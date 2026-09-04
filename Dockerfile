# Multi-stage Dockerfile for School Calendar (Express + Vite + SQLite)
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies required for building
RUN npm ci

# Copy source code
COPY . .

# Build frontend & backend (runs `vite build` and `esbuild server.ts --outfile=dist/server.cjs`)
RUN npm run build

# Production runner image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy build output and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Expose application port
EXPOSE 3000

# Run production server
CMD ["npm", "start"]
