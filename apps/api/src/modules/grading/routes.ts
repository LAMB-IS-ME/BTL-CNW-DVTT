import { Router } from "express";
import { z } from "zod";
import type { Db } from "../../db/client.js";
import { allow } from "../../middleware/auth.js";
import { param, check } from "../../utils/errors.js";
import { ownExam } from "../exams/service.js";
import {
  attemptInclude,
  readAttempt,
  lockAttempt,
  examEvents,
} from "../attempts/service.js";
import { snapshotSchema } from "../attempts/logic.js";
import {
  studentResult,
  teacherResults,
  resultStudentFilter,
} from "../results/service.js";
import { pagination } from "../../utils/pagination.js";
export function gradingRoutes(db: Db) {
  const r = Router();
  r.use(allow("TEACHER"));
  r.get("/exams/:id/grading", async (req, res) => {
    await ownExam(db, param(req), req.user.id);
    const p = pagination(req.query);
    res.json({
      data: await db.examAttempt.findMany({
        where: {
          examId: param(req),
          status: { in: ["PENDING_MANUAL_GRADING", "GRADED"] },
        },
        include: {
          student: { select: { fullName: true, studentCode: true } },
          questions: { include: { answer: true } },
        },
        skip: p.skip,
        take: p.take,
        orderBy: { submittedAt: "desc" },
      }),
    });
  });
  r.get("/attempts/:attemptId", async (req, res) => {
    const a = await readAttempt(db, param(req, "attemptId"));
    check(a && a.exam.teacherId === req.user.id, 404, "NOT_FOUND");
    res.json({ data: a });
  });
  r.put("/answers/:answerId/grade", async (req, res) => {
    const d = z
      .object({
        score: z.number().min(0).max(10000),
        feedback: z.string().max(10000).default(""),
      })
      .parse(req.body);
    const answer = await db.attemptAnswer.findUnique({
      where: { id: param(req, "answerId") },
      include: {
        question: { include: { attempt: { include: { exam: true } } } },
      },
    });
    check(
      answer && answer.question.attempt.exam.teacherId === req.user.id,
      404,
      "NOT_FOUND",
    );
    const a = await db.$transaction(async (tx) => {
      await lockAttempt(tx, answer.question.attemptId);
      const a = await readAttempt(tx, answer.question.attemptId);
      check(a && a.status !== "IN_PROGRESS", 409, "ATTEMPT_NOT_SUBMITTED");
      check(
        snapshotSchema.parse(answer.question.snapshotJson).type === "ESSAY",
        400,
        "NOT_ESSAY",
      );
      check(
        d.score <= Number(answer.question.points),
        400,
        "GRADE_OUT_OF_RANGE",
      );
      await tx.attemptAnswer.update({
        where: { id: answer.id },
        data: {
          manualScore: d.score,
          feedback: d.feedback,
          gradedBy: req.user.id,
          gradedAt: new Date(),
        },
      });
      const updated = await tx.examAttempt.findUniqueOrThrow({
        where: { id: a.id },
        include: attemptInclude,
      });
      const essays = updated.questions.filter(
        (q) => snapshotSchema.parse(q.snapshotJson).type === "ESSAY",
      );
      const complete = essays.every(
        (q) =>
          q.answer?.manualScore !== null && q.answer?.manualScore !== undefined,
      );
      const manual = essays.reduce(
        (n, q) => n + Number(q.answer?.manualScore || 0),
        0,
      );
      return tx.examAttempt.update({
        where: { id: a.id },
        data: {
          manualScore: manual,
          totalScore: complete ? Number(a.objectiveScore) + manual : null,
          status: complete ? "GRADED" : "PENDING_MANUAL_GRADING",
        },
      });
    });
    examEvents.emit("changed", a.examId);
    res.json({ data: a });
  });
  r.post("/exams/:id/release-results", async (req, res) => {
    await ownExam(db, param(req), req.user.id);
    res.json({
      data: await db.exam.update({
        where: { id: param(req) },
        data: { manualResultsReleasedAt: new Date() },
      }),
    });
  });
  r.get("/exams/:id/results", async (req, res) => {
    await ownExam(db, param(req), req.user.id);
    const p = pagination(req.query);
    const [items, total] = await Promise.all([
      teacherResults(db, param(req), p),
      db.user.count({ where: resultStudentFilter(param(req)) }),
    ]);
    res.json({
      data: { items, total },
    });
  });
  return r;
}
export function resultRoutes(db: Db) {
  const r = Router();
  r.use(allow("STUDENT"));
  r.get("/exams/:id/results", async (req, res) =>
    res.json({ data: await studentResult(db, param(req), req.user.id) }),
  );
  return r;
}
