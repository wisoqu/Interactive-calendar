# Architecture Decisions (ADR) - Interactive Calendar

This document records the key engineering decisions behind the Interactive Calendar application.

---

## ADR-1: Embedded SQLite (`better-sqlite3` in WAL Mode) Instead of External DBMS
* **Decision**: Use embedded SQLite with `WAL` journaling and targeted indexes instead of running a separate PostgreSQL/MySQL container.
* **Context**: School project deployments often run on entry-level VPS instances (512 MB – 1 GB RAM). A standalone relational database container consumes 150–300+ MB of idle RAM.
* **Consequence**: The entire full-stack application runs inside a single `node:20-alpine` container using ~60–90 MB of RAM, with zero network latency for SQL queries and simple single-folder (`./data`) backups.

---

## ADR-2: Server-Side `HttpOnly` Session Cookies Instead of LocalStorage JWTs
* **Decision**: Store session records in the `sessions` SQLite table and transmit only an opaque `session_id` token in an `HttpOnly` cookie, adapting `Secure` / `SameSite` flags automatically based on HTTP vs HTTPS (`X-Forwarded-Proto`).
* **Context**: Stateless JWTs stored in `localStorage` are vulnerable to XSS token theft and cannot be immediately invalidated when a user resets a compromised password.
* **Consequence**: Sessions are immune to client-side JavaScript extraction, work seamlessly both on local HTTP/IP testing and behind HTTPS reverse proxies, and are revoked atomically upon logout or password reset.

---

## ADR-3: Strict Classroom-Scoped Role Hierarchy (`owner` / `admin` / `member`)
* **Decision**: Scope permissions per classroom, reserve structural settings (`name`, `description`, `is_closed`, `max_members`, role promotion, deletion) strictly to the `owner`, and prevent removing or demoting the classroom `owner`.
* **Consequence**: Teachers or class presidents (`owner`) can safely delegate schedule maintenance (`events` and regular `member` enrollment) to class assistants (`admin`) without risking accidental closure, capacity tampering, or deletion of the group.
