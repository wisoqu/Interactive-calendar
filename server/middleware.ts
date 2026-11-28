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

function envPositiveInt(name: string, fallback: number): number {
  const parsed = parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Sliding-window limits. Keying strategy matters for real schools: dozens of
 * students often share one NAT/public IP, so account-scoped routes are keyed by
 * the submitted username/email and invite-code joins by the authenticated user.
 * Optional RATE_LIMIT_*_MAX env variables let administrators tune the limits.
 */
export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  login: { windowMs: 15 * 60 * 1000, max: envPositiveInt("RATE_LIMIT_LOGIN_MAX", 20) },
  register: { windowMs: 60 * 60 * 1000, max: envPositiveInt("RATE_LIMIT_REGISTER_MAX", 50) },
  resetRequest: { windowMs: 15 * 60 * 1000, max: envPositiveInt("RATE_LIMIT_RESET_REQUEST_MAX", 5) },
  resetConfirm: { windowMs: 15 * 60 * 1000, max: envPositiveInt("RATE_LIMIT_RESET_CONFIRM_MAX", 15) },
  joinClassroom: {
    windowMs: 15 * 60 * 1000,
    max: envPositiveInt("RATE_LIMIT_JOIN_MAX", 25),
  },
};

/** Normalizes an arbitrary request body field (username/email) for use as a limiter key. */
export function bodyFieldKey(field: string): (req: Request) => string {
  return (req) => {
    const raw = (req.body as Record<string, unknown> | undefined)?.[field];
    return typeof raw === "string" ? raw.trim().toLowerCase().slice(0, 254) : "";
  };
}

/**
 * Returns true when the request reached Express over HTTPS, either directly
 * (TLS-terminated by Node) or through a trusted reverse proxy that sent
 * `X-Forwarded-Proto: https` (Nginx in the official install script).
 */
export function isSecureRequest(req: Request): boolean {
  if (req.secure) {
    return true;
  }
  // Only honor X-Forwarded-Proto when proxy trust is explicitly enabled.
  // With TRUST_PROXY=0 (app published directly on IP:3000) a client-supplied
  // header must not influence cookie security or HSTS decisions.
  const trustProxy = req.app?.get?.("trust proxy");
  if (!trustProxy) {
    return false;
  }
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protoHeader = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  return (
    typeof protoHeader === "string" &&
    protoHeader.split(",")[0].trim().toLowerCase() === "https"
  );
}

export const securityHeadersMiddleware: RequestHandler = (req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // Only advertise HSTS over an actual HTTPS connection (never over plain HTTP,
  // where browsers would otherwise cache the upgrade and lock users out).
  if (isSecureRequest(req)) {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
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
  const options: CookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
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
