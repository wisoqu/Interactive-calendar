import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { cleanupExpiredAuthRecords, initDatabase } from "./server/db.ts";
import { hashPassword, verifyPassword } from "./server/crypto.ts";
import {
  cookieParserMiddleware,
  csrfOriginCheckMiddleware,
  DEFAULT_RATE_LIMITS,
  securityHeadersMiddleware,
} from "./server/middleware.ts";
import { createAuthRouter } from "./server/routes/auth.ts";
import { createClassroomRouter } from "./server/routes/classrooms.ts";
import type { RateLimitConfig, ServerOptions } from "./server/types.ts";

export { initDatabase, hashPassword, verifyPassword };
export type {
  ClassroomRecord,
  EventRecord,
  MemberRecord,
  ResetCodeRecord,
  ServerOptions,
  SessionRecord,
  UserRecord,
} from "./server/types.ts";

const DEFAULT_PORT = (() => {
  const parsed = parseInt(process.env.PORT || "3000", 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : 3000;
})();

const DEFAULT_SQLITE_DB_FILE = process.env.SQLITE_DB_PATH
  ? path.resolve(process.cwd(), process.env.SQLITE_DB_PATH)
  : path.join(process.cwd(), "data", "calendar_db.sqlite");

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export async function createServerApp(options: ServerOptions = {}) {
  const dbPath = options.dbPath || DEFAULT_SQLITE_DB_FILE;
  const attachFrontend = options.attachFrontend !== false;
  const enableRateLimit = options.enableRateLimit !== false;
  const rateLimits: RateLimitConfig = {
    ...DEFAULT_RATE_LIMITS,
    ...options.rateLimitOverrides,
  };

  const sqliteDb = initDatabase(dbPath, !options.dbPath);

  // Periodically remove expired/revoked sessions and used/expired OTP records
  const cleanupTimer = setInterval(() => {
    try {
      cleanupExpiredAuthRecords(sqliteDb);
    } catch (err) {
      console.error("[SQLite] Ошибка фоновой очистки записей:", err);
    }
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(securityHeadersMiddleware);
  app.use(express.json({ limit: "256kb" }));
  app.use(cookieParserMiddleware);
  app.use(csrfOriginCheckMiddleware);

  // Healthcheck Endpoints
  const handleHealth = (_req: Request, res: Response) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  };

  const handleDbHealth = (_req: Request, res: Response) => {
    try {
      sqliteDb.prepare("SELECT 1 as ok").get();
      res.json({ status: "healthy", database: "sqlite", connection: "ok" });
    } catch {
      res.status(500).json({ status: "unhealthy", database: "sqlite", connection: "failed" });
    }
  };

  app.get("/health", handleHealth);
  app.get("/api/health", handleHealth);
  app.get("/health/db", handleDbHealth);
  app.get("/api/health/db", handleDbHealth);

  // Domain Routers
  const authRouter = createAuthRouter({
    db: sqliteDb,
    enableRateLimit,
    rateLimits,
    onResetCodeGenerated: options.onResetCodeGenerated,
  });

  const classroomRouter = createClassroomRouter({
    db: sqliteDb,
    enableRateLimit,
    rateLimits,
  });

  app.use("/auth", authRouter);
  app.use("/api/auth", authRouter);
  app.use("/classrooms", classroomRouter);
  app.use("/api/classrooms", classroomRouter);

  // Unknown API routes return clean JSON 404 instead of SPA index.html
  app.use("/api", (_req: Request, res: Response) => {
    res.status(404).json({
      code: "NOT_FOUND",
      detail: "Запрашиваемый API-маршрут не найден.",
    });
  });

  // Global JSON error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[API ERROR]", err);
    const status = typeof err?.status === "number" ? err.status : 500;
    res.status(status).json({
      code: status === 400 ? "INVALID_JSON" : "SERVER_ERROR",
      detail:
        status === 400
          ? "Некорректный формат данных запроса."
          : "Внутренняя ошибка сервера при обработке запроса.",
    });
  });

  // Attach Vite middleware in development (dynamic import so production does NOT need Vite)
  // or serve prebuilt static dist in production
  if (attachFrontend) {
    if (process.env.NODE_ENV !== "production") {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      const indexPath = path.join(distPath, "index.html");
      app.use(express.static(distPath));
      app.get("*", (_req, res) => {
        if (!fs.existsSync(indexPath)) {
          res.status(503).send("Frontend build (dist/index.html) not found. Run `npm run build`.");
          return;
        }
        res.sendFile(indexPath);
      });
    }
  }

  return {
    app,
    sqliteDb,
    close: () => {
      clearInterval(cleanupTimer);
      try {
        sqliteDb.close();
      } catch {
        // Already closed
      }
    },
  };
}

async function startServer() {
  const instance = await createServerApp();
  const server = instance.app.listen(DEFAULT_PORT, "0.0.0.0", () => {
    console.log(`Interactive Calendar server running on http://0.0.0.0:${DEFAULT_PORT}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Server] Получен сигнал ${signal}, завершаем работу...`);
    server.close(() => {
      instance.close();
      process.exit(0);
    });
    // Force exit if connections hang longer than 5s
    setTimeout(() => {
      instance.close();
      process.exit(1);
    }, 5000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

if (process.env.DISABLE_AUTO_LISTEN !== "1") {
  startServer().catch((err) => {
    console.error("Failed to start Interactive Calendar server:", err);
    process.exit(1);
  });
}
