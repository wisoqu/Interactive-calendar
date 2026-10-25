# System Architecture - Interactive Calendar

This document describes the architecture of the Interactive Calendar full-stack web application.

## 1. Unified Full-Stack Architecture

The project is built around a lightweight, single-runtime TypeScript stack designed to run reliably on low-cost VPS instances (512 MB – 1 GB RAM) without external database servers:

```
┌─────────────────────────────────────────────────────────────┐
│                   Browser (React 19 SPA)                    │
│  AuthPage · HomePage · CalendarPage · MembersPage · Settings│
│       AuthContext · ThemeLanguageContext · apiClient        │
└──────────────────────────────┬──────────────────────────────┘
                               │ JSON over HTTPS / HttpOnly Cookie
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                Node.js 20 + Express (server.ts)             │
│  • Session & Cookie Middleware (Adaptive HTTP / HTTPS)      │
│  • Role-Based Access Control (Owner / Admin / Member)       │
│  • Domain Validation (UTC timestamps, capacity, closed flag)│
│  • Nodemailer SMTP Service (6-digit SHA-256 hashed OTP)     │
│  • Static Asset Serving (dist/) / Vite Middleware in Dev    │
└──────────────────────────────┬──────────────────────────────┘
                               │ Synchronous Prepared SQL (WAL)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│            Embedded SQLite Database (better-sqlite3)        │
│    users · classrooms · members · events · sessions · otp   │
│                Persisted in ./data/calendar_db.sqlite       │
└─────────────────────────────────────────────────────────────┘
```

## 2. Module Responsibilities

1. **Presentation Layer (`/src`)**
   * `src/api/client.ts`: Centralized `fetch` wrapper with `credentials: "include"` and unified error handling.
   * `src/store/AuthContext.tsx`: Restores active user session via `GET /api/auth/me` and synchronizes the user's classroom list.
   * `src/store/ThemeLanguageContext.tsx`: Manages Russian/English localization and Light/Dark theme state persisted in `localStorage`.
   * `src/pages/*`: Modular views for authentication/recovery, classroom overview, interactive calendar (Month, Week, List views + 4-step date/time picker + overlap warning), member management, and owner-only settings.

2. **Application & API Layer (`/server.ts`)**
   * Exposes `createServerApp()` for clean separation between HTTP routing, database lifecycle, and automated end-to-end verification (`tests/verify.ts`).
   * Enforces authentication via server-side sessions (`sessions` table) and classroom-scoped RBAC checks on every protected route.
   * Dispatches password recovery codes via configurable `SMTP_*` environment variables using `nodemailer`.

3. **Persistence Layer (`better-sqlite3`)**
   * Runs inside the Node.js process with `PRAGMA journal_mode = WAL` and indexed foreign keys, eliminating network round-trips and heavy background DBMS memory usage.
