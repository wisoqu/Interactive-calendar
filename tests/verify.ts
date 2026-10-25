import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { AddressInfo } from "node:net";
import { createServerApp } from "../server";

class TestAgent {
  private cookie: string | null = null;

  constructor(private readonly baseUrl: string) {}

  async request(
    method: string,
    urlPath: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {}
  ): Promise<{ status: number; data: any; headers: Headers }> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...extraHeaders,
    };
    if (this.cookie) {
      headers["Cookie"] = this.cookie;
    }

    const res = await fetch(`${this.baseUrl}${urlPath}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      const firstPart = setCookie.split(";")[0];
      if (firstPart.endsWith("=")) {
        this.cookie = null;
      } else {
        this.cookie = firstPart;
      }
    }

    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    return { status: res.status, data, headers: res.headers };
  }
}

async function startEphemeralServer(
  dbPath: string,
  onResetCodeGenerated?: (email: string, code: string) => void
) {
  const instance = await createServerApp({
    dbPath,
    attachFrontend: false,
    onResetCodeGenerated,
  });

  const server = http.createServer(instance.app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    sqliteDb: instance.sqliteDb,
    stop: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
      instance.close();
    },
  };
}

async function runVerification() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "interactive-calendar-test-"));
  const dbPath = path.join(tmpDir, "data", "test_calendar.sqlite");
  const capturedOtpByEmail = new Map<string, string>();

  console.log("=== Запуск автоматической проверки сценариев (Глава 4.1) ===\n");

  let srv = await startEphemeralServer(dbPath, (email, code) => {
    capturedOtpByEmail.set(email.toLowerCase(), code);
  });

  try {
    const ownerAgent = new TestAgent(srv.baseUrl);
    const adminAgent = new TestAgent(srv.baseUrl);
    const memberAgent = new TestAgent(srv.baseUrl);
    const outsiderAgent = new TestAgent(srv.baseUrl);
    const extraAgent = new TestAgent(srv.baseUrl);

    // Healthcheck
    const health = await ownerAgent.request("GET", "/api/health/db");
    assert.equal(health.status, 200);
    assert.equal(health.data.database, "sqlite");

    // -------------------------------------------------------------------------
    // Сценарий 1. Регистрация, вход, сессия (HTTP и HTTPS) и выход
    // -------------------------------------------------------------------------
    const regOwner = await ownerAgent.request("POST", "/api/auth/register", {
      username: "teacher_owner",
      password: "Password123",
      email: "owner@school42.ru",
    });
    assert.equal(regOwner.status, 201);
    assert.equal(regOwner.data.username, "teacher_owner");

    // Дубликат логина отклоняется
    const regDup = await ownerAgent.request("POST", "/api/auth/register", {
      username: "TEACHER_OWNER",
      password: "Password123",
    });
    assert.equal(regDup.status, 400);

    // Неверный пароль отклоняется
    const badLogin = await ownerAgent.request("POST", "/api/auth/login", {
      username: "teacher_owner",
      password: "WrongPassword",
    });
    assert.equal(badLogin.status, 401);

    // Обычный HTTP вход -> SameSite=Lax (без флага Secure)
    const okLoginHttp = await ownerAgent.request("POST", "/api/auth/login", {
      username: "teacher_owner",
      password: "Password123",
    });
    assert.equal(okLoginHttp.status, 200);
    const httpCookieHeader = okLoginHttp.headers.get("set-cookie") || "";
    assert.match(httpCookieHeader, /HttpOnly/i);
    assert.match(httpCookieHeader, /SameSite=Lax/i);
    assert.doesNotMatch(httpCookieHeader, /;\s*Secure/i);

    const meRes = await ownerAgent.request("GET", "/api/auth/me");
    assert.equal(meRes.status, 200);
    assert.equal(meRes.data.username, "teacher_owner");

    // Проверка работы через Bearer session_token без Cookie (iframe / блокировка сторонних cookie в браузере)
    assert.equal(typeof okLoginHttp.data.session_token, "string");
    const cookieLessAgent = new TestAgent(srv.baseUrl);
    const iframeMeRes = await cookieLessAgent.request("GET", "/api/auth/me", undefined, {
      Authorization: `Bearer ${okLoginHttp.data.session_token}`,
    });
    assert.equal(iframeMeRes.status, 200);
    assert.equal(iframeMeRes.data.username, "teacher_owner");

    // Выход отзывает сессию и для Cookie, и для Bearer-токена
    const logoutRes = await ownerAgent.request("POST", "/api/auth/logout");
    assert.equal(logoutRes.status, 200);
    const afterLogoutMe = await ownerAgent.request("GET", "/api/auth/me");
    assert.equal(afterLogoutMe.status, 401);
    const afterLogoutBearer = await cookieLessAgent.request("GET", "/api/auth/me", undefined, {
      Authorization: `Bearer ${okLoginHttp.data.session_token}`,
    });
    assert.equal(afterLogoutBearer.status, 401);

    // Вход через HTTPS прокси (X-Forwarded-Proto: https) -> Secure; SameSite=None
    const okLoginHttps = await ownerAgent.request(
      "POST",
      "/api/auth/login",
      { username: "teacher_owner", password: "Password123" },
      { "X-Forwarded-Proto": "https" }
    );
    assert.equal(okLoginHttps.status, 200);
    const httpsCookieHeader = okLoginHttps.headers.get("set-cookie") || "";
    assert.match(httpsCookieHeader, /SameSite=None/i);
    assert.match(httpsCookieHeader, /Secure/i);

    // Регистрация остальных тестовых пользователей
    for (const [agent, uname, mail] of [
      [adminAgent, "class_admin", "admin@school42.ru"],
      [memberAgent, "student_anna", "anna@school42.ru"],
      [outsiderAgent, "student_boris", "boris@school42.ru"],
      [extraAgent, "student_daria", "daria@school42.ru"],
    ] as const) {
      const r = await agent.request("POST", "/api/auth/register", {
        username: uname,
        password: "Password123",
        email: mail,
      });
      assert.equal(r.status, 201);
      const l = await agent.request("POST", "/api/auth/login", {
        username: uname,
        password: "Password123",
      });
      assert.equal(l.status, 200);
    }
    console.log("✓ Сценарий 1 пройден: регистрация, вход (HTTP/HTTPS cookie), проверка сессии и выход");

    // -------------------------------------------------------------------------
    // Сценарий 2. Создание учебной группы и назначение владельца
    // -------------------------------------------------------------------------
    const createCr = await ownerAgent.request("POST", "/api/classrooms", {
      name: "10 «А» класс",
      description: "Учебный календарь 10 А класса",
    });
    assert.equal(createCr.status, 201);
    assert.equal(createCr.data.user_role, "owner");
    assert.equal(createCr.data.invite_code.length, 6);
    const classroomId: string = createCr.data.id;
    const inviteCode: string = createCr.data.invite_code;
    console.log("✓ Сценарий 2 пройден: создание класса и генерация 6-символьного кода приглашения");

    // -------------------------------------------------------------------------
    // Сценарий 3. Вступление по коду приглашения
    // -------------------------------------------------------------------------
    const invalidJoin = await memberAgent.request("POST", "/api/classrooms/join", {
      invite_code: "ZZZZZZ",
    });
    assert.equal(invalidJoin.status, 404);

    const validJoin = await memberAgent.request("POST", "/api/classrooms/join", {
      invite_code: inviteCode.toLowerCase(),
    });
    assert.equal(validJoin.status, 200);
    assert.equal(validJoin.data.user_role, "member");

    // Повторное вступление не создает дубликат записи
    const repeatJoin = await memberAgent.request("POST", "/api/classrooms/join", {
      invite_code: inviteCode,
    });
    assert.equal(repeatJoin.status, 200);
    const membersAfterRepeat = await ownerAgent.request("GET", `/api/classrooms/${classroomId}/members`);
    assert.equal(membersAfterRepeat.data.length, 2);
    console.log("✓ Сценарий 3 пройден: вступление по коду и защита от дублирования участников");

    // -------------------------------------------------------------------------
    // Сценарий 4. Проверка ролевой модели доступа (RBAC)
    // -------------------------------------------------------------------------
    // Владелец добавляет class_admin с ролью admin
    const addAdminRes = await ownerAgent.request("POST", `/api/classrooms/${classroomId}/members`, {
      username: "class_admin",
      role: "admin",
    });
    assert.equal(addAdminRes.status, 201);
    assert.equal(addAdminRes.data.role, "admin");

    // Администратор НЕ может изменять настройки класса (только Владелец!)
    const adminPatchSettings = await adminAgent.request("PATCH", `/api/classrooms/${classroomId}`, {
      name: "Попытка переименования админом",
      is_closed: true,
    });
    assert.equal(adminPatchSettings.status, 403);

    // Администратор НЕ может удалить класс
    const adminDeleteClass = await adminAgent.request("DELETE", `/api/classrooms/${classroomId}`);
    assert.equal(adminDeleteClass.status, 403);

    // Администратор НЕ может добавить нового пользователя сразу с ролью admin
    const adminAssignAdmin = await adminAgent.request("POST", `/api/classrooms/${classroomId}/members`, {
      username: "student_boris",
      role: "admin",
    });
    assert.equal(adminAssignAdmin.status, 403);

    // Участник (member) НЕ может создать событие
    const memberCreateEvent = await memberAgent.request("POST", `/api/classrooms/${classroomId}/events`, {
      title: "Несанкционированное событие",
      starts_at: "2026-11-10T09:00:00.000Z",
      ends_at: "2026-11-10T10:00:00.000Z",
    });
    assert.equal(memberCreateEvent.status, 403);

    // Посторонний пользователь (не состоящий в классе) не видит события класса
    const outsiderEvents = await outsiderAgent.request("GET", `/api/classrooms/${classroomId}/events`);
    assert.equal(outsiderEvents.status, 403);

    console.log("✓ Сценарий 4 пройден: строгое разграничение прав Владельца, Администратора и Участника");

    // -------------------------------------------------------------------------
    // Сценарий 5. Создание, сортировка, редактирование и удаление событий
    // -------------------------------------------------------------------------
    // Ошибка валидации: окончание раньше начала
    const invalidTimeEvent = await adminAgent.request("POST", `/api/classrooms/${classroomId}/events`, {
      title: "Ошибочное время",
      starts_at: "2026-11-12T12:00:00.000Z",
      ends_at: "2026-11-12T11:00:00.000Z",
    });
    assert.equal(invalidTimeEvent.status, 400);

    // Создаем два события в обратном порядке и проверяем сортировку по starts_at
    const evLater = await adminAgent.request("POST", `/api/classrooms/${classroomId}/events`, {
      title: "Родительское собрание",
      description: "Кабинет 204",
      starts_at: "2026-11-15T11:00:00.000Z",
      ends_at: "2026-11-15T12:30:00.000Z",
    });
    assert.equal(evLater.status, 201);

    const evEarlier = await ownerAgent.request("POST", `/api/classrooms/${classroomId}/events`, {
      title: "Контрольная по математике",
      description: "Варианты 1–2",
      starts_at: "2026-11-10T08:30:00.000Z",
      ends_at: "2026-11-10T09:15:00.000Z",
    });
    assert.equal(evEarlier.status, 201);

    // Участник видит отсортированный список событий
    const listEv = await memberAgent.request("GET", `/api/classrooms/${classroomId}/events`);
    assert.equal(listEv.status, 200);
    assert.equal(listEv.data.length, 2);
    assert.equal(listEv.data[0].title, "Контрольная по математике");
    assert.equal(listEv.data[1].title, "Родительское собрание");

    // Редактирование и удаление события администратором
    const updatedEv = await adminAgent.request(
      "PATCH",
      `/api/classrooms/${classroomId}/events/${evLater.data.id}`,
      { title: "Общешкольное собрание" }
    );
    assert.equal(updatedEv.status, 200);
    assert.equal(updatedEv.data.title, "Общешкольное собрание");

    const delEv = await adminAgent.request(
      "DELETE",
      `/api/classrooms/${classroomId}/events/${evLater.data.id}`
    );
    assert.equal(delEv.status, 200);
    console.log("✓ Сценарий 5 пройден: CRUD событий, валидация интервалов и хронологическая сортировка");

    // -------------------------------------------------------------------------
    // Сценарий 6. Закрытая группа (is_closed), повторное открытие, X-Api-Envelope и max_members
    // -------------------------------------------------------------------------
    // Сейчас в классе 3 участника (owner, admin, student_anna).
    // Проверим работу через POST /update и изоляцию X-Session-Token поверх чужой Cookie (мультивкладочный режим):
    const ownerRelogin = await ownerAgent.request("POST", "/api/auth/login", {
      username: "teacher_owner",
      password: "Password123",
    });
    const ownerSessionToken: string = ownerRelogin.data.session_token;

    const outsiderRelogin = await outsiderAgent.request("POST", "/api/auth/login", {
      username: "student_boris",
      password: "Password123",
    });
    const outsiderCookie = outsiderRelogin.headers.get("set-cookie")?.split(";")[0] || "";

    // Даже если браузерная Cookie перезаписана вторым аккаунтом (student_boris),
    // вкладка владельца с X-Session-Token сохраняет права владельца и закрывает класс!
    const closeViaPost = await ownerAgent.request(
      "POST",
      `/api/classrooms/${classroomId}/update`,
      {
        is_closed: true,
        max_members: 0,
      },
      {
        Cookie: outsiderCookie,
        "X-Session-Token": ownerSessionToken,
        "X-Api-Envelope": "1",
      }
    );
    assert.equal(closeViaPost.status, 200);
    assert.equal(closeViaPost.data.is_closed, true);
    assert.equal(closeViaPost.data.member_count, 3);

    // Прямой REST-запрос возвращает 403 с кодом CLASSROOM_CLOSED
    const joinClosed = await outsiderAgent.request("POST", "/api/classrooms/join", {
      invite_code: inviteCode,
    });
    assert.equal(joinClosed.status, 403);
    assert.equal(joinClosed.data.code, "CLASSROOM_CLOSED");

    // Браузерный запрос с X-Api-Envelope: 1 получает HTTP 200 и JSON __api_error (защита от HTML 403 прокси!)
    const joinClosedEnvelope = await outsiderAgent.request(
      "POST",
      "/api/classrooms/join",
      { invite_code: inviteCode },
      { "X-Api-Envelope": "1" }
    );
    assert.equal(joinClosedEnvelope.status, 200);
    assert.equal(joinClosedEnvelope.data.__api_error, true);
    assert.equal(joinClosedEnvelope.data.status, 403);
    assert.equal(joinClosedEnvelope.data.code, "CLASSROOM_CLOSED");

    // Снова открываем класс через POST /update и устанавливаем лимит max_members = 4
    const reopenViaPost = await ownerAgent.request(
      "POST",
      `/api/classrooms/${classroomId}/update`,
      {
        is_closed: false,
        max_members: 4,
      },
      {
        Cookie: outsiderCookie,
        "X-Session-Token": ownerSessionToken,
        "X-Api-Envelope": "1",
      }
    );
    assert.equal(reopenViaPost.status, 200);
    assert.equal(reopenViaPost.data.is_closed, false);
    assert.equal(reopenViaPost.data.max_members, 4);

    // После открытия класса 4-й участник (student_boris) СРАЗУ успешно присоединяется!
    const joinFourth = await outsiderAgent.request(
      "POST",
      "/api/classrooms/join",
      { invite_code: inviteCode },
      { "X-Api-Envelope": "1" }
    );
    assert.equal(joinFourth.status, 200);
    assert.equal(joinFourth.data.__api_error, undefined);
    assert.equal(joinFourth.data.user_role, "member");
    assert.equal(joinFourth.data.member_count, 4);

    // 5-й участник (student_daria) блокируется с кодом CLASSROOM_FULL и по коду, и при ручном добавлении!
    const joinFifth = await extraAgent.request("POST", "/api/classrooms/join", {
      invite_code: inviteCode,
    });
    assert.equal(joinFifth.status, 403);
    assert.equal(joinFifth.data.code, "CLASSROOM_FULL");

    const forceAddFifth = await ownerAgent.request("POST", `/api/classrooms/${classroomId}/members`, {
      username: "student_daria",
      role: "member",
    });
    assert.equal(forceAddFifth.status, 403);
    assert.equal(forceAddFifth.data.code, "CLASSROOM_FULL");

    console.log("✓ Сценарий 6 пройден: закрытие и повторное открытие класса, X-Api-Envelope и контроль max_members");

    // -------------------------------------------------------------------------
    // Сценарий 7. Восстановление пароля по 6-значному коду и отзыв сессий
    // -------------------------------------------------------------------------
    const resetReq = await extraAgent.request("POST", "/api/auth/password-reset/request", {
      email: "anna@school42.ru",
    });
    assert.equal(resetReq.status, 200);

    const otpCode = capturedOtpByEmail.get("anna@school42.ru");
    assert.ok(otpCode && /^\d{6}$/.test(otpCode), "Должен быть сгенерирован 6-значный код");

    // Неверный код отклоняется
    const wrongOtp = await extraAgent.request("POST", "/api/auth/password-reset/confirm", {
      email: "anna@school42.ru",
      code: otpCode === "000000" ? "111111" : "000000",
      new_password: "NewAnnaPassword789",
    });
    assert.equal(wrongOtp.status, 400);

    // Верный код меняет пароль и отзывает активную сессию Анны
    const validOtp = await extraAgent.request("POST", "/api/auth/password-reset/confirm", {
      email: "anna@school42.ru",
      code: otpCode,
      new_password: "NewAnnaPassword789",
    });
    assert.equal(validOtp.status, 200);

    // Повторное использование того же кода запрещено
    const reusedOtp = await extraAgent.request("POST", "/api/auth/password-reset/confirm", {
      email: "anna@school42.ru",
      code: otpCode,
      new_password: "AnotherPassword789",
    });
    assert.equal(reusedOtp.status, 400);

    // Старая сессия memberAgent должна быть отозвана!
    const oldSessionCheck = await memberAgent.request("GET", "/api/auth/me");
    assert.equal(oldSessionCheck.status, 401);

    // Вход с новым паролем работает
    const newLoginAnna = await memberAgent.request("POST", "/api/auth/login", {
      username: "student_anna",
      password: "NewAnnaPassword789",
    });
    assert.equal(newLoginAnna.status, 200);
    console.log("✓ Сценарий 7 пройден: одноразовый 6-значный код сброса пароля и отзыв активных сессий");

    // -------------------------------------------------------------------------
    // Сценарий 8. Проверка сохранности данных после перезапуска сервера и БД
    // -------------------------------------------------------------------------
    await srv.stop();
    srv = await startEphemeralServer(dbPath);

    const reopenedAgent = new TestAgent(srv.baseUrl);
    const loginAfterRestart = await reopenedAgent.request("POST", "/api/auth/login", {
      username: "teacher_owner",
      password: "Password123",
    });
    assert.equal(loginAfterRestart.status, 200);

    const classesAfterRestart = await reopenedAgent.request("GET", "/api/classrooms");
    assert.equal(classesAfterRestart.status, 200);
    assert.equal(classesAfterRestart.data.length, 1);
    assert.equal(classesAfterRestart.data[0].name, "10 «А» класс");

    const eventsAfterRestart = await reopenedAgent.request(
      "GET",
      `/api/classrooms/${classroomId}/events`
    );
    assert.equal(eventsAfterRestart.status, 200);
    assert.equal(eventsAfterRestart.data.length, 1);
    assert.equal(eventsAfterRestart.data[0].title, "Контрольная по математике");
    console.log("✓ Сценарий 8 пройден: сохранность пользователей, групп и событий в SQLite после перезапуска");

    console.log("\n=== ВСЕ 8 ПРОВЕРОЧНЫХ СЦЕНАРИЕВ УСПЕШНО ПРОЙДЕНЫ! ===");
  } finally {
    await srv.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runVerification().catch((err) => {
  console.error("Ошибка при выполнении проверочных сценариев:", err);
  process.exit(1);
});
