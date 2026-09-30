import { EventEmitter } from "node:events";
import { randomInt } from "node:crypto";
import type { Db } from "../../db/client.js";
import type { Tx } from "../exams/service.js";
import type { UserDto, QuizState } from "@exam/shared";
import { check, AppError } from "../../utils/errors.js";
import {
  makeSnapshot,
  publicQuestion,
  snapshotSchema,
  validateAnswer,
  gradeObjective,
} from "../attempts/logic.js";
import { quizPoints } from "./logic.js";
export const quizEvents = new EventEmitter();
export type QuizChange = "joined" | "left" | "started" | "question" | "reveal";
export async function lockRoom(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "QuizRoom" WHERE id = ${id}::uuid FOR UPDATE`;
}
const roomInclude = {
  quiz: true,
  questions: { orderBy: { orderIndex: "asc" as const } },
  participants: { include: { student: { select: { fullName: true } } } },
  _count: { select: { questions: true } },
} as const;
export async function roomState(
  db: Db | Tx,
  roomId: string,
  actor?: UserDto,
): Promise<QuizState> {
  const r = await db.quizRoom.findUnique({
    where: { id: roomId },
    include: roomInclude,
  });
  check(r, 404, "QUIZ_ROOM_NOT_FOUND");
  if (actor)
    check(
      (actor.role === "TEACHER" && r.teacherId === actor.id) ||
        (actor.role === "STUDENT" &&
          r.participants.some((p) => p.studentId === actor.id)),
      403,
      "FORBIDDEN",
    );
  const current = r.questions.find(
    (q) => q.orderIndex === r.currentQuestionIndex,
  );
  const snapshot = current ? snapshotSchema.parse(current.snapshotJson) : null;
  const revealed = !!r.revealedAt;
  const own = actor
    ? r.participants.find((p) => p.studentId === actor.id)
    : null;
  const answer =
    current && own
      ? await db.quizAnswer.findUnique({
          where: {
            roomQuestionId_participantId: {
              roomQuestionId: current.id,
              participantId: own.id,
            },
          },
        })
      : null;
  const answerCount =
    current && revealed
      ? await db.quizAnswer.count({ where: { roomQuestionId: current.id } })
      : 0;
  return {
    roomId: r.id,
    code: r.code,
    title: r.quiz.title,
    status: r.status,
    currentIndex: r.currentQuestionIndex,
    total: r.questions.length,
    serverNow: new Date().toISOString(),
    closesAt: r.questionClosesAt?.toISOString() || null,
    participants: r.participants.map((p) => ({
      id: p.id,
      fullName: p.student.fullName,
      isConnected: p.isConnected,
    })),
    question:
      current && snapshot
        ? {
            id: current.id,
            points: current.basePoints,
            ...publicQuestion(snapshot),
          }
        : null,
    reveal:
      revealed && snapshot
        ? {
            correctOptionIds: snapshot.options
              .filter((o) => o.isCorrect)
              .map((o) => o.id),
            explanationMarkdown: snapshot.explanationMarkdown,
            answerCount,
          }
        : null,
    leaderboard:
      revealed || r.status === "FINISHED"
        ? [...r.participants]
            .sort(
              (a, b) =>
                b.score - a.score ||
                a.joinedAt.getTime() - b.joinedAt.getTime() ||
                a.id.localeCompare(b.id),
            )
            .map((p, i) => ({
              id: p.id,
              fullName: p.student.fullName,
              score: p.score,
              rank: i + 1,
            }))
        : [],
    ownAnswer: answer ? (answer.answerJson as string[]) : null,
  };
}
export async function createRoom(db: Db, quizId: string, teacherId: string) {
  const q = await db.liveQuiz.findUnique({ where: { id: quizId } });
  check(q && q.teacherId === teacherId, 404, "NOT_FOUND");
  check(!q.isArchived, 409, "QUIZ_ARCHIVED");
  for (let i = 0; i < 10; i++) {
    const code = randomInt(100000, 1000000).toString();
    try {
      return await db.quizRoom.create({ data: { quizId, teacherId, code } });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      )
        continue;
      throw error;
    }
  }
  throw new AppError(503, "ROOM_CODE_UNAVAILABLE");
}
export async function joinRoom(db: Db, roomId: string, actor: UserDto) {
  await db.$transaction(async (tx) => {
    await lockRoom(tx, roomId);
    const r = await tx.quizRoom.findUnique({ where: { id: roomId } });
    check(r, 404, "QUIZ_ROOM_NOT_FOUND");
    if (actor.role === "TEACHER") {
      check(r.teacherId === actor.id);
      return;
    }
    check(actor.role === "STUDENT");
    const existing = await tx.quizParticipant.findUnique({
      where: { roomId_studentId: { roomId, studentId: actor.id } },
    });
    check(existing || r.status === "LOBBY", 409, "QUIZ_ROOM_NOT_JOINABLE");
    check(r.status !== "CANCELLED", 409, "QUIZ_ROOM_NOT_JOINABLE");
    await tx.quizParticipant.upsert({
      where: { roomId_studentId: { roomId, studentId: actor.id } },
      create: { roomId, studentId: actor.id },
      update: { isConnected: true, lastSeenAt: new Date() },
    });
  });
  quizEvents.emit("changed", roomId, "joined");
  return roomState(db, roomId, actor);
}
export async function leaveRoom(db: Db, roomId: string, studentId: string) {
  await db.quizParticipant.updateMany({
    where: { roomId, studentId },
    data: { isConnected: false, lastSeenAt: new Date() },
  });
  quizEvents.emit("changed", roomId, "left");
}
export async function startRoom(db: Db, roomId: string, actor: UserDto) {
  await db.$transaction(
    async (tx) => {
      await lockRoom(tx, roomId);
      const ref = await tx.quizRoom.findUnique({
        where: { id: roomId },
        select: { quizId: true },
      });
      check(ref, 404, "QUIZ_ROOM_NOT_FOUND");
      await tx.$queryRaw`SELECT id FROM "LiveQuiz" WHERE id=${ref.quizId}::uuid FOR UPDATE`;
      const r = await tx.quizRoom.findUnique({
        where: { id: roomId },
        include: {
          quiz: {
            include: {
              questions: {
                include: {
                  question: {
                    include: { options: { orderBy: { orderIndex: "asc" } } },
                  },
                },
                orderBy: { orderIndex: "asc" },
              },
            },
          },
          _count: { select: { participants: true } },
        },
      });
      check(
        r && r.teacherId === actor.id && actor.role === "TEACHER",
        403,
        "FORBIDDEN",
      );
      check(r.status === "LOBBY", 409, "QUIZ_ALREADY_STARTED");
      check(r._count.participants > 0, 409, "QUIZ_NO_PARTICIPANTS");
      const qs = r.quiz.questions;
      check(
        qs.length > 0 &&
          qs.every(
            (q) => q.question.type !== "ESSAY" && !q.question.isArchived,
          ),
        400,
        "QUIZ_INVALID_QUESTIONS",
      );
      await tx.liveRoomQuestion.createMany({
        data: qs.map((q, orderIndex) => ({
          roomId,
          sourceQuizQuestionId: q.id,
          orderIndex,
          timeLimitSeconds: q.timeLimitSeconds,
          basePoints: q.basePoints,
          snapshotJson: makeSnapshot(q.question, false),
        })),
      });
      const now = new Date();
      await tx.quizRoom.update({
        where: { id: roomId },
        data: {
          status: "LIVE",
          startedAt: now,
          currentQuestionIndex: 0,
          questionOpenedAt: now,
          questionClosesAt: new Date(+now + qs[0]!.timeLimitSeconds * 1000),
          revealedAt: null,
        },
      });
    },
    { timeout: 15000 },
  );
  quizEvents.emit("changed", roomId, "started");
  return roomState(db, roomId, actor);
}
async function revealTx(tx: Tx, roomId: string) {
  const r = await tx.quizRoom.findUniqueOrThrow({
    where: { id: roomId },
    include: { _count: { select: { questions: true } } },
  });
  if (r.status !== "LIVE" || r.revealedAt) return false;
  const finished = r.currentQuestionIndex === r._count.questions - 1;
  const now = new Date();
  await tx.quizRoom.update({
    where: { id: roomId },
    data: {
      revealedAt: now,
      ...(finished ? { status: "FINISHED", endedAt: now } : {}),
    },
  });
  if (finished)
    await tx.quizParticipant.updateMany({
      where: { roomId },
      data: { finishedAt: now },
    });
  return true;
}
export async function nextQuestion(db: Db, roomId: string, actor: UserDto) {
  await db.$transaction(async (tx) => {
    await lockRoom(tx, roomId);
    const r = await tx.quizRoom.findUnique({ where: { id: roomId } });
    check(r && r.teacherId === actor.id && actor.role === "TEACHER");
    check(r.status === "LIVE" && r.revealedAt, 409, "QUIZ_QUESTION_NOT_CLOSED");
    const next = (r.currentQuestionIndex ?? -1) + 1;
    const q = await tx.liveRoomQuestion.findUnique({
      where: { roomId_orderIndex: { roomId, orderIndex: next } },
    });
    check(q, 409, "QUIZ_FINISHED");
    const now = new Date();
    await tx.quizRoom.update({
      where: { id: roomId },
      data: {
        currentQuestionIndex: next,
        questionOpenedAt: now,
        questionClosesAt: new Date(+now + q.timeLimitSeconds * 1000),
        revealedAt: null,
      },
    });
  });
  quizEvents.emit("changed", roomId, "question");
  return roomState(db, roomId, actor);
}
export async function answerQuiz(
  db: Db,
  roomId: string,
  questionId: string,
  selectedOptionIds: string[],
  actor: UserDto,
) {
  check(actor.role === "STUDENT");
  const result = await db.$transaction(async (tx) => {
    await lockRoom(tx, roomId);
    const r = await tx.quizRoom.findUnique({ where: { id: roomId } });
    check(r, 404, "QUIZ_ROOM_NOT_FOUND");
    const p = await tx.quizParticipant.findUnique({
      where: { roomId_studentId: { roomId, studentId: actor.id } },
    });
    check(p, 403, "QUIZ_NOT_JOINED");
    const q = await tx.liveRoomQuestion.findUnique({
      where: { id: questionId },
    });
    check(
      q && q.roomId === roomId && q.orderIndex === r.currentQuestionIndex,
      409,
      "QUIZ_WRONG_QUESTION",
    );
    const duplicate = await tx.quizAnswer.findUnique({
      where: {
        roomQuestionId_participantId: {
          roomQuestionId: questionId,
          participantId: p.id,
        },
      },
    });
    check(!duplicate, 409, "QUIZ_DUPLICATE_ANSWER");
    const now = new Date();
    if (
      r.status !== "LIVE" ||
      r.revealedAt ||
      !r.questionClosesAt ||
      now >= r.questionClosesAt
    ) {
      const revealed = await revealTx(tx, roomId);
      return { late: true, revealed };
    }
    check(r.questionOpenedAt, 409, "QUIZ_NOT_STARTED");
    const snapshot = snapshotSchema.parse(q.snapshotJson);
    const a = validateAnswer(snapshot, { selectedOptionIds });
    const correct = gradeObjective(snapshot, a.selectedOptionIds, 1) === 1;
    const points = quizPoints(
      correct,
      q.basePoints,
      +r.questionClosesAt - +now,
      q.timeLimitSeconds * 1000,
    );
    await tx.quizAnswer.create({
      data: {
        roomQuestionId: questionId,
        participantId: p.id,
        answerJson: a.selectedOptionIds,
        answeredAt: now,
        responseTimeMs: +now - +r.questionOpenedAt,
        isCorrect: correct,
        pointsAwarded: points,
      },
    });
    await tx.quizParticipant.update({
      where: { id: p.id },
      data: { score: { increment: points }, lastSeenAt: now },
    });
    const count = await tx.quizAnswer.count({
      where: { roomQuestionId: questionId },
    });
    const total = await tx.quizParticipant.count({ where: { roomId } });
    return {
      late: false,
      revealed: count >= total ? await revealTx(tx, roomId) : false,
    };
  });
  if (result.revealed) quizEvents.emit("changed", roomId, "reveal");
  check(!result.late, 409, "QUIZ_ANSWER_TOO_LATE", "Đã hết thời gian trả lời.");
  return { accepted: true };
}
export async function closeExpiredQuestions(db: Db) {
  const rooms = await db.quizRoom.findMany({
    where: {
      status: "LIVE",
      revealedAt: null,
      questionClosesAt: { lte: new Date() },
    },
    select: { id: true },
    take: 100,
  });
  for (const r of rooms) {
    const changed = await db.$transaction(async (tx) => {
      await lockRoom(tx, r.id);
      const current = await tx.quizRoom.findUniqueOrThrow({
        where: { id: r.id },
      });
      if (current.questionClosesAt && current.questionClosesAt <= new Date())
        return revealTx(tx, r.id);
      return false;
    });
    if (changed) quizEvents.emit("changed", r.id, "reveal");
  }
}
