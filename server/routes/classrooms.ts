import crypto from "crypto";
import express from "express";
import type Database from "better-sqlite3";
import {
  ensureOwnerMembership,
  formatClassroomResponse,
  generateUniqueInviteCode,
  getClassroomWithMeta,
} from "../db.ts";
import {
  createAuthenticateUser,
  createLoadClassroomMember,
  createRateLimiter,
  requireClassroomRole,
} from "../middleware.ts";
import type {
  AppRequest,
  ClassroomRecord,
  EventRecord,
  MemberRecord,
  MemberRole,
  RateLimitConfig,
  UserRecord,
} from "../types.ts";

export const MAX_CLASSROOM_DESC_LENGTH = 2000;
export const MAX_EVENT_DESC_LENGTH = 4000;
export const MAX_MEMBERS_CAP = 1000;

function parseBooleanFlag(value: unknown, fallback: number): number {
  if (value === true || value === 1 || value === "1" || value === "true") {
    return 1;
  }
  if (value === false || value === 0 || value === "0" || value === "false") {
    return 0;
  }
  return Number(fallback) === 1 ? 1 : 0;
}

function parseMaxMembersValue(value: unknown, fallback: number): number {
  if (value === undefined) {
    return Math.max(0, Math.min(MAX_MEMBERS_CAP, Math.floor(Number(fallback) || 0)));
  }
  if (value === null || value === "") {
    return 0;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.min(MAX_MEMBERS_CAP, Math.floor(parsed));
  }
  return Math.max(0, Math.min(MAX_MEMBERS_CAP, Math.floor(Number(fallback) || 0)));
}

function formatEventResponse(e: EventRecord & { creator_username: string }) {
  return {
    id: e.id,
    classroom_id: e.classroom_id,
    creator_id: e.creator_id,
    creator_username: e.creator_username,
    title: e.title,
    description: e.description || undefined,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    created_at: e.created_at,
    updated_at: e.updated_at,
  };
}

interface ClassroomRouterDeps {
  db: Database.Database;
  enableRateLimit: boolean;
  rateLimits: RateLimitConfig;
}

export function createClassroomRouter({
  db,
  enableRateLimit,
  rateLimits,
}: ClassroomRouterDeps) {
  const router = express.Router();
  const authenticateUser = createAuthenticateUser(db);
  const loadClassroomMember = createLoadClassroomMember(db);
  // Keyed by authenticated user (not just IP) because an entire class can share one
  // school NAT address; each student must get their own join budget.
  const joinLimiter = createRateLimiter(
    rateLimits.joinClassroom,
    enableRateLimit,
    (req) => (req as AppRequest).user?.id || ""
  );

  // List my classrooms
  router.get("/", authenticateUser, (rawReq, res) => {
    const req = rawReq as AppRequest;
    const rows = db
      .prepare(
        `
        SELECT c.*,
               CASE WHEN c.owner_id = m.user_id THEN 'owner' ELSE m.role END as user_role,
               u.username as owner_username,
               (SELECT COUNT(*) FROM members m2 WHERE m2.classroom_id = c.id) as member_count
        FROM members m
        JOIN classrooms c ON c.id = m.classroom_id
        LEFT JOIN users u ON u.id = c.owner_id
        WHERE m.user_id = ?
        ORDER BY c.created_at DESC
        `
      )
      .all(req.user!.id) as Array<
      ClassroomRecord & {
        user_role: MemberRole;
        owner_username: string | null;
        member_count: number;
      }
    >;

    res.json(rows.map((r) => formatClassroomResponse(r, r.user_role)));
  });

  // Create classroom
  router.post("/", authenticateUser, (rawReq, res) => {
    const req = rawReq as AppRequest;
    const { name, description, is_closed, max_members } = req.body || {};
    const cleanName = typeof name === "string" ? name.trim() : "";
    const cleanDesc =
      typeof description === "string" && description.trim() ? description.trim() : null;

    if (cleanName.length < 2 || cleanName.length > 100) {
      res.status(400).json({
        code: "INVALID_NAME",
        detail: "Название класса обязательно (от 2 до 100 символов).",
      });
      return;
    }

    if (cleanDesc && cleanDesc.length > MAX_CLASSROOM_DESC_LENGTH) {
      res.status(400).json({
        code: "DESCRIPTION_TOO_LONG",
        detail: `Описание класса не может превышать ${MAX_CLASSROOM_DESC_LENGTH} символов.`,
      });
      return;
    }

    const classroomId = "cr_" + crypto.randomBytes(8).toString("hex");
    const memberId = "mem_" + crypto.randomBytes(8).toString("hex");
    const inviteCode = generateUniqueInviteCode(db);
    const closedFlag = parseBooleanFlag(is_closed, 0);
    const cap = parseMaxMembersValue(max_members, 0);
    const nowIso = new Date().toISOString();

    db.transaction(() => {
      db.prepare(
        `INSERT INTO classrooms (id, name, description, owner_id, invite_code, is_closed, max_members, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        classroomId,
        cleanName,
        cleanDesc,
        req.user!.id,
        inviteCode,
        closedFlag,
        cap,
        nowIso,
        nowIso
      );

      db.prepare(
        "INSERT INTO members (id, user_id, classroom_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)"
      ).run(memberId, req.user!.id, classroomId, nowIso);
    })();

    res.status(201).json({
      id: classroomId,
      name: cleanName,
      description: cleanDesc || undefined,
      owner_id: req.user!.id,
      owner_username: req.user!.username,
      invite_code: inviteCode,
      user_role: "owner",
      is_closed: closedFlag === 1,
      max_members: cap,
      member_count: 1,
      created_at: nowIso,
    });
  });

  // Join classroom by invite code
  router.post("/join", authenticateUser, joinLimiter, (rawReq, res) => {
    const req = rawReq as AppRequest;
    const { invite_code } = req.body || {};
    const cleanCode = typeof invite_code === "string" ? invite_code.trim().toUpperCase() : "";

    if (!cleanCode) {
      res.status(400).json({
        code: "INVITE_CODE_REQUIRED",
        detail: "Введите код приглашения.",
      });
      return;
    }

    interface JoinOutcome {
      ok: boolean;
      payload?: ReturnType<typeof formatClassroomResponse>;
      status?: number;
      body?: Record<string, unknown>;
    }

    const outcome = db.transaction((): JoinOutcome => {
      const classroom = db
        .prepare(
          `SELECT c.*, u.username as owner_username
           FROM classrooms c
           LEFT JOIN users u ON u.id = c.owner_id
           WHERE UPPER(c.invite_code) = ?`
        )
        .get(cleanCode) as (ClassroomRecord & { owner_username: string | null }) | undefined;

      if (!classroom) {
        return {
          ok: false,
          status: 404,
          body: {
            code: "CLASSROOM_NOT_FOUND",
            detail: "Класс с таким кодом приглашения не найден.",
          },
        };
      }

      const userId = req.user!.id;
      if (classroom.owner_id === userId) {
        ensureOwnerMembership(db, classroom);
      }

      const existing = db
        .prepare("SELECT * FROM members WHERE user_id = ? AND classroom_id = ?")
        .get(userId, classroom.id) as MemberRecord | undefined;

      if (existing) {
        const fresh = getClassroomWithMeta(db, classroom.id) || { ...classroom, member_count: 1 };
        const effectiveRole: MemberRole = classroom.owner_id === userId ? "owner" : existing.role;
        return {
          ok: true,
          payload: formatClassroomResponse(fresh, effectiveRole),
        };
      }

      if (Number(classroom.is_closed) === 1) {
        return {
          ok: false,
          status: 403,
          body: {
            code: "CLASSROOM_CLOSED",
            classroom_name: classroom.name,
            detail:
              "Этот класс закрыт владельцем. Вступление новых участников по коду приглашения временно отключено.",
          },
        };
      }

      const maxCap = Math.max(0, Number(classroom.max_members || 0));
      const { count } = db
        .prepare("SELECT COUNT(*) as count FROM members WHERE classroom_id = ?")
        .get(classroom.id) as { count: number };

      if (maxCap > 0 && count >= maxCap) {
        return {
          ok: false,
          status: 403,
          body: {
            code: "CLASSROOM_FULL",
            classroom_name: classroom.name,
            max_members: maxCap,
            member_count: count,
            detail: `Достигнут лимит участников класса (${count} из ${maxCap}).`,
          },
        };
      }

      const memberId = "mem_" + crypto.randomBytes(8).toString("hex");
      const nowIso = new Date().toISOString();

      db.prepare(
        "INSERT INTO members (id, user_id, classroom_id, role, created_at) VALUES (?, ?, ?, 'member', ?)"
      ).run(memberId, userId, classroom.id, nowIso);

      const fresh = getClassroomWithMeta(db, classroom.id) || {
        ...classroom,
        member_count: count + 1,
      };
      return {
        ok: true,
        payload: formatClassroomResponse(fresh, "member"),
      };
    })();

    if (!outcome.ok) {
      res.status(outcome.status || 400).json(outcome.body || {});
      return;
    }

    res.json(outcome.payload);
  });

  // Get classroom details
  router.get("/:classroom_id", authenticateUser, loadClassroomMember, (rawReq, res) => {
    const req = rawReq as AppRequest;
    res.json(formatClassroomResponse(req.classroom!, req.callerRole!));
  });

  // Update classroom settings (Owner only, supports partial updates)
  router.patch(
    "/:classroom_id",
    authenticateUser,
    loadClassroomMember,
    requireClassroomRole(["owner"], "Изменять настройки класса может только его владелец."),
    (rawReq, res) => {
      const req = rawReq as AppRequest;
      const classroom = req.classroom!;
      const { name, description, is_closed, max_members } = req.body || {};

      let nextName = classroom.name;
      if (name !== undefined) {
        const trimmedName = typeof name === "string" ? name.trim() : "";
        if (trimmedName.length < 2 || trimmedName.length > 100) {
          res.status(400).json({
            code: "INVALID_NAME",
            detail: "Название класса обязательно (от 2 до 100 символов).",
          });
          return;
        }
        nextName = trimmedName;
      }

      let updatedDesc = classroom.description;
      if (description !== undefined) {
        const trimmedDesc =
          typeof description === "string" && description.trim() ? description.trim() : null;
        if (trimmedDesc && trimmedDesc.length > MAX_CLASSROOM_DESC_LENGTH) {
          res.status(400).json({
            code: "DESCRIPTION_TOO_LONG",
            detail: `Описание класса не может превышать ${MAX_CLASSROOM_DESC_LENGTH} символов.`,
          });
          return;
        }
        updatedDesc = trimmedDesc;
      }

      const updatedClosed = parseBooleanFlag(is_closed, classroom.is_closed);
      const updatedCap = parseMaxMembersValue(max_members, classroom.max_members);
      const nowIso = new Date().toISOString();

      db.prepare(
        "UPDATE classrooms SET name = ?, description = ?, is_closed = ?, max_members = ?, updated_at = ? WHERE id = ?"
      ).run(nextName, updatedDesc, updatedClosed, updatedCap, nowIso, classroom.id);

      const freshClassroom = getClassroomWithMeta(db, classroom.id) || {
        ...classroom,
        name: nextName,
        description: updatedDesc,
        is_closed: updatedClosed,
        max_members: updatedCap,
        updated_at: nowIso,
      };

      res.json(formatClassroomResponse(freshClassroom, "owner"));
    }
  );

  // Delete classroom (Owner only; cascades to events and members)
  router.delete(
    "/:classroom_id",
    authenticateUser,
    loadClassroomMember,
    requireClassroomRole(["owner"], "Удалить класс может только его владелец."),
    (rawReq, res) => {
      const req = rawReq as AppRequest;
      const classroomId = req.classroom!.id;

      db.transaction(() => {
        db.prepare("DELETE FROM events WHERE classroom_id = ?").run(classroomId);
        db.prepare("DELETE FROM members WHERE classroom_id = ?").run(classroomId);
        db.prepare("DELETE FROM classrooms WHERE id = ?").run(classroomId);
      })();

      res.json({ success: true, message: "Класс и все связанные записи удалены." });
    }
  );

  // --- Classroom Members ---

  router.get("/:classroom_id/members", authenticateUser, loadClassroomMember, (rawReq, res) => {
    const req = rawReq as AppRequest;
    const classroom = req.classroom!;

    const rows = db
      .prepare(
        `SELECT m.id, m.user_id, COALESCE(u.username, 'unknown') as username,
                CASE WHEN ? = m.user_id THEN 'owner' ELSE m.role END as role,
                m.created_at
         FROM members m
         LEFT JOIN users u ON u.id = m.user_id
         WHERE m.classroom_id = ?
         ORDER BY CASE WHEN ? = m.user_id THEN 0 WHEN m.role = 'owner' THEN 0 WHEN m.role = 'admin' THEN 1 ELSE 2 END, m.created_at ASC`
      )
      .all(classroom.owner_id, classroom.id, classroom.owner_id);

    res.json(rows);
  });

  router.post(
    "/:classroom_id/members",
    authenticateUser,
    loadClassroomMember,
    requireClassroomRole(["owner", "admin"], "Недостаточно прав для добавления участников."),
    (rawReq, res) => {
      const req = rawReq as AppRequest;
      const classroomId = req.classroom!.id;
      const callerRole = req.callerRole!;
      const { username, role } = req.body || {};
      const cleanUsername = typeof username === "string" ? username.trim() : "";

      if (!cleanUsername || !role) {
        res.status(400).json({
          code: "INVALID_INPUT",
          detail: "Укажите имя пользователя и назначаемую роль.",
        });
        return;
      }

      if (role !== "admin" && role !== "member") {
        res.status(400).json({
          code: "INVALID_ROLE",
          detail: "Роль должна быть 'admin' или 'member'.",
        });
        return;
      }

      if (role === "admin" && callerRole !== "owner") {
        res.status(403).json({
          code: "FORBIDDEN_OWNER_ONLY",
          detail: "Назначать администраторов может только владелец класса.",
        });
        return;
      }

      interface AddMemberOutcome {
        ok: boolean;
        payload?: Record<string, unknown>;
        status?: number;
        body?: Record<string, unknown>;
      }

      const outcome = db.transaction((): AddMemberOutcome => {
        const freshClassroom = db
          .prepare("SELECT * FROM classrooms WHERE id = ?")
          .get(classroomId) as ClassroomRecord | undefined;

        if (!freshClassroom) {
          return {
            ok: false,
            status: 404,
            body: { code: "CLASSROOM_NOT_FOUND", detail: "Класс не найден." },
          };
        }

        const targetUser = db
          .prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?)")
          .get(cleanUsername) as UserRecord | undefined;

        if (!targetUser) {
          return {
            ok: false,
            status: 404,
            body: {
              code: "USER_NOT_FOUND",
              detail: `Пользователь «${cleanUsername}» не найден.`,
            },
          };
        }

        const existing = db
          .prepare("SELECT id FROM members WHERE classroom_id = ? AND user_id = ?")
          .get(classroomId, targetUser.id);

        if (existing) {
          return {
            ok: false,
            status: 400,
            body: {
              code: "ALREADY_MEMBER",
              detail: "Пользователь уже состоит в этом классе.",
            },
          };
        }

        const maxCap = Math.max(0, Number(freshClassroom.max_members || 0));
        if (maxCap > 0) {
          const { count } = db
            .prepare("SELECT COUNT(*) as count FROM members WHERE classroom_id = ?")
            .get(classroomId) as { count: number };
          if (count >= maxCap) {
            return {
              ok: false,
              status: 403,
              body: {
                code: "CLASSROOM_FULL",
                max_members: maxCap,
                member_count: count,
                detail: `Достигнут лимит участников класса (${count} из ${maxCap}).`,
              },
            };
          }
        }

        const memberId = "mem_" + crypto.randomBytes(8).toString("hex");
        const nowIso = new Date().toISOString();

        db.prepare(
          "INSERT INTO members (id, user_id, classroom_id, role, created_at) VALUES (?, ?, ?, ?, ?)"
        ).run(memberId, targetUser.id, classroomId, role, nowIso);

        return {
          ok: true,
          payload: {
            id: memberId,
            user_id: targetUser.id,
            username: targetUser.username,
            role,
            created_at: nowIso,
          },
        };
      })();

      if (!outcome.ok) {
        res.status(outcome.status || 400).json(outcome.body || {});
        return;
      }

      res.status(201).json(outcome.payload);
    }
  );

  router.patch(
    "/:classroom_id/members/:member_id",
    authenticateUser,
    loadClassroomMember,
    requireClassroomRole(["owner"], "Изменять роли участников может только владелец класса."),
    (rawReq, res) => {
      const req = rawReq as AppRequest;
      const classroom = req.classroom!;
      const { member_id } = req.params;
      const { role } = req.body || {};

      const targetMember = db
        .prepare("SELECT * FROM members WHERE id = ? AND classroom_id = ?")
        .get(member_id, classroom.id) as MemberRecord | undefined;

      if (!targetMember) {
        res.status(404).json({
          code: "MEMBER_NOT_FOUND",
          detail: "Участник не найден в этом классе.",
        });
        return;
      }

      if (targetMember.role === "owner" || targetMember.user_id === classroom.owner_id) {
        res.status(400).json({
          code: "OWNER_IMMUTABLE",
          detail: "Роль владельца класса не может быть изменена.",
        });
        return;
      }

      if (role !== "admin" && role !== "member") {
        res.status(400).json({
          code: "INVALID_ROLE",
          detail: "Роль должна быть 'admin' или 'member'.",
        });
        return;
      }

      db.prepare("UPDATE members SET role = ? WHERE id = ?").run(role, member_id);

      const u = db
        .prepare("SELECT username FROM users WHERE id = ?")
        .get(targetMember.user_id) as { username: string } | undefined;

      res.json({
        id: targetMember.id,
        user_id: targetMember.user_id,
        username: u ? u.username : "unknown",
        role,
        created_at: targetMember.created_at,
      });
    }
  );

  router.delete(
    "/:classroom_id/members/:member_id",
    authenticateUser,
    loadClassroomMember,
    (rawReq, res) => {
      const req = rawReq as AppRequest;
      const classroom = req.classroom!;
      const callerMembership = req.callerMembership!;
      const callerRole = req.callerRole!;
      const { member_id } = req.params;

      const targetMember = db
        .prepare("SELECT * FROM members WHERE id = ? AND classroom_id = ?")
        .get(member_id, classroom.id) as MemberRecord | undefined;

      if (!targetMember) {
        res.status(404).json({
          code: "MEMBER_NOT_FOUND",
          detail: "Участник не найден в этом классе.",
        });
        return;
      }

      if (targetMember.role === "owner" || targetMember.user_id === classroom.owner_id) {
        res.status(400).json({
          code: "OWNER_IMMUTABLE",
          detail: "Владелец не может покинуть класс или быть исключен.",
        });
        return;
      }

      const isSelf = callerMembership.user_id === targetMember.user_id;
      const canDismiss =
        isSelf ||
        callerRole === "owner" ||
        (callerRole === "admin" && targetMember.role === "member");

      if (!canDismiss) {
        res.status(403).json({
          code: "FORBIDDEN",
          detail: "Недостаточно прав для исключения этого участника.",
        });
        return;
      }

      db.prepare("DELETE FROM members WHERE id = ?").run(member_id);
      res.json({ success: true, message: "Участник удален из класса." });
    }
  );

  // --- Classroom Events ---

  router.get("/:classroom_id/events", authenticateUser, loadClassroomMember, (rawReq, res) => {
    const req = rawReq as AppRequest;
    const classroomId = req.classroom!.id;
    const rawFrom = typeof req.query.from === "string" ? req.query.from.trim() : "";
    const rawTo = typeof req.query.to === "string" ? req.query.to.trim() : "";

    const conditions = ["e.classroom_id = ?"];
    const params: string[] = [classroomId];

    if (rawFrom) {
      const fromDate = new Date(rawFrom);
      if (Number.isNaN(fromDate.getTime())) {
        res.status(400).json({
          code: "INVALID_DATE_RANGE",
          detail: "Некорректный формат параметра from.",
        });
        return;
      }
      conditions.push("e.ends_at >= ?");
      params.push(fromDate.toISOString());
    }

    if (rawTo) {
      const toDate = new Date(rawTo);
      if (Number.isNaN(toDate.getTime())) {
        res.status(400).json({
          code: "INVALID_DATE_RANGE",
          detail: "Некорректный формат параметра to.",
        });
        return;
      }
      conditions.push("e.starts_at <= ?");
      params.push(toDate.toISOString());
    }

    const rows = db
      .prepare(
        `SELECT e.*, COALESCE(u.username, 'unknown') as creator_username
         FROM events e
         LEFT JOIN users u ON u.id = e.creator_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY e.starts_at ASC`
      )
      .all(...params) as Array<EventRecord & { creator_username: string }>;

    res.json(rows.map(formatEventResponse));
  });

  router.post(
    "/:classroom_id/events",
    authenticateUser,
    loadClassroomMember,
    requireClassroomRole(
      ["owner", "admin"],
      "Создавать события могут только владелец и администраторы класса."
    ),
    (rawReq, res) => {
      const req = rawReq as AppRequest;
      const classroomId = req.classroom!.id;
      const { title, description, starts_at, ends_at } = req.body || {};

      const cleanTitle = typeof title === "string" ? title.trim() : "";
      if (
        cleanTitle.length < 2 ||
        cleanTitle.length > 150 ||
        typeof starts_at !== "string" ||
        typeof ends_at !== "string"
      ) {
        res.status(400).json({
          code: "INVALID_EVENT_INPUT",
          detail: "Укажите название события (от 2 до 150 символов), время начала и окончания.",
        });
        return;
      }

      const cleanDesc =
        typeof description === "string" && description.trim() ? description.trim() : null;
      if (cleanDesc && cleanDesc.length > MAX_EVENT_DESC_LENGTH) {
        res.status(400).json({
          code: "DESCRIPTION_TOO_LONG",
          detail: `Описание события не может превышать ${MAX_EVENT_DESC_LENGTH} символов.`,
        });
        return;
      }

      const startDate = new Date(starts_at);
      const endDate = new Date(ends_at);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        res.status(400).json({
          code: "INVALID_EVENT_TIME",
          detail: "Некорректный формат даты или времени события.",
        });
        return;
      }

      if (endDate.getTime() <= startDate.getTime()) {
        res.status(400).json({
          code: "INVALID_EVENT_RANGE",
          detail: "Время окончания события должно быть позже времени начала.",
        });
        return;
      }

      const eventId = "ev_" + crypto.randomBytes(8).toString("hex");
      const utcStarts = startDate.toISOString();
      const utcEnds = endDate.toISOString();
      const nowIso = new Date().toISOString();

      db.prepare(
        `INSERT INTO events (id, classroom_id, creator_id, title, description, starts_at, ends_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        eventId,
        classroomId,
        req.user!.id,
        cleanTitle,
        cleanDesc,
        utcStarts,
        utcEnds,
        nowIso,
        nowIso
      );

      res.status(201).json({
        id: eventId,
        classroom_id: classroomId,
        creator_id: req.user!.id,
        creator_username: req.user!.username,
        title: cleanTitle,
        description: cleanDesc || undefined,
        starts_at: utcStarts,
        ends_at: utcEnds,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }
  );

  router.get(
    "/:classroom_id/events/:event_id",
    authenticateUser,
    loadClassroomMember,
    (rawReq, res) => {
      const req = rawReq as AppRequest;
      const classroomId = req.classroom!.id;
      const { event_id } = req.params;

      const event = db
        .prepare(
          `SELECT e.*, COALESCE(u.username, 'unknown') as creator_username
           FROM events e
           LEFT JOIN users u ON u.id = e.creator_id
           WHERE e.id = ? AND e.classroom_id = ?`
        )
        .get(event_id, classroomId) as (EventRecord & { creator_username: string }) | undefined;

      if (!event) {
        res.status(404).json({
          code: "EVENT_NOT_FOUND",
          detail: "Событие не найдено.",
        });
        return;
      }

      res.json(formatEventResponse(event));
    }
  );

  router.patch(
    "/:classroom_id/events/:event_id",
    authenticateUser,
    loadClassroomMember,
    requireClassroomRole(
      ["owner", "admin"],
      "Редактировать события могут только владелец и администраторы класса."
    ),
    (rawReq, res) => {
      const req = rawReq as AppRequest;
      const classroomId = req.classroom!.id;
      const { event_id } = req.params;
      const { title, description, starts_at, ends_at } = req.body || {};

      const event = db
        .prepare("SELECT * FROM events WHERE id = ? AND classroom_id = ?")
        .get(event_id, classroomId) as EventRecord | undefined;

      if (!event) {
        res.status(404).json({
          code: "EVENT_NOT_FOUND",
          detail: "Событие не найдено.",
        });
        return;
      }

      let nextTitle = event.title;
      if (title !== undefined) {
        const trimmed = typeof title === "string" ? title.trim() : "";
        if (trimmed.length < 2 || trimmed.length > 150) {
          res.status(400).json({
            code: "INVALID_EVENT_INPUT",
            detail: "Название события должно содержать от 2 до 150 символов.",
          });
          return;
        }
        nextTitle = trimmed;
      }

      let nextDesc = event.description;
      if (description !== undefined) {
        const trimmedDesc =
          typeof description === "string" && description.trim() ? description.trim() : null;
        if (trimmedDesc && trimmedDesc.length > MAX_EVENT_DESC_LENGTH) {
          res.status(400).json({
            code: "DESCRIPTION_TOO_LONG",
            detail: `Описание события не может превышать ${MAX_EVENT_DESC_LENGTH} символов.`,
          });
          return;
        }
        nextDesc = trimmedDesc;
      }

      const rawStarts = starts_at !== undefined ? starts_at : event.starts_at;
      const rawEnds = ends_at !== undefined ? ends_at : event.ends_at;
      const startDate = new Date(rawStarts);
      const endDate = new Date(rawEnds);

      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        res.status(400).json({
          code: "INVALID_EVENT_TIME",
          detail: "Некорректный формат даты или времени события.",
        });
        return;
      }

      if (endDate.getTime() <= startDate.getTime()) {
        res.status(400).json({
          code: "INVALID_EVENT_RANGE",
          detail: "Время окончания события должно быть позже времени начала.",
        });
        return;
      }

      const utcStarts = startDate.toISOString();
      const utcEnds = endDate.toISOString();
      const nowIso = new Date().toISOString();

      db.prepare(
        "UPDATE events SET title = ?, description = ?, starts_at = ?, ends_at = ?, updated_at = ? WHERE id = ?"
      ).run(nextTitle, nextDesc, utcStarts, utcEnds, nowIso, event.id);

      const creator = db
        .prepare("SELECT username FROM users WHERE id = ?")
        .get(event.creator_id) as { username: string } | undefined;

      res.json({
        id: event.id,
        classroom_id: event.classroom_id,
        creator_id: event.creator_id,
        creator_username: creator ? creator.username : "unknown",
        title: nextTitle,
        description: nextDesc || undefined,
        starts_at: utcStarts,
        ends_at: utcEnds,
        created_at: event.created_at,
        updated_at: nowIso,
      });
    }
  );

  router.delete(
    "/:classroom_id/events/:event_id",
    authenticateUser,
    loadClassroomMember,
    requireClassroomRole(
      ["owner", "admin"],
      "Удалять события могут только владелец и администраторы класса."
    ),
    (rawReq, res) => {
      const req = rawReq as AppRequest;
      const classroomId = req.classroom!.id;
      const { event_id } = req.params;

      const result = db
        .prepare("DELETE FROM events WHERE id = ? AND classroom_id = ?")
        .run(event_id, classroomId);

      if (result.changes === 0) {
        res.status(404).json({
          code: "EVENT_NOT_FOUND",
          detail: "Событие не найдено.",
        });
        return;
      }

      res.json({ success: true, message: "Событие удалено." });
    }
  );

  return router;
}
