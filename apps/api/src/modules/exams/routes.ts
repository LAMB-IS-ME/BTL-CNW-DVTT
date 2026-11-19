import { lockCatalog } from "../question-banks/lock.js";
import { Router } from "express";
import { z } from "zod";
import { examSchema } from "@exam/shared";
import type { Db } from "../../db/client.js";
import { allow } from "../../middleware/auth.js";
import { check, param } from "../../utils/errors.js";
import { pagination, pageData } from "../../utils/pagination.js";
import { ownExam, lockExam, type Tx } from "./service.js";
import {
  classesSchema,
  fixedQuestionsSchema,
  poolsSchema,
  configurationSchema,
  replaceClasses,
  replaceQuestions,
  replacePools,
  validatePublishedExam,
  writeConfiguration,
} from "./configuration.js";
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
      await lockCatalog(tx, teacherId);
      const e = await ownExam(tx, id, teacherId);
      check(e.status !== "ARCHIVED", 409, "EXAM_ARCHIVED");
      check(
        (await tx.examAttempt.count({ where: { examId: id } })) === 0,
        409,
        "EXAM_HAS_ATTEMPTS",
        "Đề đã có lượt thi; không thể sửa cấu trúc/cấu hình.",
      );
      const result = await fn(tx);
      if ((await ownExam(tx, id, teacherId)).status === "PUBLISHED")
        await validatePublishedExam(tx, id, teacherId);
      return result;
    });
  r.get("/exams", async (req, res) => {
    const p = pagination(req.query);
    const status = z
      .enum(["DRAFT", "PUBLISHED", "ARCHIVED"])
      .optional()
      .parse(req.query.status);
    const where = {
      teacherId: req.user.id,
      title: { contains: p.search, mode: "insensitive" as const },
      status,
    };
    const items = await db.exam.findMany({
      where,
      skip: p.skip,
      take: p.take,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });
    res.json({
      data: await pageData(req.query, items, () => db.exam.count({ where })),
    });
  });
  r.post("/exams", async (req, res) =>
    res.status(201).json({
      data: await db.exam.create({
        data: { ...examSchema.parse(req.body), teacherId: req.user.id },
      }),
    }),
  );
  r.post("/exams/configuration", async (req, res) => {
    const data = configurationSchema.parse(req.body);
    const exam = await db.$transaction(async (tx) => {
      await lockCatalog(tx, req.user.id);
      const created = await tx.exam.create({
        data: { ...data.exam, teacherId: req.user.id },
      });
      return writeConfiguration(tx, created.id, req.user.id, data);
    });
    res.status(201).json({ data: exam });
  });
  r.put("/exams/:id/configuration", async (req, res) => {
    const data = configurationSchema.parse(req.body);
    res.json({
      data: await edit(param(req), req.user.id, (tx) =>
        writeConfiguration(tx, param(req), req.user.id, data),
      ),
    });
  });
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
    const exam = await db.$transaction(async (tx) => {
      await lockExam(tx, param(req));
      await ownExam(tx, param(req), req.user.id);
      return tx.exam.update({
        where: { id: param(req) },
        data: { status: "ARCHIVED" },
      });
    });
    res.json({ data: exam });
  });
  r.put("/exams/:id/classes", async (req, res) => {
    const { classIds } = classesSchema.parse(req.body);
    await edit(param(req), req.user.id, (tx) =>
      replaceClasses(tx, param(req), req.user.id, classIds),
    );
    res.json({ data: { saved: true } });
  });
  r.put("/exams/:id/questions", async (req, res) => {
    const { questions } = fixedQuestionsSchema.parse(req.body);
    await edit(param(req), req.user.id, (tx) =>
      replaceQuestions(tx, param(req), req.user.id, questions),
    );
    res.json({ data: { saved: true } });
  });
  r.put("/exams/:id/pools", async (req, res) => {
    const { pools } = poolsSchema.parse(req.body);
    await edit(param(req), req.user.id, (tx) =>
      replacePools(tx, param(req), req.user.id, pools),
    );
    res.json({ data: { saved: true } });
  });
  r.post("/exams/:id/publish", async (req, res) => {
    const e = await db.$transaction(async (tx) => {
      await lockExam(tx, param(req));
      const e = await ownExam(tx, param(req), req.user.id);
      check(e.status === "DRAFT", 409, "EXAM_NOT_DRAFT");
      await lockCatalog(tx, req.user.id);
      await validatePublishedExam(tx, e.id, req.user.id, true);
      return tx.exam.update({
        where: { id: e.id },
        data: { status: "PUBLISHED", publishedAt: new Date() },
      });
    });
    res.json({ data: e });
  });
  return r;
}
