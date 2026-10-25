# Multi-stage Dockerfile for Interactive School Calendar (Express + React + SQLite)
FROM node:20-alpine AS builder

WORKDIR /app

# Native build toolchain for better-sqlite3 across x86_64 and ARM64 VPS
RUN apk add --no-cache python3 make g++

# Copy dependency manifests and install dependencies
COPY package*.json ./
RUN npm ci

# Copy application source and compile frontend + server bundle
COPY . .
RUN npm run build && npm prune --omit=dev

# Production runtime image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV SQLITE_DB_PATH=/app/data/calendar_db.sqlite

# Ensure persistent SQLite directory exists
RUN mkdir -p /app/data

# Copy production build output and pruned runtime dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["npm", "start"]
