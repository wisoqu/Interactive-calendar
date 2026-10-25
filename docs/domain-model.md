# Domain Model - Interactive Calendar

This document defines the core domain model, entities, roles, and business invariants implemented in the Interactive Calendar application (`server.ts` + SQLite).

## 1. Entities

### User (`users`)
Represents an individual who can authenticate and participate in school classrooms/groups.
* `id`: unique string identifier (`usr_...`).
* `username`: unique username (3–50 characters, case-insensitive uniqueness). Required.
* `email`: optional email address (case-insensitive uniqueness when set). Required for email password recovery.
* `password_hash`: PBKDF2-SHA256 salted password hash (`pbkdf2_sha256$100000$<salt>$<hash>`).
* `created_at`: UTC ISO-8601 timestamp of account creation.

### Classroom (`classrooms`)
An academic class, club, or school group containing events and members.
* `id`: unique string identifier (`cr_...`).
* `name`: display name of the classroom (2–100 characters). Required.
* `description`: optional text description.
* `owner_id`: references the creating `User` who holds the `owner` role.
* `invite_code`: unique 6-character alphanumeric code used to join the group.
* `is_closed`: boolean flag (`0` / `1` in SQLite). When enabled, joining via invite code is blocked.
* `max_members`: integer capacity limit (`0` = unlimited). When `> 0`, new enrollments are blocked once current member count reaches `max_members`.
* `created_at`: UTC ISO-8601 timestamp of classroom creation.
* `updated_at`: UTC ISO-8601 timestamp of last settings update.

### ClassMember (`members`)
Maps a `User` to a `Classroom` with a specific access role.
* `id`: unique association identifier (`mem_...`).
* `user_id`: references `User`.
* `classroom_id`: references `Classroom`.
* `role`: `MemberRole` (`owner` | `admin` | `member`).
* `created_at`: UTC ISO-8601 timestamp of enrollment.
* *Constraint*: Unique pair `(user_id, classroom_id)`.

### Event (`events`)
A scheduled school event occurring within a specific classroom.
* `id`: unique identifier (`ev_...`).
* `classroom_id`: references `Classroom`.
* `creator_id`: references `User` who created the event.
* `title`: event title (2–150 characters). Required.
* `description`: optional event details/notes.
* `starts_at`: UTC ISO-8601 timestamp of event start.
* `ends_at`: UTC ISO-8601 timestamp of event end.
* `created_at`: UTC ISO-8601 timestamp of event creation.
* `updated_at`: UTC ISO-8601 timestamp of last edit.

### UserSession (`sessions`)
Represents a server-side authentication session transmitted via an `HttpOnly` cookie.
* `id`: unique database key (`sid_...`).
* `session_id`: cryptographically random token (`sess_...`) stored in the `session_id` cookie.
* `user_id`: references `User`.
* `created_at`: UTC ISO-8601 login timestamp.
* `expires_at`: UTC ISO-8601 expiration timestamp (7 days).
* `revoked_at`: optional UTC ISO-8601 timestamp set upon logout or password reset.

### PasswordResetCode (`reset_codes`)
One-time 6-digit email verification code for password recovery.
* `id`: unique identifier (`rst_...`).
* `user_id`: references `User`.
* `code_hash`: SHA-256 hex digest of the 6-digit verification code (raw code is never stored in SQLite).
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
2. **Explicit Ownership**: Every classroom has a single `owner`. The owner cannot leave or be removed from their own classroom; to disband the group, the owner deletes the classroom (which cascades to its events and memberships).
3. **Strict Role Hierarchy**:
   * `member` cannot create, edit, or delete events, members, or classroom settings.
   * `admin` cannot modify classroom settings (`PATCH /api/classrooms/:id`), cannot assign the `admin` role, and cannot remove the `owner` or another `admin`.
   * Only `owner` can modify classroom settings, change member roles (`member <-> admin`), or delete the classroom.
4. **Join & Capacity Controls**:
   * When `is_closed = true`, joining via `invite_code` is rejected (`403`).
   * When `max_members > 0` and member count `>= max_members`, both code-joining and manual member addition are rejected (`403`).
5. **DateTime Consistency**:
   * `ends_at` must be strictly later than `starts_at`.
   * Timestamps are normalized and persisted in **UTC** ISO-8601 format.
6. **Session Revocation on Password Reset**:
   * Confirming a password reset marks the verification code as used and immediately revokes all active sessions of that user (`revoked_at`).
