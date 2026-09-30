import { Router } from "express";
import type { Db } from "../../db/client.js";
import { allow } from "../../middleware/auth.js";
import { param, check } from "../../utils/errors.js";
import { pagination } from "../../utils/pagination.js";
import {
  getAttempt,
  saveAnswer,
  startAttempt,
  submitAttempt,
} from "./service.js";
const examSelect = {
  id: true,
  title: true,
  descriptionMarkdown: true,
  status: true,
  openAt: true,
  closeAt: true,
  durationMinutes: true,
  maxAttempts: true,
  resultReleaseMode: true,
  resultStrategy: true,
} as const;
export function attemptRoutes(db: Db) {
  const r = Router();
  r.use(allow("STUDENT"));
  r.get("/exams", async (req, res) => {
    const p = pagination(req.query);
    res.json({
      data: await db.exam.findMany({
        where: {
          status: { not: "DRAFT" },
          classes: {
            some: { class: { members: { some: { studentId: req.user.id } } } },
          },
        },
        select: {
          ...examSelect,
          attempts: {
            where: { studentId: req.user.id },
            select: {
              id: true,
              status: true,
              attemptNo: true,
              expiresAt: true,
            },
          },
        },
        skip: p.skip,
        take: p.take,
        orderBy: { openAt: "desc" },
      }),
    });
  });
  r.get("/exams/:id", async (req, res) => {
    const e = await db.exam.findFirst({
      where: {
        id: param(req),
        status: { not: "DRAFT" },
        classes: {
          some: { class: { members: { some: { studentId: req.user.id } } } },
        },
      },
      select: {
        ...examSelect,
        attempts: {
          where: { studentId: req.user.id },
          select: { id: true, status: true, attemptNo: true, expiresAt: true },
        },
      },
    });
    check(e, 404, "NOT_FOUND");
    res.json({ data: { ...e, serverNow: new Date() } });
  });
  r.post("/exams/:id/attempts", async (req, res) =>
    res
      .status(201)
      .json({ data: await startAttempt(db, param(req), req.user.id) }),
  );
  r.get("/attempts/:attemptId", async (req, res) =>
    res.json({
      data: await getAttempt(db, param(req, "attemptId"), req.user.id),
    }),
  );
  r.put("/attempts/:attemptId/answers/:attemptQuestionId", async (req, res) =>
    res.json({
      data: await saveAnswer(
        db,
        param(req, "attemptId"),
        param(req, "attemptQuestionId"),
        req.user.id,
        req.body,
      ),
    }),
  );
  r.post("/attempts/:attemptId/submit", async (req, res) =>
    res.json({
      data: await submitAttempt(db, param(req, "attemptId"), req.user.id),
    }),
  );
  return r;
}
