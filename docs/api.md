# API Contract - Interactive Calendar

All APIs communicate via standard JSON payloads. In case of success, operations return structured models or indicators. In case of errors, a standard error interface is returned with descriptive messages.

---

## 1. Authentication Endpoints

### Register
*   **Path**: `POST /auth/register`
*   **Request Payload**:
    ```json
    {
      "username": "student_jennifer",
      "password": "SecurePassword123",
      "email": "jennifer@school.org"
    }
    ```
*   **Response Payload (201 Created)**:
    ```json
    {
      "id": "usr_902341",
      "username": "student_jennifer",
      "email": "jennifer@school.org"
    }
    ```

### Login
*   **Path**: `POST /auth/login`
*   **Request Payload**:
    ```json
    {
      "username": "student_jennifer",
      "password": "SecurePassword123"
    }
    ```
*   **Response Headers**:
    *   `Set-Cookie: session_id=sess_abcd1234...; HttpOnly; SameSite=Lax; Path=/`
*   **Response Payload (200 OK)**:
    ```json
    {
      "id": "usr_902341",
      "username": "student_jennifer",
      "email": "jennifer@school.org"
    }
    ```

### Me (Current User Verification)
*   **Path**: `GET /auth/me`
*   **Request headers**: Include `session_id` cookie.
*   **Response Payload (200 OK)**:
    ```json
    {
      "id": "usr_902341",
      "username": "student_jennifer",
      "email": "jennifer@school.org"
    }
    ```

### Logout
*   **Path**: `POST /auth/logout`
*   **Response Headers**: Clears the `session_id` cookie.
*   **Response Payload (200 OK)**:
    ```json
    {
      "success": true,
      "message": "Logged out successfully"
    }
    ```

### Password Reset Request
*   **Path**: `POST /auth/password-reset/request`
*   **Request Payload**:
    ```json
    {
      "email": "jennifer@school.org"
    }
    ```
*   **Response Payload (200 OK)**:
    ```json
    {
      "success": true,
      "message": "If the email is registered, a 6-digit reset code has been sent."
    }
    ```

### Password Reset Confirm
*   **Path**: `POST /auth/password-reset/confirm`
*   **Request Payload**:
    ```json
    {
      "email": "jennifer@school.org",
      "code": "123456",
      "new_password": "MySuperNewPassword456"
    }
    ```
*   **Response Payload (200 OK)**:
    ```json
    {
      "success": true,
      "message": "Password updated successfully. All active sessions have been revoked."
    }
    ```

---

## 2. Classroom Endpoints

### List My Classrooms
*   **Path**: `GET /classrooms`
*   **Response Payload (200 OK)**:
    ```json
    [
      {
        "id": "cr_101",
        "name": "Chemistry Group A",
        "description": "Weekly laboratory calendar",
        "owner_id": "usr_902341",
        "owner_username": "student_jennifer",
        "invite_code": "CHEM-902",
        "user_role": "owner",
        "created_at": "2026-06-15T02:00:00Z"
      }
    ]
    ```

### Create Classroom
*   **Path**: `POST /classrooms`
*   **Request Payload**:
    ```json
    {
      "name": "Chemistry Group A",
      "description": "Weekly laboratory calendar"
    }
    ```
*   **Response Payload (201 Created)**:
    ```json
    {
      "id": "cr_101",
      "name": "Chemistry Group A",
      "description": "Weekly laboratory calendar",
      "owner_id": "usr_902341",
      "owner_username": "student_jennifer",
      "invite_code": "CHEM-902",
      "user_role": "owner",
      "created_at": "2026-06-15T02:00:00Z"
    }
    ```

### Join Classroom by Invite Code
*   **Path**: `POST /classrooms/join`
*   **Request Payload**:
    ```json
    {
      "invite_code": "CHEM-902"
    }
    ```
*   **Response Payload (200 OK)**:
    ```json
    {
      "id": "cr_101",
      "name": "Chemistry Group A",
      "description": "Weekly laboratory calendar",
      "owner_id": "usr_902341",
      "owner_username": "student_jennifer",
      "invite_code": "CHEM-902",
      "user_role": "member",
      "created_at": "2026-06-15T02:00:00Z"
    }
    ```

### Get Classroom Details
*   **Path**: `GET /classrooms/{classroom_id}`
*   **Response Payload (200 OK)**:
    ```json
    {
      "id": "cr_101",
      "name": "Chemistry Group A",
      "description": "Weekly laboratory calendar",
      "owner_id": "usr_902341",
      "owner_username": "student_jennifer",
      "invite_code": "CHEM-902",
      "user_role": "member",
      "created_at": "2026-06-15T02:00:00Z"
    }
    ```

### Update Classroom (Owner-Only)
*   **Path**: `PATCH /classrooms/{classroom_id}`
*   **Request Payload**:
    ```json
    {
      "name": "Chemistry Group A (Advanced)",
      "description": "New schedule information"
    }
    ```
*   **Response Payload (200 OK)**:
    ```json
    {
      "id": "cr_101",
      "name": "Chemistry Group A (Advanced)",
      "description": "New schedule information",
      "owner_id": "usr_902341",
      "owner_username": "student_jennifer",
      "invite_code": "CHEM-902",
      "user_role": "owner",
      "created_at": "2026-06-15T02:00:00Z"
    }
    ```

### Delete Classroom (Owner-Only)
*   **Path**: `DELETE /classrooms/{classroom_id}`
*   **Response Payload (200 OK)**:
    ```json
    {
      "success": true,
      "message": "Classroom and all associated occurrences deleted completely."
    }
    ```

---

## 3. Classroom Members Endpoints

### Get Roster/Members
*   **Path**: `GET /classrooms/{classroom_id}/members`
*   **Response Payload (200 OK)**:
    ```json
    [
      {
        "id": "mem_2092",
        "user_id": "usr_902341",
        "username": "student_jennifer",
        "role": "owner",
        "created_at": "2026-06-15T02:00:00Z"
      },
      {
        "id": "mem_3120",
        "user_id": "usr_556012",
        "username": "assistant_bobby",
        "role": "admin",
        "created_at": "2026-06-15T02:15:00Z"
      }
    ]
    ```

### Force Join/Add Member by Username (Owner/Admin Only)
*   **Path**: `POST /classrooms/{classroom_id}/members`
*   **Request Payload**:
    ```json
    {
      "username": "assistant_bobby",
      "role": "admin"
    }
    ```
*   **Response Payload (201 Created)**:
    ```json
    {
      "id": "mem_3120",
      "user_id": "usr_556012",
      "username": "assistant_bobby",
      "role": "admin",
      "created_at": "2026-06-15T02:15:00Z"
    }
    ```

### Update Member Role (Owner-Only)
*   **Path**: `PATCH /classrooms/{classroom_id}/members/{member_id}`
*   **Request Payload**:
    ```json
    {
      "role": "admin"
    }
    ```
*   **Response Payload (200 OK)**:
    ```json
    {
      "id": "mem_3120",
      "user_id": "usr_556012",
      "username": "assistant_bobby",
      "role": "admin",
      "created_at": "2026-06-15T02:15:00Z"
    }
    ```

### Remove Member (Owner/Admin Only)
*   **Path**: `DELETE /classrooms/{classroom_id}/members/{member_id}`
*   **Response Payload (200 OK)**:
    ```json
    {
      "success": true,
      "message": "Member removed successfully"
    }
    ```

---

## 4. Classroom Events Endpoints

### List Events (In UTC)
*   **Path**: `GET /classrooms/{classroom_id}/events`
*   **Response Payload (200 OK)**:
    ```json
    [
      {
        "id": "ev_0091",
        "classroom_id": "cr_101",
        "creator_id": "usr_902341",
        "creator_username": "student_jennifer",
        "title": "Semester Quiz 1",
        "description": "Covers chapter 1 to 4 of organic chemistry",
        "starts_at": "2026-06-20T09:00:00Z",
        "ends_at": "2026-06-20T10:00:00Z",
        "created_at": "2026-06-15T02:30:00Z",
        "updated_at": "2026-06-15T02:30:00Z"
      }
    ]
    ```

### Create Event (Owner/Admin Only)
*   **Path**: `POST /classrooms/{classroom_id}/events`
*   **Request Payload**:
    ```json
    {
      "title": "Semester Quiz 1",
      "description": "Covers chapter 1 to 4 of organic chemistry",
      "starts_at": "2026-06-20T09:00:00Z",
      "ends_at": "2026-06-20T10:00:00Z"
    }
    ```
*   **Response Payload (201 Created)**:
    ```json
    {
      "id": "ev_0091",
      "classroom_id": "cr_101",
      "creator_id": "usr_902341",
      "creator_username": "student_jennifer",
      "title": "Semester Quiz 1",
      "description": "Covers chapter 1 to 4 of organic chemistry",
      "starts_at": "2026-06-20T09:00:00Z",
      "ends_at": "2026-06-20T10:00:00Z",
      "created_at": "2026-06-15T02:30:00Z",
      "updated_at": "2026-06-15T02:30:00Z"
    }
    ```

### Get Specific Event
*   **Path**: `GET /classrooms/{classroom_id}/events/{event_id}`
*   **Response Payload (200 OK)**:
    ```json
    {
      "id": "ev_0091",
      "classroom_id": "cr_101",
      "creator_id": "usr_902341",
      "creator_username": "student_jennifer",
      "title": "Semester Quiz 1",
      "description": "Covers chapter 1 to 4 of organic chemistry",
      "starts_at": "2026-06-20T09:00:00Z",
      "ends_at": "2026-06-20T10:00:00Z",
      "created_at": "2026-06-15T02:30:00Z",
      "updated_at": "2026-06-15T02:30:00Z"
    }
    ```

### Update Event (Owner/Admin Only)
*   **Path**: `PATCH /classrooms/{classroom_id}/events/{event_id}`
*   **Request Payload**:
    ```json
    {
      "title": "Semester Quiz 1 - Postponed",
      "starts_at": "2026-06-21T09:00:00Z",
      "ends_at": "2026-06-21T10:00:00Z"
    }
    ```
*   **Response Payload (200 OK)**:
    ```json
    {
      "id": "ev_0091",
      "classroom_id": "cr_101",
      "creator_id": "usr_902341",
      "creator_username": "student_jennifer",
      "title": "Semester Quiz 1 - Postponed",
      "description": "Covers chapter 1 to 4 of organic chemistry",
      "starts_at": "2026-06-21T09:00:00Z",
      "ends_at": "2026-06-21T10:00:00Z",
      "created_at": "2026-06-15T02:30:00Z",
      "updated_at": "2026-06-15T02:40:00Z"
    }
    ```

### Delete Event (Owner/Admin Only)
*   **Path**: `DELETE /classrooms/{classroom_id}/events/{event_id}`
*   **Response Payload (200 OK)**:
    ```json
    {
      "success": true,
      "message": "Event deleted successfully."
    }
    ```

---

## 5. Health Endpoints

### Base Health
*   **Path**: `GET /health`
*   **Response Payload (200 OK)**:
    ```json
    {
      "status": "healthy",
      "timestamp": "2026-06-15T02:43:23Z"
    }
    ```

### Database Health
*   **Path**: `GET /health/db`
*   **Response Payload (200 OK)**:
    ```json
    {
      "status": "healthy",
      "database": "sqlite_local",
      "connection": "ok"
    }
    ```

---

## 6. Error Response Protocol

If any server operations fail, a structured, unified error schema is systematically returned. 

*   **Failure Schema (4xx / 5xx Status Code)**:
    ```json
    {
      "detail": "Descriptive error message describing exactly what failed, readable by human."
    }
    ```
