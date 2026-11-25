# Deployment Guide - Interactive Calendar

This document describes the production container packaging, environment configuration, persistent SQLite volume mounting, and HTTPS reverse proxy setup.

## 1. Environment Variables (`.env`)

For local development (`.env.example`):

```dotenv
NODE_ENV=development
PORT=3000
BIND_HOST=0.0.0.0
SQLITE_DB_PATH=./data/calendar_db.sqlite
```

For production in Docker (generated automatically by `install.sh`):

```dotenv
NODE_ENV=production
PORT=3000
# Use 0.0.0.0 for direct IP:3000 access, or 127.0.0.1 when fronted by Nginx HTTPS
BIND_HOST=0.0.0.0
SQLITE_DB_PATH=/app/data/calendar_db.sqlite

# Optional SMTP settings for 6-digit password reset emails
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your_account@gmail.com"
SMTP_PASS="your_16_char_app_password"
SMTP_FROM="Школьный календарь <your_account@gmail.com>"
SMTP_SECURE=false
```

## 2. Docker & Persistent SQLite Volume (`Dockerfile` + `docker-compose.yml`)

* **Multi-stage Alpine build (`Dockerfile`)**: installs dependencies cleanly with `npm ci`, compiles frontend static assets (`dist/`) and the Node server bundle (`dist/server.cjs`), then runs `npm prune --omit=dev` so production images contain only runtime dependencies (`better-sqlite3`, `dotenv`, `express`, `nodemailer`).
* **Non-root execution (`docker-entrypoint.sh`)**: ensures `/app/data` is owned by `node:node` on container boot and drops privileges via `su-exec node` so the Node.js application never runs as `root`.
* **WAL-safe directory mount (`docker-compose.yml`)**: SQLite in `WAL` mode creates companion `-wal` and `-shm` files alongside `calendar_db.sqlite`, so `./data` is mounted as a directory to `/app/data`. A built-in `healthcheck` monitors `/api/health`.

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: school_calendar_app
    restart: unless-stopped
    ports:
      - "${BIND_HOST:-0.0.0.0}:${PORT:-3000}:${PORT:-3000}"
    env_file:
      - .env
    environment:
      - NODE_ENV=production
      - PORT=${PORT:-3000}
      - SQLITE_DB_PATH=/app/data/calendar_db.sqlite
    volumes:
      - ./data:/app/data
```

## 3. One-Command Automated Setup (`install.sh`)

On Ubuntu/Debian servers, `install.sh` automates:
1. Checking available RAM and optionally provisioning a 2 GB `/swapfile` on low-memory VPS instances.
2. Non-interactively installing `git`, `curl`, `docker`, and `docker-compose` if missing.
3. Cloning or safely updating the repository into `/opt/interactive-calendar` and generating a properly escaped `.env`.
4. Building and starting the container via Docker Compose and verifying `/api/health`.
5. Optionally configuring Nginx + Certbot (`Let's Encrypt`) to serve the application over HTTPS on port `443` with `X-Forwarded-Proto` headers, and switching `BIND_HOST=127.0.0.1` so port `3000` is not exposed directly on the public interface.
