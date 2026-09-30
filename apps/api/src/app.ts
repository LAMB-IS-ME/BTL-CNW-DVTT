import { quizRoutes, studentQuizRoutes } from "./modules/live-quiz/routes.js";
import { analyticsRoutes } from "./modules/analytics/routes.js";
import { gradingRoutes, resultRoutes } from "./modules/grading/routes.js";
import { monitorSnapshot } from "./sockets/presence.js";
import { ownExam } from "./modules/exams/service.js";
import { allow } from "./middleware/auth.js";
import { param } from "./utils/errors.js";
import { attemptRoutes } from "./modules/attempts/routes.js";
import { examRoutes } from "./modules/exams/routes.js";
import express from "express";
import { classRoutes } from "./modules/classes/routes.js";
import { bankRoutes } from "./modules/question-banks/routes.js";
import { storageRoutes } from "./modules/storage/routes.js";
import helmet from "helmet";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import type { Db } from "./db/client.js";
import type { Config } from "./config/env.js";
import { csrfProtection } from "./middleware/security.js";
import { authenticate } from "./middleware/auth.js";
import { authRoutes } from "./modules/auth/routes.js";
import { adminRoutes } from "./modules/admin/routes.js";
import { AppError, errorHandler } from "./utils/errors.js";
export function createApp(deps?: { db: Db; config: Config }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.get("/api/health", (_req, res) =>
    res.json({ data: { status: "ok", service: "exam-api" } }),
  );
  if (deps) {
    const { db, config } = deps;
    app.set("trust proxy", config.TRUST_PROXY);
    app.use(
      cors({
        origin: (origin, callback) =>
          callback(
            origin && !config.origins.includes(origin)
              ? new AppError(403, "ORIGIN_REJECTED")
              : null,
            true,
          ),
        credentials: true,
      }),
    );
    app.use(express.json({ limit: "1mb" }));
    const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 5 });
    const store = new (connectPgSimple(session))({
      pool,
      tableName: "session",
      createTableIfMissing: false,
    });
    const sessionMiddleware = session({
      store,
      name: config.SESSION_COOKIE_NAME,
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: config.COOKIE_SECURE,
        sameSite: config.COOKIE_SAME_SITE,
        maxAge: config.SESSION_MAX_AGE_MS,
        path: "/",
      },
    });
    app.locals.sessionMiddleware = sessionMiddleware;
    app.locals.sessionPool = pool;
    app.locals.sessionStore = store;
    app.use(sessionMiddleware);
    app.use("/api/v1", csrfProtection(config));
    app.use("/api/v1/auth", authRoutes(db, config));
    app.use("/api/v1/admin", authenticate(db), adminRoutes(db));
    app.get(
      "/api/v1/teacher/exams/:id/monitor",
      authenticate(db),
      allow("TEACHER"),
      async (req, res) => {
        await ownExam(db, param(req), req.user.id);
        res.json({
          data: await monitorSnapshot(db, param(req), app.locals.presence),
        });
      },
    );
    app.use(
      "/api/v1/teacher",
      authenticate(db),
      classRoutes(db),
      bankRoutes(db),
      examRoutes(db),
      gradingRoutes(db),
      analyticsRoutes(db),
      quizRoutes(db),
    );
    app.use(
      "/api/v1/student",
      authenticate(db),
      attemptRoutes(db),
      resultRoutes(db),
      studentQuizRoutes(db),
    );
    app.use("/api/v1", authenticate(db), storageRoutes(db, config));
  }
  app.use((_req, _res, next) =>
    next(new AppError(404, "NOT_FOUND", "Không tìm thấy đường dẫn.")),
  );
  app.use(errorHandler);
  return app;
}
