# Domain Model - Interactive Calendar

This document defines the core domain model, entities, roles, and business invariants implemented in the Interactive Calendar application (`server/db.ts` + SQLite).

All tables enforce real foreign key constraints (`PRAGMA foreign_keys = ON`) with `ON DELETE CASCADE` on child tables.

## 1. Entities

### User (`users`)
Represents an individual who can authenticate and participate in school classrooms/groups.
* `id`: unique string identifier (`usr_...`).
* `username`: unique username (3–50 characters, enforced via `UNIQUE` index on `LOWER(username)`). Required.
* `email`: optional email address (enforced via `UNIQUE` index on `LOWER(email)` when set). Required for email password recovery.
* `password_hash`: PBKDF2-SHA256 salted password hash (`pbkdf2_sha256$100000$<salt>$<hash>`). Raw password length is restricted to 6–128 characters.
* `created_at`: UTC ISO-8601 timestamp of account creation.

### Classroom (`classrooms`)
An academic class, club, or school group containing events and members.
* `id`: unique string identifier (`cr_...`).
* `name`: display name of the classroom (2–100 characters). Required.
* `description`: optional text description (up to 2000 characters).
* `owner_id`: references `users(id) ON DELETE CASCADE` for the creating user holding the `owner` role.
* `invite_code`: unique 6-character alphanumeric code used to join the group.
* `is_closed`: boolean flag (`0` / `1` in SQLite). When enabled, joining via invite code is blocked.
* `max_members`: integer capacity limit (`0` = unlimited, up to `1000`). When `> 0`, new enrollments are blocked once current member count reaches `max_members`.
* `created_at`: UTC ISO-8601 timestamp of classroom creation.
* `updated_at`: UTC ISO-8601 timestamp of last settings update.

### ClassMember (`members`)
Maps a `User` to a `Classroom` with a specific access role.
* `id`: unique association identifier (`mem_...`).
* `user_id`: references `users(id) ON DELETE CASCADE`.
* `classroom_id`: references `classrooms(id) ON DELETE CASCADE`.
* `role`: `MemberRole` (`owner` | `admin` | `member`) enforced via `CHECK` constraint.
* `created_at`: UTC ISO-8601 timestamp of enrollment.
* *Constraint*: Unique pair `(user_id, classroom_id)`.

### Event (`events`)
A scheduled school event occurring within a specific classroom.
* `id`: unique identifier (`ev_...`).
* `classroom_id`: references `classrooms(id) ON DELETE CASCADE`.
* `creator_id`: references `users(id) ON DELETE CASCADE` who created the event.
* `title`: event title (2–150 characters). Required.
* `description`: optional event details/notes (up to 4000 characters).
* `starts_at`: UTC ISO-8601 timestamp of event start.
* `ends_at`: UTC ISO-8601 timestamp of event end.
* `created_at`: UTC ISO-8601 timestamp of event creation.
* `updated_at`: UTC ISO-8601 timestamp of last edit.

### UserSession (`sessions`)
Represents a server-side authentication session transmitted via an `HttpOnly; SameSite=Lax` cookie.
* `id`: unique database key (`sid_...`).
* `session_id`: cryptographically random token (`sess_...`) stored in the `session_id` cookie.
* `user_id`: references `users(id) ON DELETE CASCADE`.
* `created_at`: UTC ISO-8601 login timestamp.
* `expires_at`: UTC ISO-8601 expiration timestamp (7 days).
* `revoked_at`: optional UTC ISO-8601 timestamp set upon logout or password reset.

### PasswordResetCode (`reset_codes`)
One-time 6-digit email verification code for password recovery.
* `id`: unique identifier (`rst_...`).
* `user_id`: references `users(id) ON DELETE CASCADE`.
* `code_hash`: SHA-256 hex digest of the 6-digit verification code (raw code is never stored in SQLite).
* `attempts`: failed verification counter (code is invalidated once `attempts >= 5`).
* `expires_at`: UTC ISO-8601 expiration timestamp (15 minutes from creation).
* `used_at`: optional UTC ISO-8601 timestamp set once consumed.
* `created_at`: UTC ISO-8601 request timestamp.

---

## 2. Roles (`MemberRole`)

* `owner`: Full privileges over the classroom, including updating settings (`name`, `description`, `is_closed`, `max_members`), promoting/demoting `admin`s, managing events, removing members, and deleting the classroom.
* `admin`: Event management (create, edit, delete), adding `member`s by username, and removing regular `member`s. Cannot modify classroom settings or manage `owner` / other `admin`s.
* `member`: Read-only access to the classroom calendar, event details, and member list; can leave the classroom at any time.

---

## 3. Core Business Invariants & Policies

1. **Single Enrollment per Classroom**: A user can belong to a classroom at most once (`UNIQUE(user_id, classroom_id)`).
2. **Case-Insensitive Identity Uniqueness**: Two accounts cannot differ only in capitalization of `username` or `email`.
3. **Explicit Ownership**: Every classroom has a single `owner`. The owner cannot leave or be removed from their own classroom; to disband the group, the owner deletes the classroom (which cascades via SQLite foreign keys to its events and memberships).
4. **Strict Role Hierarchy**:
   * `member` cannot create, edit, or delete events, members, or classroom settings.
   * `admin` cannot modify classroom settings (`PATCH /api/classrooms/:id`), cannot assign the `admin` role, and cannot remove the `owner` or another `admin`.
   * Only `owner` can modify classroom settings, change member roles (`member <-> admin`), or delete the classroom.
5. **Join & Capacity Controls**:
   * When `is_closed = true`, joining via `invite_code` is rejected (`403`, `CLASSROOM_CLOSED`).
   * When `max_members > 0` and member count `>= max_members`, both code-joining and manual member addition are rejected (`403`, `CLASSROOM_FULL`).
6. **DateTime Consistency**:
   * `ends_at` must be strictly later than `starts_at`.
   * Timestamps are normalized and persisted in **UTC** ISO-8601 format and sorted chronologically in SQL.
7. **Password Reset Hardening & Session Revocation**:
   * Reset requests never disclose whether an email address is registered.
   * Reset codes lock out after 5 invalid attempts (`429`, `RESET_CODE_LOCKED`).
   * Confirming a password reset marks the verification code as used and immediately revokes all active sessions of that user (`revoked_at`).
8. **Periodic Hygiene**:
   * Expired/revoked sessions and expired/consumed/locked reset codes are periodically purged from SQLite.
