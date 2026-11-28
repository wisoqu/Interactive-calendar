# System Architecture - Interactive Calendar

This document describes the architecture of the Interactive Calendar full-stack web application.

## 1. Unified Full-Stack Architecture

The project is built around a lightweight, single-runtime modular TypeScript stack designed to run reliably on low-cost VPS instances (512 MB – 1 GB RAM) without external database servers:

```
┌─────────────────────────────────────────────────────────────┐
│                Browser (React 19 SPA, strict TS)            │
│  AuthPage · HomePage · CalendarPage · MembersPage · Settings│
│  calendar/* Views · AuthContext · ThemeLanguageContext      │
│  URL Hash Routing (#/home, #/classroom/:id/:tab)            │
└──────────────────────────────┬──────────────────────────────┘
                               │ JSON over HTTP(S) + HttpOnly SameSite=Lax Cookie
                               ▼
┌─────────────────────────────────────────────────────────────┐
│           Node.js 22+ + Express (server.ts + server/)        │
│  • Security Headers incl. HSTS (HTTPS) + CSRF Origin Check  │
│  • Account/user-scoped Sliding-Window Rate Limits           │
│  • HttpOnly Cookie Sessions + Hourly Expired-Record Cleanup │
│  • Async PBKDF2-SHA256 Password Hashing (server/crypto.ts)  │
│  • Classroom-Scoped RBAC (Owner / Admin / Member)           │
│  • Nodemailer SMTP Service with Timeouts (server/mailer.ts) │
│  • Static Asset Serving (dist/) / Dynamic Vite in Dev Only  │
└──────────────────────────────┬──────────────────────────────┘
                               │ Synchronous Prepared SQL (WAL + FK CASCADE)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│            Embedded SQLite Database (better-sqlite3)        │
│ users · classrooms · members · events · sessions · reset_codes
│                Persisted in ./data/calendar_db.sqlite       │
└─────────────────────────────────────────────────────────────┘
```

In production the application container is published on `127.0.0.1:3000` and exposed to the internet by **Nginx** on ports 80/443. Nginx terminates TLS and forwards `Host`, `X-Forwarded-For` and `X-Forwarded-Proto`; the Node process trusts those headers only when `TRUST_PROXY=1` (set by `install.sh` for the HTTPS profile, `0` for direct `IP:3000` access).

## 2. Module Responsibilities

1. **Presentation Layer (`/src`)**
   * `src/api/client.ts`: Strictly typed `fetch` wrapper with `credentials: "include"`, `AbortSignal` support, and structured `ApiError` (`status`, `code`, `meta`).
   * `src/utils/errorMessages.ts`: Maps backend error `code` values, HTTP status codes, and offline errors into clean Russian and English messages.
   * `src/utils/calendarDate.ts`: Pure date/time helpers for multi-day event overlap detection, dynamic week grid hour expansion, month/week grid generation, and conflict detection.
   * `src/components/calendar/*`: Modular calendar subcomponents (`MonthGridView`, `WeekGridView`, `EventListView`, `EventEditorModal`, `EventViewModal`) plus shared `ConfirmModal` and `NoticeModal`.
   * `src/store/AuthContext.tsx`: Restores active user session via `GET /api/auth/me`, deduplicates concurrent classroom refreshes, and preserves sessions on transient network blips.
   * `src/store/ThemeLanguageContext.tsx`: Manages Russian/English localization (`<html lang>`) and Light/Dark theme state persisted safely in `localStorage`.
   * `src/App.tsx`: Synchronizes application views with URL hash navigation (`#/home`, `#/classroom/:id/:tab`) for Back/Forward and reload support.

2. **Application & API Layer (`/server.ts` + `/server/*`)**
   * `server.ts`: Slim composition root exposing `createServerApp()`, dynamically loading Vite only in development mode, handling JSON 404/413/400 for API routes, running hourly cleanup of expired sessions/OTPs, executing graceful `SIGTERM`/`SIGINT` shutdown, and honoring `PORT`, `LISTEN_HOST` and `TRUST_PROXY`.
   * `server/crypto.ts`: Async `crypto.pbkdf2` hashing/verification with `timingSafeEqual`, SHA-256 OTP hashing, and cryptographically random ID/token generators.
   * `server/db.ts`: SQLite initialization (`WAL`, `busy_timeout`, `foreign_keys = ON`, `ON DELETE CASCADE`, `CHECK` role constraint on new databases, case-insensitive unique indexes) and expired record cleanup.
   * `server/middleware.ts`: Security headers (HSTS on HTTPS), proxy-aware secure-cookie detection, CSRF Origin/Referer verification, sliding-window IP/counter-key rate limiters, cookie session management, and `createAuthenticateUser` / `createLoadClassroomMember` / `requireClassroomRole` guards.
   * `server/mailer.ts`: Nodemailer SMTP wrapper with explicit socket timeouts, connection cleanup, and localized RU/EN email templates.
   * `server/routes/auth.ts` & `server/routes/classrooms.ts`: REST route handlers with strict payload validation, partial `PATCH` updates, SQL-sorted and date-range-filtered event listing, and structured error codes.

3. **Persistence Layer (`better-sqlite3`)**
   * Runs inside the Node.js process with `PRAGMA journal_mode = WAL`, `PRAGMA busy_timeout = 5000`, `PRAGMA foreign_keys = ON`, and indexed foreign keys, eliminating network round-trips and external DBMS overhead.

## 3. Request Security Pipeline

1. `securityHeadersMiddleware` adds `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and `Strict-Transport-Security` (only over HTTPS).
2. `express.json({ limit: "256kb" })` rejects oversized payloads with `413 PAYLOAD_TOO_LARGE`.
3. `cookieParserMiddleware` parses the `session_id` cookie without external session middleware.
4. `csrfOriginCheckMiddleware` rejects state-changing requests whose `Origin`/`Referer` host differs from `Host`.
5. Route-level rate limiters run before validation/password hashing. Keys are scoped to username/email (login/reset) and to the authenticated user (invite-code joining) so a shared school NAT does not lock out a whole class.
6. `createAuthenticateUser` resolves the server-side session and rejects revoked/expired sessions.
7. `createLoadClassroomMember` loads the classroom, repairs the owner membership if necessary, and resolves the caller's role; `requireClassroomRole` enforces RBAC.

## 4. Verification & CI

* `tests/verify.ts` – 26 integration/unit checks (crypto, calendar math, auth, CSRF, RBAC, events, password reset, WAL/cascade, rate limits, proxy trust, HSTS, payload limits, schema).
* `tests/install-sim.sh` – 80 network-free checks of `install.sh` and `backup.sh`: a temporary local git mirror, mocked `docker`, `apt-get`, `nginx`, `certbot`, `curl` and `getent`, and an interactive Q&A run through a real pty.
* `.github/workflows/ci.yml` – runs TypeScript, tests and installer simulation on Node 22 and 24, then builds the production Docker image and smoke-tests `/api/health/db` plus the SPA.
