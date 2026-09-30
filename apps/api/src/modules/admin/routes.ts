import { Router } from "express";
import { z } from "zod";
import { registerSchema, roles } from "@exam/shared";
import type { Db } from "../../db/client.js";
import { allow, userSelect } from "../../middleware/auth.js";
import { hashPassword } from "../auth/password.js";
import { pagination } from "../../utils/pagination.js";
import { check, param } from "../../utils/errors.js";
export function adminRoutes(db: Db) {
  const r = Router();
  r.use(allow("ADMIN"));
  r.get("/users", async (req, res) => {
    const p = pagination(req.query);
    const role = z.enum(roles).optional().parse(req.query.role);
    const where = {
      role,
      OR: [
        { email: { contains: p.search, mode: "insensitive" as const } },
        { fullName: { contains: p.search, mode: "insensitive" as const } },
        { studentCode: { contains: p.search, mode: "insensitive" as const } },
      ],
    };
    const [items, total] = await Promise.all([
      db.user.findMany({
        where,
        select: userSelect,
        skip: p.skip,
        take: p.take,
        orderBy: { createdAt: "desc" },
      }),
      db.user.count({ where }),
    ]);
    res.json({ data: { items, total, page: p.page, pageSize: p.pageSize } });
  });
  r.post("/users", async (req, res) => {
    const d = registerSchema.extend({ role: z.enum(roles) }).parse(req.body);
    const { password, ...data } = d;
    res.status(201).json({
      data: await db.user.create({
        data: { ...data, passwordHash: await hashPassword(password) },
        select: userSelect,
      }),
    });
  });
  r.patch("/users/:id/status", async (req, res) => {
    const { status } = z
      .object({ status: z.enum(["ACTIVE", "LOCKED"]) })
      .parse(req.body);
    check(param(req) !== req.user.id, 409, "CANNOT_MODIFY_SELF");
    const user = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(904201)`;
      const actor = await tx.user.findUnique({ where: { id: req.user.id } });
      check(
        actor?.role === "ADMIN" && actor.status === "ACTIVE",
        403,
        "FORBIDDEN",
      );
      return tx.user.update({
        where: { id: param(req) },
        data: { status },
        select: userSelect,
      });
    });
    if (status === "LOCKED")
      req.app.locals.io?.in(`user:${user.id}`).disconnectSockets();
    res.json({ data: user });
  });
  r.patch("/users/:id/role", async (req, res) => {
    const { role } = z.object({ role: z.enum(roles) }).parse(req.body);
    const id = param(req);
    check(id !== req.user.id, 409, "CANNOT_MODIFY_SELF");
    const updated = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(904201)`;
      const actor = await tx.user.findUnique({ where: { id: req.user.id } });
      check(
        actor?.role === "ADMIN" && actor.status === "ACTIVE",
        403,
        "FORBIDDEN",
      );
      const user = await tx.user.findUniqueOrThrow({
        where: { id },
        include: {
          _count: {
            select: {
              classes: true,
              banks: true,
              exams: true,
              quizzes: true,
              memberships: true,
              attempts: true,
              participations: true,
            },
          },
        },
      });
      check(
        user.role === role || Object.values(user._count).every((n) => n === 0),
        409,
        "ROLE_HAS_DEPENDENCIES",
        "Không thể đổi role khi tài khoản đã có dữ liệu nghiệp vụ.",
      );
      return tx.user.update({
        where: { id },
        data: { role },
        select: userSelect,
      });
    });
    req.app.locals.io?.in(`user:${id}`).disconnectSockets();
    res.json({ data: updated });
  });
  r.get("/classes", async (req, res) => {
    const p = pagination(req.query);
    res.json({
      data: await db.class.findMany({
        skip: p.skip,
        take: p.take,
        include: {
          teacher: { select: userSelect },
          _count: { select: { members: true } },
        },
      }),
    });
  });
  r.get("/stats", async (_req, res) => {
    const [users, classes, exams, quizzes] = await Promise.all([
      db.user.count(),
      db.class.count(),
      db.exam.count(),
      db.liveQuiz.count(),
    ]);
    res.json({ data: { users, classes, exams, quizzes } });
  });
  return r;
}
