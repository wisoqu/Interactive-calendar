import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type Database from "better-sqlite3";
import { createServerApp, hashPassword, verifyPassword } from "../server.ts";
import { cleanupExpiredAuthRecords } from "../server/db.ts";
import { hashResetCode, verifyResetCodeHash } from "../server/crypto.ts";
import {
  eventOverlapsDay,
  findEventConflict,
  getEventDisplayHourForDay,
  getEventsForDate,
  getWeekDays,
  getWeekHourSlots,
} from "../src/utils/calendarDate.ts";
import { getLocalizedApiError } from "../src/utils/errorMessages.ts";
import { ApiError } from "../src/api/client.ts";
import type { CalendarEvent } from "../src/types.ts";

class CookieJar {
  private cookies = new Map<string, string>();
  lastSetCookieHeaders: string[] = [];

  capture(res: Response) {
    const setCookies =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie")!]
        : [];
    this.lastSetCookieHeaders = setCookies;
    for (const raw of setCookies) {
      const firstPart = raw.split(";")[0];
      const eqIdx = firstPart.indexOf("=");
      if (eqIdx === -1) continue;
      const name = firstPart.slice(0, eqIdx).trim();
      const val = firstPart.slice(eqIdx + 1).trim();
      if (!val || raw.toLowerCase().includes("max-age=0")) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, val);
      }
    }
  }

  header(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  get(name: string): string | undefined {
    return this.cookies.get(name);
  }
}

async function apiRequest(
  baseUrl: string,
  method: string,
  urlPath: string,
  options?: {
    jar?: CookieJar;
    body?: unknown;
    headers?: Record<string, string>;
  }
): Promise<{ status: number; data: any; res: Response }> {
  const headers: Record<string, string> = {
    ...(options?.headers || {}),
  };
  if (options?.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options?.jar) {
    const cookieStr = options.jar.header();
    if (cookieStr) headers["Cookie"] = cookieStr;
  }

  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (options?.jar) {
    options.jar.capture(res);
  }

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: res.status, data, res };
}

async function startTestServer(
  dbPath: string,
  opts?: {
    enableRateLimit?: boolean;
    onResetCodeGenerated?: (email: string, code: string) => void;
  }
): Promise<{
  server: Server;
  baseUrl: string;
  db: Database.Database;
  close: () => Promise<void>;
}> {
  const { app, sqliteDb, close: closeApp } = await createServerApp({
    dbPath,
    attachFrontend: false,
    enableRateLimit: opts?.enableRateLimit ?? false,
    onResetCodeGenerated: opts?.onResetCodeGenerated,
  });
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return {
    server,
    baseUrl,
    db: sqliteDb,
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
      closeApp();
    },
  };
}

let passedTests = 0;

async function runStep(name: string, fn: () => Promise<void> | void) {
  await fn();
  passedTests++;
  console.log(`  [PASS] ${name}`);
}

async function runAllTests() {
  console.log("Running Interactive Calendar comprehensive verification suite...\n");

  // =========================================================================
  // 1. UNIT TESTS: CRYPTO, CALENDAR DATE UTILS & ERROR LOCALIZATION
  // =========================================================================
  console.log("1. Unit Tests (Crypto, Calendar Date Math, Error Localization)");

  await runStep("Async PBKDF2 hashing, OTP hashing & timing-safe verification", async () => {
    const hash = await hashPassword("MySecretPass123!");
    assert.ok(hash.startsWith("pbkdf2_sha256$100000$"));
    assert.equal(await verifyPassword("MySecretPass123!", hash), true);
    assert.equal(await verifyPassword("WrongPassword123!", hash), false);
    assert.equal(await verifyPassword("anything", "malformed_hash"), false);

    const otpHash = hashResetCode("123456");
    assert.equal(verifyResetCodeHash("123456", otpHash), true);
    assert.equal(verifyResetCodeHash("654321", otpHash), false);
  });

  await runStep("Multi-day event overlap, dynamic week hour expansion & conflict check", () => {
    const makeEv = (id: string, starts_at: string, ends_at: string): CalendarEvent => ({
      id,
      classroom_id: "cr_1",
      creator_id: "usr_1",
      creator_username: "teacher",
      title: `Event ${id}`,
      starts_at,
      ends_at,
      created_at: starts_at,
      updated_at: starts_at,
    });

    // Multi-day trip: local Oct 10 10:00 -> Oct 12 15:00
    const d10 = new Date(2026, 9, 10, 10, 0, 0);
    const d12 = new Date(2026, 9, 12, 15, 0, 0);
    const multiDay = makeEv("ev_multi", d10.toISOString(), d12.toISOString());

    assert.equal(eventOverlapsDay(multiDay, new Date(2026, 9, 9)), false);
    assert.equal(eventOverlapsDay(multiDay, new Date(2026, 9, 10)), true);
    assert.equal(eventOverlapsDay(multiDay, new Date(2026, 9, 11)), true);
    assert.equal(eventOverlapsDay(multiDay, new Date(2026, 9, 12)), true);
    assert.equal(eventOverlapsDay(multiDay, new Date(2026, 9, 13)), false);

    assert.equal(getEventsForDate([multiDay], new Date(2026, 9, 11)).length, 1);
    assert.equal(getEventDisplayHourForDay(multiDay, new Date(2026, 9, 10), 8), 10);
    assert.equal(getEventDisplayHourForDay(multiDay, new Date(2026, 9, 11), 8), 8);

    // Dynamic week hours: default 08..22, expands to include early 06:00 and late 23:00 events
    const weekDays = getWeekDays(new Date(2026, 9, 14)); // Wednesday Oct 14 2026
    const defaultSlots = getWeekHourSlots(weekDays, []);
    assert.equal(defaultSlots[0], 8);
    assert.equal(defaultSlots[defaultSlots.length - 1], 22);

    const earlyEv = makeEv(
      "ev_early",
      new Date(2026, 9, 14, 6, 0, 0).toISOString(),
      new Date(2026, 9, 14, 7, 0, 0).toISOString()
    );
    const lateEv = makeEv(
      "ev_late",
      new Date(2026, 9, 14, 23, 0, 0).toISOString(),
      new Date(2026, 9, 14, 23, 45, 0).toISOString()
    );
    const expandedSlots = getWeekHourSlots(weekDays, [earlyEv, lateEv]);
    assert.equal(expandedSlots[0], 6);
    assert.equal(expandedSlots[expandedSlots.length - 1], 23);

    // Conflict detection ignores self when editing
    const conflictRu = findEventConflict(
      [earlyEv, lateEv],
      new Date(2026, 9, 14, 6, 30, 0),
      new Date(2026, 9, 14, 7, 30, 0),
      null,
      "ru"
    );
    assert.ok(conflictRu && conflictRu.includes("ev_early"));

    const conflictIgnoringSelf = findEventConflict(
      [earlyEv, lateEv],
      new Date(2026, 9, 14, 6, 30, 0),
      new Date(2026, 9, 14, 7, 30, 0),
      "ev_early",
      "en"
    );
    assert.equal(conflictIgnoringSelf, null);
  });

  await runStep("Frontend API error localization (RU & EN)", () => {
    const closedErr = new ApiError("Closed", 403, "CLASSROOM_CLOSED");
    assert.ok(getLocalizedApiError(closedErr, "ru", "fb").includes("закрыто"));
    assert.ok(getLocalizedApiError(closedErr, "en", "fb").includes("closed"));

    const fullErr = new ApiError("Full", 403, "CLASSROOM_FULL", { max_members: 25 });
    assert.ok(getLocalizedApiError(fullErr, "ru", "fb").includes("25"));
    assert.ok(getLocalizedApiError(fullErr, "en", "fb").includes("25"));

    const netErr = new TypeError("Failed to fetch");
    assert.ok(getLocalizedApiError(netErr, "ru", "fb").includes("соединения"));
    assert.ok(getLocalizedApiError(netErr, "en", "fb").includes("reach"));
  });

  // =========================================================================
  // 2. SERVER INTEGRATION TESTS
  // =========================================================================
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ic-verify-"));
  const dbPath = path.join(tmpDir, "test_calendar.sqlite");

  // Ensure SMTP env vars do not leak from host during tests
  const savedEnv = {
    NODE_ENV: process.env.NODE_ENV,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
  };
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;

  const capturedOtps: Array<{ email: string; code: string }> = [];
  let srv = await startTestServer(dbPath, {
    enableRateLimit: false,
    onResetCodeGenerated: (email, code) => capturedOtps.push({ email, code }),
  });

  try {
    console.log("\n2. Health, Security Headers, JSON 404 & Auth Config");

    await runStep("Health endpoints & security headers", async () => {
      const h = await apiRequest(srv.baseUrl, "GET", "/api/health");
      assert.equal(h.status, 200);
      assert.equal(h.data.status, "healthy");
      assert.equal(h.res.headers.get("x-content-type-options"), "nosniff");
      assert.equal(h.res.headers.get("x-frame-options"), "SAMEORIGIN");
      assert.equal(h.res.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
      assert.equal(h.res.headers.get("x-powered-by"), null);

      const hdb = await apiRequest(srv.baseUrl, "GET", "/api/health/db");
      assert.equal(hdb.status, 200);
      assert.equal(hdb.data.connection, "ok");

      const cfg = await apiRequest(srv.baseUrl, "GET", "/api/auth/config");
      assert.equal(cfg.status, 200);
      assert.equal(typeof cfg.data.smtp_configured, "boolean");
    });

    await runStep("Unknown /api/* path returns JSON 404 (not HTML)", async () => {
      const notFound = await apiRequest(srv.baseUrl, "GET", "/api/does-not-exist");
      assert.equal(notFound.status, 404);
      assert.equal(notFound.data.code, "NOT_FOUND");
    });

    console.log("\n3. Authentication, Cookie Hardening, CSRF & Uniqueness");

    const ownerJar = new CookieJar();
    const adminJar = new CookieJar();
    const memberJar = new CookieJar();
    const outsiderJar = new CookieJar();

    let ownerId = "";
    let memberUserId = "";

    await runStep("Password length validation (6..128 chars)", async () => {
      const shortRes = await apiRequest(srv.baseUrl, "POST", "/api/auth/register", {
        body: { username: "shortpwd", password: "123" },
      });
      assert.equal(shortRes.status, 400);
      assert.equal(shortRes.data.code, "INVALID_PASSWORD");

      const longRes = await apiRequest(srv.baseUrl, "POST", "/api/auth/register", {
        body: { username: "longpwd", password: "a".repeat(129) },
      });
      assert.equal(longRes.status, 400);
      assert.equal(longRes.data.code, "INVALID_PASSWORD");
    });

    await runStep("Registration & case-insensitive username/email uniqueness", async () => {
      const r1 = await apiRequest(srv.baseUrl, "POST", "/api/auth/register", {
        body: { username: "OwnerTeacher", password: "Password123!", email: "Owner@School.RU" },
      });
      assert.equal(r1.status, 201);
      ownerId = r1.data.id;

      // Case-insensitive username duplicate
      const dupUser = await apiRequest(srv.baseUrl, "POST", "/api/auth/register", {
        body: { username: "ownerteacher", password: "Password123!" },
      });
      assert.equal(dupUser.status, 400);
      assert.equal(dupUser.data.code, "USERNAME_TAKEN");

      // Case-insensitive email duplicate
      const dupEmail = await apiRequest(srv.baseUrl, "POST", "/api/auth/register", {
        body: { username: "different_user", password: "Password123!", email: "owner@school.ru" },
      });
      assert.equal(dupEmail.status, 400);
      assert.equal(dupEmail.data.code, "EMAIL_TAKEN");

      const r2 = await apiRequest(srv.baseUrl, "POST", "/api/auth/register", {
        body: { username: "class_admin", password: "Password123!", email: "admin@school.ru" },
      });
      assert.equal(r2.status, 201);

      const r3 = await apiRequest(srv.baseUrl, "POST", "/api/auth/register", {
        body: { username: "student_one", password: "Password123!" },
      });
      assert.equal(r3.status, 201);
      memberUserId = r3.data.id;

      const r4 = await apiRequest(srv.baseUrl, "POST", "/api/auth/register", {
        body: { username: "outsider_student", password: "Password123!" },
      });
      assert.equal(r4.status, 201);
    });

    await runStep(
      "Login sets HttpOnly SameSite=Lax cookie, never leaks session_token, rejects X-Session-Token",
      async () => {
        const loginHttp = await apiRequest(srv.baseUrl, "POST", "/api/auth/login", {
          jar: ownerJar,
          body: { username: "ownerteacher", password: "Password123!" }, // case-insensitive login
        });
        assert.equal(loginHttp.status, 200);
        assert.equal(loginHttp.data.id, ownerId);
        assert.equal("session_token" in loginHttp.data, false);

        const setCookie = ownerJar.lastSetCookieHeaders.join("; ");
        assert.ok(setCookie.includes("HttpOnly"));
        assert.ok(setCookie.includes("SameSite=Lax"));
        assert.equal(setCookie.includes("SameSite=None"), false);
        assert.equal(setCookie.includes("Secure"), false);

        const sessionCookieVal = ownerJar.get("session_id");
        assert.ok(sessionCookieVal && sessionCookieVal.startsWith("sess_"));

        // Verify X-Session-Token header is NOT accepted without cookie
        const headerOnly = await apiRequest(srv.baseUrl, "GET", "/api/auth/me", {
          headers: { "X-Session-Token": sessionCookieVal },
        });
        assert.equal(headerOnly.status, 401);

        // Verify HTTPS behind proxy adds Secure flag while preserving SameSite=Lax
        const httpsJar = new CookieJar();
        const loginHttps = await apiRequest(srv.baseUrl, "POST", "/api/auth/login", {
          jar: httpsJar,
          headers: { "X-Forwarded-Proto": "https" },
          body: { username: "class_admin", password: "Password123!" },
        });
        assert.equal(loginHttps.status, 200);
        const httpsCookie = httpsJar.lastSetCookieHeaders.join("; ");
        assert.ok(httpsCookie.includes("HttpOnly"));
        assert.ok(httpsCookie.includes("SameSite=Lax"));
        assert.ok(httpsCookie.includes("Secure"));

        // Normal logins for other accounts
        assert.equal(
          (
            await apiRequest(srv.baseUrl, "POST", "/api/auth/login", {
              jar: adminJar,
              body: { username: "class_admin", password: "Password123!" },
            })
          ).status,
          200
        );
        assert.equal(
          (
            await apiRequest(srv.baseUrl, "POST", "/api/auth/login", {
              jar: memberJar,
              body: { username: "student_one", password: "Password123!" },
            })
          ).status,
          200
        );
        assert.equal(
          (
            await apiRequest(srv.baseUrl, "POST", "/api/auth/login", {
              jar: outsiderJar,
              body: { username: "outsider_student", password: "Password123!" },
            })
          ).status,
          200
        );
      }
    );

    await runStep("CSRF Origin/Referer validation blocks cross-origin mutations", async () => {
      const evilRes = await apiRequest(srv.baseUrl, "POST", "/api/classrooms", {
        jar: ownerJar,
        headers: { Origin: "https://evil-attacker.example" },
        body: { name: "Hijacked Class" },
      });
      assert.equal(evilRes.status, 403);
      assert.equal(evilRes.data.code, "CSRF_REJECTED");

      const evilReferer = await apiRequest(srv.baseUrl, "POST", "/api/classrooms", {
        jar: ownerJar,
        headers: { Referer: "https://evil-attacker.example/csrf.html" },
        body: { name: "Hijacked Class 2" },
      });
      assert.equal(evilReferer.status, 403);
      assert.equal(evilReferer.data.code, "CSRF_REJECTED");
    });

    await runStep("Logout revokes server-side session", async () => {
      const tempJar = new CookieJar();
      await apiRequest(srv.baseUrl, "POST", "/api/auth/login", {
        jar: tempJar,
        body: { username: "student_one", password: "Password123!" },
      });
      const stolenCookie = tempJar.header();
      assert.equal(
        (await apiRequest(srv.baseUrl, "GET", "/api/auth/me", { jar: tempJar })).status,
        200
      );

      const out = await apiRequest(srv.baseUrl, "POST", "/api/auth/logout", { jar: tempJar });
      assert.equal(out.status, 200);

      // Even replaying the old cookie header must fail
      const replay = await apiRequest(srv.baseUrl, "GET", "/api/auth/me", {
        headers: { Cookie: stolenCookie },
      });
      assert.equal(replay.status, 401);
    });

    console.log("\n4. Classrooms, Partial PATCH, Closure, Capacity & Full RBAC Matrix");

    let classroomId = "";
    let inviteCode = "";
    let adminMembershipId = "";
    let memberMembershipId = "";
    let ownerMembershipId = "";

    await runStep("Classroom creation, non-member isolation & invite joining", async () => {
      const createRes = await apiRequest(srv.baseUrl, "POST", "/api/classrooms", {
        jar: ownerJar,
        headers: { Origin: srv.baseUrl },
        body: { name: "10 «А» Физика", description: "Основное расписание" },
      });
      assert.equal(createRes.status, 201);
      classroomId = createRes.data.id;
      inviteCode = createRes.data.invite_code;
      assert.equal(createRes.data.user_role, "owner");
      assert.equal(createRes.data.member_count, 1);
      assert.equal(inviteCode.length, 6);

      // Non-member cannot read classroom or events
      assert.equal(
        (await apiRequest(srv.baseUrl, "GET", `/api/classrooms/${classroomId}`, { jar: memberJar }))
          .status,
        403
      );
      assert.equal(
        (
          await apiRequest(srv.baseUrl, "GET", `/api/classrooms/${classroomId}/events`, {
            jar: memberJar,
          })
        ).status,
        403
      );

      // Unknown classroom -> 404
      const missingCr = await apiRequest(srv.baseUrl, "GET", "/api/classrooms/cr_nonexistent", {
        jar: ownerJar,
      });
      assert.equal(missingCr.status, 404);
      assert.equal(missingCr.data.code, "CLASSROOM_NOT_FOUND");

      // Invalid invite code -> 404
      const badJoin = await apiRequest(srv.baseUrl, "POST", "/api/classrooms/join", {
        jar: memberJar,
        body: { invite_code: "ZZZZZZ" },
      });
      assert.equal(badJoin.status, 404);
      assert.equal(badJoin.data.code, "CLASSROOM_NOT_FOUND");

      // Join using lowercase invite code
      const joinOk = await apiRequest(srv.baseUrl, "POST", "/api/classrooms/join", {
        jar: memberJar,
        body: { invite_code: inviteCode.toLowerCase() },
      });
      assert.equal(joinOk.status, 200);
      assert.equal(joinOk.data.user_role, "member");
      assert.equal(joinOk.data.member_count, 2);
    });

    await runStep("Partial PATCH for is_closed & max_members enforces join/add limits", async () => {
      // Partial PATCH: only is_closed = true must preserve name & description
      const closeRes = await apiRequest(srv.baseUrl, "PATCH", `/api/classrooms/${classroomId}`, {
        jar: ownerJar,
        body: { is_closed: true },
      });
      assert.equal(closeRes.status, 200);
      assert.equal(closeRes.data.is_closed, true);
      assert.equal(closeRes.data.name, "10 «А» Физика");
      assert.equal(closeRes.data.description, "Основное расписание");

      // Outsider blocked while closed
      const joinClosed = await apiRequest(srv.baseUrl, "POST", "/api/classrooms/join", {
        jar: outsiderJar,
        body: { invite_code: inviteCode },
      });
      assert.equal(joinClosed.status, 403);
      assert.equal(joinClosed.data.code, "CLASSROOM_CLOSED");

      // Open classroom but set max_members = 2 (already 2 members enrolled)
      const capRes = await apiRequest(srv.baseUrl, "PATCH", `/api/classrooms/${classroomId}`, {
        jar: ownerJar,
        body: { is_closed: false, max_members: 2 },
      });
      assert.equal(capRes.status, 200);
      assert.equal(capRes.data.max_members, 2);

      // Outsider blocked by capacity limit on invite join
      const joinFull = await apiRequest(srv.baseUrl, "POST", "/api/classrooms/join", {
        jar: outsiderJar,
        body: { invite_code: inviteCode },
      });
      assert.equal(joinFull.status, 403);
      assert.equal(joinFull.data.code, "CLASSROOM_FULL");
      assert.equal(joinFull.data.max_members, 2);

      // Manual add by owner also blocked by capacity limit
      const addFull = await apiRequest(
        srv.baseUrl,
        "POST",
        `/api/classrooms/${classroomId}/members`,
        {
          jar: ownerJar,
          body: { username: "class_admin", role: "admin" },
        }
      );
      assert.equal(addFull.status, 403);
      assert.equal(addFull.data.code, "CLASSROOM_FULL");

      // Remove capacity limit (0 = unlimited)
      const uncapRes = await apiRequest(srv.baseUrl, "PATCH", `/api/classrooms/${classroomId}`, {
        jar: ownerJar,
        body: { max_members: 0 },
      });
      assert.equal(uncapRes.status, 200);
      assert.equal(uncapRes.data.max_members, 0);
    });

    await runStep("RBAC hierarchy: owner vs admin vs member & self-leave", async () => {
      // Owner adds class_admin as admin
      const addAdmin = await apiRequest(
        srv.baseUrl,
        "POST",
        `/api/classrooms/${classroomId}/members`,
        {
          jar: ownerJar,
          body: { username: "class_admin", role: "admin" },
        }
      );
      assert.equal(addAdmin.status, 201);
      adminMembershipId = addAdmin.data.id;

      // List members to collect IDs
      const listMem = await apiRequest(
        srv.baseUrl,
        "GET",
        `/api/classrooms/${classroomId}/members`,
        { jar: ownerJar }
      );
      assert.equal(listMem.status, 200);
      assert.equal(listMem.data.length, 3);
      ownerMembershipId = listMem.data.find((m: any) => m.user_id === ownerId).id;
      memberMembershipId = listMem.data.find((m: any) => m.user_id === memberUserId).id;

      // Member CANNOT create event or change settings
      assert.equal(
        (
          await apiRequest(srv.baseUrl, "POST", `/api/classrooms/${classroomId}/events`, {
            jar: memberJar,
            body: {
              title: "Unauthorized",
              starts_at: "2026-12-01T10:00:00.000Z",
              ends_at: "2026-12-01T11:00:00.000Z",
            },
          })
        ).status,
        403
      );
      assert.equal(
        (
          await apiRequest(srv.baseUrl, "PATCH", `/api/classrooms/${classroomId}`, {
            jar: memberJar,
            body: { name: "Hacked" },
          })
        ).status,
        403
      );

      // Admin CANNOT update classroom settings, delete classroom, promote roles, or add admin
      assert.equal(
        (
          await apiRequest(srv.baseUrl, "PATCH", `/api/classrooms/${classroomId}`, {
            jar: adminJar,
            body: { name: "Admin Rename" },
          })
        ).status,
        403
      );
      assert.equal(
        (
          await apiRequest(srv.baseUrl, "DELETE", `/api/classrooms/${classroomId}`, {
            jar: adminJar,
          })
        ).status,
        403
      );
      assert.equal(
        (
          await apiRequest(
            srv.baseUrl,
            "PATCH",
            `/api/classrooms/${classroomId}/members/${memberMembershipId}`,
            { jar: adminJar, body: { role: "admin" } }
          )
        ).status,
        403
      );
      assert.equal(
        (
          await apiRequest(srv.baseUrl, "POST", `/api/classrooms/${classroomId}/members`, {
            jar: adminJar,
            body: { username: "outsider_student", role: "admin" },
          })
        ).status,
        403
      );

      // Admin CAN add a regular member and remove a regular member
      const adminAddMem = await apiRequest(
        srv.baseUrl,
        "POST",
        `/api/classrooms/${classroomId}/members`,
        {
          jar: adminJar,
          body: { username: "outsider_student", role: "member" },
        }
      );
      assert.equal(adminAddMem.status, 201);
      const outsiderMemId = adminAddMem.data.id;

      // Admin CANNOT remove owner
      const rmOwner = await apiRequest(
        srv.baseUrl,
        "DELETE",
        `/api/classrooms/${classroomId}/members/${ownerMembershipId}`,
        { jar: adminJar }
      );
      assert.equal(rmOwner.status, 400);
      assert.equal(rmOwner.data.code, "OWNER_IMMUTABLE");

      // Owner CANNOT self-leave either
      const ownerSelfLeave = await apiRequest(
        srv.baseUrl,
        "DELETE",
        `/api/classrooms/${classroomId}/members/${ownerMembershipId}`,
        { jar: ownerJar }
      );
      assert.equal(ownerSelfLeave.status, 400);
      assert.equal(ownerSelfLeave.data.code, "OWNER_IMMUTABLE");

      // Admin CAN remove regular member (outsider)
      assert.equal(
        (
          await apiRequest(
            srv.baseUrl,
            "DELETE",
            `/api/classrooms/${classroomId}/members/${outsiderMemId}`,
            { jar: adminJar }
          )
        ).status,
        200
      );

      // Member CAN self-leave, then loses access
      assert.equal(
        (
          await apiRequest(
            srv.baseUrl,
            "DELETE",
            `/api/classrooms/${classroomId}/members/${memberMembershipId}`,
            { jar: memberJar }
          )
        ).status,
        200
      );
      assert.equal(
        (await apiRequest(srv.baseUrl, "GET", `/api/classrooms/${classroomId}`, { jar: memberJar }))
          .status,
        403
      );

      // Owner can demote admin -> member, and demoted admin loses event write access
      const demoteRes = await apiRequest(
        srv.baseUrl,
        "PATCH",
        `/api/classrooms/${classroomId}/members/${adminMembershipId}`,
        { jar: ownerJar, body: { role: "member" } }
      );
      assert.equal(demoteRes.status, 200);
      assert.equal(demoteRes.data.role, "member");

      assert.equal(
        (
          await apiRequest(srv.baseUrl, "POST", `/api/classrooms/${classroomId}/events`, {
            jar: adminJar,
            body: {
              title: "After Demotion",
              starts_at: "2026-12-01T10:00:00.000Z",
              ends_at: "2026-12-01T11:00:00.000Z",
            },
          })
        ).status,
        403
      );

      // Promote back to admin for event tests
      const promoteRes = await apiRequest(
        srv.baseUrl,
        "PATCH",
        `/api/classrooms/${classroomId}/members/${adminMembershipId}`,
        { jar: ownerJar, body: { role: "admin" } }
      );
      assert.equal(promoteRes.status, 200);
      assert.equal(promoteRes.data.role, "admin");
    });

    console.log("\n5. Events CRUD, SQL Sorting, Partial PATCH, Date Filtering & 404 Checks");

    let ev1Id = "";
    let ev2Id = "";

    await runStep("Event validation, chronological SQL sorting & partial PATCH", async () => {
      // Invalid range (ends_at <= starts_at)
      const badEv = await apiRequest(srv.baseUrl, "POST", `/api/classrooms/${classroomId}/events`, {
        jar: adminJar,
        body: {
          title: "Bad range",
          starts_at: "2026-12-10T12:00:00.000Z",
          ends_at: "2026-12-10T11:00:00.000Z",
        },
      });
      assert.equal(badEv.status, 400);
      assert.equal(badEv.data.code, "INVALID_EVENT_RANGE");

      // Create LATER event first, EARLIER event second
      const laterRes = await apiRequest(
        srv.baseUrl,
        "POST",
        `/api/classrooms/${classroomId}/events`,
        {
          jar: adminJar,
          body: {
            title: "Декабрьский экзамен",
            description: "Кабинет 301",
            starts_at: "2026-12-20T09:00:00.000Z",
            ends_at: "2026-12-20T11:00:00.000Z",
          },
        }
      );
      assert.equal(laterRes.status, 201);
      ev2Id = laterRes.data.id;

      const earlierRes = await apiRequest(
        srv.baseUrl,
        "POST",
        `/api/classrooms/${classroomId}/events`,
        {
          jar: ownerJar,
          body: {
            title: "Ноябрьская олимпиада",
            description: "Кабинет 105",
            starts_at: "2026-11-28T08:00:00.000Z",
            ends_at: "2026-11-28T10:00:00.000Z",
          },
        }
      );
      assert.equal(earlierRes.status, 201);
      ev1Id = earlierRes.data.id;

      // Verify ascending chronological sort
      const allEv = await apiRequest(srv.baseUrl, "GET", `/api/classrooms/${classroomId}/events`, {
        jar: adminJar,
      });
      assert.equal(allEv.status, 200);
      assert.equal(allEv.data.length, 2);
      assert.equal(allEv.data[0].id, ev1Id);
      assert.equal(allEv.data[1].id, ev2Id);

      // Range filtering (?from & ?to)
      const decOnly = await apiRequest(
        srv.baseUrl,
        "GET",
        `/api/classrooms/${classroomId}/events?from=2026-12-01T00:00:00.000Z&to=2026-12-31T23:59:59.000Z`,
        { jar: adminJar }
      );
      assert.equal(decOnly.status, 200);
      assert.equal(decOnly.data.length, 1);
      assert.equal(decOnly.data[0].id, ev2Id);

      // Invalid date filter -> 400
      const badFilter = await apiRequest(
        srv.baseUrl,
        "GET",
        `/api/classrooms/${classroomId}/events?from=not-a-date`,
        { jar: adminJar }
      );
      assert.equal(badFilter.status, 400);
      assert.equal(badFilter.data.code, "INVALID_DATE_RANGE");

      // Partial PATCH preserves description & timestamps
      const patchEv = await apiRequest(
        srv.baseUrl,
        "PATCH",
        `/api/classrooms/${classroomId}/events/${ev1Id}`,
        {
          jar: adminJar,
          body: { title: "Ноябрьская олимпиада (обновлено)" },
        }
      );
      assert.equal(patchEv.status, 200);
      assert.equal(patchEv.data.title, "Ноябрьская олимпиада (обновлено)");
      assert.equal(patchEv.data.description, "Кабинет 105");

      // Non-existent event -> 404
      const delMissing = await apiRequest(
        srv.baseUrl,
        "DELETE",
        `/api/classrooms/${classroomId}/events/ev_missing`,
        { jar: ownerJar }
      );
      assert.equal(delMissing.status, 404);
      assert.equal(delMissing.data.code, "EVENT_NOT_FOUND");
    });

    console.log("\n6. Password Reset Security (No Enumeration, OTP Lockout & Session Revocation)");

    await runStep("Production mode without SMTP returns 503 SMTP_NOT_CONFIGURED", async () => {
      const prodDbPath = path.join(tmpDir, "prod_smtp_check.sqlite");
      process.env.NODE_ENV = "production";
      const prodSrv = await startTestServer(prodDbPath, { enableRateLimit: false });
      try {
        const prodCfg = await apiRequest(prodSrv.baseUrl, "GET", "/api/auth/config");
        assert.equal(prodCfg.status, 200);
        assert.equal(prodCfg.data.smtp_configured, false);

        const reqReset = await apiRequest(
          prodSrv.baseUrl,
          "POST",
          "/api/auth/password-reset/request",
          { body: { email: "admin@school.ru" } }
        );
        assert.equal(reqReset.status, 503);
        assert.equal(reqReset.data.code, "SMTP_NOT_CONFIGURED");
      } finally {
        await prodSrv.close();
        process.env.NODE_ENV = savedEnv.NODE_ENV ?? "test";
      }
    });

    await runStep("Reset request prevents email enumeration (uniform 200 OK)", async () => {
      capturedOtps.length = 0;

      const existingRes = await apiRequest(srv.baseUrl, "POST", "/api/auth/password-reset/request", {
        body: { email: "admin@school.ru", lang: "ru" },
      });
      const unknownRes = await apiRequest(srv.baseUrl, "POST", "/api/auth/password-reset/request", {
        body: { email: "nonexistent@school.ru", lang: "ru" },
      });

      assert.equal(existingRes.status, 200);
      assert.equal(unknownRes.status, 200);
      assert.deepEqual(existingRes.data, unknownRes.data);
      assert.equal(capturedOtps.length, 1);
      assert.equal(capturedOtps[0].email, "admin@school.ru");
      assert.match(capturedOtps[0].code, /^\d{6}$/);
    });

    await runStep("OTP locks out after 5 failed attempts (brute-force protection)", async () => {
      const realCode = capturedOtps[0].code;
      const wrongCode = realCode === "000000" ? "111111" : "000000";

      for (let attempt = 1; attempt <= 4; attempt++) {
        const wrongRes = await apiRequest(srv.baseUrl, "POST", "/api/auth/password-reset/confirm", {
          body: { email: "admin@school.ru", code: wrongCode, new_password: "NewPassword999!" },
        });
        assert.equal(wrongRes.status, 400);
        assert.equal(wrongRes.data.code, "INVALID_RESET_CODE");
      }

      // 5th wrong attempt triggers lockout (429 RESET_CODE_LOCKED)
      const fifthRes = await apiRequest(srv.baseUrl, "POST", "/api/auth/password-reset/confirm", {
        body: { email: "admin@school.ru", code: wrongCode, new_password: "NewPassword999!" },
      });
      assert.equal(fifthRes.status, 429);
      assert.equal(fifthRes.data.code, "RESET_CODE_LOCKED");

      // Even the REAL code is now rejected because the OTP was invalidated on lockout
      const realAfterLock = await apiRequest(
        srv.baseUrl,
        "POST",
        "/api/auth/password-reset/confirm",
        {
          body: { email: "admin@school.ru", code: realCode, new_password: "NewPassword999!" },
        }
      );
      assert.equal(realAfterLock.status, 400);
      assert.equal(realAfterLock.data.code, "INVALID_RESET_CODE");
    });

    await runStep("Valid OTP updates password and atomically revokes all active sessions", async () => {
      // Confirm adminJar is currently authenticated
      assert.equal(
        (await apiRequest(srv.baseUrl, "GET", "/api/auth/me", { jar: adminJar })).status,
        200
      );

      capturedOtps.length = 0;
      const req2 = await apiRequest(srv.baseUrl, "POST", "/api/auth/password-reset/request", {
        body: { email: "admin@school.ru" },
      });
      assert.equal(req2.status, 200);
      assert.equal(capturedOtps.length, 1);
      const validCode = capturedOtps[0].code;

      const confirmRes = await apiRequest(srv.baseUrl, "POST", "/api/auth/password-reset/confirm", {
        body: { email: "admin@school.ru", code: validCode, new_password: "BrandNewPassword2026!" },
      });
      assert.equal(confirmRes.status, 200);

      // Existing adminJar session MUST be revoked
      assert.equal(
        (await apiRequest(srv.baseUrl, "GET", "/api/auth/me", { jar: adminJar })).status,
        401
      );

      // Reusing same code fails
      const reuse = await apiRequest(srv.baseUrl, "POST", "/api/auth/password-reset/confirm", {
        body: { email: "admin@school.ru", code: validCode, new_password: "AnotherPassword123!" },
      });
      assert.equal(reuse.status, 400);

      // Old password fails, new password succeeds
      assert.equal(
        (
          await apiRequest(srv.baseUrl, "POST", "/api/auth/login", {
            body: { username: "class_admin", password: "Password123!" },
          })
        ).status,
        401
      );
      assert.equal(
        (
          await apiRequest(srv.baseUrl, "POST", "/api/auth/login", {
            jar: adminJar,
            body: { username: "class_admin", password: "BrandNewPassword2026!" },
          })
        ).status,
        200
      );
    });

    console.log("\n7. SQLite WAL Persistence, Cleanup Hygiene & Cascade FK Delete");

    await runStep("Expired session & OTP cleanup removes stale records only", () => {
      const pastIso = new Date(Date.now() - 60_000).toISOString();
      srv.db
        .prepare(
          "INSERT INTO sessions (id, session_id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
        )
        .run("sid_expired", "sess_expired", ownerId, pastIso, pastIso);

      const { deletedSessions, deletedResetCodes } = cleanupExpiredAuthRecords(srv.db);
      assert.ok(deletedSessions >= 1);
      assert.ok(deletedResetCodes >= 1);

      const expiredGone = srv.db
        .prepare("SELECT id FROM sessions WHERE id = 'sid_expired'")
        .get();
      assert.equal(expiredGone, undefined);
    });

    await runStep("WAL persistence survives full server restart", async () => {
      await srv.close();
      srv = await startTestServer(dbPath, { enableRateLimit: false });

      // Owner session & classroom data survived restart
      const me = await apiRequest(srv.baseUrl, "GET", "/api/auth/me", { jar: ownerJar });
      assert.equal(me.status, 200);
      assert.equal(me.data.id, ownerId);

      const eventsAfterRestart = await apiRequest(
        srv.baseUrl,
        "GET",
        `/api/classrooms/${classroomId}/events`,
        { jar: ownerJar }
      );
      assert.equal(eventsAfterRestart.status, 200);
      assert.equal(eventsAfterRestart.data.length, 2);
    });

    await runStep("Deleting classroom cascades to members & events via SQLite FK", async () => {
      const delRes = await apiRequest(srv.baseUrl, "DELETE", `/api/classrooms/${classroomId}`, {
        jar: ownerJar,
      });
      assert.equal(delRes.status, 200);

      const remainingClassrooms = (
        srv.db.prepare("SELECT COUNT(*) AS c FROM classrooms WHERE id = ?").get(classroomId) as any
      ).c;
      const remainingMembers = (
        srv.db
          .prepare("SELECT COUNT(*) AS c FROM members WHERE classroom_id = ?")
          .get(classroomId) as any
      ).c;
      const remainingEvents = (
        srv.db
          .prepare("SELECT COUNT(*) AS c FROM events WHERE classroom_id = ?")
          .get(classroomId) as any
      ).c;

      assert.equal(remainingClassrooms, 0);
      assert.equal(remainingMembers, 0);
      assert.equal(remainingEvents, 0);
    });

    console.log("\n8. Rate Limiting Protection");

    await runStep("Sliding-window rate limiter enforces 429 RATE_LIMITED on login flood", async () => {
      const rlDbPath = path.join(tmpDir, "rl_test.sqlite");
      const rlSrv = await startTestServer(rlDbPath, { enableRateLimit: true });
      try {
        let got429 = false;
        let retryAfter: string | null = null;
        for (let i = 0; i < 25; i++) {
          const r = await apiRequest(rlSrv.baseUrl, "POST", "/api/auth/login", {
            body: { username: "nobody", password: "wrongpassword" },
          });
          if (r.status === 429) {
            assert.equal(r.data.code, "RATE_LIMITED");
            retryAfter = r.res.headers.get("retry-after");
            got429 = true;
            break;
          }
        }
        assert.equal(got429, true, "Expected 429 RATE_LIMITED after exceeding login burst limit");
        assert.ok(retryAfter && Number(retryAfter) > 0, "Expected positive Retry-After header");
      } finally {
        await rlSrv.close();
      }
    });

    console.log(`\nALL ${passedTests} VERIFICATION CHECKS PASSED SUCCESSFULLY!`);
  } finally {
    await srv.close().catch(() => {});
    if (savedEnv.NODE_ENV !== undefined) process.env.NODE_ENV = savedEnv.NODE_ENV;
    else delete process.env.NODE_ENV;
    if (savedEnv.SMTP_HOST !== undefined) process.env.SMTP_HOST = savedEnv.SMTP_HOST;
    if (savedEnv.SMTP_USER !== undefined) process.env.SMTP_USER = savedEnv.SMTP_USER;
    if (savedEnv.SMTP_PASS !== undefined) process.env.SMTP_PASS = savedEnv.SMTP_PASS;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runAllTests().catch((err) => {
  console.error("\nVERIFICATION SUITE FAILED:", err);
  process.exit(1);
});
