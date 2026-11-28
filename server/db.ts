import crypto from "crypto";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import type { ClassroomRecord, ClassroomWithMeta, MemberRecord, MemberRole } from "./types.ts";

const LEGACY_JSON_DB_FILE = path.join(process.cwd(), "calendar_db.json");

export function initDatabase(dbFilePath: string, allowLegacyJsonMigration = false): Database.Database {
  const resolvedDir = path.dirname(dbFilePath);
  if (!fs.existsSync(resolvedDir)) {
    fs.mkdirSync(resolvedDir, { recursive: true });
  }

  const db = new Database(dbFilePath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

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
      is_closed INTEGER NOT NULL DEFAULT 0,
      max_members INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      classroom_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE
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
      updated_at TEXT NOT NULL,
      FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE,
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      session_id TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reset_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Backward-compatible migrations for existing SQLite databases created by earlier versions
  for (const sql of [
    "ALTER TABLE classrooms ADD COLUMN is_closed INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE classrooms ADD COLUMN max_members INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE reset_codes ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0",
  ]) {
    try {
      db.exec(sql);
    } catch {
      // Column already exists
    }
  }

  // Indexes for fast lookups & database-level case-insensitive uniqueness
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_classrooms_invite_code ON classrooms(invite_code);
    CREATE INDEX IF NOT EXISTS idx_classrooms_owner ON classrooms(owner_id);
    CREATE INDEX IF NOT EXISTS idx_members_classroom ON members(classroom_id);
    CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);
    CREATE INDEX IF NOT EXISTS idx_events_classroom_starts ON events(classroom_id, starts_at);
    CREATE INDEX IF NOT EXISTS idx_events_creator ON events(creator_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_reset_codes_user ON reset_codes(user_id, created_at);
  `);

  for (const uniqueIdxSql of [
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users(LOWER(username))",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email)) WHERE email IS NOT NULL",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_members_user_classroom ON members(user_id, classroom_id)",
  ]) {
    try {
      db.exec(uniqueIdxSql);
    } catch (err) {
      console.warn("[SQLite] Не удалось создать уникальный индекс (возможны исторические дубли):", err);
    }
  }

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
              "INSERT OR IGNORE INTO users (id, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
            );
            for (const u of jsonDb.users) {
              stmt.run(u.id, u.username, u.email || null, u.password_hash, u.created_at);
            }
          }
          if (Array.isArray(jsonDb.classrooms)) {
            const stmt = db.prepare(
              "INSERT OR IGNORE INTO classrooms (id, name, description, owner_id, invite_code, is_closed, max_members, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
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
              "INSERT OR IGNORE INTO members (id, user_id, classroom_id, role, created_at) VALUES (?, ?, ?, ?, ?)"
            );
            for (const m of jsonDb.members) {
              stmt.run(m.id, m.user_id, m.classroom_id, m.role, m.created_at);
            }
          }
          if (Array.isArray(jsonDb.events)) {
            const stmt = db.prepare(
              "INSERT OR IGNORE INTO events (id, classroom_id, creator_id, title, description, starts_at, ends_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
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
              "INSERT OR IGNORE INTO sessions (id, session_id, user_id, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?)"
            );
            for (const s of jsonDb.sessions) {
              stmt.run(s.id, s.session_id, s.user_id, s.created_at, s.expires_at, s.revoked_at || null);
            }
          }
          if (Array.isArray(jsonDb.reset_codes)) {
            const stmt = db.prepare(
              "INSERT OR IGNORE INTO reset_codes (id, user_id, code_hash, expires_at, used_at, attempts, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)"
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

  cleanupExpiredAuthRecords(db);
  return db;
}

export function cleanupExpiredAuthRecords(db: Database.Database): {
  deletedSessions: number;
  deletedResetCodes: number;
} {
  const nowIso = new Date().toISOString();
  const sRes = db
    .prepare("DELETE FROM sessions WHERE expires_at < ? OR revoked_at IS NOT NULL")
    .run(nowIso);
  const rRes = db
    .prepare("DELETE FROM reset_codes WHERE expires_at < ? OR used_at IS NOT NULL")
    .run(nowIso);
  return {
    deletedSessions: sRes.changes,
    deletedResetCodes: rRes.changes,
  };
}

export function generateUniqueInviteCode(db: Database.Database): string {
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

export function getClassroomWithMeta(
  db: Database.Database,
  classroomId: string
): ClassroomWithMeta | undefined {
  return db
    .prepare(
      `SELECT c.*, u.username as owner_username,
              (SELECT COUNT(*) FROM members m2 WHERE m2.classroom_id = c.id) as member_count
       FROM classrooms c
       LEFT JOIN users u ON u.id = c.owner_id
       WHERE c.id = ?`
    )
    .get(classroomId) as ClassroomWithMeta | undefined;
}

export function ensureOwnerMembership(
  db: Database.Database,
  classroom: ClassroomRecord
): MemberRecord {
  const existing = db
    .prepare("SELECT * FROM members WHERE user_id = ? AND classroom_id = ?")
    .get(classroom.owner_id, classroom.id) as MemberRecord | undefined;

  if (!existing) {
    const memberId = "mem_" + crypto.randomBytes(8).toString("hex");
    const nowIso = new Date().toISOString();
    db.prepare(
      "INSERT INTO members (id, user_id, classroom_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)"
    ).run(memberId, classroom.owner_id, classroom.id, nowIso);
    return {
      id: memberId,
      user_id: classroom.owner_id,
      classroom_id: classroom.id,
      role: "owner",
      created_at: nowIso,
    };
  }

  if (existing.role !== "owner") {
    db.prepare("UPDATE members SET role = 'owner' WHERE id = ?").run(existing.id);
    return { ...existing, role: "owner" };
  }

  return existing;
}

export function formatClassroomResponse(
  row: ClassroomRecord & { owner_username?: string | null; member_count?: number },
  userRole: MemberRole
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
