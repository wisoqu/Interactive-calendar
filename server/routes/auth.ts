import crypto from "crypto";
import express from "express";
import type Database from "better-sqlite3";
import {
  hashPassword,
  hashResetCode,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  verifyPassword,
  verifyResetCodeHash,
} from "../crypto.ts";
import { isSmtpConfigured, sendResetEmail } from "../mailer.ts";
import {
  createAuthenticateUser,
  createRateLimiter,
  extractSessionCookie,
  getCookieOptions,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
} from "../middleware.ts";
import type { AppRequest, RateLimitConfig, ResetCodeRecord, UserRecord } from "../types.ts";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL_CHARS_REGEX = /[\x00-\x1F\x7F]/;
const MAX_RESET_ATTEMPTS = 5;
const RESET_CODE_TTL_MS = 15 * 60 * 1000;

interface AuthRouterDeps {
  db: Database.Database;
  enableRateLimit: boolean;
  rateLimits: RateLimitConfig;
  onResetCodeGenerated?: (email: string, code: string) => void;
}

export function createAuthRouter({
  db,
  enableRateLimit,
  rateLimits,
  onResetCodeGenerated,
}: AuthRouterDeps) {
  const router = express.Router();
  const authenticateUser = createAuthenticateUser(db);

  const loginLimiter = createRateLimiter(rateLimits.login, enableRateLimit);
  const registerLimiter = createRateLimiter(rateLimits.register, enableRateLimit);
  const resetRequestLimiter = createRateLimiter(rateLimits.resetRequest, enableRateLimit);
  const resetConfirmLimiter = createRateLimiter(rateLimits.resetConfirm, enableRateLimit);

  router.get("/config", (_req, res) => {
    res.json({
      smtp_configured: isSmtpConfigured() || Boolean(onResetCodeGenerated),
    });
  });

  router.post("/register", registerLimiter, async (req, res, next) => {
    try {
      const { username, password, email } = req.body || {};
      const cleanUsername = typeof username === "string" ? username.trim() : "";
      const cleanEmail = typeof email === "string" && email.trim() ? email.trim() : null;

      if (
        cleanUsername.length < 3 ||
        cleanUsername.length > 50 ||
        CONTROL_CHARS_REGEX.test(cleanUsername) ||
        /\s{2,}/.test(cleanUsername)
      ) {
        res.status(400).json({
          code: "INVALID_USERNAME",
          detail: "Имя пользователя должно содержать от 3 до 50 допустимых символов.",
        });
        return;
      }

      if (
        typeof password !== "string" ||
        password.length < MIN_PASSWORD_LENGTH ||
        password.length > MAX_PASSWORD_LENGTH
      ) {
        res.status(400).json({
          code: "INVALID_PASSWORD",
          detail: `Пароль должен содержать от ${MIN_PASSWORD_LENGTH} до ${MAX_PASSWORD_LENGTH} символов.`,
        });
        return;
      }

      if (cleanEmail && (cleanEmail.length > 254 || !EMAIL_REGEX.test(cleanEmail))) {
        res.status(400).json({
          code: "INVALID_EMAIL",
          detail: "Указан некорректный адрес электронной почты.",
        });
        return;
      }

      const existingUsername = db
        .prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?)")
        .get(cleanUsername);
      if (existingUsername) {
        res.status(400).json({
          code: "USERNAME_TAKEN",
          detail: "Это имя пользователя уже занято.",
        });
        return;
      }

      if (cleanEmail) {
        const existingEmail = db
          .prepare("SELECT id FROM users WHERE email IS NOT NULL AND LOWER(email) = LOWER(?)")
          .get(cleanEmail);
        if (existingEmail) {
          res.status(400).json({
            code: "EMAIL_TAKEN",
            detail: "Этот адрес электронной почты уже зарегистрирован.",
          });
          return;
        }
      }

      const userId = "usr_" + crypto.randomBytes(8).toString("hex");
      const createdAt = new Date().toISOString();
      const passwordHash = await hashPassword(password);

      try {
        db.prepare(
          "INSERT INTO users (id, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
        ).run(userId, cleanUsername, cleanEmail, passwordHash, createdAt);
      } catch (err: any) {
        if (err?.code === "SQLITE_CONSTRAINT_UNIQUE") {
          const msg = String(err?.message || "").toLowerCase();
          if (msg.includes("email")) {
            res.status(400).json({
              code: "EMAIL_TAKEN",
              detail: "Этот адрес электронной почты уже зарегистрирован.",
            });
            return;
          }
          res.status(400).json({
            code: "USERNAME_TAKEN",
            detail: "Это имя пользователя уже занято.",
          });
          return;
        }
        throw err;
      }

      res.status(201).json({
        id: userId,
        username: cleanUsername,
        email: cleanEmail || undefined,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/login", loginLimiter, async (req, res, next) => {
    try {
      const { username, password } = req.body || {};
      const cleanUsername = typeof username === "string" ? username.trim() : "";

      if (
        !cleanUsername ||
        typeof password !== "string" ||
        password.length === 0 ||
        password.length > MAX_PASSWORD_LENGTH
      ) {
        res.status(401).json({
          code: "INVALID_CREDENTIALS",
          detail: "Неверное имя пользователя или пароль.",
        });
        return;
      }

      const user = db
        .prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?)")
        .get(cleanUsername) as UserRecord | undefined;

      if (!user || !(await verifyPassword(password, user.password_hash))) {
        res.status(401).json({
          code: "INVALID_CREDENTIALS",
          detail: "Неверное имя пользователя или пароль.",
        });
        return;
      }

      const id = "sid_" + crypto.randomBytes(8).toString("hex");
      const sessionId = "sess_" + crypto.randomBytes(32).toString("hex");
      const nowIso = new Date().toISOString();
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

      db.prepare(
        "INSERT INTO sessions (id, session_id, user_id, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)"
      ).run(id, sessionId, user.id, nowIso, expiresAt);

      res.cookie(SESSION_COOKIE_NAME, sessionId, getCookieOptions(req, true));

      res.json({
        id: user.id,
        username: user.username,
        email: user.email || undefined,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/me", authenticateUser, (rawReq, res) => {
    const req = rawReq as AppRequest;
    res.json({
      id: req.user!.id,
      username: req.user!.username,
      email: req.user!.email,
    });
  });

  router.post("/logout", (rawReq, res) => {
    const req = rawReq as AppRequest;
    const sessionId = extractSessionCookie(req);
    if (sessionId) {
      db.prepare(
        "UPDATE sessions SET revoked_at = ? WHERE session_id = ? AND revoked_at IS NULL"
      ).run(new Date().toISOString(), sessionId);
    }
    res.clearCookie(SESSION_COOKIE_NAME, getCookieOptions(req, false));
    res.json({ success: true, message: "Выход выполнен успешно." });
  });

  router.post("/password-reset/request", resetRequestLimiter, (req, res) => {
    const { email, lang } = req.body || {};
    const cleanEmail = typeof email === "string" ? email.trim() : "";
    const emailLang: "ru" | "en" = lang === "en" ? "en" : "ru";

    if (!cleanEmail || cleanEmail.length > 254 || !EMAIL_REGEX.test(cleanEmail)) {
      res.status(400).json({
        code: "INVALID_EMAIL",
        detail: "Укажите корректный адрес электронной почты.",
      });
      return;
    }

    if (!isSmtpConfigured() && !onResetCodeGenerated && process.env.NODE_ENV === "production") {
      res.status(503).json({
        code: "SMTP_NOT_CONFIGURED",
        detail: "Отправка писем (SMTP) не настроена на этом сервере. Обратитесь к администратору.",
      });
      return;
    }

    const user = db
      .prepare("SELECT * FROM users WHERE email IS NOT NULL AND LOWER(email) = LOWER(?)")
      .get(cleanEmail) as UserRecord | undefined;

    if (user) {
      const code = crypto.randomInt(100000, 1000000).toString();
      const codeHash = hashResetCode(code);
      const resetId = "rst_" + crypto.randomBytes(8).toString("hex");
      const nowIso = new Date().toISOString();
      const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS).toISOString();

      db.transaction(() => {
        // Invalidate previous unused codes for this user
        db.prepare("UPDATE reset_codes SET used_at = ? WHERE user_id = ? AND used_at IS NULL").run(
          nowIso,
          user.id
        );
        db.prepare(
          "INSERT INTO reset_codes (id, user_id, code_hash, expires_at, used_at, attempts, created_at) VALUES (?, ?, ?, ?, NULL, 0, ?)"
        ).run(resetId, user.id, codeHash, expiresAt, nowIso);
      })();

      onResetCodeGenerated?.(cleanEmail, code);

      sendResetEmail(cleanEmail, user.username, code, emailLang)
        .then((sent) => {
          if (!sent && process.env.NODE_ENV !== "production") {
            console.log(`[DEV OTP] Пользователь: ${user.username} (${cleanEmail}) | Код: ${code}`);
          } else if (!sent) {
            console.warn(
              `[SMTP NOT CONFIGURED] Запрошен сброс пароля для ${cleanEmail}, но отправка не удалась.`
            );
          }
        })
        .catch((err) => {
          console.error("[SMTP ERROR] Ошибка отправки кода восстановления:", err);
        });
    }

    res.json({
      success: true,
      message:
        "Если указанный адрес зарегистрирован, на него отправлен 6-значный код восстановления.",
    });
  });

  router.post("/password-reset/confirm", resetConfirmLimiter, async (req, res, next) => {
    try {
      const { email, code, new_password } = req.body || {};
      const cleanEmail = typeof email === "string" ? email.trim() : "";
      const cleanCode = typeof code === "string" ? code.trim() : "";

      if (
        !cleanEmail ||
        !EMAIL_REGEX.test(cleanEmail) ||
        !/^\d{6}$/.test(cleanCode) ||
        typeof new_password !== "string" ||
        new_password.length < MIN_PASSWORD_LENGTH ||
        new_password.length > MAX_PASSWORD_LENGTH
      ) {
        res.status(400).json({
          code: "INVALID_RESET_INPUT",
          detail: `Укажите почту, 6-значный код и новый пароль (от ${MIN_PASSWORD_LENGTH} до ${MAX_PASSWORD_LENGTH} символов).`,
        });
        return;
      }

      const user = db
        .prepare("SELECT * FROM users WHERE email IS NOT NULL AND LOWER(email) = LOWER(?)")
        .get(cleanEmail) as UserRecord | undefined;

      // Never reveal whether an email exists in the database (prevents email enumeration)
      if (!user) {
        res.status(400).json({
          code: "INVALID_RESET_CODE",
          detail: "Неверный или недействительный код подтверждения.",
        });
        return;
      }

      const latest = db
        .prepare(
          "SELECT * FROM reset_codes WHERE user_id = ? AND used_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 1"
        )
        .get(user.id) as ResetCodeRecord | undefined;

      if (!latest) {
        res.status(400).json({
          code: "INVALID_RESET_CODE",
          detail: "Неверный или недействительный код подтверждения.",
        });
        return;
      }

      const nowIso = new Date().toISOString();

      if (new Date(latest.expires_at).getTime() < Date.now()) {
        db.prepare("UPDATE reset_codes SET used_at = ? WHERE id = ?").run(nowIso, latest.id);
        res.status(400).json({
          code: "RESET_CODE_EXPIRED",
          detail: "Срок действия кода истек. Запросите новый код.",
        });
        return;
      }

      if (latest.attempts >= MAX_RESET_ATTEMPTS) {
        db.prepare("UPDATE reset_codes SET used_at = ? WHERE id = ?").run(nowIso, latest.id);
        res.status(429).json({
          code: "RESET_CODE_LOCKED",
          detail: "Превышено число попыток ввода кода. Запросите новый код.",
        });
        return;
      }

      if (!verifyResetCodeHash(cleanCode, latest.code_hash)) {
        const nextAttempts = latest.attempts + 1;
        if (nextAttempts >= MAX_RESET_ATTEMPTS) {
          db.prepare("UPDATE reset_codes SET attempts = ?, used_at = ? WHERE id = ?").run(
            nextAttempts,
            nowIso,
            latest.id
          );
          res.status(429).json({
            code: "RESET_CODE_LOCKED",
            detail: "Превышено число попыток ввода кода. Запросите новый код.",
          });
          return;
        }
        db.prepare("UPDATE reset_codes SET attempts = ? WHERE id = ?").run(nextAttempts, latest.id);
        res.status(400).json({
          code: "INVALID_RESET_CODE",
          detail: "Неверный или недействительный код подтверждения.",
        });
        return;
      }

      const newPasswordHash = await hashPassword(new_password);

      db.transaction(() => {
        db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
          newPasswordHash,
          user.id
        );
        db.prepare("UPDATE reset_codes SET used_at = ? WHERE user_id = ? AND used_at IS NULL").run(
          nowIso,
          user.id
        );
        // Security invariant: revoke all active sessions upon password reset
        db.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(
          nowIso,
          user.id
        );
      })();

      res.clearCookie(SESSION_COOKIE_NAME, getCookieOptions(req, false));
      res.json({
        success: true,
        message: "Пароль успешно обновлен. Все активные сессии завершены.",
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
