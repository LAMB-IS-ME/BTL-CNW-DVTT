import { z } from "zod";
import type { Db } from "../../db/client.js";
import type { Tx } from "../exams/service.js";
import { check } from "../../utils/errors.js";
import { validateSourceAssets } from "../storage/references.js";

export const quizSchema = z.object({
  title: z.string().trim().min(1).max(200),
  descriptionMarkdown: z.string().max(20000).nullable().optional(),
});
export const quizQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        questionId: z.uuid(),
        timeLimitSeconds: z.number().int().min(5).max(300),
        basePoints: z.number().int().min(1).max(10000),
      }),
    )
    .max(100),
});
export const quizConfigurationSchema = z.object({
  quiz: quizSchema,
  ...quizQuestionsSchema.shape,
});
export async function lockQuiz(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "LiveQuiz" WHERE id=${id}::uuid FOR UPDATE`;
}
export async function ownQuiz(db: Db | Tx, id: string, teacherId: string) {
  const quiz = await db.liveQuiz.findUnique({
    where: { id },
    include: {
      questions: {
        include: { question: { include: { bank: true, options: true } } },
        orderBy: { orderIndex: "asc" },
      },
      rooms: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  check(quiz && quiz.teacherId === teacherId, 404, "NOT_FOUND");
  return quiz;
}

// Room creation/start require a nonempty definition; an unused draft may be empty.
export async function validateQuizDefinition(
  tx: Tx,
  id: string,
  teacherId: string,
  requireQuestions = false,
) {
  const quiz = await ownQuiz(tx, id, teacherId);
  check(!quiz.isArchived, 409, "QUIZ_ARCHIVED");
  const needsQuestions =
    requireQuestions ||
    (await tx.quizRoom.count({ where: { quizId: id, status: "LOBBY" } })) > 0;
  check(
    (!needsQuestions || quiz.questions.length > 0) &&
      quiz.questions.every(
        ({ question: q }) =>
          q.type !== "ESSAY" &&
          !q.isArchived &&
          !q.bank.isArchived &&
          q.bank.ownerTeacherId === teacherId,
      ),
    400,
    "QUIZ_INVALID_QUESTIONS",
  );
  await validateSourceAssets(
    tx,
    quiz.questions.map((q) => q.question),
  );
  return quiz;
}

export async function replaceQuizQuestions(
  tx: Tx,
  id: string,
  teacherId: string,
  questions: z.infer<typeof quizQuestionsSchema>["questions"],
) {
  const ids = [...new Set(questions.map((q) => q.questionId))];
  check(
    (await tx.question.count({
      where: {
        id: { in: ids },
        type: { not: "ESSAY" },
        isArchived: false,
        bank: { ownerTeacherId: teacherId, isArchived: false },
      },
    })) === ids.length,
    400,
    "QUIZ_INVALID_QUESTIONS",
  );
  await tx.liveQuizQuestion.deleteMany({ where: { quizId: id } });
  await tx.liveQuizQuestion.createMany({
    data: questions.map((q, orderIndex) => ({ ...q, quizId: id, orderIndex })),
  });
}
