import type { CookieOptions, NextFunction, Request, RequestHandler, Response } from "express";
import type Database from "better-sqlite3";
import { ensureOwnerMembership, getClassroomWithMeta } from "./db.ts";
import type {
  AppRequest,
  MemberRecord,
  MemberRole,
  RateLimitConfig,
  RateLimitRule,
  SessionRecord,
  UserRecord,
} from "./types.ts";

export const SESSION_COOKIE_NAME = "session_id";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  login: { windowMs: 15 * 60 * 1000, max: 20 },
  register: { windowMs: 60 * 60 * 1000, max: 15 },
  resetRequest: { windowMs: 15 * 60 * 1000, max: 5 },
  resetConfirm: { windowMs: 15 * 60 * 1000, max: 15 },
  joinClassroom: { windowMs: 15 * 60 * 1000, max: 25 },
};

export const securityHeadersMiddleware: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
};

export const cookieParserMiddleware: RequestHandler = (req, _res, next) => {
  const list: Record<string, string> = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    cookieHeader.split(";").forEach((cookie) => {
      const eqIdx = cookie.indexOf("=");
      if (eqIdx === -1) return;
      const key = cookie.slice(0, eqIdx).trim();
      const rawVal = cookie.slice(eqIdx + 1).trim();
      if (!key) return;
      try {
        list[key] = decodeURIComponent(rawVal);
      } catch {
        list[key] = rawVal;
      }
    });
  }
  (req as AppRequest).cookies = list;
  next();
};

export function getCookieOptions(req: Request, includeMaxAge = true): CookieOptions {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protoHeader = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const isHttps =
    req.secure ||
    (typeof protoHeader === "string" && protoHeader.split(",")[0].trim().toLowerCase() === "https");

  const options: CookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
  };

  if (includeMaxAge) {
    options.maxAge = SESSION_TTL_MS;
  }

  return options;
}

/**
 * Defense-in-depth CSRF protection alongside SameSite=Lax cookies:
 * verifies that browser-supplied Origin/Referer headers on mutating requests match the target Host.
 */
export const csrfOriginCheckMiddleware: RequestHandler = (req, res, next) => {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    next();
    return;
  }

  const forwardedHost = req.headers["x-forwarded-host"];
  const rawHost =
    (typeof forwardedHost === "string" ? forwardedHost.split(",")[0].trim() : undefined) ||
    req.get("host");

  if (!rawHost) {
    next();
    return;
  }

  const expectedHost = rawHost.toLowerCase();
  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;

  if (typeof originHeader === "string" && originHeader.trim()) {
    try {
      const originHost = new URL(originHeader).host.toLowerCase();
      if (originHost !== expectedHost) {
        res.status(403).json({
          code: "CSRF_REJECTED",
          detail: "Запрос отклонен политикой безопасности источника (CSRF).",
        });
        return;
      }
    } catch {
      res.status(403).json({
        code: "CSRF_REJECTED",
        detail: "Некорректный заголовок Origin.",
      });
      return;
    }
    next();
    return;
  }

  if (typeof refererHeader === "string" && refererHeader.trim()) {
    try {
      const refererHost = new URL(refererHeader).host.toLowerCase();
      if (refererHost !== expectedHost) {
        res.status(403).json({
          code: "CSRF_REJECTED",
          detail: "Запрос отклонен политикой безопасности источника (CSRF).",
        });
        return;
      }
    } catch {
      res.status(403).json({
        code: "CSRF_REJECTED",
        detail: "Некорректный заголовок Referer.",
      });
      return;
    }
  }

  next();
};

export function createRateLimiter(
  rule: RateLimitRule,
  enabled: boolean,
  keyFn?: (req: Request) => string
): RequestHandler {
  if (!enabled) {
    return (_req, _res, next) => next();
  }

  const hits = new Map<string, number[]>();
  let lastPrune = Date.now();

  return (req, res, next) => {
    const now = Date.now();
    const cutoff = now - rule.windowMs;

    if (now - lastPrune > Math.max(60_000, rule.windowMs)) {
      for (const [key, timestamps] of hits.entries()) {
        const fresh = timestamps.filter((t) => t > cutoff);
        if (fresh.length === 0) {
          hits.delete(key);
        } else {
          hits.set(key, fresh);
        }
      }
      lastPrune = now;
    }

    const clientIp = req.ip || req.socket.remoteAddress || "unknown";
    const key = keyFn ? `${clientIp}:${keyFn(req)}` : clientIp;
    const prev = hits.get(key) || [];
    const recent = prev.filter((t) => t > cutoff);

    if (recent.length >= rule.max) {
      const oldestInWindow = recent[0];
      const retryAfterSec = Math.max(1, Math.ceil((oldestInWindow + rule.windowMs - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        code: "RATE_LIMITED",
        detail: "Слишком много попыток. Повторите запрос позже.",
      });
      return;
    }

    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

export function extractSessionCookie(req: AppRequest): string | undefined {
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof cookieToken === "string" && cookieToken.trim()) {
    return cookieToken.trim();
  }
  return undefined;
}

export function createAuthenticateUser(db: Database.Database): RequestHandler {
  return (rawReq: Request, res: Response, next: NextFunction) => {
    const req = rawReq as AppRequest;
    const sessionId = extractSessionCookie(req);

    if (!sessionId) {
      res.status(401).json({
        code: "UNAUTHORIZED",
        detail: "Требуется авторизация (отсутствует сессия).",
      });
      return;
    }

    const session = db
      .prepare("SELECT * FROM sessions WHERE session_id = ? AND revoked_at IS NULL")
      .get(sessionId) as SessionRecord | undefined;

    if (!session) {
      res.status(401).json({
        code: "UNAUTHORIZED",
        detail: "Сессия недействительна или завершена.",
      });
      return;
    }

    if (new Date(session.expires_at).getTime() < Date.now()) {
      res.status(401).json({
        code: "SESSION_EXPIRED",
        detail: "Срок действия сессии истек. Войдите снова.",
      });
      return;
    }

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(session.user_id) as
      | UserRecord
      | undefined;

    if (!user) {
      res.status(401).json({
        code: "UNAUTHORIZED",
        detail: "Пользователь сессии не найден.",
      });
      return;
    }

    req.sessionId = sessionId;
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email || undefined,
    };
    next();
  };
}

export function createLoadClassroomMember(db: Database.Database): RequestHandler {
  return (rawReq: Request, res: Response, next: NextFunction) => {
    const req = rawReq as AppRequest;
    const classroomId = req.params.classroom_id;
    const classroom = getClassroomWithMeta(db, classroomId);

    if (!classroom) {
      res.status(404).json({
        code: "CLASSROOM_NOT_FOUND",
        detail: "Класс не найден.",
      });
      return;
    }

    const userId = req.user!.id;
    if (classroom.owner_id === userId) {
      ensureOwnerMembership(db, classroom);
    }

    const membership = db
      .prepare("SELECT * FROM members WHERE user_id = ? AND classroom_id = ?")
      .get(userId, classroom.id) as MemberRecord | undefined;

    if (!membership) {
      res.status(403).json({
        code: "NOT_A_MEMBER",
        detail: "Вы не состоите в этом классе.",
      });
      return;
    }

    req.classroom = classroom;
    req.callerMembership = membership;
    req.callerRole = classroom.owner_id === userId ? "owner" : membership.role;
    next();
  };
}

export function requireClassroomRole(allowedRoles: MemberRole[], ownerOnlyDetail?: string): RequestHandler {
  const isOwnerOnly = allowedRoles.length === 1 && allowedRoles[0] === "owner";
  return (rawReq: Request, res: Response, next: NextFunction) => {
    const req = rawReq as AppRequest;
    if (!req.callerRole || !allowedRoles.includes(req.callerRole)) {
      res.status(403).json({
        code: isOwnerOnly ? "FORBIDDEN_OWNER_ONLY" : "FORBIDDEN",
        detail:
          ownerOnlyDetail ||
          (isOwnerOnly
            ? "Это действие доступно только владельцу класса."
            : "Недостаточно прав для выполнения этого действия."),
      });
      return;
    }
    next();
  };
}
