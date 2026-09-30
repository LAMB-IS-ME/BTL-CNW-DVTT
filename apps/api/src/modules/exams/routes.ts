import { Router } from "express";
import { z } from "zod";
import { examSchema } from "@exam/shared";
import type { Db } from "../../db/client.js";
import { allow } from "../../middleware/auth.js";
import { check, param } from "../../utils/errors.js";
import { pagination } from "../../utils/pagination.js";
import { ownExam, lockExam, materializeSources, type Tx } from "./service.js";
export function examRoutes(db: Db) {
  const r = Router();
  r.use(allow("TEACHER"));
  const edit = async <T>(
    id: string,
    teacherId: string,
    fn: (tx: Tx) => Promise<T>,
  ) =>
    db.$transaction(async (tx) => {
      await lockExam(tx, id);
      const e = await ownExam(tx, id, teacherId);
      check(e.status !== "ARCHIVED", 409, "EXAM_ARCHIVED");
      check(
        (await tx.examAttempt.count({ where: { examId: id } })) === 0,
        409,
        "EXAM_HAS_ATTEMPTS",
        "Đề đã có lượt thi; không thể sửa cấu trúc/cấu hình.",
      );
      return fn(tx);
    });
  r.get("/exams", async (req, res) => {
    const p = pagination(req.query);
    res.json({
      data: await db.exam.findMany({
        where: {
          teacherId: req.user.id,
          title: { contains: p.search, mode: "insensitive" },
        },
        skip: p.skip,
        take: p.take,
        orderBy: { createdAt: "desc" },
      }),
    });
  });
  r.post("/exams", async (req, res) =>
    res
      .status(201)
      .json({
        data: await db.exam.create({
          data: { ...examSchema.parse(req.body), teacherId: req.user.id },
        }),
      }),
  );
  r.get("/exams/:id", async (req, res) =>
    res.json({ data: await ownExam(db, param(req), req.user.id) }),
  );
  r.patch("/exams/:id", async (req, res) => {
    const data = examSchema.parse(req.body);
    res.json({
      data: await edit(param(req), req.user.id, (tx) =>
        tx.exam.update({ where: { id: param(req) }, data }),
      ),
    });
  });
  r.delete("/exams/:id", async (req, res) => {
    await edit(param(req), req.user.id, (tx) =>
      tx.exam.update({
        where: { id: param(req) },
        data: { status: "ARCHIVED" },
      }),
    );
    res.status(204).end();
  });
  r.post("/exams/:id/archive", async (req, res) => {
    await ownExam(db, param(req), req.user.id);
    res.json({
      data: await db.exam.update({
        where: { id: param(req) },
        data: { status: "ARCHIVED" },
      }),
    });
  });
  r.put("/exams/:id/classes", async (req, res) => {
    const { classIds } = z
      .object({ classIds: z.array(z.uuid()).max(100) })
      .parse(req.body);
    check(new Set(classIds).size === classIds.length, 400, "DUPLICATE_CLASS");
    await edit(param(req), req.user.id, async (tx) => {
      check(
        (await tx.class.count({
          where: {
            id: { in: classIds },
            teacherId: req.user.id,
            archivedAt: null,
          },
        })) === classIds.length,
        400,
        "INVALID_CLASS",
      );
      await tx.examClass.deleteMany({ where: { examId: param(req) } });
      await tx.examClass.createMany({
        data: classIds.map((classId) => ({ classId, examId: param(req) })),
      });
    });
    res.json({ data: { saved: true } });
  });
  r.put("/exams/:id/questions", async (req, res) => {
    const { questions } = z
      .object({
        questions: z
          .array(
            z.object({
              questionId: z.uuid(),
              points: z.number().positive().max(10000),
            }),
          )
          .max(500),
      })
      .parse(req.body);
    check(
      new Set(questions.map((q) => q.questionId)).size === questions.length,
      400,
      "DUPLICATE_QUESTION",
    );
    await edit(param(req), req.user.id, async (tx) => {
      check(
        (await tx.question.count({
          where: {
            id: { in: questions.map((q) => q.questionId) },
            isArchived: false,
            bank: { ownerTeacherId: req.user.id, isArchived: false },
          },
        })) === questions.length,
        400,
        "INVALID_QUESTION",
      );
      await tx.examQuestion.deleteMany({ where: { examId: param(req) } });
      await tx.examQuestion.createMany({
        data: questions.map((q, orderIndex) => ({
          ...q,
          examId: param(req),
          orderIndex,
        })),
      });
    });
    res.json({ data: { saved: true } });
  });
  r.put("/exams/:id/pools", async (req, res) => {
    const { pools } = z
      .object({
        pools: z
          .array(
            z.object({
              questionBankId: z.uuid(),
              pickCount: z.number().int().min(1).max(100),
              pointsEach: z.number().positive().max(10000),
              difficultyFilter: z
                .enum(["EASY", "MEDIUM", "HARD"])
                .nullable()
                .optional(),
              tagFilter: z.array(z.string()).max(20).default([]),
            }),
          )
          .max(20),
      })
      .parse(req.body);
    await edit(param(req), req.user.id, async (tx) => {
      const bankIds = [...new Set(pools.map((p) => p.questionBankId))];
      check(
        (await tx.questionBank.count({
          where: {
            id: { in: bankIds },
            ownerTeacherId: req.user.id,
            isArchived: false,
          },
        })) === bankIds.length,
        400,
        "INVALID_BANK",
      );
      await tx.examQuestionPool.deleteMany({ where: { examId: param(req) } });
      await tx.examQuestionPool.createMany({
        data: pools.map((p) => ({ ...p, examId: param(req) })),
      });
    });
    res.json({ data: { saved: true } });
  });
  r.post("/exams/:id/publish", async (req, res) => {
    const e = await db.$transaction(async (tx) => {
      await lockExam(tx, param(req));
      const e = await ownExam(tx, param(req), req.user.id);
      check(e.status === "DRAFT", 409, "EXAM_NOT_DRAFT");
      check(e.classes.length > 0, 400, "CLASS_REQUIRED");
      check(
        e.closeAt > new Date() && e.closeAt > e.openAt && e.durationMinutes > 0,
        400,
        "INVALID_SCHEDULE",
      );
      await materializeSources(tx, e, false);
      return tx.exam.update({
        where: { id: e.id },
        data: { status: "PUBLISHED", publishedAt: new Date() },
      });
    });
    res.json({ data: e });
  });
  return r;
}
