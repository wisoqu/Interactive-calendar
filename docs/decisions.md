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
* **Decision**: Load `vite` only via dynamic `await import("vite")` in development mode, prune dev dependencies (`npm prune --omit=dev`) in the multi-stage `Dockerfile`, bind the container process to non-root user `node` via `docker-entrypoint.sh`, and have `install.sh` set `BIND_HOST=127.0.0.1` when the HTTPS profile is configured so the published port is reachable only through Nginx.
* **Consequence**: The production runtime image contains only the 4 runtime dependencies (`better-sqlite3`, `dotenv`, `express`, `nodemailer`), starts cleanly without `vite` installed, reduces container attack surface, and prevents bypassing Nginx TLS when HTTPS is configured.

---

## ADR-6: Explicit Proxy Trust and Separate Host/Listen Bind Addresses
* **Decision**: Treat `BIND_HOST` as a Docker Compose-only value for the *published* host interface, and `LISTEN_HOST` as the address the Node process binds to inside the container (always `0.0.0.0` in Docker). Gate `X-Forwarded-Proto` handling (`Secure` cookies and HSTS) behind `TRUST_PROXY`, which `install.sh` sets to `1` for the Nginx/HTTPS profile and `0` for direct `IP:3000` access.
* **Context**: Docker forwards published ports to the container's bridge interface, so binding Node to `127.0.0.1` inside the container breaks all traffic. Conversely, always trusting `X-Forwarded-*` on a directly exposed port lets clients spoof their IP (rate-limit bypass) and influence cookie security.
* **Consequence**: The same image works both behind Nginx and directly; HTTPS gets strict HSTS and `Secure` cookies; direct HTTP never emits HSTS or trusts spoofable headers.

---

## ADR-7: NAT-Aware Rate Limiting Keyed by Account and User
* **Decision**: Key login attempts by `IP + username`, password-reset requests/confirmations by `IP + email` (with a broad `100/IP/15 min` anti-abuse cap on requests), and invite-code joins by `IP + authenticated user`. Provide `RATE_LIMIT_*_MAX` environment overrides.
* **Context**: A school class typically shares one public NAT address; a naive per-IP limit of 20 logins per 15 minutes would lock out the class during the first lesson.
* **Consequence**: Individual accounts stay protected against brute force and reset-code spam, while 30 students behind one NAT can authenticate and join independently.

---

## ADR-8: Executable Deployment Verification Instead of Documentation-Only Claims
* **Decision**: Keep `tests/verify.ts` (application behavior) and `tests/install-sim.sh` (installer behavior with mocked Docker/Nginx/Certbot) as first-class, runnable artifacts, and add a GitHub Actions pipeline that also builds the real Docker image and smoke-tests `/api/health/db` plus the SPA.
* **Consequence**: Installation and runtime regressions are caught before a server is touched, and the README/deployment guide claims are continuously checked against executable behavior.
