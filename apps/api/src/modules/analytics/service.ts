import type { Db } from "../../db/client.js";
import { teacherResults } from "../results/service.js";
import { snapshotSchema } from "../attempts/logic.js";
export async function analytics(db: Db, examId: string) {
  const exam = await db.exam.findUniqueOrThrow({ where: { id: examId } });
  const rows = await teacherResults(db, examId);
  const graded = rows.flatMap((r) =>
    r.finalAttempt?.status === "GRADED" ? [r.finalAttempt] : [],
  );
  const scores = graded.map(
    (a) => (Number(a.totalScore) / Number(a.maxScore)) * 100,
  );
  const distribution = Array.from({ length: 5 }, (_, i) => ({
    range: `${i * 20}–${(i + 1) * 20}`,
    count: scores.filter(
      (s) => s >= i * 20 && (i === 4 ? s <= 100 : s < (i + 1) * 20),
    ).length,
  }));
  const questions = new Map<
    string,
    { questionId: string; prompt: string; correct: number; responses: number }
  >();
  for (const a of graded)
    for (const q of a.questions) {
      const s = snapshotSchema.parse(q.snapshotJson);
      if (s.type === "ESSAY") continue;
      const item = questions.get(q.originalQuestionId) || {
        questionId: q.originalQuestionId,
        prompt: s.promptMarkdown,
        correct: 0,
        responses: 0,
      };
      item.responses++;
      if (Number(q.answer?.autoScore) === Number(q.points)) item.correct++;
      questions.set(q.originalQuestionId, item);
    }
  return {
    totalAssigned: rows.length,
    notStarted: rows.filter((r) => !r.attemptCount).length,
    inProgress: rows.filter((r) =>
      r.attempts.some((a) => a.status === "IN_PROGRESS"),
    ).length,
    submitted: rows.filter((r) => r.attempts.some((a) => a.submittedAt)).length,
    graded: graded.length,
    average: scores.length
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null,
    highest: scores.length ? Math.max(...scores) : null,
    lowest: scores.length ? Math.min(...scores) : null,
    passRate: scores.length
      ? (scores.filter((s) => s >= Number(exam.passScorePercent)).length /
          scores.length) *
        100
      : null,
    distribution,
    questions: [...questions.values()].map((q) => ({
      ...q,
      correctRate: (q.correct / q.responses) * 100,
    })),
  };
}
