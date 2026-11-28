# API Contract - Interactive Calendar

All endpoints accept and return JSON (`application/json`). Every API route is mounted under `/api/...` (used by the React SPA client), with direct root aliases (`/auth/...`, `/classrooms/...`, `/health`) also available. Unknown `/api/*` paths return `404` JSON instead of SPA HTML.

### Authentication & Security Model
* **Sessions**: Strictly cookie-based using the `session_id` `HttpOnly` cookie (`SameSite=Lax`, 7-day `Max-Age`). The `Secure` flag is added when the request is HTTPS, either directly or via `X-Forwarded-Proto: https` **from a trusted proxy** (`TRUST_PROXY=1`, set by `install.sh` for the Nginx profile). Session tokens are **never** exposed in JSON responses and are **never** accepted from `X-Session-Token` headers.
* **Transport hardening**: over HTTPS the server also sends `Strict-Transport-Security: max-age=15552000; includeSubDomains`. With `TRUST_PROXY=0` (direct `IP:3000` access) `X-Forwarded-*` headers are ignored entirely.
* **CSRF Protection**: State-changing requests (`POST`, `PATCH`, `PUT`, `DELETE`) verify `Origin` / `Referer` against the request `Host` whenever those headers are present.
* **Rate Limiting**: Sliding-window limits return `429 Too Many Requests` with `code: "RATE_LIMITED"` and a `Retry-After` header. Keys are scoped so a shared school NAT does not lock out an entire class:
  * login — `IP + username`, 20 / 15 min;
  * registration — `IP`, 50 / hour;
  * password-reset request — `IP + email`, 5 / 15 min (plus a 100 / 15 min per-IP anti-abuse cap);
  * password-reset confirm — `IP + email`, 15 / 15 min;
  * invite-code join — `IP + authenticated user`, 25 / 15 min.
  Values are tunable via `RATE_LIMIT_LOGIN_MAX`, `RATE_LIMIT_REGISTER_MAX`, `RATE_LIMIT_RESET_REQUEST_MAX`, `RATE_LIMIT_RESET_CONFIRM_MAX`, `RATE_LIMIT_JOIN_MAX`.

---

## 1. Authentication Endpoints

### Auth Configuration Status
* **Path**: `GET /api/auth/config`
* **Response (200 OK)**:
  ```json
  {
    "smtp_configured": true
  }
  ```

### Register
* **Path**: `POST /api/auth/register` (alias: `POST /auth/register`)
* **Request Payload**:
  ```json
  {
    "username": "ivan_petrov",
    "password": "SecurePassword123",
    "email": "ivan@school42.ru"
  }
  ```
* **Validation**: `username` 3–50 chars (case-insensitive unique), `password` 6–128 chars, optional `email` (case-insensitive unique when provided).
* **Response (201 Created)**:
  ```json
  {
    "id": "usr_902341ab12cd34ef",
    "username": "ivan_petrov",
    "email": "ivan@school42.ru"
  }
  ```

### Login
* **Path**: `POST /api/auth/login` (alias: `POST /auth/login`)
* **Request Payload**:
  ```json
  {
    "username": "ivan_petrov",
    "password": "SecurePassword123"
  }
  ```
* **Response Headers**: Sets `session_id` (`HttpOnly; SameSite=Lax`, plus `Secure` on HTTPS).
* **Response (200 OK)**:
  ```json
  {
    "id": "usr_902341ab12cd34ef",
    "username": "ivan_petrov",
    "email": "ivan@school42.ru"
  }
  ```

### Current User (`Me`)
* **Path**: `GET /api/auth/me` (alias: `GET /auth/me`)
* **Cookies**: `session_id`
* **Response (200 OK)**:
  ```json
  {
    "id": "usr_902341ab12cd34ef",
    "username": "ivan_petrov",
    "email": "ivan@school42.ru"
  }
  ```

### Logout
* **Path**: `POST /api/auth/logout` (alias: `POST /auth/logout`)
* **Behavior**: Marks current session `revoked_at` in SQLite and clears the `session_id` cookie.
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Выход выполнен успешно."
  }
  ```

### Password Reset Request
* **Path**: `POST /api/auth/password-reset/request`
* **Request Payload**:
  ```json
  {
    "email": "ivan@school42.ru",
    "lang": "ru"
  }
  ```
* **Behavior**: Returns `503` (`code: "SMTP_NOT_CONFIGURED"`) in production if SMTP is not configured. Otherwise, always returns a uniform `200 OK` message regardless of whether the email exists (preventing email enumeration).
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Если указанный адрес зарегистрирован, на него отправлен 6-значный код восстановления."
  }
  ```

### Password Reset Confirm
* **Path**: `POST /api/auth/password-reset/confirm`
* **Request Payload**:
  ```json
  {
    "email": "ivan@school42.ru",
    "code": "123456",
    "new_password": "NewSecurePassword456"
  }
  ```
* **Behavior**: Verifies 6-digit OTP SHA-256 hash & 15-minute expiry. Locks out the OTP after **5 failed attempts** (`429`, `code: "RESET_CODE_LOCKED"`). On success, updates the PBKDF2 password hash, marks the code as used, and atomically revokes all active sessions for the user.
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Пароль успешно обновлен. Все активные сессии завершены."
  }
  ```

---

## 2. Classroom Endpoints

### List My Classrooms
* **Path**: `GET /api/classrooms`
* **Response (200 OK)**:
  ```json
  [
    {
      "id": "cr_a1b2c3d4e5f60718",
      "name": "10 «А» класс",
      "description": "Расписание контрольных и классных мероприятий",
      "owner_id": "usr_902341ab12cd34ef",
      "owner_username": "ivan_petrov",
      "invite_code": "A7K9P2",
      "user_role": "owner",
      "is_closed": false,
      "max_members": 30,
      "member_count": 12,
      "created_at": "2026-09-01T08:00:00.000Z"
    }
  ]
  ```

### Create Classroom
* **Path**: `POST /api/classrooms`
* **Request Payload**:
  ```json
  {
    "name": "10 «А» класс",
    "description": "Расписание контрольных и классных мероприятий"
  }
  ```
* **Response (201 Created)**: Classroom object with `user_role: "owner"`.

### Join Classroom by Invite Code
* **Path**: `POST /api/classrooms/join`
* **Request Payload**:
  ```json
  {
    "invite_code": "A7K9P2"
  }
  ```
* **Response (200 OK)**: Classroom object with `user_role: "member"` (or `403` with `CLASSROOM_CLOSED` / `CLASSROOM_FULL`, `404` with `CLASSROOM_NOT_FOUND`, `429` with `RATE_LIMITED`).

### Get Classroom Details
* **Path**: `GET /api/classrooms/:classroom_id`
* **Response (200 OK)**: Classroom object for enrolled members (`403` if non-member).

### Update Classroom Settings (Owner Only, Supports Partial Updates)
* **Path**: `PATCH /api/classrooms/:classroom_id`
* **Request Payload** (any subset of fields):
  ```json
  {
    "name": "10 «А» класс (профиль)",
    "description": "Обновленное описание группы",
    "is_closed": true,
    "max_members": 28
  }
  ```
* **Response (200 OK)**: Updated classroom object (`403` if caller is `admin` or `member`).

### Delete Classroom (Owner Only)
* **Path**: `DELETE /api/classrooms/:classroom_id`
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Класс и все связанные записи удалены."
  }
  ```

---

## 3. Classroom Members Endpoints

### List Members
* **Path**: `GET /api/classrooms/:classroom_id/members`
* **Response (200 OK)**: Array of `{ id, user_id, username, role, created_at }`.

### Add Member by Username (Owner / Admin)
* **Path**: `POST /api/classrooms/:classroom_id/members`
* **Permissions**: `owner` can add `member` or `admin`; `admin` can only add `member`. Respects `max_members`.
* **Request Payload**:
  ```json
  {
    "username": "maria_sidorova",
    "role": "member"
  }
  ```
* **Response (201 Created)**: Created membership object.

### Update Member Role (Owner Only)
* **Path**: `PATCH /api/classrooms/:classroom_id/members/:member_id`
* **Request Payload**:
  ```json
  {
    "role": "admin"
  }
  ```
* **Response (200 OK)**: Updated membership object.

### Remove Member / Leave Classroom
* **Path**: `DELETE /api/classrooms/:classroom_id/members/:member_id`
* **Permissions**: Non-owner self-leave allowed; `owner` can remove `admin`/`member`; `admin` can remove `member`. `owner` cannot be removed (`400`, `OWNER_IMMUTABLE`).

---

## 4. Classroom Events Endpoints

### List Events (Sorted Chronologically in SQL by `starts_at`)
* **Path**: `GET /api/classrooms/:classroom_id/events`
* **Optional Query Parameters**:
  * `from`: ISO-8601 UTC timestamp — returns events overlapping `[from, ...]` (`ends_at >= from`).
  * `to`: ISO-8601 UTC timestamp — returns events overlapping `[..., to]` (`starts_at <= to`).
* **Response (200 OK)**: Array of event objects in UTC ISO-8601 format.

### Create Event (Owner / Admin Only)
* **Path**: `POST /api/classrooms/:classroom_id/events`
* **Request Payload**:
  ```json
  {
    "title": "Контрольная работа по алгебре",
    "description": "Повторить параграфы 4–7",
    "starts_at": "2026-10-15T03:00:00.000Z",
    "ends_at": "2026-10-15T04:00:00.000Z"
  }
  ```
* **Response (201 Created)**: Created event object (`400` if `ends_at <= starts_at` or title `< 2` chars).

### Get Event Details
* **Path**: `GET /api/classrooms/:classroom_id/events/:event_id`

### Update Event (Owner / Admin Only, Supports Partial Updates)
* **Path**: `PATCH /api/classrooms/:classroom_id/events/:event_id`

### Delete Event (Owner / Admin Only)
* **Path**: `DELETE /api/classrooms/:classroom_id/events/:event_id`

---

## 5. Health & Error Format

* `GET /api/health` (alias `/health`) -> `{ "status": "healthy", "timestamp": "..." }`
* `GET /api/health/db` (alias `/health/db`) -> `{ "status": "healthy", "database": "sqlite", "connection": "ok" }` (used by Docker healthcheck and `install.sh`)
* Malformed JSON returns `400 INVALID_JSON`; bodies above `256kb` return `413 PAYLOAD_TOO_LARGE`:
  ```json
  { "code": "PAYLOAD_TOO_LARGE", "detail": "Размер запроса превышает допустимый предел." }
  ```
* All `4xx` / `5xx` errors return structured JSON with a machine-readable `code` (mapped to RU/EN on the frontend) and a human-readable `detail`:
  ```json
  {
    "detail": "Достигнут максимальный лимит участников в классе (30).",
    "code": "CLASSROOM_FULL",
    "max_members": 30
  }
  ```
