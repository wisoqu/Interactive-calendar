# Deployment - Interactive Calendar

This document illustrates the configurations required to package, configure, and boot the Interactive Calendar monorepo securely.

## 1. Local and Production Configurations

The application relies on standard Environment variables to define secure database paths, port layouts, and secret stores.

### Root `.env` Configurations

```cfg
# Server Environment
ENV=production
PORT=3000

# Backend Credentials & Secret Keys
SECRET_KEY="A_VERY_LONG_CRYPTOGRAPHIC_PASSWORD_SIGNING_SECRET"
GEMINI_API_KEY="AI_STUDIO_INJECTED_OR_MANUAL_SECRET"

# Database Configuration (Postgre)
DATABASE_URL="postgresql://postgres:postgres_secret_password@db:5432/classroom_calendar"

# Mail/SMTP Setup (For code dispatch, can mock in simple setups)
SMTP_HOST="smtp.mailtrap.io"
SMTP_PORT=2525
SMTP_USERNAME="smtp_mock_user"
SMTP_PASSWORD="smtp_mock_password"
SENDER_EMAIL="noreply@classroomcalendar.org"
```

## 2. Docker Compose Layout

We package the PostgreSQL instance, Python FastAPI server, and a prebuilt Static Site server of the React frontend within a multi-container Docker Network.

```yaml
version: '3.8'

services:
  db:
    image: postgres:15-alpine
    container_name: calendar_postgres
    restart: always
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres_secret_password
      POSTGRES_DB: classroom_calendar
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: calendar_fastapi
    restart: always
    depends_on:
      db:
        condition: service_healthy
    environment:
      - ENV=production
      - DATABASE_URL=postgresql://postgres:postgres_secret_password@db:5432/classroom_calendar
      - SECRET_KEY=A_VERY_LONG_CRYPTOGRAPHIC_PASSWORD_SIGNING_SECRET
    ports:
      - "8000:8000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: calendar_nginx
    restart: always
    ports:
      - "3000:3000"
    depends_on:
      - backend

volumes:
  postgres_data:
```

## 3. Automation and Migrations

*   **Alembic Migrations**: Mounted at container boot inside the `backend/` execution container. When the server powers on, it waits for PostgreSQL to reply to health checks, then executes `alembic upgrade head` before serving FastAPI routes.
*   **Vite Single Line Builds**: Built during construction layer inside a Node compilation container and stuffed cleanly into a lightweight Nginx container serving standard static routing rules with SPA fallbacks.
