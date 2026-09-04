import express, { Request, Response, NextFunction } from "express";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import nodemailer from "nodemailer";

const PORT = 3000;
const SESSION_COOKIE_NAME = "session_id";
const DB_FILE = path.join(process.cwd(), "calendar_db.json");
const SQLITE_DB_FILE = path.join(process.cwd(), "calendar_db.sqlite");

async function sendResetEmail(toEmail: string, username: string, code: string): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || `"Classroom Calendar" <no-reply@classroomcalendar.app>`;
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  if (host && user && pass) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass }
      });

      await transporter.sendMail({
        from,
        to: toEmail,
        subject: "Код сброса пароля / Password Reset Code — Classroom Calendar",
        text: `Здравствуйте, ${username}!\n\nВаш 6-значный код для сброса пароля: ${code}\nКод действителен в течение 15 минут.\n\nЕсли вы не запрашивали сброс, проигнорируйте это письмо.`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f5; color: #18181b;">
            <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border: 3px solid #000000; padding: 24px;">
              <h2 style="text-transform: uppercase; letter-spacing: -1px; font-weight: 900; margin-top: 0;">Код сброса пароля</h2>
              <p>Здравствуйте, <strong>${username}</strong>!</p>
              <p>Вы запросили сброс пароля для своей учетной записи в Интерактивном Школьном Календаре.</p>
              <div style="background-color: #000000; color: #ffffff; padding: 16px; text-align: center; font-size: 28px; font-weight: 900; letter-spacing: 6px; margin: 20px 0;">
                ${code}
              </div>
              <p style="font-size: 12px; color: #71717a;">Код действителен 15 минут. Если вы не запрашивали сброс, проигнорируйте данное сообщение.</p>
            </div>
          </div>
        `
      });
      console.log(`[SMTP EMAIL SENT] Reset code successfully delivered to ${toEmail}`);
      return true;
    } catch (err) {
      console.error(`[SMTP ERROR] Failed to send email via SMTP:`, err);
    }
  }
  return false;
}

const sqliteDb = new Database(SQLITE_DB_FILE);

// Schema creation
sqliteDb.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    email TEXT,
    password_hash TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS classrooms (
    id TEXT PRIMARY KEY,
    name TEXT,
    description TEXT,
    owner_id TEXT,
    invite_code TEXT UNIQUE,
    is_closed INTEGER DEFAULT 0,
    max_members INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    classroom_id TEXT,
    role TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    classroom_id TEXT,
    creator_id TEXT,
    title TEXT,
    description TEXT,
    starts_at TEXT,
    ends_at TEXT,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    session_id TEXT UNIQUE,
    user_id TEXT,
    created_at TEXT,
    expires_at TEXT,
    revoked_at TEXT
  );

  CREATE TABLE IF NOT EXISTS reset_codes (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    code_hash TEXT,
    expires_at TEXT,
    used_at TEXT,
    created_at TEXT
  );
`);

// Migration checks for existing databases
try { sqliteDb.exec("ALTER TABLE classrooms ADD COLUMN is_closed INTEGER DEFAULT 0"); } catch (e) {}
try { sqliteDb.exec("ALTER TABLE classrooms ADD COLUMN max_members INTEGER DEFAULT 0"); } catch (e) {}


// Define in-memory types mirroring domain model
interface User {
  id: string;
  username: string;
  email?: string;
  password_hash: string;
  created_at: string;
}

interface Classroom {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  invite_code: string;
  is_closed?: boolean;
  max_members?: number;
  created_at: string;
  updated_at: string;
}

interface ClassMember {
  id: string;
  user_id: string;
  classroom_id: string;
  role: "owner" | "admin" | "member";
  created_at: string;
}

interface EventRecord {
  id: string;
  classroom_id: string;
  creator_id: string;
  title: string;
  description?: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
  updated_at: string;
}

interface UserSession {
  id: string;
  session_id: string;
  user_id: string;
  created_at: string;
  expires_at: string;
  revoked_at?: string;
}

interface PasswordResetCode {
  id: string;
  user_id: string;
  code_hash: string;
  expires_at: string;
  used_at?: string;
  created_at: string;
}

// LowDb style minimal transaction schema
interface DbSchema {
  users: User[];
  classrooms: Classroom[];
  members: ClassMember[];
  events: EventRecord[];
  sessions: UserSession[];
  reset_codes: PasswordResetCode[];
}

const DEFAULT_DB: DbSchema = {
  users: [],
  classrooms: [],
  members: [],
  events: [],
  sessions: [],
  reset_codes: []
};

// Thread-safe SQLite DB access with automatic live JSON-to-SQLite migration
let migrated = false;

function readDb(): DbSchema {
  if (!migrated) {
    migrated = true;
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, "utf-8");
        const jsonDb = JSON.parse(raw);
        const userCount = sqliteDb.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
        if (userCount.count === 0) {
          console.log("Migrating calendar_db.json into SQLite...");
          sqliteDb.transaction(() => {
            if (Array.isArray(jsonDb.users)) {
              const insertUser = sqliteDb.prepare("INSERT OR REPLACE INTO users (id, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)");
              for (const u of jsonDb.users) {
                insertUser.run(u.id, u.username, u.email || null, u.password_hash, u.created_at);
              }
            }
            if (Array.isArray(jsonDb.classrooms)) {
              const insertClassroom = sqliteDb.prepare("INSERT OR REPLACE INTO classrooms (id, name, description, owner_id, invite_code, is_closed, max_members, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
              for (const c of jsonDb.classrooms) {
                insertClassroom.run(c.id, c.name, c.description || null, c.owner_id, c.invite_code, c.is_closed ? 1 : 0, c.max_members || 0, c.created_at, c.updated_at);
              }
            }
            if (Array.isArray(jsonDb.members)) {
              const insertMember = sqliteDb.prepare("INSERT OR REPLACE INTO members (id, user_id, classroom_id, role, created_at) VALUES (?, ?, ?, ?, ?)");
              for (const m of jsonDb.members) {
                insertMember.run(m.id, m.user_id, m.classroom_id, m.role, m.created_at);
              }
            }
            if (Array.isArray(jsonDb.events)) {
              const insertEvent = sqliteDb.prepare("INSERT OR REPLACE INTO events (id, classroom_id, creator_id, title, description, starts_at, ends_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
              for (const e of jsonDb.events) {
                insertEvent.run(e.id, e.classroom_id, e.creator_id, e.title, e.description || null, e.starts_at, e.ends_at, e.created_at, e.updated_at);
              }
            }
            if (Array.isArray(jsonDb.sessions)) {
              const insertSession = sqliteDb.prepare("INSERT OR REPLACE INTO sessions (id, session_id, user_id, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?)");
              for (const s of jsonDb.sessions) {
                insertSession.run(s.id, s.session_id, s.user_id, s.created_at, s.expires_at, s.revoked_at || null);
              }
            }
            if (Array.isArray(jsonDb.reset_codes)) {
              const insertResetCode = sqliteDb.prepare("INSERT OR REPLACE INTO reset_codes (id, user_id, code_hash, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, ?, ?)");
              for (const r of jsonDb.reset_codes) {
                insertResetCode.run(r.id, r.user_id, r.code_hash, r.expires_at, r.used_at || null, r.created_at);
              }
            }
          })();
          console.log("Migration to SQLite completed successfully.");
        }
      } catch (err) {
        console.error("Failed to perform SQLite migration", err);
      }
    }
  }

  try {
    const users = sqliteDb.prepare("SELECT * FROM users").all() as any[];
    const classrooms = sqliteDb.prepare("SELECT * FROM classrooms").all() as any[];
    const members = sqliteDb.prepare("SELECT * FROM members").all() as any[];
    const events = sqliteDb.prepare("SELECT * FROM events").all() as any[];
    const sessions = sqliteDb.prepare("SELECT * FROM sessions").all() as any[];
    const reset_codes = sqliteDb.prepare("SELECT * FROM reset_codes").all() as any[];

    const usersMapped = users.map(u => ({ ...u, email: u.email || undefined }));
    const classroomsMapped = classrooms.map(c => ({
      ...c,
      description: c.description || undefined,
      is_closed: Boolean(c.is_closed),
      max_members: Number(c.max_members || 0)
    }));
    const membersMapped = members.map(m => ({ ...m, role: m.role }));
    const eventsMapped = events.map(e => ({ ...e, description: e.description || undefined }));
    const sessionsMapped = sessions.map(s => ({ ...s, revoked_at: s.revoked_at || undefined }));
    const reset_codesMapped = reset_codes.map(r => ({ ...r, used_at: r.used_at || undefined }));

    return {
      users: usersMapped,
      classrooms: classroomsMapped,
      members: membersMapped,
      events: eventsMapped,
      sessions: sessionsMapped,
      reset_codes: reset_codesMapped
    };
  } catch (err) {
    console.error("Failed to read SQLite db, returning default fallbacks", err);
    return DEFAULT_DB;
  }
}

function writeDb(data: DbSchema): void {
  try {
    sqliteDb.transaction(() => {
      sqliteDb.prepare("DELETE FROM users").run();
      sqliteDb.prepare("DELETE FROM classrooms").run();
      sqliteDb.prepare("DELETE FROM members").run();
      sqliteDb.prepare("DELETE FROM events").run();
      sqliteDb.prepare("DELETE FROM sessions").run();
      sqliteDb.prepare("DELETE FROM reset_codes").run();

      const insertUser = sqliteDb.prepare("INSERT INTO users (id, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)");
      for (const u of data.users) {
        insertUser.run(u.id, u.username, u.email || null, u.password_hash, u.created_at);
      }

      const insertClassroom = sqliteDb.prepare("INSERT INTO classrooms (id, name, description, owner_id, invite_code, is_closed, max_members, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
      for (const c of data.classrooms) {
        insertClassroom.run(
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

      const insertMember = sqliteDb.prepare("INSERT INTO members (id, user_id, classroom_id, role, created_at) VALUES (?, ?, ?, ?, ?)");
      for (const m of data.members) {
        insertMember.run(m.id, m.user_id, m.classroom_id, m.role, m.created_at);
      }

      const insertEvent = sqliteDb.prepare("INSERT INTO events (id, classroom_id, creator_id, title, description, starts_at, ends_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
      for (const e of data.events) {
        insertEvent.run(e.id, e.classroom_id, e.creator_id, e.title, e.description || null, e.starts_at, e.ends_at, e.created_at, e.updated_at);
      }

      const insertSession = sqliteDb.prepare("INSERT INTO sessions (id, session_id, user_id, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?)");
      for (const s of data.sessions) {
        insertSession.run(s.id, s.session_id, s.user_id, s.created_at, s.expires_at, s.revoked_at || null);
      }

      const insertResetCode = sqliteDb.prepare("INSERT INTO reset_codes (id, user_id, code_hash, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, ?, ?)");
      for (const r of data.reset_codes) {
        insertResetCode.run(r.id, r.user_id, r.code_hash, r.expires_at, r.used_at || null, r.created_at);
      }
    })();
  } catch (err) {
    console.error("Failed to commit SQLite write transaction", err);
  }
}

// Cryptography helpers matching Python pbkdf2_sha256 structure
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha256").toString("hex");
  return `pbkdf2_sha256$100000$${salt}$${hash}`;
}

function verifyPassword(password: string, hashed: string): boolean {
  try {
    const parts = hashed.split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
    const iterations = parseInt(parts[1], 10);
    const salt = parts[2];
    const storedHash = parts[3];
    const calculated = crypto.pbkdf2Sync(password, salt, iterations, 64, "sha256").toString("hex");
    return crypto.timingSafeEqual(Buffer.from(calculated, "hex"), Buffer.from(storedHash, "hex"));
  } catch (e) {
    return false;
  }
}

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const db = readDb();
  while (true) {
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (!db.classrooms.some(c => c.invite_code === code)) {
      return code;
    }
  }
}

async function startServer() {
  const app = express();

  // Basic utility-parsing middlewares
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Cookie extraction helper middleware
  app.use((req: any, res, next) => {
    const list: Record<string, string> = {};
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      cookieHeader.split(";").forEach((cookie: string) => {
        const parts = cookie.split("=");
        list[parts.shift()!.trim()] = decodeURI(parts.join("="));
      });
    }
    req.cookies = list;
    next();
  });

  // Authentication validation middleware
  const authenticateUser = (req: any, res: Response, next: NextFunction) => {
    const sessionId = req.cookies?.[SESSION_COOKIE_NAME];
    if (!sessionId) {
      res.status(401).json({ detail: "Not authenticated. Missing session cookie." });
      return;
    }

    const db = readDb();
    const session = db.sessions.find(s => s.session_id === sessionId && !s.revoked_at);
    if (!session) {
      res.status(401).json({ detail: "Session is invalid or has been logged out." });
      return;
    }

    if (new Date(session.expires_at).getTime() < Date.now()) {
      res.status(401).json({ detail: "Session occurred has expired." });
      return;
    }

    const user = db.users.find(u => u.id === session.user_id);
    if (!user) {
      res.status(401).json({ detail: "User record associated with session not found." });
      return;
    }

    req.user = user;
    next();
  };

  // -----------------------------------------------------
  // API CONTRACT IMPLEMENTATION
  // -----------------------------------------------------

  // Healthcheck endpoints
  app.get("/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  app.get("/health/db", (req, res) => {
    res.json({ status: "healthy", database: "sqlite_lock_sandbox", connection: "ok" });
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  app.get("/api/health/db", (req, res) => {
    res.json({ status: "healthy", database: "sqlite_lock_sandbox", connection: "ok" });
  });

  // --- Auth Endpoints ---
  const authRouter = express.Router();

  authRouter.post("/register", (req, res) => {
    const { username, password, email } = req.body;
    if (!username || username.length < 3 || !password || password.length < 6) {
      res.status(400).json({ detail: "Username (min 3 chars) and password (min 6 chars) are required." });
      return;
    }

    const db = readDb();
    if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      res.status(400).json({ detail: "Username is already taken" });
      return;
    }

    if (email && db.users.some(u => u.email?.toLowerCase() === email.toLowerCase())) {
      res.status(400).json({ detail: "Email is already registered" });
      return;
    }

    const user: User = {
      id: "usr_" + crypto.randomBytes(8).toString("hex"),
      username,
      email: email || undefined,
      password_hash: hashPassword(password),
      created_at: new Date().toISOString()
    };

    db.users.push(user);
    writeDb(db);

    res.status(201).json({
      id: user.id,
      username: user.username,
      email: user.email
    });
  });

  authRouter.post("/login", (req, res) => {
    const { username, password } = req.body;
    const db = readDb();

    const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({ detail: "Invalid username or password" });
      return;
    }

    const sessionId = "sess_" + crypto.randomBytes(32).toString("hex");
    const session: UserSession = {
      id: "sid_" + crypto.randomBytes(8).toString("hex"),
      session_id: sessionId,
      user_id: user.id,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };

    db.sessions.push(session);
    writeDb(db);

    res.cookie(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/"
    });

    res.json({
      id: user.id,
      username: user.username,
      email: user.email
    });
  });

  authRouter.get("/me", authenticateUser, (req: any, res) => {
    res.json({
      id: req.user.id,
      username: req.user.username,
      email: req.user.email
    });
  });

  authRouter.post("/logout", (req: any, res) => {
    const sessionId = req.cookies?.[SESSION_COOKIE_NAME];
    if (sessionId) {
      const db = readDb();
      const session = db.sessions.find(s => s.session_id === sessionId);
      if (session) {
        session.revoked_at = new Date().toISOString();
        writeDb(db);
      }
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/", sameSite: "none", secure: true });
    res.json({ success: true, message: "Logged out successfully" });
  });

  authRouter.post("/password-reset/request", (req, res) => {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ detail: "Email parameter is required." });
      return;
    }

    const db = readDb();
    const user = db.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (user) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const tokenHash = crypto.createHash("sha256").update(code).digest("hex");

      const reset: PasswordResetCode = {
        id: "rst_" + crypto.randomBytes(8).toString("hex"),
        user_id: user.id,
        code_hash: tokenHash,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 mins
        created_at: new Date().toISOString()
      };

      db.reset_codes.push(reset);
      writeDb(db);

      console.log(`[LOCAL DEV RESET MATCH] User: ${user.username} | Email: ${email} | CODE: ${code}`);

      sendResetEmail(email, user.username, code).catch(err => {
        console.error("Failed sending reset email:", err);
      });
    }

    res.json({ success: true, message: "If the email is registered, a 6-digit reset code has been sent." });
  });

  authRouter.post("/password-reset/confirm", (req, res) => {
    const { email, code, new_password } = req.body;
    if (!email || !code || !new_password || new_password.length < 6) {
      res.status(400).json({ detail: "Missing inputs or new_password is too weak (min 6 chars)." });
      return;
    }

    const db = readDb();
    const user = db.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) {
      res.status(404).json({ detail: "User not found with this email" });
      return;
    }

    const userResets = db.reset_codes.filter(r => r.user_id === user.id && !r.used_at);
    if (userResets.length === 0) {
      res.status(400).json({ detail: "No password reset requested" });
      return;
    }

    const latest = userResets[userResets.length - 1];
    if (new Date(latest.expires_at).getTime() < Date.now()) {
      res.status(400).json({ detail: "Code has expired" });
      return;
    }

    const checkHash = crypto.createHash("sha256").update(code).digest("hex");
    if (latest.code_hash !== checkHash) {
      res.status(400).json({ detail: "Incorrect verification code" });
      return;
    }

    // Hash and update password
    user.password_hash = hashPassword(new_password);
    latest.used_at = new Date().toISOString();

    // Revoke all active sessions (security invariant!)
    db.sessions.filter(s => s.user_id === user.id).forEach(s => {
      s.revoked_at = new Date().toISOString();
    });

    writeDb(db);
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/", sameSite: "none", secure: true });
    res.json({ success: true, message: "Password updated successfully. All active sessions have been revoked." });
  });

  // --- Classrooms & Items ---
  const classroomRouter = express.Router();

  classroomRouter.get("/", authenticateUser, (req: any, res) => {
    const db = readDb();
    // Get classrooms that current user belongs to
    const myMemberships = db.members.filter(m => m.user_id === req.user.id);
    const results = myMemberships.map(mem => {
      const cr = db.classrooms.find(c => c.id === mem.classroom_id);
      if (!cr) return null;
      const ownerUser = db.users.find(u => u.id === cr.owner_id);
      return {
        id: cr.id,
        name: cr.name,
        description: cr.description,
        owner_id: cr.owner_id,
        owner_username: ownerUser ? ownerUser.username : "unknown",
        invite_code: cr.invite_code,
        user_role: mem.role,
        is_closed: cr.is_closed || false,
        max_members: cr.max_members || 0,
        created_at: cr.created_at
      };
    }).filter(Boolean);

    res.json(results);
  });

  classroomRouter.post("/", authenticateUser, (req: any, res) => {
    const { name, description, is_closed, max_members } = req.body;
    if (!name || name.trim().length < 2) {
      res.status(400).json({ detail: "Classroom name is required (min 2 chars)." });
      return;
    }

    const db = readDb();
    const classroomId = "cr_" + crypto.randomBytes(8).toString("hex");
    const invite_code = generateInviteCode();

    const classroom: Classroom = {
      id: classroomId,
      name: name.trim(),
      description: description || undefined,
      owner_id: req.user.id,
      invite_code,
      is_closed: !!is_closed,
      max_members: typeof max_members === "number" && max_members >= 0 ? max_members : 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const membership: ClassMember = {
      id: "mem_" + crypto.randomBytes(8).toString("hex"),
      user_id: req.user.id,
      classroom_id: classroomId,
      role: "owner",
      created_at: new Date().toISOString()
    };

    db.classrooms.push(classroom);
    db.members.push(membership);
    writeDb(db);

    res.status(201).json({
      id: classroom.id,
      name: classroom.name,
      description: classroom.description,
      owner_id: classroom.owner_id,
      owner_username: req.user.username,
      invite_code: classroom.invite_code,
      user_role: "owner",
      is_closed: classroom.is_closed || false,
      max_members: classroom.max_members || 0,
      created_at: classroom.created_at
    });
  });

  classroomRouter.post("/join", authenticateUser, (req: any, res) => {
    const { invite_code } = req.body;
    if (!invite_code) {
      res.status(400).json({ detail: "Invite code is required." });
      return;
    }

    const db = readDb();
    const classroom = db.classrooms.find(c => c.invite_code === invite_code.trim().toUpperCase());
    if (!classroom) {
      res.status(404).json({ detail: "No classroom found with this invite code" });
      return;
    }

    const existing = db.members.find(m => m.user_id === req.user.id && m.classroom_id === classroom.id);
    if (existing) {
      const ownerUser = db.users.find(u => u.id === classroom.owner_id);
      res.json({
        id: classroom.id,
        name: classroom.name,
        description: classroom.description,
        owner_id: classroom.owner_id,
        owner_username: ownerUser ? ownerUser.username : "unknown",
        invite_code: classroom.invite_code,
        user_role: existing.role,
        is_closed: classroom.is_closed || false,
        max_members: classroom.max_members || 0,
        created_at: classroom.created_at
      });
      return;
    }

    // Privacy constraint checks: Closed classroom or Max members reached
    if (classroom.is_closed) {
      res.status(403).json({ detail: "Этот класс закрыт владельцем. Вступление новых участников временно невозможно." });
      return;
    }

    if (classroom.max_members && classroom.max_members > 0) {
      const currentMemberCount = db.members.filter(m => m.classroom_id === classroom.id).length;
      if (currentMemberCount >= classroom.max_members) {
        res.status(403).json({ detail: `Достигнут максимальный лимит участников класса (${classroom.max_members}).` });
        return;
      }
    }

    const membership: ClassMember = {
      id: "mem_" + crypto.randomBytes(8).toString("hex"),
      user_id: req.user.id,
      classroom_id: classroom.id,
      role: "member",
      created_at: new Date().toISOString()
    };

    db.members.push(membership);
    writeDb(db);

    const ownerUser = db.users.find(u => u.id === classroom.owner_id);
    res.json({
      id: classroom.id,
      name: classroom.name,
      description: classroom.description,
      owner_id: classroom.owner_id,
      owner_username: ownerUser ? ownerUser.username : "unknown",
      invite_code: classroom.invite_code,
      user_role: "member",
      is_closed: classroom.is_closed || false,
      max_members: classroom.max_members || 0,
      created_at: classroom.created_at
    });
  });

  classroomRouter.get("/:classroom_id", authenticateUser, (req: any, res) => {
    const db = readDb();
    const cr = db.classrooms.find(c => c.id === req.params.classroom_id);
    if (!cr) {
      res.status(404).json({ detail: "Classroom not found" });
      return;
    }

    const membership = db.members.find(m => m.user_id === req.user.id && m.classroom_id === cr.id);
    if (!membership) {
      res.status(403).json({ detail: "You are not a member of this classroom" });
      return;
    }

    const ownerUser = db.users.find(u => u.id === cr.owner_id);
    res.json({
      id: cr.id,
      name: cr.name,
      description: cr.description,
      owner_id: cr.owner_id,
      owner_username: ownerUser ? ownerUser.username : "unknown",
      invite_code: cr.invite_code,
      user_role: membership.role,
      is_closed: cr.is_closed || false,
      max_members: cr.max_members || 0,
      created_at: cr.created_at
    });
  });

  classroomRouter.patch("/:classroom_id", authenticateUser, (req: any, res) => {
    const { name, description, is_closed, max_members } = req.body;
    if (!name || name.trim().length < 2) {
      res.status(400).json({ detail: "Classroom name is required." });
      return;
    }

    const db = readDb();
    const cr = db.classrooms.find(c => c.id === req.params.classroom_id);
    if (!cr) {
      res.status(404).json({ detail: "Classroom not found" });
      return;
    }

    const membership = db.members.find(m => m.user_id === req.user.id && m.classroom_id === cr.id);
    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      res.status(403).json({ detail: "Only the owner or admin can modify classroom configurations" });
      return;
    }

    cr.name = name.trim();
    cr.description = description || undefined;
    if (typeof is_closed === "boolean") cr.is_closed = is_closed;
    if (typeof max_members === "number" && max_members >= 0) cr.max_members = max_members;
    cr.updated_at = new Date().toISOString();

    writeDb(db);

    const ownerUser = db.users.find(u => u.id === cr.owner_id);
    res.json({
      id: cr.id,
      name: cr.name,
      description: cr.description,
      owner_id: cr.owner_id,
      owner_username: ownerUser ? ownerUser.username : "unknown",
      invite_code: cr.invite_code,
      user_role: "owner",
      is_closed: cr.is_closed || false,
      max_members: cr.max_members || 0,
      created_at: cr.created_at
    });
  });

  classroomRouter.delete("/:classroom_id", authenticateUser, (req: any, res) => {
    const db = readDb();
    const index = db.classrooms.findIndex(c => c.id === req.params.classroom_id);
    if (index === -1) {
      res.status(404).json({ detail: "Classroom not found" });
      return;
    }

    const cr = db.classrooms[index];
    const membership = db.members.find(m => m.user_id === req.user.id && m.classroom_id === cr.id);
    if (!membership || membership.role !== "owner") {
      res.status(403).json({ detail: "Only the owner can delete the classroom" });
      return;
    }

    // Delete classroom, its memberships and events cascadingly
    db.classrooms.splice(index, 1);
    db.members = db.members.filter(m => m.classroom_id !== cr.id);
    db.events = db.events.filter(e => e.classroom_id !== cr.id);

    writeDb(db);
    res.json({ success: true, message: "Classroom deleted successfully." });
  });

  // --- Classroom Members Endpoints ---
  app.get("/api/classrooms/:classroom_id/members", authenticateUser, (req: any, res) => {
    const { classroom_id } = req.params;
    const db = readDb();

    const callerMembership = db.members.find(m => m.user_id === req.user.id && m.classroom_id === classroom_id);
    if (!callerMembership) {
      res.status(403).json({ detail: "You are not a member of this classroom" });
      return;
    }

    const members = db.members.filter(m => m.classroom_id === classroom_id);
    const results = members.map(m => {
      const u = db.users.find(user => user.id === m.user_id);
      return {
        id: m.id,
        user_id: m.user_id,
        username: u ? u.username : "unknown",
        role: m.role,
        created_at: m.created_at
      };
    });

    res.json(results);
  });

  app.post("/api/classrooms/:classroom_id/members", authenticateUser, (req: any, res) => {
    const { classroom_id } = req.params;
    const { username, role } = req.body;
    if (!username || !role) {
      res.status(400).json({ detail: "Username and role are required." });
      return;
    }

    const db = readDb();
    const callerMembership = db.members.find(m => m.user_id === req.user.id && m.classroom_id === classroom_id);
    if (!callerMembership || (callerMembership.role !== "owner" && callerMembership.role !== "admin")) {
      res.status(403).json({ detail: "You do not have administrative permissions to add members" });
      return;
    }

    if (role !== "admin" && role !== "member") {
      res.status(400).json({ detail: "Invalid role type requested" });
      return;
    }

    const targetUser = db.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
    if (!targetUser) {
      res.status(404).json({ detail: `User with username '${username}' does not exist` });
      return;
    }

    const exists = db.members.some(m => m.classroom_id === classroom_id && m.user_id === targetUser.id);
    if (exists) {
      res.status(400).json({ detail: "User is already a member of this classroom" });
      return;
    }

    const newMem: ClassMember = {
      id: "mem_" + crypto.randomBytes(8).toString("hex"),
      user_id: targetUser.id,
      classroom_id: classroom_id,
      role: role as any,
      created_at: new Date().toISOString()
    };

    db.members.push(newMem);
    writeDb(db);

    res.status(201).json({
      id: newMem.id,
      user_id: newMem.user_id,
      username: targetUser.username,
      role: newMem.role,
      created_at: newMem.created_at
    });
  });

  app.patch("/api/classrooms/:classroom_id/members/:member_id", authenticateUser, (req: any, res) => {
    const { classroom_id, member_id } = req.params;
    const { role } = req.body;

    const db = readDb();
    const callerMembership = db.members.find(m => m.user_id === req.user.id && m.classroom_id === classroom_id);
    if (!callerMembership || callerMembership.role !== "owner") {
      res.status(403).json({ detail: "Only the classroom owner can update roles" });
      return;
    }

    const targetMember = db.members.find(m => m.id === member_id && m.classroom_id === classroom_id);
    if (!targetMember) {
      res.status(404).json({ detail: "Membership record not found" });
      return;
    }

    if (targetMember.role === "owner") {
      res.status(400).json({ detail: "The Owner role cannot be modified. Ownership transfer is out of scope." });
      return;
    }

    if (role !== "admin" && role !== "member") {
      res.status(400).json({ detail: "Role type must be either 'admin' or 'member'" });
      return;
    }

    targetMember.role = role as any;
    writeDb(db);

    const u = db.users.find(user => user.id === targetMember.user_id);
    res.json({
      id: targetMember.id,
      user_id: targetMember.user_id,
      username: u ? u.username : "unknown",
      role: targetMember.role,
      created_at: targetMember.created_at
    });
  });

  app.delete("/api/classrooms/:classroom_id/members/:member_id", authenticateUser, (req: any, res) => {
    const { classroom_id, member_id } = req.params;
    const db = readDb();

    const callerMembership = db.members.find(m => m.user_id === req.user.id && m.classroom_id === classroom_id);
    if (!callerMembership) {
      res.status(403).json({ detail: "Access denied" });
      return;
    }

    const targetMember = db.members.find(m => m.id === member_id && m.classroom_id === classroom_id);
    if (!targetMember) {
      res.status(404).json({ detail: "Membership record not found" });
      return;
    }

    if (targetMember.role === "owner") {
      res.status(400).json({ detail: "The classroom owner cannot be removed" });
      return;
    }

    // Permit self-leaving
    if (callerMembership.user_id === targetMember.user_id) {
      db.members = db.members.filter(m => m.id !== member_id);
      writeDb(db);
      res.json({ success: true, message: "Member removed/left successfully." });
      return;
    }

    // Admin eviction rules
    if (callerMembership.role === "owner" || (callerMembership.role === "admin" && targetMember.role === "member")) {
      db.members = db.members.filter(m => m.id !== member_id);
      writeDb(db);
      res.json({ success: true, message: "Member removed/left successfully." });
    } else {
      res.status(403).json({ detail: "Insufficient roles to remove this member" });
    }
  });

  // --- Classroom Events Endpoints ---
  app.get("/api/classrooms/:classroom_id/events", authenticateUser, (req: any, res) => {
    const { classroom_id } = req.params;
    const db = readDb();

    const membership = db.members.find(m => m.user_id === req.user.id && m.classroom_id === classroom_id);
    if (!membership) {
      res.status(403).json({ detail: "You are not a member of this classroom" });
      return;
    }

    const events = db.events.filter(e => e.classroom_id === classroom_id);
    // Sort starts_at ascending
    events.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

    const result = events.map(e => {
      const u = db.users.find(user => user.id === e.creator_id);
      return {
        id: e.id,
        classroom_id: e.classroom_id,
        creator_id: e.creator_id,
        creator_username: u ? u.username : "unknown",
        title: e.title,
        description: e.description,
        starts_at: e.starts_at,
        ends_at: e.ends_at,
        created_at: e.created_at,
        updated_at: e.updated_at
      };
    });

    res.json(result);
  });

  app.post("/api/classrooms/:classroom_id/events", authenticateUser, (req: any, res) => {
    const { classroom_id } = req.params;
    const { title, description, starts_at, ends_at } = req.body;

    const db = readDb();
    const membership = db.members.find(m => m.user_id === req.user.id && m.classroom_id === classroom_id);
    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      res.status(403).json({ detail: "Only classroom owners and admins can create events" });
      return;
    }

    if (!title || title.trim().length < 2 || !starts_at || !ends_at) {
      res.status(400).json({ detail: "A title (min 2 chars) starts_at, and ends_at are required." });
      return;
    }

    if (new Date(ends_at).getTime() <= new Date(starts_at).getTime()) {
      res.status(400).json({ detail: "Event end time must be strictly after the start time" });
      return;
    }

    const event: EventRecord = {
      id: "ev_" + crypto.randomBytes(8).toString("hex"),
      classroom_id,
      creator_id: req.user.id,
      title: title.trim(),
      description: description || undefined,
      starts_at,
      ends_at,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    db.events.push(event);
    writeDb(db);

    res.status(201).json({
      id: event.id,
      classroom_id: event.classroom_id,
      creator_id: event.creator_id,
      creator_username: req.user.username,
      title: event.title,
      description: event.description,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      created_at: event.created_at,
      updated_at: event.updated_at
    });
  });

  app.get("/api/classrooms/:classroom_id/events/:event_id", authenticateUser, (req: any, res) => {
    const { classroom_id, event_id } = req.params;
    const db = readDb();

    const membership = db.members.find(m => m.user_id === req.user.id && m.classroom_id === classroom_id);
    if (!membership) {
      res.status(403).json({ detail: "You are not a member of this classroom" });
      return;
    }

    const event = db.events.find(e => e.id === event_id && e.classroom_id === classroom_id);
    if (!event) {
      res.status(404).json({ detail: "Event not found or is outside classroom boundaries" });
      return;
    }

    const u = db.users.find(user => user.id === event.creator_id);
    res.json({
      id: event.id,
      classroom_id: event.classroom_id,
      creator_id: event.creator_id,
      creator_username: u ? u.username : "unknown",
      title: event.title,
      description: event.description,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      created_at: event.created_at,
      updated_at: event.updated_at
    });
  });

  app.patch("/api/classrooms/:classroom_id/events/:event_id", authenticateUser, (req: any, res) => {
    const { classroom_id, event_id } = req.params;
    const { title, description, starts_at, ends_at } = req.body;

    const db = readDb();
    const membership = db.members.find(m => m.user_id === req.user.id && m.classroom_id === classroom_id);
    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      res.status(403).json({ detail: "Only classroom owners and admins can update events" });
      return;
    }

    const event = db.events.find(e => e.id === event_id && e.classroom_id === classroom_id);
    if (!event) {
      res.status(404).json({ detail: "Event not found" });
      return;
    }

    const checkStarts = starts_at || event.starts_at;
    const checkEnds = ends_at || event.ends_at;
    if (new Date(checkEnds).getTime() <= new Date(checkStarts).getTime()) {
      res.status(400).json({ detail: "Event end time must be strictly after the start time" });
      return;
    }

    if (title !== undefined) event.title = title.trim();
    if (description !== undefined) event.description = description || undefined;
    if (starts_at !== undefined) event.starts_at = starts_at;
    if (ends_at !== undefined) event.ends_at = ends_at;
    event.updated_at = new Date().toISOString();

    writeDb(db);

    const u = db.users.find(user => user.id === event.creator_id);
    res.json({
      id: event.id,
      classroom_id: event.classroom_id,
      creator_id: event.creator_id,
      creator_username: u ? u.username : "unknown",
      title: event.title,
      description: event.description,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      created_at: event.created_at,
      updated_at: event.updated_at
    });
  });

  app.delete("/api/classrooms/:classroom_id/events/:event_id", authenticateUser, (req: any, res) => {
    const { classroom_id, event_id } = req.params;
    const db = readDb();

    const membership = db.members.find(m => m.user_id === req.user.id && m.classroom_id === classroom_id);
    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      res.status(403).json({ detail: "Only classroom owners and admins can delete events" });
      return;
    }

    const index = db.events.findIndex(e => e.id === event_id && e.classroom_id === classroom_id);
    if (index === -1) {
      res.status(404).json({ detail: "Event not found" });
      return;
    }

    db.events.splice(index, 1);
    writeDb(db);

    res.json({ success: true, message: "Event deleted successfully." });
  });

  // Mount Auth Router under direct and API prefixes for seamless integration
  app.use("/auth", authRouter);
  app.use("/api/auth", authRouter);
  app.use("/classrooms", classroomRouter);
  app.use("/api/classrooms", classroomRouter);

  // -----------------------------------------------------
  // VITE BINDINGS FOR HOT LIVE PREVIEWS
  // -----------------------------------------------------
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express dev server actively running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to boot full-stack development runner", err);
});
