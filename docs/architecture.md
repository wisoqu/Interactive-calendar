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
│           Node.js 20 + Express (server.ts + server/)        │
│  • Security Headers, CSRF Origin/Referer Check, Rate Limits │
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
│    users · classrooms · members · events · sessions · otp   │
│                Persisted in ./data/calendar_db.sqlite       │
└─────────────────────────────────────────────────────────────┘
```

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
   * `server.ts`: Slim composition root exposing `createServerApp()`, dynamically loading Vite only in development mode, handling JSON 404 for unknown `/api/*` paths, running hourly cleanup of expired sessions/OTPs, and executing graceful `SIGTERM`/`SIGINT` shutdown.
   * `server/crypto.ts`: Async `crypto.pbkdf2` hashing/verification with `timingSafeEqual`, SHA-256 OTP hashing, and cryptographically random ID/token generators.
   * `server/db.ts`: SQLite initialization (`WAL`, `foreign_keys = ON`, `ON DELETE CASCADE`, case-insensitive unique indexes) and expired record cleanup.
   * `server/middleware.ts`: Security headers, CSRF Origin/Referer verification, sliding-window IP rate limiters, cookie session management, and `requireAuth`/`requireClassroomMember` guards.
   * `server/mailer.ts`: Nodemailer SMTP wrapper with explicit socket timeouts, connection cleanup, and localized RU/EN email templates.
   * `server/routes/auth.ts` & `server/routes/classrooms.ts`: REST route handlers with strict payload validation, partial `PATCH` updates, SQL-sorted and date-range-filtered event listing, and structured error codes.

3. **Persistence Layer (`better-sqlite3`)**
   * Runs inside the Node.js process with `PRAGMA journal_mode = WAL`, `PRAGMA busy_timeout = 5000`, `PRAGMA foreign_keys = ON`, and indexed foreign keys, eliminating network round-trips and external DBMS overhead.
