import { Router } from "express";
import { z } from "zod";
import { questionSchema, questionTypes } from "@exam/shared";
import type { Db } from "../../db/client.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { allow } from "../../middleware/auth.js";
import { check, param } from "../../utils/errors.js";
import { pagination } from "../../utils/pagination.js";
import { lockCatalog } from "./lock.js";
import { validateArchive } from "./lifecycle.js";
const bankSchema = z.object({
  title: z.string().trim().min(1).max(150),
  subject: z.string().trim().max(150).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
});
const filters = z.object({
  status: z.enum(["active", "archived", "all"]).optional(),
  subject: z.string().max(150).optional(),
  type: z.enum(questionTypes).optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  sort: z.enum(["updated", "newest", "title"]).default("updated"),
  view: z.enum(["manage"]).optional(),
});
type Client = Db | Prisma.TransactionClient;
export async function ownQuestion(db: Client, id: string, teacherId: string) {
  const q = await db.question.findUnique({
    where: { id },
    include: {
      bank: true,
      options: { orderBy: { orderIndex: "asc" } },
      assets: true,
    },
  });
  check(q && q.bank.ownerTeacherId === teacherId, 404, "NOT_FOUND");
  return q;
}
export function bankRoutes(db: Db) {
  const r = Router();
  r.use(allow("TEACHER"));
  const own = async (client: Client, id: string, ownerTeacherId: string) => {
    const b = await client.questionBank.findUnique({ where: { id } });
    check(b && b.ownerTeacherId === ownerTeacherId, 404, "NOT_FOUND");
    return b;
  };
  r.get("/question-banks", async (req, res) => {
    const p = pagination(req.query),
      f = filters.parse(req.query);
    const where: Prisma.QuestionBankWhereInput = {
      ownerTeacherId: req.user.id,
      title: { contains: p.search, mode: "insensitive" },
      ...(f.subject ? { subject: f.subject } : {}),
      ...(f.status && f.status !== "all"
        ? { isArchived: f.status === "archived" }
        : {}),
    };
    const items = await db.questionBank.findMany({
      where,
      skip: p.skip,
      take: p.take,
      orderBy: [
        f.sort === "title"
          ? { title: "asc" }
          : f.sort === "newest"
            ? { createdAt: "desc" }
            : { updatedAt: "desc" },
        { id: "asc" },
      ],
      include: {
        _count: { select: { questions: { where: { isArchived: false } } } },
      },
    });
    // Existing Exam/Quiz pickers keep their array contract.
    if (f.view !== "manage") {
      res.json({ data: items });
      return;
    }
    const [total, subjects] = await Promise.all([
      db.questionBank.count({ where }),
      db.questionBank.findMany({
        where: { ownerTeacherId: req.user.id, subject: { not: null } },
        select: { subject: true },
        distinct: ["subject"],
        orderBy: { subject: "asc" },
      }),
    ]);
    res.json({
      data: {
        items,
        total,
        subjects: subjects.map((b) => b.subject).filter(Boolean),
      },
    });
  });
  r.post("/question-banks", async (req, res) =>
    res.status(201).json({
      data: await db.questionBank.create({
        data: { ...bankSchema.parse(req.body), ownerTeacherId: req.user.id },
      }),
    }),
  );
  r.get("/question-banks/:id", async (req, res) =>
    res.json({ data: await own(db, param(req), req.user.id) }),
  );
  r.patch("/question-banks/:id", async (req, res) => {
    await own(db, param(req), req.user.id);
    res.json({
      data: await db.questionBank.update({
        where: { id: param(req) },
        data: bankSchema.partial().parse(req.body),
      }),
    });
  });
  r.delete("/question-banks/:id", async (req, res) => {
    await db.$transaction(async (tx) => {
      await lockCatalog(tx, req.user.id);
      const b = await own(tx, param(req), req.user.id);
      if (b.isArchived) return;
      await tx.questionBank.update({
        where: { id: b.id },
        data: { isArchived: true },
      });
      await validateArchive(tx, req.user.id, b.id);
    });
    res.status(204).end();
  });
  r.post("/question-banks/:id/restore", async (req, res) => {
    res.json({
      data: await db.$transaction(async (tx) => {
        await lockCatalog(tx, req.user.id);
        await own(tx, param(req), req.user.id);
        return tx.questionBank.update({
          where: { id: param(req) },
          data: { isArchived: false },
        });
      }),
    });
  });
  r.get("/question-banks/:id/questions", async (req, res) => {
    await own(db, param(req), req.user.id);
    const p = pagination(req.query),
      f = filters.parse(req.query);
    const where: Prisma.QuestionWhereInput = {
      bankId: param(req),
      ...(f.status === "all" ? {} : { isArchived: f.status === "archived" }),
      promptMarkdown: { contains: p.search, mode: "insensitive" },
      type: f.type,
      difficulty: f.difficulty,
    };
    const [items, total] = await Promise.all([
      db.question.findMany({
        where,
        skip: p.skip,
        take: p.take,
        include: { options: { orderBy: { orderIndex: "asc" } } },
        orderBy: [
          f.sort === "newest" ? { createdAt: "desc" } : { updatedAt: "desc" },
          { id: "asc" },
        ],
      }),
      db.question.count({ where }),
    ]);
    res.json({ data: { items, total } });
  });
  r.post("/question-banks/:id/questions", async (req, res) => {
    const { options, ...data } = questionSchema.parse(req.body);
    res.status(201).json({
      data: await db.$transaction(async (tx) => {
        await lockCatalog(tx, req.user.id);
        const b = await own(tx, param(req), req.user.id);
        check(!b.isArchived, 409, "BANK_ARCHIVED");
        return tx.question.create({
          data: {
            ...data,
            bankId: b.id,
            options: {
              create: options.map((o, orderIndex) => ({ ...o, orderIndex })),
            },
          },
          include: { options: true },
        });
      }),
    });
  });
  r.get("/questions/:questionId", async (req, res) =>
    res.json({
      data: await ownQuestion(db, param(req, "questionId"), req.user.id),
    }),
  );
  r.patch("/questions/:questionId", async (req, res) => {
    const { options, ...data } = questionSchema.parse(req.body);
    res.json({
      data: await db.$transaction(async (tx) => {
        await lockCatalog(tx, req.user.id);
        const q = await ownQuestion(tx, param(req, "questionId"), req.user.id);
        check(!q.isArchived && !q.bank.isArchived, 409, "QUESTION_ARCHIVED");
        return tx.question.update({
          where: { id: q.id },
          data: {
            ...data,
            options: {
              deleteMany: {},
              create: options.map((o, orderIndex) => ({ ...o, orderIndex })),
            },
          },
          include: { options: true },
        });
      }),
    });
  });
  r.delete("/questions/:questionId", async (req, res) => {
    await db.$transaction(async (tx) => {
      await lockCatalog(tx, req.user.id);
      const q = await ownQuestion(tx, param(req, "questionId"), req.user.id);
      if (q.isArchived) return;
      await tx.question.update({
        where: { id: q.id },
        data: { isArchived: true },
      });
      await validateArchive(tx, req.user.id, q.bankId, q.id);
    });
    res.status(204).end();
  });
  r.post("/questions/:questionId/restore", async (req, res) => {
    res.json({
      data: await db.$transaction(async (tx) => {
        await lockCatalog(tx, req.user.id);
        const q = await ownQuestion(tx, param(req, "questionId"), req.user.id);
        check(!q.bank.isArchived, 409, "BANK_ARCHIVED");
        return tx.question.update({
          where: { id: q.id },
          data: { isArchived: false },
        });
      }),
    });
  });
  return r;
}
