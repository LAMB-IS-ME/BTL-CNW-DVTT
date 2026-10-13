import { Router } from "express";
import { z } from "zod";
import type { Db } from "../../db/client.js";
import { allow, userSelect } from "../../middleware/auth.js";
import { check, param } from "../../utils/errors.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { pagination, pageData } from "../../utils/pagination.js";
const schema = z.object({
  name: z.string().trim().min(1).max(150),
  code: z.string().max(40).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
});
export function classRoutes(db: Db) {
  const r = Router();
  r.use(allow("TEACHER"));
  const own = async (id: string, teacherId: string) => {
    const c = await db.class.findUnique({ where: { id } });
    check(c && c.teacherId === teacherId, 404, "NOT_FOUND");
    return c;
  };
  r.get("/students", async (req, res) => {
    const p = pagination(req.query);
    const where: Prisma.UserWhereInput = {
      role: "STUDENT",
      status: "ACTIVE",
      OR: ["email", "fullName", "studentCode"].map((field) => ({
        [field]: { contains: p.search, mode: "insensitive" },
      })),
    };
    const items = await db.user.findMany({
      where,
      select: userSelect,
      skip: p.skip,
      take: p.take,
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
    });
    res.json({
      data: await pageData(req.query, items, () => db.user.count({ where })),
    });
  });
  r.get("/classes", async (req, res) => {
    const p = pagination(req.query);
    const status = z
      .enum(["active", "archived", "all"])
      .optional()
      .parse(req.query.status);
    const where: Prisma.ClassWhereInput = {
      teacherId: req.user.id,
      OR: [
        { name: { contains: p.search, mode: "insensitive" } },
        { code: { contains: p.search, mode: "insensitive" } },
      ],
      ...(status && status !== "all"
        ? { archivedAt: status === "active" ? null : { not: null } }
        : {}),
    };
    const items = await db.class.findMany({
      where,
      include: { _count: { select: { members: true } } },
      skip: p.skip,
      take: p.take,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });
    res.json({
      data: await pageData(req.query, items, () => db.class.count({ where })),
    });
  });
  r.post("/classes", async (req, res) =>
    res.status(201).json({
      data: await db.class.create({
        data: { ...schema.parse(req.body), teacherId: req.user.id },
      }),
    }),
  );
  r.get("/classes/:id", async (req, res) => {
    await own(param(req), req.user.id);
    res.json({
      data: await db.class.findUnique({
        where: { id: param(req) },
        include: {
          members: { include: { student: { select: userSelect } } },
          exams: { include: { exam: { select: { id: true, title: true } } } },
        },
      }),
    });
  });
  r.patch("/classes/:id", async (req, res) => {
    await own(param(req), req.user.id);
    res.json({
      data: await db.class.update({
        where: { id: param(req) },
        data: schema.partial().parse(req.body),
      }),
    });
  });
  r.delete("/classes/:id", async (req, res) => {
    await own(param(req), req.user.id);
    await db.class.update({
      where: { id: param(req) },
      data: { archivedAt: new Date() },
    });
    res.status(204).end();
  });
  r.post("/classes/:id/students", async (req, res) => {
    const c = await own(param(req), req.user.id);
    check(!c.archivedAt, 409, "CLASS_ARCHIVED");
    const { studentId } = z.object({ studentId: z.uuid() }).parse(req.body);
    const s = await db.user.findUnique({ where: { id: studentId } });
    check(
      s?.role === "STUDENT" && s.status === "ACTIVE",
      400,
      "INVALID_STUDENT",
    );
    res.status(201).json({
      data: await db.classMember.upsert({
        where: { classId_studentId: { classId: c.id, studentId } },
        create: { classId: c.id, studentId },
        update: {},
      }),
    });
  });
  r.delete("/classes/:id/students/:studentId", async (req, res) => {
    await own(param(req), req.user.id);
    await db.classMember.deleteMany({
      where: { classId: param(req), studentId: param(req, "studentId") },
    });
    res.status(204).end();
  });
  return r;
}
