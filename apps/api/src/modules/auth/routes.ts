import { Router } from "express";
import { randomBytes } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { loginSchema, registerSchema } from "@exam/shared";
import type { Db } from "../../db/client.js";
import type { Config } from "../../config/env.js";
import { authenticate, userSelect } from "../../middleware/auth.js";
import { hashPassword, verifyPassword } from "./password.js";
import { check } from "../../utils/errors.js";
export function authRoutes(db: Db, config: Config) {
  const router = Router();
  router.get("/csrf", (req, res) => {
    req.session.csrf ??= randomBytes(32).toString("hex");
    res.json({ data: { token: req.session.csrf } });
  });
  const limiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        code: "RATE_LIMITED",
        message: "Quá nhiều yêu cầu. Vui lòng thử lại sau.",
      },
    },
  });
  router.post("/register", limiter, async (req, res) => {
    const data = registerSchema.parse(req.body);
    const user = await db.user.create({
      data: {
        email: data.email,
        fullName: data.fullName,
        studentCode: data.studentCode,
        passwordHash: await hashPassword(data.password),
        role: "STUDENT",
      },
      select: userSelect,
    });
    res.status(201).json({ data: user });
  });
  router.post("/login", limiter, async (req, res) => {
    const data = loginSchema.parse(req.body);
    const user = await db.user.findUnique({ where: { email: data.email } });
    check(
      user && (await verifyPassword(user.passwordHash, data.password)),
      401,
      "AUTH_INVALID_CREDENTIALS",
      "Email hoặc mật khẩu không đúng.",
    );
    check(
      user.status === "ACTIVE",
      403,
      "ACCOUNT_LOCKED",
      "Tài khoản đã bị khóa.",
    );
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    req.session.userId = user.id;
    req.session.csrf = randomBytes(32).toString("hex");
    await new Promise<void>((resolve, reject) =>
      req.session.save((e) => (e ? reject(e) : resolve())),
    );
    const updated = await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
      select: userSelect,
    });
    res.json({ data: { user: updated, csrf: req.session.csrf } });
  });
  router.post("/logout", async (req, res) => {
    const sessionId = req.session.id;
    await new Promise<void>((resolve, reject) =>
      req.session.destroy((e) => (e ? reject(e) : resolve())),
    );
    req.app.locals.io?.in(`session:${sessionId}`).disconnectSockets();
    res.clearCookie(config.SESSION_COOKIE_NAME, {
      path: "/",
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: config.COOKIE_SAME_SITE,
    });
    res.status(204).end();
  });
  router.get("/me", authenticate(db), (req, res) =>
    res.json({ data: req.user }),
  );
  return router;
}
