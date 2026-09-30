import { Router } from "express";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import type { Db } from "../../db/client.js";
import { allow } from "../../middleware/auth.js";
import { param, check } from "../../utils/errors.js";
import { pagination } from "../../utils/pagination.js";
import { createRoom, roomState } from "./service.js";
const schema = z.object({
  title: z.string().trim().min(1).max(200),
  descriptionMarkdown: z.string().max(20000).nullable().optional(),
});
export function quizRoutes(db: Db) {
  const r = Router();
  r.use(allow("TEACHER"));
  const own = async (id: string, teacherId: string) => {
    const q = await db.liveQuiz.findUnique({
      where: { id },
      include: {
        questions: {
          include: { question: { include: { options: true } } },
          orderBy: { orderIndex: "asc" },
        },
        rooms: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    check(q && q.teacherId === teacherId, 404, "NOT_FOUND");
    return q;
  };
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
    res
      .status(201)
      .json({
        data: await db.liveQuiz.create({
          data: { ...schema.parse(req.body), teacherId: req.user.id },
        }),
      }),
  );
  r.get("/quizzes/:id", async (req, res) =>
    res.json({ data: await own(param(req), req.user.id) }),
  );
  r.patch("/quizzes/:id", async (req, res) => {
    await own(param(req), req.user.id);
    res.json({
      data: await db.liveQuiz.update({
        where: { id: param(req) },
        data: schema.parse(req.body),
      }),
    });
  });
  r.delete("/quizzes/:id", async (req, res) => {
    await own(param(req), req.user.id);
    await db.liveQuiz.update({
      where: { id: param(req) },
      data: { isArchived: true },
    });
    res.status(204).end();
  });
  r.put("/quizzes/:id/questions", async (req, res) => {
    await own(param(req), req.user.id);
    const { questions } = z
      .object({
        questions: z
          .array(
            z.object({
              questionId: z.uuid(),
              timeLimitSeconds: z.number().int().min(5).max(300),
              basePoints: z.number().int().min(1).max(10000),
            }),
          )
          .max(100),
      })
      .parse(req.body);
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "LiveQuiz" WHERE id=${param(req)}::uuid FOR UPDATE`;
      check(
        (await tx.question.count({
          where: {
            id: { in: [...new Set(questions.map((q) => q.questionId))] },
            type: { not: "ESSAY" },
            isArchived: false,
            bank: { ownerTeacherId: req.user.id, isArchived: false },
          },
        })) === new Set(questions.map((q) => q.questionId)).size,
        400,
        "QUIZ_INVALID_QUESTIONS",
      );
      await tx.liveQuizQuestion.deleteMany({ where: { quizId: param(req) } });
      await tx.liveQuizQuestion.createMany({
        data: questions.map((q, orderIndex) => ({
          ...q,
          quizId: param(req),
          orderIndex,
        })),
      });
    });
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
