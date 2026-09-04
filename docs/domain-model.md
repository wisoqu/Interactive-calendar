# Domain Model - Interactive Calendar

This document defines the core domain model, entities, relations, value objects, and business rules for the Interactive Calendar application.

## 1. Entities

### User
Represents an individual who can authenticate and participate in groups.
*   `id`: unique string/UUID identifier.
*   `username`: unique, alphanumeric username. Required.
*   `email`: optional string representation, validated. Required only for password resets.
*   `password_hash`: secure cryptographic password representation.
*   `created_at`: timestamp of account creation.

### Classroom
An academic class, extracurricular club, or school group containing events and members.
*   `id`: unique string/UUID identifier.
*   `name`: display name of the group. Required.
*   `description`: optional text description.
*   `owner_id`: references the creating User who is the group's "owner".
*   `invite_code`: unique, alphanumeric code that provides join rights.
*   `created_at`: timestamp of classroom creation.
*   `updated_at`: timestamp of last details edit.

### ClassMember
A specific association mapping a User to a Classroom, with role-based attributes.
*   `id`: unique association identifier.
*   `user_id`: references User.
*   `classroom_id`: references Classroom.
*   `role`: MemberRole value (`owner`, `admin`, `member`).
*   `created_at`: timestamp of membership enrollment.
*   *Constraint*: Unique combination of `(user_id, classroom_id)`.

### Event
An event occurring within a specific group.
*   `id`: unique event identifier.
*   `classroom_id`: references Classroom.
*   `creator_id`: references User.
*   `title`: event title. Required.
*   `description`: optional event description.
*   `starts_at`: UTC timestamp indicating event start.
*   `ends_at`: UTC timestamp indicating event end.
*   `created_at`: timestamp of event creation.
*   `updated_at`: timestamp of last event edit.

### UserSession
Represents an active server-side authentication session.
*   `id`: unique database key.
*   `session_id`: unguessable secure token sent to the user as a cookie.
*   `user_id`: references User.
*   `created_at`: timestamp of login.
*   `expires_at`: timestamp when the session expires.
*   `revoked_at`: optional timestamp set when logged out or after password resets.

### PasswordResetCode
One-time email reset token.
*   `id`: unique identifier.
*   `user_id`: references User.
*   `code_hash`: SHA-256 hash of the verification code sent to the email.
*   `expires_at`: expiration window (e.g., 15 minutes).
*   `used_at`: timestamp of usage.
*   `created_at`: timestamp of code request.

---

## 2. Value Objects and Enums

### MemberRole (Enum)
Defines roles within a classroom:
*   `owner`: Full administrative privileges, including classroom deletion and member/role management.
*   `admin`: Classroom editing, event management (CRUD), and non-owner member removal.
*   `member`: Base level permission. Can view events and roster.

---

## 3. Core Business Invariants & Policies

1.  **Unique Relationships**: A user can join a classroom only once. Any duplicate join attempt must be blocked.
2.  **Explicit Ownership**: A classroom must have exactly one Owner. The owner's membership cannot be deleted, and their role cannot be changed unless ownership is transferred or the classroom is deleted.
3.  **Role Hierarchy Security**:
    *   `member` cannot perform CRUD operations on events or classrooms.
    *   `admin` can manage events but cannot modify classroom configuration (`name`, `description`, `invite_code`).
    *   `admin` cannot modify or delete the `owner` or other `admin`s.
4.  **DateTime Consistency**:
    *   `ends_at` must always be strictly greater than `starts_at`.
    *   All timestamps must be recorded and stored in **UTC**.
5.  **Session Revocation Policy**:
    *   Upon a successful password reset, all active sessions for that user are immediately revoked by setting `revoked_at` to the current time.
