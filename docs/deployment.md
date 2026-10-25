# Deployment Guide - Interactive Calendar

This document describes the production container packaging, environment configuration, persistent SQLite volume mounting, and HTTPS reverse proxy setup.

## 1. Environment Variables (`.env`)

```dotenv
NODE_ENV=production
PORT=3000
SQLITE_DB_PATH=/app/data/calendar_db.sqlite

# Optional SMTP settings for 6-digit password reset emails
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_account@gmail.com
SMTP_PASS=your_16_char_app_password
SMTP_FROM="Школьный календарь <your_account@gmail.com>"
SMTP_SECURE=false
```

## 2. Docker & Persistent SQLite Volume (`docker-compose.yml`)

SQLite in `WAL` mode creates companion `-wal` and `-shm` files alongside `calendar_db.sqlite`. Therefore, `docker-compose.yml` mounts the `./data` **directory** (rather than a single file) to `/app/data`:

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: school_calendar_app
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - .env
    environment:
      - NODE_ENV=production
      - PORT=3000
      - SQLITE_DB_PATH=/app/data/calendar_db.sqlite
    volumes:
      - ./data:/app/data
```

## 3. One-Command Automated Setup (`install.sh`)

On Ubuntu/Debian servers, `install.sh` automates:
1. Checking available RAM and optionally provisioning a 2 GB `/swapfile` on low-memory VPS instances.
2. Installing `git`, `curl`, `docker`, and `docker-compose-plugin` if missing.
3. Cloning the repository into `/opt/interactive-calendar` and generating `.env`.
4. Building and starting the container via `docker compose up -d --build` and verifying `/api/health`.
5. Optionally configuring Nginx + Certbot (`Let's Encrypt`) to serve the application over HTTPS on port `443` with `X-Forwarded-Proto` headers.
