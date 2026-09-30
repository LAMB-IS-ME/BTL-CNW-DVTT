import { Router } from "express";
import { z } from "zod";
import { questionSchema } from "@exam/shared";
import type { Db } from "../../db/client.js";
import { allow } from "../../middleware/auth.js";
import { check, param } from "../../utils/errors.js";
import { pagination } from "../../utils/pagination.js";
const bankSchema = z.object({
  title: z.string().trim().min(1).max(150),
  subject: z.string().max(150).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
});
export async function ownQuestion(db: Db, id: string, teacherId: string) {
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
  const own = async (id: string, ownerTeacherId: string) => {
    const b = await db.questionBank.findUnique({ where: { id } });
    check(b && b.ownerTeacherId === ownerTeacherId, 404, "NOT_FOUND");
    return b;
  };
  r.get("/question-banks", async (req, res) => {
    const p = pagination(req.query);
    res.json({
      data: await db.questionBank.findMany({
        where: { ownerTeacherId: req.user.id },
        skip: p.skip,
        take: p.take,
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { questions: true } } },
      }),
    });
  });
  r.post("/question-banks", async (req, res) =>
    res
      .status(201)
      .json({
        data: await db.questionBank.create({
          data: { ...bankSchema.parse(req.body), ownerTeacherId: req.user.id },
        }),
      }),
  );
  r.get("/question-banks/:id", async (req, res) =>
    res.json({ data: await own(param(req), req.user.id) }),
  );
  r.patch("/question-banks/:id", async (req, res) => {
    await own(param(req), req.user.id);
    res.json({
      data: await db.questionBank.update({
        where: { id: param(req) },
        data: bankSchema.partial().parse(req.body),
      }),
    });
  });
  r.delete("/question-banks/:id", async (req, res) => {
    await own(param(req), req.user.id);
    await db.questionBank.update({
      where: { id: param(req) },
      data: { isArchived: true },
    });
    res.status(204).end();
  });
  r.get("/question-banks/:id/questions", async (req, res) => {
    await own(param(req), req.user.id);
    const p = pagination(req.query);
    const where = {
      bankId: param(req),
      isArchived: false,
      promptMarkdown: { contains: p.search, mode: "insensitive" as const },
    };
    const [items, total] = await Promise.all([
      db.question.findMany({
        where,
        skip: p.skip,
        take: p.take,
        include: { options: { orderBy: { orderIndex: "asc" } } },
        orderBy: { createdAt: "desc" },
      }),
      db.question.count({ where }),
    ]);
    res.json({ data: { items, total } });
  });
  r.post("/question-banks/:id/questions", async (req, res) => {
    const b = await own(param(req), req.user.id);
    check(!b.isArchived, 409, "BANK_ARCHIVED");
    const { options, ...data } = questionSchema.parse(req.body);
    res
      .status(201)
      .json({
        data: await db.question.create({
          data: {
            ...data,
            bankId: b.id,
            options: {
              create: options.map((o, orderIndex) => ({ ...o, orderIndex })),
            },
          },
          include: { options: true },
        }),
      });
  });
  r.get("/questions/:questionId", async (req, res) =>
    res.json({
      data: await ownQuestion(db, param(req, "questionId"), req.user.id),
    }),
  );
  r.patch("/questions/:questionId", async (req, res) => {
    const q = await ownQuestion(db, param(req, "questionId"), req.user.id);
    check(!q.isArchived && !q.bank.isArchived, 409, "QUESTION_ARCHIVED");
    const { options, ...data } = questionSchema.parse(req.body);
    res.json({
      data: await db.question.update({
        where: { id: q.id },
        data: {
          ...data,
          options: {
            deleteMany: {},
            create: options.map((o, orderIndex) => ({ ...o, orderIndex })),
          },
        },
        include: { options: true },
      }),
    });
  });
  r.delete("/questions/:questionId", async (req, res) => {
    await ownQuestion(db, param(req, "questionId"), req.user.id);
    await db.question.update({
      where: { id: param(req, "questionId") },
      data: { isArchived: true },
    });
    res.status(204).end();
  });
  return r;
}
