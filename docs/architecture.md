# System Architecture - Interactive Calendar

This document outlines the layering and separation of concerns adopted for the Interactive Calendar codebase.

## 1. Architectural Layers

Both the Python FastAPI backend and the Express development runner mirror a strict multi-tiered dependency rule. Dependency flow is monodirectional: outermost layers depend inward on stable domain policies, and there are absolutely no circular or horizontal shortcuts.

```
       [ HTTP API (Routers / Controllers) ]               (Outermost Layer)
                     │
                     ▼
        [ Application Layer (Services) ]
                     │
                     ▼
   [ Domain Model (Entities, Enums, Policies) ] <───┐     (Innermost Core)
                     ▲                              │
                     │                              │
   [ Infrastructure (Repositories, Cryptography) ] ─┘
```

### 1. Domain Layer (`/domain` or `/src/domain`)
The core of the application containing pure enterprise logic and structures:
*   **Entities**: Domain mappings representing essential data boundaries (User, Classroom, ClassMember, Event, Session, ResetCode).
*   **Policies**: Static rules governing access rights and actions (e.g., matching User roles to classroom operations).
*   **Exceptions**: Pure domain-level exceptions representing violation of invariants (e.g., `ClassroomJoinException`, `PermissionDeniedException`, `SessionExpiredException`).

### 2. Infrastructure Layer (`/infrastructure` or `/src/infrastructure`)
Provides technology-specific implements backing core interfaces:
*   **Repositories**: Concrete database helpers carrying SQL queries/commands. Business logic remains completely absent from this layer.
*   **Security/Cryptography**: Password hashing, secure string generators for invite codes and session IDs, SHA-256 calculators.
*   **DB Drivers**: Handles schema creation, active session states, and connection pooling.

### 3. Application Layer (`/application/services` or `/src/services`)
Orchestrates domain models and infrastructure capabilities to achieve workflows:
*   Encapsulates atomic behaviors (e.g., `ClassroomService.join_by_code()`, `AuthService.reset_password()`).
*   Verifies authorization rules by delegating to permission policies.
*   Performs coordinate operations (saving event, creating join records).

### 4. Router/API Layer (`/api` or `/src/routes`)
Unpacks and translates network schemas to domain workflows, returning standardized responses:
*   Invokes appropriate services.
*   Sets session cookies in HTTP response headers.
*   Catches business exceptions and wraps them into unified, descriptive API errors.
