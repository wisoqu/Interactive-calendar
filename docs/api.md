# API Contract - Interactive Calendar

All endpoints accept and return JSON (`application/json`). Every route is mounted under both `/api/...` (used by the React SPA client) and direct root paths (`/auth/...`, `/classrooms/...`, `/health`).

---

## 1. Authentication Endpoints

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
* **Response Headers**:
  * Sets `session_id` `HttpOnly` cookie (`SameSite=None; Secure` over HTTPS, `SameSite=Lax` over plain HTTP, 7-day `Max-Age`).
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
* **Behavior**: Marks current session `revoked_at` in SQLite and clears `session_id` cookie.
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
    "email": "ivan@school42.ru"
  }
  ```
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
* **Behavior**: Verifies 6-digit OTP SHA-256 hash & 15-minute expiry, updates PBKDF2 password hash, marks code as used, and revokes all active sessions for the user.
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
* **Response (200 OK)**: Classroom object with `user_role: "member"` (or `403` if `is_closed` is `true` or `max_members` limit is reached; `404` if code does not exist).

### Get Classroom Details
* **Path**: `GET /api/classrooms/:classroom_id`
* **Response (200 OK)**: Classroom object for enrolled members (`403` if non-member).

### Update Classroom Settings (Owner Only)
* **Path**: `PATCH /api/classrooms/:classroom_id`
* **Request Payload**:
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
* **Permissions**: Non-owner self-leave allowed; `owner` can remove `admin`/`member`; `admin` can remove `member`. `owner` cannot be removed (`400`).

---

## 4. Classroom Events Endpoints

### List Events (Sorted Chronologically by `starts_at`)
* **Path**: `GET /api/classrooms/:classroom_id/events`
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

### Update Event (Owner / Admin Only)
* **Path**: `PATCH /api/classrooms/:classroom_id/events/:event_id`

### Delete Event (Owner / Admin Only)
* **Path**: `DELETE /api/classrooms/:classroom_id/events/:event_id`

---

## 5. Health & Error Format

* `GET /api/health` (alias `/health`) -> `{ "status": "healthy", "timestamp": "..." }`
* `GET /api/health/db` (alias `/health/db`) -> `{ "status": "healthy", "database": "sqlite", "connection": "ok" }`
* All `4xx` / `5xx` errors return:
  ```json
  {
    "detail": "Понятное описание причины ошибки."
  }
  ```
