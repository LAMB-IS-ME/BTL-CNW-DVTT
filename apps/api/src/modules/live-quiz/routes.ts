import { lockCatalog } from "../question-banks/lock.js";
import { Router } from "express";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import type { Db } from "../../db/client.js";
import type { Tx } from "../exams/service.js";
import { allow } from "../../middleware/auth.js";
import { param, check } from "../../utils/errors.js";
import { pagination } from "../../utils/pagination.js";
import { createRoom, roomState } from "./service.js";
import {
  quizSchema,
  quizQuestionsSchema,
  quizConfigurationSchema,
  lockQuiz,
  ownQuiz,
  replaceQuizQuestions,
  validateQuizDefinition,
} from "./configuration.js";
export function quizRoutes(db: Db) {
  const r = Router();
  r.use(allow("TEACHER"));
  const edit = async <T>(
    id: string,
    teacherId: string,
    fn: (tx: Tx) => Promise<T>,
  ) =>
    db.$transaction(async (tx) => {
      await lockQuiz(tx, id);
      await lockCatalog(tx, teacherId);
      const quiz = await ownQuiz(tx, id, teacherId);
      check(!quiz.isArchived, 409, "QUIZ_ARCHIVED");
      const result = await fn(tx);
      await validateQuizDefinition(tx, id, teacherId);
      return result;
    });
  r.get("/quizzes", async (req, res) => {
    const p = pagination(req.query);
    res.json({
      data: await db.liveQuiz.findMany({
        where: { teacherId: req.user.id },
        skip: p.skip,
        take: p.take,
        orderBy: { createdAt: "desc" },
      }),
    });
  });
  r.post("/quizzes", async (req, res) =>
    res.status(201).json({
      data: await db.liveQuiz.create({
        data: { ...quizSchema.parse(req.body), teacherId: req.user.id },
      }),
    }),
  );
  r.get("/quizzes/:id", async (req, res) =>
    res.json({ data: await ownQuiz(db, param(req), req.user.id) }),
  );
  r.post("/quizzes/configuration", async (req, res) => {
    const data = quizConfigurationSchema.parse(req.body);
    const quiz = await db.$transaction(async (tx) => {
      await lockCatalog(tx, req.user.id);
      const created = await tx.liveQuiz.create({
        data: { ...data.quiz, teacherId: req.user.id },
      });
      await replaceQuizQuestions(tx, created.id, req.user.id, data.questions);
      return validateQuizDefinition(tx, created.id, req.user.id);
    });
    res.status(201).json({ data: quiz });
  });
  r.put("/quizzes/:id/configuration", async (req, res) => {
    const data = quizConfigurationSchema.parse(req.body);
    const quiz = await edit(param(req), req.user.id, async (tx) => {
      await tx.liveQuiz.update({ where: { id: param(req) }, data: data.quiz });
      await replaceQuizQuestions(tx, param(req), req.user.id, data.questions);
      return ownQuiz(tx, param(req), req.user.id);
    });
    res.json({ data: quiz });
  });
  r.patch("/quizzes/:id", async (req, res) => {
    const data = quizSchema.parse(req.body);
    res.json({
      data: await edit(param(req), req.user.id, (tx) =>
        tx.liveQuiz.update({ where: { id: param(req) }, data }),
      ),
    });
  });
  r.delete("/quizzes/:id", async (req, res) => {
    await db.$transaction(async (tx) => {
      await lockQuiz(tx, param(req));
      await lockCatalog(tx, req.user.id);
      await ownQuiz(tx, param(req), req.user.id);
      check(
        (await tx.quizRoom.count({
          where: { quizId: param(req), status: "LOBBY" },
        })) === 0,
        409,
        "QUIZ_HAS_LOBBY",
        "Quiz đang có phòng chờ. Hãy hoàn tất phòng trước khi lưu trữ Quiz.",
      );
      await tx.liveQuiz.update({
        where: { id: param(req) },
        data: { isArchived: true },
      });
    });
    res.status(204).end();
  });
  r.put("/quizzes/:id/questions", async (req, res) => {
    const { questions } = quizQuestionsSchema.parse(req.body);
    await edit(param(req), req.user.id, (tx) =>
      replaceQuizQuestions(tx, param(req), req.user.id, questions),
    );
    res.json({ data: { saved: true } });
  });
  r.post("/quizzes/:id/rooms", async (req, res) =>
    res
      .status(201)
      .json({ data: await createRoom(db, param(req), req.user.id) }),
  );
  r.get("/quiz-rooms/:roomId", async (req, res) =>
    res.json({ data: await roomState(db, param(req, "roomId"), req.user) }),
  );
  return r;
}
export function studentQuizRoutes(db: Db) {
  const r = Router();
  r.use(allow("STUDENT"));
  r.get(
    "/quiz-rooms/by-code/:code",
    rateLimit({ windowMs: 60000, limit: 20 }),
    async (req, res) => {
      const code = z
        .string()
        .regex(/^\d{6}$/)
        .parse(param(req, "code"));
      const room = await db.quizRoom.findUnique({
        where: { code },
        select: {
          id: true,
          code: true,
          status: true,
          quiz: { select: { title: true } },
        },
      });
      check(room, 404, "QUIZ_ROOM_NOT_FOUND");
      res.json({ data: room });
    },
  );
  r.get("/quiz-rooms/:roomId/state", async (req, res) =>
    res.json({ data: await roomState(db, param(req, "roomId"), req.user) }),
  );
  return r;
}
