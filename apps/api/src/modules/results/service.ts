import type { Db } from "../../db/client.js";
import { check } from "../../utils/errors.js";
import { attemptInclude } from "../attempts/service.js";
import { snapshotSchema, publicQuestion } from "../attempts/logic.js";
import { resultVisible, finalAttempt } from "./logic.js";
import { userSelect } from "../../middleware/auth.js";
export async function studentResult(db: Db, examId: string, studentId: string) {
  const exam = await db.exam.findUnique({ where: { id: examId } });
  check(exam, 404, "NOT_FOUND");
  const attempts = await db.examAttempt.findMany({
    where: { examId, studentId },
    include: attemptInclude,
    orderBy: { attemptNo: "desc" },
  });
  check(
    attempts.length > 0 ||
      (await db.classMember.count({
        where: { studentId, class: { exams: { some: { examId } } } },
      })) > 0,
    404,
    "NOT_FOUND",
  );
  return {
    examId,
    title: exam.title,
    resultStrategy: exam.resultStrategy,
    finalAttemptId: finalAttempt(attempts, exam.resultStrategy)?.id || null,
    attempts: attempts.map((a) => {
      const visible = resultVisible(exam, a.status);
      return {
        id: a.id,
        attemptNo: a.attemptNo,
        status: a.status,
        submittedAt: a.submittedAt,
        visible,
        ...(visible
          ? {
              totalScore: Number(a.totalScore),
              maxScore: Number(a.maxScore),
              percentage: (Number(a.totalScore) / Number(a.maxScore)) * 100,
              questions: a.questions.map((q) => {
                const s = snapshotSchema.parse(q.snapshotJson);
                return {
                  id: q.id,
                  ...publicQuestion(s),
                  options: s.options.map((o) => ({
                    id: o.id,
                    contentMarkdown: o.contentMarkdown,
                    ...(exam.showCorrectAnswers
                      ? { isCorrect: o.isCorrect }
                      : {}),
                  })),
                  selectedOptionIds: q.answer?.answerJson || [],
                  answerText: q.answer?.answerText || "",
                  feedback: q.answer?.feedback || null,
                  ...(exam.showDetailedScore
                    ? {
                        points: Number(q.points),
                        score:
                          Number(q.answer?.autoScore || 0) +
                          Number(q.answer?.manualScore || 0),
                      }
                    : {}),
                  ...(exam.showExplanations
                    ? { explanationMarkdown: s.explanationMarkdown }
                    : {}),
                };
              }),
            }
          : {}),
      };
    }),
  };
}
export const resultStudentFilter = (examId: string) => ({
  OR: [
    { memberships: { some: { class: { exams: { some: { examId } } } } } },
    { attempts: { some: { examId } } },
  ],
});
export async function teacherResults(
  db: Db,
  examId: string,
  page?: { skip: number; take: number },
) {
  const exam = await db.exam.findUniqueOrThrow({ where: { id: examId } });
  const students = await db.user.findMany({
    where: resultStudentFilter(examId),
    ...(page ? { skip: page.skip, take: page.take } : {}),
    select: {
      ...userSelect,
      attempts: {
        where: { examId },
        orderBy: { attemptNo: "desc" },
        include: { questions: { include: { answer: true } } },
      },
    },
    orderBy: { fullName: "asc" },
  });
  return students.map((s) => ({
    student: {
      id: s.id,
      fullName: s.fullName,
      studentCode: s.studentCode,
      email: s.email,
    },
    attemptCount: s.attempts.length,
    finalAttempt: finalAttempt(s.attempts, exam.resultStrategy) || null,
    attempts: s.attempts,
  }));
}
