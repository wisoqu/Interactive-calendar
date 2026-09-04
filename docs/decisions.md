# Architecture Decisions (ADR) - Interactive Calendar

This document captures key structural choices made during the development of this monorepo.

---

## 1. Modular Session-Based Cookie Auth
*   **Decision**: Avoid JWTs entirely. Rely on unguessable session IDs persisted in an SQLite (dev) or PostgreSQL (prod) table, transmitted through HTTP-only cookies.
*   **Context**: Many developers utilize client-side JWTs for short-term ease, which makes real-time session revocation impossible. Placing session states in a table paired with `revoked_at` allows immediate session eviction upon critical actions (such as email password resets).
*   **Risk Mitigation**: Cookies are labeled `HttpOnly` and configured with `SameSite=Lax` to avoid XSS credentials capture, matching security standards.

---

## 2. Sandbox Coexistence Strategy
*   **Decision**: Provide both (a) a fully production-ready Python FastAPI backend in the `/backend` folder complete with Alembic, Pydantic, and Docker rules, and (b) a unified Node-friendly Express backend in `/server.ts` that mirrors the Python APIs with local file-based database locks.
*   **Context**: The AI Studio sandboxed development container binds port 3000 to Node processes, and file system permissions prevent standard Python startup commands or daemon processes on port 3000, which would disable user previews in the iframe.
*   **Benefit**: This strategy gives the client exactly their requested Python FastAPI monorepo, while also giving them a fully interactive high-fidelity live preview in their AI Studio workspace immediately.

---

## 3. Strict Active Role Protection Invariants
*   **Decision**: Prevent deleting or modifying Owner roles through normal application flow. Ensure that membership role mutations do not allow an Owner to demote themselves if they are the sole owner of a classroom, and prevent Admins from escalating passwords or editing other Admins or Owners.
*   **Benefit**: Maintains absolute multi-tenant containment. One user cannot join multiple times, nor can an Admin compromise the classroom owner.
