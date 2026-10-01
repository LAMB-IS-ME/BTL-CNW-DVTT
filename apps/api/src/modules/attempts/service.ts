import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import { EventEmitter } from "node:events";
import type { Db } from "../../db/client.js";
import type { Tx } from "../exams/service.js";
import { lockExam, examInclude, materializeSources } from "../exams/service.js";
import { check, AppError } from "../../utils/errors.js";
import { shuffle } from "../exams/selection.js";
import {
  eligibility,
  expiresAt,
  makeSnapshot,
  snapshotSchema,
  publicQuestion,
  gradeObjective,
  validateAnswer,
} from "./logic.js";
export const examEvents = new EventEmitter();
export const attemptInclude = {
  exam: true,
  questions: {
    orderBy: { orderIndex: "asc" as const },
    include: { answer: true },
  },
} as const;
export type FullAttempt = NonNullable<Awaited<ReturnType<typeof readAttempt>>>;
export async function readAttempt(db: Db | Tx, id: string) {
  return db.examAttempt.findUnique({ where: { id }, include: attemptInclude });
}
export async function lockAttempt(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "ExamAttempt" WHERE id = ${id}::uuid FOR UPDATE`;
}
export function attemptDto(a: FullAttempt) {
  return {
    id: a.id,
    examId: a.examId,
    title: a.exam.title,
    attemptNo: a.attemptNo,
    status: a.status,
    startedAt: a.startedAt,
    expiresAt: a.expiresAt,
    submittedAt: a.submittedAt,
    serverNow: new Date(),
    questions: a.questions.map((q) => ({
      id: q.id,
      points: Number(q.points),
      ...publicQuestion(snapshotSchema.parse(q.snapshotJson)),
      answer: {
        selectedOptionIds: Array.isArray(q.answer?.answerJson)
          ? q.answer.answerJson
          : [],
        answerText: q.answer?.answerText || "",
        savedAt: q.answer?.savedAt || null,
      },
    })),
  };
}
export async function finalizeTx(tx: Tx, id: string, auto = false) {
  await lockAttempt(tx, id);
  const a = await readAttempt(tx, id);
  check(a, 404, "NOT_FOUND");
  return finalizeLockedTx(tx, a, auto);
}
// The caller must hold the attempt row lock before loading this state.
async function finalizeLockedTx(tx: Tx, a: FullAttempt, auto: boolean) {
  if (a.status !== "IN_PROGRESS") return a;
  const scores: Prisma.Sql[] = [];
  const gradedAt = new Date();
  let objectiveScore = 0,
    hasEssay = false;
  for (const q of a.questions) {
    const snap = snapshotSchema.parse(q.snapshotJson);
    const selected = Array.isArray(q.answer?.answerJson)
      ? q.answer.answerJson.filter((x): x is string => typeof x === "string")
      : [];
    const score = gradeObjective(snap, selected, Number(q.points));
    if (score === null) hasEssay = true;
    else objectiveScore += score;
    scores.push(
      Prisma.sql`(${randomUUID()}::uuid, ${q.id}::uuid, ${score}::numeric, ${gradedAt})`,
    );
  }
  // One parameterized batch preserves saved answers/feedback and avoids one
  // upsert round trip per question (up to 500 questions per attempt).
  if (scores.length)
    await tx.$executeRaw(Prisma.sql`
    INSERT INTO "AttemptAnswer" (id, "attemptQuestionId", "autoScore", "updatedAt")
    VALUES ${Prisma.join(scores)}
    ON CONFLICT ("attemptQuestionId") DO UPDATE
      SET "autoScore" = EXCLUDED."autoScore", "updatedAt" = EXCLUDED."updatedAt"
  `);
  return tx.examAttempt.update({
    where: { id: a.id },
    data: {
      status: hasEssay ? "PENDING_MANUAL_GRADING" : "GRADED",
      autoSubmitted: auto,
      submittedAt: new Date(),
      objectiveScore,
      manualScore: 0,
      totalScore: hasEssay ? null : objectiveScore,
    },
    include: attemptInclude,
  });
}
export async function startAttempt(db: Db, examId: string, studentId: string) {
  const a = await db.$transaction(async (tx) => {
    await lockExam(tx, examId);
    const exam = await tx.exam.findUnique({
      where: { id: examId },
      include: examInclude,
    });
    check(exam, 404, "NOT_FOUND");
    const user = await tx.user.findUnique({ where: { id: studentId } });
    check(
      user?.role === "STUDENT" && user.status === "ACTIVE",
      403,
      "FORBIDDEN",
    );
    const member = await tx.classMember.count({
      where: { studentId, class: { exams: { some: { examId } } } },
    });
    check(member > 0, 403, "EXAM_NOT_ASSIGNED");
    const previous = await tx.examAttempt.findMany({
      where: { examId, studentId },
      orderBy: { attemptNo: "desc" },
    });
    const active = previous.find((a) => a.status === "IN_PROGRESS");
    const now = new Date();
    if (active) {
      if (active.expiresAt > now) return (await readAttempt(tx, active.id))!;
      await finalizeTx(tx, active.id, true);
    }
    try {
      eligibility(exam, true, previous.length, now);
    } catch (error) {
      if (error instanceof AppError) return { failure: error };
      throw error;
    }
    let selected = await materializeSources(tx, exam);
    if (exam.shuffleQuestions) selected = shuffle(selected);
    const a = await tx.examAttempt.create({
      data: {
        examId,
        studentId,
        attemptNo: (previous[0]?.attemptNo || 0) + 1,
        startedAt: now,
        expiresAt: expiresAt(now, exam.durationMinutes, exam.closeAt),
        lastActivityAt: now,
        maxScore: selected.reduce((n, q) => n + q.points, 0),
      },
    });
    await tx.attemptQuestion.createMany({
      data: selected.map((s, orderIndex) => ({
        attemptId: a.id,
        originalQuestionId: s.question.id,
        sourceType: s.sourceType,
        orderIndex,
        points: s.points,
        snapshotJson: makeSnapshot(s.question, exam.shuffleOptions),
      })),
    });
    return (await readAttempt(tx, a.id))!;
  });
  examEvents.emit("changed", examId);
  if ("failure" in a) throw a.failure;
  return attemptDto(a);
}
export async function getAttempt(db: Db, id: string, studentId: string) {
  const a = await db.$transaction(async (tx) => {
    await lockAttempt(tx, id);
    const a = await readAttempt(tx, id);
    check(a && a.studentId === studentId, 404, "NOT_FOUND");
    return a.status === "IN_PROGRESS" && a.expiresAt <= new Date()
      ? finalizeLockedTx(tx, a, true)
      : a;
  });
  examEvents.emit("changed", a.examId);
  return attemptDto(a);
}
export async function saveAnswer(
  db: Db,
  id: string,
  questionId: string,
  studentId: string,
  input: unknown,
) {
  const result = await db.$transaction(async (tx) => {
    await lockAttempt(tx, id);
    const a = await readAttempt(tx, id);
    check(a && a.studentId === studentId, 404, "NOT_FOUND");
    check(a.status === "IN_PROGRESS", 409, "ATTEMPT_ALREADY_SUBMITTED");
    if (a.expiresAt <= new Date()) {
      await finalizeLockedTx(tx, a, true);
      return { expired: true, examId: a.examId };
    }
    const q = a.questions.find((q) => q.id === questionId);
    check(q, 404, "NOT_FOUND");
    const answer = validateAnswer(snapshotSchema.parse(q.snapshotJson), input);
    const savedAt = new Date();
    await tx.attemptAnswer.upsert({
      where: { attemptQuestionId: questionId },
      create: {
        attemptQuestionId: questionId,
        answerJson: answer.selectedOptionIds,
        answerText: answer.answerText,
        savedAt,
      },
      update: {
        answerJson: answer.selectedOptionIds,
        answerText: answer.answerText,
        savedAt,
      },
    });
    await tx.examAttempt.update({
      where: { id },
      data: { lastActivityAt: savedAt },
    });
    return { expired: false, savedAt, examId: a.examId };
  });
  examEvents.emit("changed", result.examId);
  check(
    !result.expired,
    409,
    "ATTEMPT_EXPIRED",
    "Bài thi đã hết giờ và được tự động nộp.",
  );
  return { savedAt: result.savedAt };
}
export async function submitAttempt(db: Db, id: string, studentId: string) {
  const a = await db.$transaction(async (tx) => {
    await lockAttempt(tx, id);
    const a = await readAttempt(tx, id);
    check(a && a.studentId === studentId, 404, "NOT_FOUND");
    return finalizeLockedTx(tx, a, a.expiresAt <= new Date());
  });
  examEvents.emit("changed", a.examId);
  examEvents.emit("submitted", {
    id: a.id,
    examId: a.examId,
    autoSubmitted: a.autoSubmitted,
  });
  return attemptDto(a);
}
export async function expireAttempts(db: Db) {
  const expired = await db.examAttempt.findMany({
    where: { status: "IN_PROGRESS", expiresAt: { lte: new Date() } },
    select: { id: true },
    take: 100,
  });
  for (const row of expired) {
    const a = await db.$transaction((tx) => finalizeTx(tx, row.id, true));
    examEvents.emit("changed", a.examId);
    examEvents.emit("submitted", {
      id: a.id,
      examId: a.examId,
      autoSubmitted: true,
    });
  }
}
