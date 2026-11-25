# Architecture Decisions (ADR) - Interactive Calendar

This document records the key engineering decisions behind the Interactive Calendar application.

---

## ADR-1: Embedded SQLite (`better-sqlite3` in WAL Mode) Instead of External DBMS
* **Decision**: Use embedded SQLite with `WAL` journaling, `PRAGMA foreign_keys = ON` (`ON DELETE CASCADE`), and targeted indexes instead of running a separate PostgreSQL/MySQL container.
* **Context**: School project deployments often run on entry-level VPS instances (512 MB – 1 GB RAM). A standalone relational database container consumes 150–300+ MB of idle RAM.
* **Consequence**: The entire full-stack application runs inside a single `node:20-alpine` container using ~60–90 MB of RAM, with zero network latency for SQL queries, guaranteed referential integrity, and simple single-folder (`./data`) backups.

---

## ADR-2: Strict `HttpOnly` + `SameSite=Lax` Cookies and CSRF Verification
* **Decision**: Store session records in the `sessions` SQLite table and transmit the opaque `session_id` strictly via an `HttpOnly; SameSite=Lax` cookie (`+ Secure` on HTTPS). Never expose session tokens in JSON responses or accept `X-Session-Token` headers. Enforce `Origin`/`Referer` verification on state-changing requests and apply sliding-window rate limits on authentication and invite-code endpoints.
* **Context**: Tokens stored in `localStorage` or returned in JSON are vulnerable to XSS theft; `SameSite=None` weakens CSRF protection unnecessarily for a same-origin SPA.
* **Consequence**: Sessions cannot be read by client-side JavaScript, are protected against cross-site request forgery, work cleanly both over local HTTP and behind HTTPS reverse proxies, and can be revoked atomically on logout or password reset.

---

## ADR-3: Strict Classroom-Scoped Role Hierarchy (`owner` / `admin` / `member`)
* **Decision**: Scope permissions per classroom, reserve structural settings (`name`, `description`, `is_closed`, `max_members`, role promotion/demotion, deletion) strictly to the `owner`, and prevent removing or demoting the classroom `owner`.
* **Consequence**: Teachers or class presidents (`owner`) can safely delegate schedule maintenance (`events` and regular `member` enrollment) to class assistants (`admin`) without risking accidental closure, capacity tampering, or deletion of the group.

---

## ADR-4: Non-Blocking Async PBKDF2 & Modular Backend Decomposition
* **Decision**: Split backend responsibilities across `server/{types,crypto,db,mailer,middleware}.ts` and `server/routes/{auth,classrooms}.ts`, and execute `PBKDF2-SHA256` (100,000 iterations, password length bounded to 6–128 chars) asynchronously via `crypto.pbkdf2` on Node's libuv thread pool.
* **Context**: Synchronous `pbkdf2Sync` blocks the single-threaded Express event loop during concurrent logins/registrations and makes large-password DoS trivial.
* **Consequence**: Concurrent authentication requests remain responsive and the backend is cleanly separated into testable, maintainable modules.

---

## ADR-5: Hardened Non-Root Production Container Without Runtime Dev Dependencies
* **Decision**: Load `vite` only via dynamic `await import("vite")` in development mode, prune dev dependencies (`npm prune --omit=dev`) in the multi-stage `Dockerfile`, bind the container process to non-root user `node` via `docker-entrypoint.sh`, and default to `BIND_HOST=127.0.0.1` when installed behind Nginx HTTPS.
* **Consequence**: The production runtime image contains only the 4 runtime dependencies (`better-sqlite3`, `dotenv`, `express`, `nodemailer`), starts cleanly without `vite` installed, reduces container attack surface, and prevents bypassing Nginx TLS when HTTPS is configured.
