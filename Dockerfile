# Multi-stage Dockerfile for Interactive School Calendar (Express + React + SQLite)
FROM node:20-alpine AS builder

WORKDIR /app

# Native build toolchain for better-sqlite3 across x86_64 and ARM64 VPS
RUN apk add --no-cache python3 make g++

# Copy dependency manifests and install exact locked dependencies
COPY package*.json ./
RUN npm ci

# Copy application source and compile frontend + server bundle, then prune devDependencies
COPY . .
RUN npm run build && npm prune --omit=dev

# Minimal production runtime image
FROM node:20-alpine AS runner

WORKDIR /app

# su-exec allows entrypoint to fix volume ownership and drop root privileges cleanly
RUN apk add --no-cache su-exec

ENV NODE_ENV=production
ENV PORT=3000
ENV SQLITE_DB_PATH=/app/data/calendar_db.sqlite

# Prepare persistent SQLite directory owned by non-root node user
RUN mkdir -p /app/data && chown -R node:node /app/data

# Copy production build output and pruned runtime dependencies (~4 backend deps)
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/server.cjs"]
