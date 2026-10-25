import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import nodemailer from "nodemailer";

const DEFAULT_PORT = parseInt(process.env.PORT || "3000", 10);
const SESSION_COOKIE_NAME = "session_id";
const LEGACY_JSON_DB_FILE = path.join(process.cwd(), "calendar_db.json");
const DEFAULT_SQLITE_DB_FILE = process.env.SQLITE_DB_PATH
  ? path.resolve(process.cwd(), process.env.SQLITE_DB_PATH)
  : path.join(process.cwd(), "calendar_db.sqlite");

export interface UserRecord {
  id: string;
  username: string;
  email: string | null;
  password_hash: string;
  created_at: string;
}

export interface ClassroomRecord {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  invite_code: string;
  is_closed: number;
  max_members: number;
  created_at: string;
  updated_at: string;
}

export interface MemberRecord {
  id: string;
  user_id: string;
  classroom_id: string;
  role: "owner" | "admin" | "member";
  created_at: string;
}

export interface EventRecord {
  id: string;
  classroom_id: string;
  creator_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  created_at: string;
  updated_at: string;
}

export interface SessionRecord {
  id: string;
  session_id: string;
  user_id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface ResetCodeRecord {
  id: string;
  user_id: string;
  code_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface ServerOptions {
  dbPath?: string;
  attachFrontend?: boolean;
  onResetCodeGenerated?: (email: string, code: string) => void;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendResetEmail(toEmail: string, username: string, code: string): Promise<boolean> {
  const host = process.env.SMTP_HOST?.trim();
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const rawFrom = process.env.SMTP_FROM?.trim();
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  if (!host || !user || !pass) {
    return false;
  }

  // Avoid SMTP 553 sender-mismatch rejections on Gmail/Yandex/Mail.ru if SMTP_FROM is left as placeholder
  const from =
    rawFrom && !rawFrom.includes("@example.com")
      ? rawFrom
      : `"Школьный календарь" <${user}>`;

  const safeUsername = escapeHtml(username);

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from,
      to: toEmail,
      subject: "Код восстановления пароля — Интерактивный школьный календарь",
      text: `Здравствуйте, ${username}!\n\nВаш 6-значный код для восстановления пароля: ${code}\nКод действителен в течение 15 минут.\n\nЕсли вы не запрашивали сброс пароля, просто проигнорируйте это письмо.`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; padding: 24px; background-color: #f4f4f5; color: #18181b;">
          <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border: 2px solid #18181b; padding: 28px;">
            <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 800; color: #18181b;">Восстановление пароля</h2>
            <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.5;">Здравствуйте, <strong>${safeUsername}</strong>!</p>
            <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.5;">Используйте этот 6-значный код для установки нового пароля в приложении «Интерактивный школьный календарь»:</p>
            <div style="background-color: #18181b; color: #ffffff; padding: 16px; text-align: center; font-family: monospace; font-size: 28px; font-weight: 700; letter-spacing: 6px; margin: 20px 0;">
              ${code}
            </div>
            <p style="margin: 16px 0 0 0; font-size: 12px; color: #71717a; line-height: 1.5;">Код действителен в течение 15 минут. Если вы не запрашивали смену пароля, проигнорируйте это сообщение.</p>
          </div>
        </div>
      `,
    });
    console.log(`[SMTP] Код восстановления отправлен на адрес ${toEmail}`);
    return true;
  } catch (err) {
    console.error("[SMTP ERROR] Не удалось отправить письмо через SMTP:", err);
    return false;
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha256").toString("hex");
  return `pbkdf2_sha256$100000$${salt}$${hash}`;
}

export function verifyPassword(password: string, hashed: string): boolean {
  try {
    const parts = hashed.split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
    const iterations = parseInt(parts[1], 10);
    const salt = parts[2];
    const storedHash = parts[3];
    const calculated = crypto.pbkdf2Sync(password, salt, iterations, 64, "sha256").toString("hex");
    return crypto.timingSafeEqual(Buffer.from(calculated, "hex"), Buffer.from(storedHash, "hex"));
  } catch {
    return false;
  }
}

function getCookieOptions(req: Request, includeMaxAge = true): express.CookieOptions {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protoHeader = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const originHeader = typeof req.headers.origin === "string" ? req.headers.origin : "";
  const refererHeader = typeof req.headers.referer === "string" ? req.headers.referer : "";

  const isHttps =
    req.secure ||
    (typeof protoHeader === "string" && protoHeader.split(",")[0].trim() === "https") ||
    originHeader.startsWith("https://") ||
    refererHeader.startsWith("https://");

  const base: Record<string, unknown> = {
    httpOnly: true,
    sameSite: isHttps ? "none" : "lax",
    secure: isHttps,
    ...(isHttps ? { partitioned: true } : {}),
    path: "/",
  };

  if (includeMaxAge) {
    base.maxAge = 7 * 24 * 60 * 60 * 1000;
  }

  return base as express.CookieOptions;
}

function extractSessionId(req: any): string | undefined {
  // Prefer explicit per-tab session headers first so multiple browser tabs do not collide on shared cookies
  const customHeader = req.headers?.["x-session-token"];
  if (typeof customHeader === "string" && customHeader.trim()) {
    return customHeader.trim();
  }

  const authHeader = req.headers?.authorization;
  if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }

  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof cookieToken === "string" && cookieToken.trim()) {
    return cookieToken.trim();
  }

  return undefined;
}

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
    return Math.max(0, Math.floor(Number(fallback) || 0));
  }
  if (value === null || value === "") {
    return 0;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.min(10000, Math.floor(parsed));
  }
  return Math.max(0, Math.floor(Number(fallback) || 0));
}

export function initDatabase(dbFilePath: string, allowLegacyJsonMigration = false): Database.Database {
  const resolvedDir = path.dirname(dbFilePath);
  if (!fs.existsSync(resolvedDir)) {
    fs.mkdirSync(resolvedDir, { recursive: true });
  }

  const db = new Database(dbFilePath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS classrooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      owner_id TEXT NOT NULL,
      invite_code TEXT UNIQUE NOT NULL,
      is_closed INTEGER DEFAULT 0,
      max_members INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      classroom_id TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      classroom_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      session_id TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS reset_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Backward-compatible schema migrations for older SQLite files
  try {
    db.exec("ALTER TABLE classrooms ADD COLUMN is_closed INTEGER DEFAULT 0");
  } catch {}
  try {
    db.exec("ALTER TABLE classrooms ADD COLUMN max_members INTEGER DEFAULT 0");
  } catch {}

  // Indexes for fast lookups on low-resource VPS
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_classrooms_invite_code ON classrooms(invite_code);
    CREATE INDEX IF NOT EXISTS idx_members_classroom ON members(classroom_id);
    CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);
    CREATE INDEX IF NOT EXISTS idx_events_classroom_starts ON events(classroom_id, starts_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_reset_codes_user ON reset_codes(user_id, created_at);
  `);
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_members_user_classroom ON members(user_id, classroom_id)");
  } catch {}

  // One-time migration from legacy calendar_db.json if SQLite database is empty
  if (allowLegacyJsonMigration && fs.existsSync(LEGACY_JSON_DB_FILE)) {
    try {
      const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
      if (userCount.count === 0) {
        const raw = fs.readFileSync(LEGACY_JSON_DB_FILE, "utf-8");
        const jsonDb = JSON.parse(raw);
        db.transaction(() => {
          if (Array.isArray(jsonDb.users)) {
            const stmt = db.prepare(
              "INSERT OR REPLACE INTO users (id, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
            );
            for (const u of jsonDb.users) {
              stmt.run(u.id, u.username, u.email || null, u.password_hash, u.created_at);
            }
          }
          if (Array.isArray(jsonDb.classrooms)) {
            const stmt = db.prepare(
              "INSERT OR REPLACE INTO classrooms (id, name, description, owner_id, invite_code, is_closed, max_members, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            );
            for (const c of jsonDb.classrooms) {
              stmt.run(
                c.id,
                c.name,
                c.description || null,
                c.owner_id,
                c.invite_code,
                c.is_closed ? 1 : 0,
                c.max_members || 0,
                c.created_at,
                c.updated_at
              );
            }
          }
          if (Array.isArray(jsonDb.members)) {
            const stmt = db.prepare(
              "INSERT OR REPLACE INTO members (id, user_id, classroom_id, role, created_at) VALUES (?, ?, ?, ?, ?)"
            );
            for (const m of jsonDb.members) {
              stmt.run(m.id, m.user_id, m.classroom_id, m.role, m.created_at);
            }
          }
          if (Array.isArray(jsonDb.events)) {
            const stmt = db.prepare(
              "INSERT OR REPLACE INTO events (id, classroom_id, creator_id, title, description, starts_at, ends_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            );
            for (const e of jsonDb.events) {
              stmt.run(
                e.id,
                e.classroom_id,
                e.creator_id,
                e.title,
                e.description || null,
                e.starts_at,
                e.ends_at,
                e.created_at,
                e.updated_at
              );
            }
          }
          if (Array.isArray(jsonDb.sessions)) {
            const stmt = db.prepare(
              "INSERT OR REPLACE INTO sessions (id, session_id, user_id, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?)"
            );
            for (const s of jsonDb.sessions) {
              stmt.run(s.id, s.session_id, s.user_id, s.created_at, s.expires_at, s.revoked_at || null);
            }
          }
          if (Array.isArray(jsonDb.reset_codes)) {
            const stmt = db.prepare(
              "INSERT OR REPLACE INTO reset_codes (id, user_id, code_hash, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, ?, ?)"
            );
            for (const r of jsonDb.reset_codes) {
              stmt.run(r.id, r.user_id, r.code_hash, r.expires_at, r.used_at || null, r.created_at);
            }
          }
        })();
        console.log("[SQLite] Выполнена миграция данных из calendar_db.json");
      }
    } catch (err) {
      console.error("[SQLite] Ошибка при миграции calendar_db.json:", err);
    }
  }

  return db;
}

function generateUniqueInviteCode(db: Database.Database): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const checkStmt = db.prepare("SELECT 1 FROM classrooms WHERE invite_code = ?");
  while (true) {
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(crypto.randomInt(0, chars.length));
    }
    if (!checkStmt.get(code)) {
      return code;
    }
  }
}

function formatClassroomResponse(
  row: ClassroomRecord & { owner_username?: string | null; member_count?: number },
  userRole: "owner" | "admin" | "member"
) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    owner_id: row.owner_id,
    owner_username: row.owner_username || "unknown",
    invite_code: row.invite_code,
    user_role: userRole,
    is_closed: Number(row.is_closed) === 1,
    max_members: Math.max(0, Number(row.max_members || 0)),
    member_count: Math.max(1, Number(row.member_count || 1)),
    created_at: row.created_at,
  };
}

export async function createServerApp(options: ServerOptions = {}) {
  const dbPath = options.dbPath || DEFAULT_SQLITE_DB_FILE;
  const attachFrontend = options.attachFrontend !== false;
  const sqliteDb = initDatabase(dbPath, !options.dbPath);

  const app = express();
  app.set("trust proxy", true);

  app.use(express.json({ limit: "256kb" }));
  app.use(express.urlencoded({ extended: true }));

  // Proxy-safe JSON envelope middleware for SPA clients sending X-Api-Envelope: 1
  // Prevents reverse proxies (Nginx / Envoy / Cloud Run) from replacing 403/404 JSON bodies with raw HTML pages
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.headers["x-api-envelope"] === "1") {
      const originalJson = res.json.bind(res);
      res.json = (body: any) => {
        const statusCode = res.statusCode || 200;
        if (statusCode >= 400) {
          res.status(200);
          const detail =
            body && typeof body === "object" && typeof body.detail === "string"
              ? body.detail
              : "Произошла ошибка при выполнении запроса.";
          return originalJson({
            ...(body && typeof body === "object" ? body : {}),
            __api_error: true,
            status: statusCode,
            detail,
          });
        }
        return originalJson(body);
      };
    }
    next();
  });

  // Safe cookie parser middleware
  app.use((req: any, _res: Response, next: NextFunction) => {
    const list: Record<string, string> = {};
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      cookieHeader.split(";").forEach((cookie: string) => {
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
    req.cookies = list;
    next();
  });

  // Session authentication middleware (supports X-Session-Token, Bearer, and HttpOnly cookie)
  const authenticateUser = (req: any, res: Response, next: NextFunction) => {
    const sessionId = extractSessionId(req);
    if (!sessionId) {
      res.status(401).json({
        code: "UNAUTHORIZED",
        detail: "Требуется авторизация (отсутствует сессия).",
      });
      return;
    }

    const session = sqliteDb
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
        code: "UNAUTHORIZED",
        detail: "Срок действия сессии истек. Войдите снова.",
      });
      return;
    }

    const user = sqliteDb
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(session.user_id) as UserRecord | undefined;

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

  // -----------------------------------------------------
  // Healthcheck Endpoints
  // -----------------------------------------------------
  const handleHealth = (_req: Request, res: Response) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  };

  const handleDbHealth = (_req: Request, res: Response) => {
    try {
      sqliteDb.prepare("SELECT 1 as ok").get();
      res.json({ status: "healthy", database: "sqlite", connection: "ok" });
    } catch {
      res.status(500).json({ status: "unhealthy", database: "sqlite", connection: "failed" });
    }
  };

  app.get("/health", handleHealth);
  app.get("/api/health", handleHealth);
  app.get("/health/db", handleDbHealth);
  app.get("/api/health/db", handleDbHealth);

  // -----------------------------------------------------
  // Auth Endpoints
  // -----------------------------------------------------
  const authRouter = express.Router();

  authRouter.post("/register", (req, res) => {
    const { username, password, email } = req.body || {};
    const cleanUsername = typeof username === "string" ? username.trim() : "";
    const cleanEmail = typeof email === "string" && email.trim() ? email.trim() : null;

    if (cleanUsername.length < 3 || cleanUsername.length > 50 || typeof password !== "string" || password.length < 6) {
      res.status(400).json({
        detail: "Имя пользователя (от 3 до 50 символов) и пароль (минимум 6 символов) обязательны.",
      });
      return;
    }

    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ detail: "Указан некорректный адрес электронной почты." });
      return;
    }

    const existingUsername = sqliteDb
      .prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?)")
      .get(cleanUsername);
    if (existingUsername) {
      res.status(400).json({ detail: "Это имя пользователя уже занято." });
      return;
    }

    if (cleanEmail) {
      const existingEmail = sqliteDb
        .prepare("SELECT id FROM users WHERE email IS NOT NULL AND LOWER(email) = LOWER(?)")
        .get(cleanEmail);
      if (existingEmail) {
        res.status(400).json({ detail: "Этот адрес электронной почты уже зарегистрирован." });
        return;
      }
    }

    const userId = "usr_" + crypto.randomBytes(8).toString("hex");
    const createdAt = new Date().toISOString();
    const passwordHash = hashPassword(password);

    sqliteDb
      .prepare("INSERT INTO users (id, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(userId, cleanUsername, cleanEmail, passwordHash, createdAt);

    res.status(201).json({
      id: userId,
      username: cleanUsername,
      email: cleanEmail || undefined,
    });
  });

  authRouter.post("/login", (req, res) => {
    const { username, password } = req.body || {};
    const cleanUsername = typeof username === "string" ? username.trim() : "";

    if (!cleanUsername || typeof password !== "string") {
      res.status(401).json({ detail: "Неверное имя пользователя или пароль." });
      return;
    }

    const user = sqliteDb
      .prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?)")
      .get(cleanUsername) as UserRecord | undefined;

    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({ detail: "Неверное имя пользователя или пароль." });
      return;
    }

    const id = "sid_" + crypto.randomBytes(8).toString("hex");
    const sessionId = "sess_" + crypto.randomBytes(32).toString("hex");
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    sqliteDb
      .prepare(
        "INSERT INTO sessions (id, session_id, user_id, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)"
      )
      .run(id, sessionId, user.id, nowIso, expiresAt);

    res.cookie(SESSION_COOKIE_NAME, sessionId, getCookieOptions(req, true));

    res.json({
      id: user.id,
      username: user.username,
      email: user.email || undefined,
      session_token: sessionId,
    });
  });

  authRouter.get("/me", authenticateUser, (req: any, res) => {
    res.json({
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      session_token: req.sessionId,
    });
  });

  authRouter.post("/logout", (req: any, res) => {
    const sessionId = extractSessionId(req);
    if (sessionId) {
      sqliteDb
        .prepare("UPDATE sessions SET revoked_at = ? WHERE session_id = ? AND revoked_at IS NULL")
        .run(new Date().toISOString(), sessionId);
    }
    res.clearCookie(SESSION_COOKIE_NAME, getCookieOptions(req, false));
    res.json({ success: true, message: "Выход выполнен успешно." });
  });

  authRouter.post("/password-reset/request", (req, res) => {
    const { email } = req.body || {};
    const cleanEmail = typeof email === "string" ? email.trim() : "";

    if (!cleanEmail) {
      res.status(400).json({ detail: "Укажите адрес электронной почты." });
      return;
    }

    const user = sqliteDb
      .prepare("SELECT * FROM users WHERE email IS NOT NULL AND LOWER(email) = LOWER(?)")
      .get(cleanEmail) as UserRecord | undefined;

    if (user) {
      const code = crypto.randomInt(100000, 1000000).toString();
      const codeHash = crypto.createHash("sha256").update(code).digest("hex");
      const resetId = "rst_" + crypto.randomBytes(8).toString("hex");
      const nowIso = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      sqliteDb
        .prepare(
          "INSERT INTO reset_codes (id, user_id, code_hash, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)"
        )
        .run(resetId, user.id, codeHash, expiresAt, nowIso);

      options.onResetCodeGenerated?.(cleanEmail, code);

      sendResetEmail(cleanEmail, user.username, code)
        .then((sent) => {
          if (!sent && process.env.NODE_ENV !== "production") {
            console.log(`[DEV OTP] Пользователь: ${user.username} (${cleanEmail}) | Код: ${code}`);
          } else if (!sent) {
            console.warn(
              `[SMTP NOT CONFIGURED] Запрошен сброс пароля для ${cleanEmail}, но переменные SMTP_* не заданы в .env.`
            );
          }
        })
        .catch((err) => {
          console.error("[SMTP ERROR] Ошибка отправки кода восстановления:", err);
        });
    }

    res.json({
      success: true,
      message: "Если указанный адрес зарегистрирован, на него отправлен 6-значный код восстановления.",
    });
  });

  authRouter.post("/password-reset/confirm", (req, res) => {
    const { email, code, new_password } = req.body || {};
    const cleanEmail = typeof email === "string" ? email.trim() : "";
    const cleanCode = typeof code === "string" ? code.trim() : "";

    if (!cleanEmail || !cleanCode || typeof new_password !== "string" || new_password.length < 6) {
      res.status(400).json({
        detail: "Укажите почту, 6-значный код и новый пароль (не менее 6 символов).",
      });
      return;
    }

    const user = sqliteDb
      .prepare("SELECT * FROM users WHERE email IS NOT NULL AND LOWER(email) = LOWER(?)")
      .get(cleanEmail) as UserRecord | undefined;

    if (!user) {
      res.status(404).json({ detail: "Пользователь с таким адресом почты не найден." });
      return;
    }

    const latest = sqliteDb
      .prepare(
        "SELECT * FROM reset_codes WHERE user_id = ? AND used_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 1"
      )
      .get(user.id) as ResetCodeRecord | undefined;

    if (!latest) {
      res.status(400).json({ detail: "Активный запрос на сброс пароля не найден." });
      return;
    }

    if (new Date(latest.expires_at).getTime() < Date.now()) {
      res.status(400).json({ detail: "Срок действия кода истек. Запросите новый код." });
      return;
    }

    const checkHash = crypto.createHash("sha256").update(cleanCode).digest("hex");
    const hashesMatch =
      latest.code_hash.length === checkHash.length &&
      crypto.timingSafeEqual(Buffer.from(latest.code_hash, "hex"), Buffer.from(checkHash, "hex"));

    if (!hashesMatch) {
      res.status(400).json({ detail: "Неверный код подтверждения." });
      return;
    }

    const nowIso = new Date().toISOString();
    const newPasswordHash = hashPassword(new_password);

    sqliteDb.transaction(() => {
      sqliteDb.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(newPasswordHash, user.id);
      sqliteDb
        .prepare("UPDATE reset_codes SET used_at = ? WHERE user_id = ? AND used_at IS NULL")
        .run(nowIso, user.id);
      // Security invariant: revoke all active sessions upon password reset
      sqliteDb
        .prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
        .run(nowIso, user.id);
    })();

    res.clearCookie(SESSION_COOKIE_NAME, getCookieOptions(req, false));
    res.json({
      success: true,
      message: "Пароль успешно обновлен. Все активные сессии завершены.",
    });
  });

  // -----------------------------------------------------
  // Classrooms, Members & Events Endpoints
  // -----------------------------------------------------
  const classroomRouter = express.Router();

  const getClassroomWithMeta = (classroomId: string) => {
    return sqliteDb
      .prepare(
        `SELECT c.*, u.username as owner_username,
                (SELECT COUNT(*) FROM members m2 WHERE m2.classroom_id = c.id) as member_count
         FROM classrooms c
         LEFT JOIN users u ON u.id = c.owner_id
         WHERE c.id = ?`
      )
      .get(classroomId) as
      | (ClassroomRecord & { owner_username: string | null; member_count: number })
      | undefined;
  };

  const ensureOwnerMembership = (classroom: ClassroomRecord): MemberRecord | undefined => {
    const existing = sqliteDb
      .prepare("SELECT * FROM members WHERE user_id = ? AND classroom_id = ?")
      .get(classroom.owner_id, classroom.id) as MemberRecord | undefined;

    if (!existing) {
      const memberId = "mem_" + crypto.randomBytes(8).toString("hex");
      const nowIso = new Date().toISOString();
      sqliteDb
        .prepare("INSERT INTO members (id, user_id, classroom_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)")
        .run(memberId, classroom.owner_id, classroom.id, nowIso);
      return {
        id: memberId,
        user_id: classroom.owner_id,
        classroom_id: classroom.id,
        role: "owner",
        created_at: nowIso,
      };
    }

    if (existing.role !== "owner") {
      sqliteDb.prepare("UPDATE members SET role = 'owner' WHERE id = ?").run(existing.id);
      return { ...existing, role: "owner" };
    }

    return existing;
  };

  classroomRouter.get("/", authenticateUser, (req: any, res) => {
    const rows = sqliteDb
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
      .all(req.user.id) as Array<
      ClassroomRecord & {
        user_role: "owner" | "admin" | "member";
        owner_username: string | null;
        member_count: number;
      }
    >;

    res.json(rows.map((r) => formatClassroomResponse(r, r.user_role)));
  });

  classroomRouter.post("/", authenticateUser, (req: any, res) => {
    const { name, description, is_closed, max_members } = req.body || {};
    const cleanName = typeof name === "string" ? name.trim() : "";
    const cleanDesc = typeof description === "string" && description.trim() ? description.trim() : null;

    if (cleanName.length < 2 || cleanName.length > 100) {
      res.status(400).json({
        code: "INVALID_NAME",
        detail: "Название класса обязательно (от 2 до 100 символов).",
      });
      return;
    }

    const classroomId = "cr_" + crypto.randomBytes(8).toString("hex");
    const memberId = "mem_" + crypto.randomBytes(8).toString("hex");
    const inviteCode = generateUniqueInviteCode(sqliteDb);
    const closedFlag = parseBooleanFlag(is_closed, 0);
    const cap = parseMaxMembersValue(max_members, 0);
    const nowIso = new Date().toISOString();

    sqliteDb.transaction(() => {
      sqliteDb
        .prepare(
          `INSERT INTO classrooms (id, name, description, owner_id, invite_code, is_closed, max_members, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(classroomId, cleanName, cleanDesc, req.user.id, inviteCode, closedFlag, cap, nowIso, nowIso);

      sqliteDb
        .prepare("INSERT INTO members (id, user_id, classroom_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)")
        .run(memberId, req.user.id, classroomId, nowIso);
    })();

    res.status(201).json({
      id: classroomId,
      name: cleanName,
      description: cleanDesc || undefined,
      owner_id: req.user.id,
      owner_username: req.user.username,
      invite_code: inviteCode,
      user_role: "owner",
      is_closed: closedFlag === 1,
      max_members: cap,
      member_count: 1,
      created_at: nowIso,
    });
  });

  classroomRouter.post("/join", authenticateUser, (req: any, res) => {
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

    const outcome = sqliteDb.transaction((): JoinOutcome => {
      const classroom = sqliteDb
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

      if (classroom.owner_id === req.user.id) {
        ensureOwnerMembership(classroom);
      }

      const existing = sqliteDb
        .prepare("SELECT * FROM members WHERE user_id = ? AND classroom_id = ?")
        .get(req.user.id, classroom.id) as MemberRecord | undefined;

      if (existing) {
        const fresh = getClassroomWithMeta(classroom.id) || { ...classroom, member_count: 1 };
        const effectiveRole = classroom.owner_id === req.user.id ? "owner" : existing.role;
        return {
          ok: true,
          payload: formatClassroomResponse(fresh, effectiveRole),
        };
      }

      const isClosed = Number(classroom.is_closed) === 1;
      if (isClosed) {
        return {
          ok: false,
          status: 403,
          body: {
            code: "CLASSROOM_CLOSED",
            classroom_name: classroom.name,
            detail: "Этот класс закрыт владельцем. Вступление новых участников по коду приглашения временно отключено.",
          },
        };
      }

      const maxCap = Math.max(0, Number(classroom.max_members || 0));
      const { count } = sqliteDb
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

      sqliteDb
        .prepare("INSERT INTO members (id, user_id, classroom_id, role, created_at) VALUES (?, ?, ?, 'member', ?)")
        .run(memberId, req.user.id, classroom.id, nowIso);

      const fresh = getClassroomWithMeta(classroom.id) || { ...classroom, member_count: count + 1 };
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

  classroomRouter.get("/:classroom_id", authenticateUser, (req: any, res) => {
    const classroom = getClassroomWithMeta(req.params.classroom_id);

    if (!classroom) {
      res.status(404).json({ code: "CLASSROOM_NOT_FOUND", detail: "Класс не найден." });
      return;
    }

    if (classroom.owner_id === req.user.id) {
      ensureOwnerMembership(classroom);
    }

    const membership = sqliteDb
      .prepare("SELECT * FROM members WHERE user_id = ? AND classroom_id = ?")
      .get(req.user.id, classroom.id) as MemberRecord | undefined;

    if (!membership) {
      res.status(403).json({ code: "NOT_A_MEMBER", detail: "Вы не состоите в этом классе." });
      return;
    }

    const effectiveRole = classroom.owner_id === req.user.id ? "owner" : membership.role;
    res.json(formatClassroomResponse(classroom, effectiveRole));
  });

  const updateClassroomHandler = (req: any, res: Response) => {
    const { name, description, is_closed, max_members } = req.body || {};

    const classroom = getClassroomWithMeta(req.params.classroom_id);
    if (!classroom) {
      res.status(404).json({ code: "CLASSROOM_NOT_FOUND", detail: "Класс не найден." });
      return;
    }

    if (classroom.owner_id === req.user.id) {
      ensureOwnerMembership(classroom);
    }

    const membership = sqliteDb
      .prepare("SELECT * FROM members WHERE user_id = ? AND classroom_id = ?")
      .get(req.user.id, classroom.id) as MemberRecord | undefined;

    const isOwner = classroom.owner_id === req.user.id || membership?.role === "owner";

    // Strict RBAC: Only the Owner can modify classroom settings
    if (!isOwner) {
      res.status(403).json({
        code: "FORBIDDEN_OWNER_ONLY",
        detail: "Изменять настройки класса может только его владелец.",
      });
      return;
    }

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

    const updatedDesc =
      description === undefined
        ? classroom.description
        : typeof description === "string" && description.trim()
        ? description.trim()
        : null;
    const updatedClosed = parseBooleanFlag(is_closed, classroom.is_closed);
    const updatedCap = parseMaxMembersValue(max_members, classroom.max_members);
    const nowIso = new Date().toISOString();

    sqliteDb
      .prepare(
        "UPDATE classrooms SET name = ?, description = ?, is_closed = ?, max_members = ?, updated_at = ? WHERE id = ?"
      )
      .run(nextName, updatedDesc, updatedClosed, updatedCap, nowIso, classroom.id);

    const freshClassroom = getClassroomWithMeta(classroom.id) || {
      ...classroom,
      name: nextName,
      description: updatedDesc,
      is_closed: updatedClosed,
      max_members: updatedCap,
      updated_at: nowIso,
    };

    res.json(formatClassroomResponse(freshClassroom, "owner"));
  };

  classroomRouter.patch("/:classroom_id", authenticateUser, updateClassroomHandler);
  classroomRouter.post("/:classroom_id/update", authenticateUser, updateClassroomHandler);

  const deleteClassroomHandler = (req: any, res: Response) => {
    const classroom = sqliteDb
      .prepare("SELECT * FROM classrooms WHERE id = ?")
      .get(req.params.classroom_id) as ClassroomRecord | undefined;

    if (!classroom) {
      res.status(404).json({ code: "CLASSROOM_NOT_FOUND", detail: "Класс не найден." });
      return;
    }

    const membership = sqliteDb
      .prepare("SELECT * FROM members WHERE user_id = ? AND classroom_id = ?")
      .get(req.user.id, classroom.id) as MemberRecord | undefined;

    const isOwner = classroom.owner_id === req.user.id || membership?.role === "owner";
    if (!isOwner) {
      res.status(403).json({
        code: "FORBIDDEN_OWNER_ONLY",
        detail: "Удалить класс может только его владелец.",
      });
      return;
    }

    sqliteDb.transaction(() => {
      sqliteDb.prepare("DELETE FROM events WHERE classroom_id = ?").run(classroom.id);
      sqliteDb.prepare("DELETE FROM members WHERE classroom_id = ?").run(classroom.id);
      sqliteDb.prepare("DELETE FROM classrooms WHERE id = ?").run(classroom.id);
    })();

    res.json({ success: true, message: "Класс и все связанные записи удалены." });
  };

  classroomRouter.delete("/:classroom_id", authenticateUser, deleteClassroomHandler);
  classroomRouter.post("/:classroom_id/delete", authenticateUser, deleteClassroomHandler);

  // --- Classroom Members ---
  classroomRouter.get("/:classroom_id/members", authenticateUser, (req: any, res) => {
    const { classroom_id } = req.params;

    const classroom = sqliteDb
      .prepare("SELECT * FROM classrooms WHERE id = ?")
      .get(classroom_id) as ClassroomRecord | undefined;
    if (!classroom) {
      res.status(404).json({ code: "CLASSROOM_NOT_FOUND", detail: "Класс не найден." });
      return;
    }

    if (classroom.owner_id === req.user.id) {
      ensureOwnerMembership(classroom);
    }

    const callerMembership = sqliteDb
      .prepare("SELECT * FROM members WHERE user_id = ? AND classroom_id = ?")
      .get(req.user.id, classroom_id) as MemberRecord | undefined;

    if (!callerMembership) {
      res.status(403).json({ code: "NOT_A_MEMBER", detail: "Вы не состоите в этом классе." });
      return;
    }

    const rows = sqliteDb
      .prepare(
        `SELECT m.id, m.user_id, COALESCE(u.username, 'unknown') as username,
                CASE WHEN ? = m.user_id THEN 'owner' ELSE m.role END as role,
                m.created_at
         FROM members m
         LEFT JOIN users u ON u.id = m.user_id
         WHERE m.classroom_id = ?
         ORDER BY CASE WHEN ? = m.user_id THEN 0 WHEN m.role = 'owner' THEN 0 WHEN m.role = 'admin' THEN 1 ELSE 2 END, m.created_at ASC`
      )
      .all(classroom.owner_id, classroom_id, classroom.owner_id);

    res.json(rows);
  });

  classroomRouter.post("/:classroom_id/members", authenticateUser, (req: any, res) => {
    const { classroom_id } = req.params;
    const { username, role } = req.body || {};
    const cleanUsername = typeof username === "string" ? username.trim() : "";

    if (!cleanUsername || !role) {
      res.status(400).json({ detail: "Укажите имя пользователя и назначаемую роль." });
      return;
    }

    if (role !== "admin" && role !== "member") {
      res.status(400).json({ detail: "Роль должна быть 'admin' или 'member'." });
      return;
    }

    interface AddMemberOutcome {
      ok: boolean;
      payload?: Record<string, unknown>;
      status?: number;
      body?: Record<string, unknown>;
    }

    const outcome = sqliteDb.transaction((): AddMemberOutcome => {
      const classroom = sqliteDb
        .prepare("SELECT * FROM classrooms WHERE id = ?")
        .get(classroom_id) as ClassroomRecord | undefined;

      if (!classroom) {
        return { ok: false, status: 404, body: { code: "CLASSROOM_NOT_FOUND", detail: "Класс не найден." } };
      }

      if (classroom.owner_id === req.user.id) {
        ensureOwnerMembership(classroom);
      }

      const callerMembership = sqliteDb
        .prepare("SELECT * FROM members WHERE user_id = ? AND classroom_id = ?")
        .get(req.user.id, classroom_id) as MemberRecord | undefined;

      const callerRole = classroom.owner_id === req.user.id ? "owner" : callerMembership?.role;

      if (!callerRole || (callerRole !== "owner" && callerRole !== "admin")) {
        return {
          ok: false,
          status: 403,
          body: { code: "FORBIDDEN", detail: "Недостаточно прав для добавления участников." },
        };
      }

      // Only Owner can designate Admins
      if (role === "admin" && callerRole !== "owner") {
        return {
          ok: false,
          status: 403,
          body: {
            code: "FORBIDDEN_OWNER_ONLY",
            detail: "Назначать администраторов может только владелец класса.",
          },
        };
      }

      const targetUser = sqliteDb
        .prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?)")
        .get(cleanUsername) as UserRecord | undefined;

      if (!targetUser) {
        return {
          ok: false,
          status: 404,
          body: { code: "USER_NOT_FOUND", detail: `Пользователь «${cleanUsername}» не найден.` },
        };
      }

      const existing = sqliteDb
        .prepare("SELECT id FROM members WHERE classroom_id = ? AND user_id = ?")
        .get(classroom_id, targetUser.id);

      if (existing) {
        return {
          ok: false,
          status: 400,
          body: { code: "ALREADY_MEMBER", detail: "Пользователь уже состоит в этом классе." },
        };
      }

      const maxCap = Math.max(0, Number(classroom.max_members || 0));
      if (maxCap > 0) {
        const { count } = sqliteDb
          .prepare("SELECT COUNT(*) as count FROM members WHERE classroom_id = ?")
          .get(classroom_id) as { count: number };
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

      sqliteDb
        .prepare("INSERT INTO members (id, user_id, classroom_id, role, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(memberId, targetUser.id, classroom_id, role, nowIso);

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
  });

  const updateMemberRoleHandler = (req: any, res: Response) => {
    const { classroom_id, member_id } = req.params;
    const { role } = req.body || {};

    const classroom = sqliteDb
      .prepare("SELECT * FROM classrooms WHERE id = ?")
      .get(classroom_id) as ClassroomRecord | undefined;

    if (!classroom) {
      res.status(404).json({ code: "CLASSROOM_NOT_FOUND", detail: "Класс не найден." });
      return;
    }

    if (classroom.owner_id === req.user.id) {
      ensureOwnerMembership(classroom);
    }

    const callerMembership = sqliteDb
      .prepare("SELECT * FROM members WHERE user_id = ? AND classroom_id = ?")
      .get(req.user.id, classroom_id) as MemberRecord | undefined;

    const isOwner = classroom.owner_id === req.user.id || callerMembership?.role === "owner";
    if (!isOwner) {
      res.status(403).json({
        code: "FORBIDDEN_OWNER_ONLY",
        detail: "Изменять роли участников может только владелец класса.",
      });
      return;
    }

    const targetMember = sqliteDb
      .prepare("SELECT * FROM members WHERE id = ? AND classroom_id = ?")
      .get(member_id, classroom_id) as MemberRecord | undefined;

    if (!targetMember) {
      res.status(404).json({ detail: "Участник не найден в этом классе." });
      return;
    }

    if (targetMember.role === "owner" || targetMember.user_id === classroom.owner_id) {
      res.status(400).json({ detail: "Роль владельца класса не может быть изменена." });
      return;
    }

    if (role !== "admin" && role !== "member") {
      res.status(400).json({ detail: "Роль должна быть 'admin' или 'member'." });
      return;
    }

    sqliteDb.prepare("UPDATE members SET role = ? WHERE id = ?").run(role, member_id);

    const u = sqliteDb
      .prepare("SELECT username FROM users WHERE id = ?")
      .get(targetMember.user_id) as { username: string } | undefined;

    res.json({
      id: targetMember.id,
      user_id: targetMember.user_id,
      username: u ? u.username : "unknown",
      role,
      created_at: targetMember.created_at,
    });
  };

  classroomRouter.patch("/:classroom_id/members/:member_id", authenticateUser, updateMemberRoleHandler);
  classroomRouter.post("/:classroom_id/members/:member_id/role", authenticateUser, updateMemberRoleHandler);

  const removeMemberHandler = (req: any, res: Response) => {
    const { classroom_id, member_id } = req.params;

    const classroom = sqliteDb
      .prepare("SELECT * FROM classrooms WHERE id = ?")
      .get(classroom_id) as ClassroomRecord | undefined;

    if (!classroom) {
      res.status(404).json({ code: "CLASSROOM_NOT_FOUND", detail: "Класс не найден." });
      return;
    }

    if (classroom.owner_id === req.user.id) {
      ensureOwnerMembership(classroom);
    }

    const callerMembership = sqliteDb
      .prepare("SELECT * FROM members WHERE user_id = ? AND classroom_id = ?")
      .get(req.user.id, classroom_id) as MemberRecord | undefined;

    if (!callerMembership) {
      res.status(403).json({ code: "FORBIDDEN", detail: "Доступ запрещен." });
      return;
    }

    const callerRole = classroom.owner_id === req.user.id ? "owner" : callerMembership.role;

    const targetMember = sqliteDb
      .prepare("SELECT * FROM members WHERE id = ? AND classroom_id = ?")
      .get(member_id, classroom_id) as MemberRecord | undefined;

    if (!targetMember) {
      res.status(404).json({ detail: "Участник не найден в этом классе." });
      return;
    }

    if (targetMember.role === "owner" || targetMember.user_id === classroom.owner_id) {
      res.status(400).json({ detail: "Владелец не может покинуть класс или быть исключен." });
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

    sqliteDb.prepare("DELETE FROM members WHERE id = ?").run(member_id);
    res.json({ success: true, message: "Участник удален из класса." });
  };

  classroomRouter.delete("/:classroom_id/members/:member_id", authenticateUser, removeMemberHandler);
  classroomRouter.post("/:classroom_id/members/:member_id/remove", authenticateUser, removeMemberHandler);

  // --- Classroom Events ---
  classroomRouter.get("/:classroom_id/events", authenticateUser, (req: any, res) => {
    const { classroom_id } = req.params;

    const classroom = sqliteDb
      .prepare("SELECT * FROM classrooms WHERE id = ?")
      .get(classroom_id) as ClassroomRecord | undefined;
    if (!classroom) {
      res.status(404).json({ code: "CLASSROOM_NOT_FOUND", detail: "Класс не найден." });
      return;
    }

    if (classroom.owner_id === req.user.id) {
      ensureOwnerMembership(classroom);
    }

    const membership = sqliteDb
      .prepare("SELECT * FROM members WHERE user_id = ? AND classroom_id = ?")
      .get(req.user.id, classroom_id) as MemberRecord | undefined;

    if (!membership) {
      res.status(403).json({ code: "NOT_A_MEMBER", detail: "Вы не состоите в этом классе." });
      return;
    }

    const rows = sqliteDb
      .prepare(
        `SELECT e.*, COALESCE(u.username, 'unknown') as creator_username
         FROM events e
         LEFT JOIN users u ON u.id = e.creator_id
         WHERE e.classroom_id = ?`
      )
      .all(classroom_id) as Array<EventRecord & { creator_username: string }>;

    rows.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

    res.json(
      rows.map((e) => ({
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
      }))
    );
  });

  classroomRouter.post("/:classroom_id/events", authenticateUser, (req: any, res) => {
    const { classroom_id } = req.params;
    const { title, description, starts_at, ends_at } = req.body || {};

    const classroom = sqliteDb
      .prepare("SELECT * FROM classrooms WHERE id = ?")
      .get(classroom_id) as ClassroomRecord | undefined;
    if (!classroom) {
      res.status(404).json({ code: "CLASSROOM_NOT_FOUND", detail: "Класс не найден." });
      return;
    }

    if (classroom.owner_id === req.user.id) {
      ensureOwnerMembership(classroom);
    }

    const membership = sqliteDb
      .prepare("SELECT * FROM members WHERE user_id = ? AND classroom_id = ?")
      .get(req.user.id, classroom_id) as MemberRecord | undefined;

    const callerRole = classroom.owner_id === req.user.id ? "owner" : membership?.role;

    if (!callerRole || (callerRole !== "owner" && callerRole !== "admin")) {
      res.status(403).json({
        code: "FORBIDDEN",
        detail: "Создавать события могут только владелец и администраторы класса.",
      });
      return;
    }

    const cleanTitle = typeof title === "string" ? title.trim() : "";
    if (cleanTitle.length < 2 || cleanTitle.length > 150 || typeof starts_at !== "string" || typeof ends_at !== "string") {
      res.status(400).json({
        detail: "Укажите название события (от 2 символов), время начала и время окончания.",
      });
      return;
    }

    const startDate = new Date(starts_at);
    const endDate = new Date(ends_at);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      res.status(400).json({ detail: "Некорректный формат даты или времени события." });
      return;
    }

    if (endDate.getTime() <= startDate.getTime()) {
      res.status(400).json({ detail: "Время окончания события должно быть позже времени начала." });
      return;
    }

    const eventId = "ev_" + crypto.randomBytes(8).toString("hex");
    const cleanDesc = typeof description === "string" && description.trim() ? description.trim() : null;
    const utcStarts = startDate.toISOString();
    const utcEnds = endDate.toISOString();
    const nowIso = new Date().toISOString();

    sqliteDb
      .prepare(
        `INSERT INTO events (id, classroom_id, creator_id, title, description, starts_at, ends_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(eventId, classroom_id, req.user.id, cleanTitle, cleanDesc, utcStarts, utcEnds, nowIso, nowIso);

    res.status(201).json({
      id: eventId,
      classroom_id,
      creator_id: req.user.id,
      creator_username: req.user.username,
      title: cleanTitle,
      description: cleanDesc || undefined,
      starts_at: utcStarts,
      ends_at: utcEnds,
      created_at: nowIso,
      updated_at: nowIso,
    });
  });

  classroomRouter.get("/:classroom_id/events/:event_id", authenticateUser, (req: any, res) => {
    const { classroom_id, event_id } = req.params;

    const membership = sqliteDb
      .prepare("SELECT * FROM members WHERE user_id = ? AND classroom_id = ?")
      .get(req.user.id, classroom_id) as MemberRecord | undefined;

    if (!membership) {
      res.status(403).json({ code: "NOT_A_MEMBER", detail: "Вы не состоите в этом классе." });
      return;
    }

    const event = sqliteDb
      .prepare(
        `SELECT e.*, COALESCE(u.username, 'unknown') as creator_username
         FROM events e
         LEFT JOIN users u ON u.id = e.creator_id
         WHERE e.id = ? AND e.classroom_id = ?`
      )
      .get(event_id, classroom_id) as (EventRecord & { creator_username: string }) | undefined;

    if (!event) {
      res.status(404).json({ detail: "Событие не найдено." });
      return;
    }

    res.json({
      id: event.id,
      classroom_id: event.classroom_id,
      creator_id: event.creator_id,
      creator_username: event.creator_username,
      title: event.title,
      description: event.description || undefined,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      created_at: event.created_at,
      updated_at: event.updated_at,
    });
  });

  const updateEventHandler = (req: any, res: Response) => {
    const { classroom_id, event_id } = req.params;
    const { title, description, starts_at, ends_at } = req.body || {};

    const classroom = sqliteDb
      .prepare("SELECT * FROM classrooms WHERE id = ?")
      .get(classroom_id) as ClassroomRecord | undefined;

    if (!classroom) {
      res.status(404).json({ code: "CLASSROOM_NOT_FOUND", detail: "Класс не найден." });
      return;
    }

    if (classroom.owner_id === req.user.id) {
      ensureOwnerMembership(classroom);
    }

    const membership = sqliteDb
      .prepare("SELECT * FROM members WHERE user_id = ? AND classroom_id = ?")
      .get(req.user.id, classroom_id) as MemberRecord | undefined;

    const callerRole = classroom.owner_id === req.user.id ? "owner" : membership?.role;

    if (!callerRole || (callerRole !== "owner" && callerRole !== "admin")) {
      res.status(403).json({
        code: "FORBIDDEN",
        detail: "Редактировать события могут только владелец и администраторы класса.",
      });
      return;
    }

    const event = sqliteDb
      .prepare("SELECT * FROM events WHERE id = ? AND classroom_id = ?")
      .get(event_id, classroom_id) as EventRecord | undefined;

    if (!event) {
      res.status(404).json({ detail: "Событие не найдено." });
      return;
    }

    let nextTitle = event.title;
    if (title !== undefined) {
      const trimmed = typeof title === "string" ? title.trim() : "";
      if (trimmed.length < 2 || trimmed.length > 150) {
        res.status(400).json({ detail: "Название события должно содержать от 2 до 150 символов." });
        return;
      }
      nextTitle = trimmed;
    }

    const nextDesc =
      description === undefined
        ? event.description
        : typeof description === "string" && description.trim()
        ? description.trim()
        : null;

    const rawStarts = starts_at !== undefined ? starts_at : event.starts_at;
    const rawEnds = ends_at !== undefined ? ends_at : event.ends_at;
    const startDate = new Date(rawStarts);
    const endDate = new Date(rawEnds);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      res.status(400).json({ detail: "Некорректный формат даты или времени события." });
      return;
    }

    if (endDate.getTime() <= startDate.getTime()) {
      res.status(400).json({ detail: "Время окончания события должно быть позже времени начала." });
      return;
    }

    const utcStarts = startDate.toISOString();
    const utcEnds = endDate.toISOString();
    const nowIso = new Date().toISOString();

    sqliteDb
      .prepare(
        "UPDATE events SET title = ?, description = ?, starts_at = ?, ends_at = ?, updated_at = ? WHERE id = ?"
      )
      .run(nextTitle, nextDesc, utcStarts, utcEnds, nowIso, event.id);

    const creator = sqliteDb
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
  };

  classroomRouter.patch("/:classroom_id/events/:event_id", authenticateUser, updateEventHandler);
  classroomRouter.post("/:classroom_id/events/:event_id/update", authenticateUser, updateEventHandler);

  const deleteEventHandler = (req: any, res: Response) => {
    const { classroom_id, event_id } = req.params;

    const classroom = sqliteDb
      .prepare("SELECT * FROM classrooms WHERE id = ?")
      .get(classroom_id) as ClassroomRecord | undefined;

    if (!classroom) {
      res.status(404).json({ code: "CLASSROOM_NOT_FOUND", detail: "Класс не найден." });
      return;
    }

    if (classroom.owner_id === req.user.id) {
      ensureOwnerMembership(classroom);
    }

    const membership = sqliteDb
      .prepare("SELECT * FROM members WHERE user_id = ? AND classroom_id = ?")
      .get(req.user.id, classroom_id) as MemberRecord | undefined;

    const callerRole = classroom.owner_id === req.user.id ? "owner" : membership?.role;

    if (!callerRole || (callerRole !== "owner" && callerRole !== "admin")) {
      res.status(403).json({
        code: "FORBIDDEN",
        detail: "Удалять события могут только владелец и администраторы класса.",
      });
      return;
    }

    const result = sqliteDb
      .prepare("DELETE FROM events WHERE id = ? AND classroom_id = ?")
      .run(event_id, classroom_id);

    if (result.changes === 0) {
      res.status(404).json({ detail: "Событие не найдено." });
      return;
    }

    res.json({ success: true, message: "Событие удалено." });
  };

  classroomRouter.delete("/:classroom_id/events/:event_id", authenticateUser, deleteEventHandler);
  classroomRouter.post("/:classroom_id/events/:event_id/delete", authenticateUser, deleteEventHandler);

  // Mount under both direct and /api prefixes for compatibility
  app.use("/auth", authRouter);
  app.use("/api/auth", authRouter);
  app.use("/classrooms", classroomRouter);
  app.use("/api/classrooms", classroomRouter);

  // Global JSON error handler for API routes
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[API ERROR]", err);
    const status = typeof err?.status === "number" ? err.status : 500;
    res.status(status).json({
      code: "SERVER_ERROR",
      detail:
        status === 400
          ? "Некорректный формат данных запроса."
          : "Внутренняя ошибка сервера при обработке запроса.",
    });
  });

  // Attach Vite middleware in development or static dist in production
  if (attachFrontend) {
    if (process.env.NODE_ENV !== "production") {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (_req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  return {
    app,
    sqliteDb,
    close: () => {
      try {
        sqliteDb.close();
      } catch {}
    },
  };
}

async function startServer() {
  const { app } = await createServerApp();
  app.listen(DEFAULT_PORT, "0.0.0.0", () => {
    console.log(`Interactive Calendar server running on http://localhost:${DEFAULT_PORT}`);
  });
}

if (process.env.DISABLE_AUTO_LISTEN !== "1") {
  startServer().catch((err) => {
    console.error("Failed to start Interactive Calendar server:", err);
    process.exit(1);
  });
}
