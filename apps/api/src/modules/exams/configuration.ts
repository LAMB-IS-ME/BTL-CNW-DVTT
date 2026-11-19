import { z } from "zod";
import { examSchema } from "@exam/shared";
import { check } from "../../utils/errors.js";
import { materializeSources, ownExam, type Tx } from "./service.js";

export const classesSchema = z.object({ classIds: z.array(z.uuid()).max(100) });
export const fixedQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        questionId: z.uuid(),
        points: z.number().positive().max(10000),
      }),
    )
    .max(500),
});
export const poolsSchema = z.object({
  pools: z
    .array(
      z.object({
        questionBankId: z.uuid(),
        pickCount: z.number().int().min(1).max(100),
        pointsEach: z.number().positive().max(10000),
        difficultyFilter: z
          .enum(["EASY", "MEDIUM", "HARD"])
          .nullable()
          .optional(),
        tagFilter: z.array(z.string()).max(20).default([]),
      }),
    )
    .max(20),
});
export const configurationSchema = z.object({
  exam: examSchema,
  ...classesSchema.shape,
  ...fixedQuestionsSchema.shape,
  ...poolsSchema.shape,
  publish: z.boolean().default(false),
});

export async function replaceClasses(
  tx: Tx,
  id: string,
  teacherId: string,
  classIds: string[],
) {
  check(new Set(classIds).size === classIds.length, 400, "DUPLICATE_CLASS");
  check(
    (await tx.class.count({
      where: {
        id: { in: classIds },
        teacherId,
        archivedAt: null,
      },
    })) === classIds.length,
    400,
    "INVALID_CLASS",
  );
  await tx.examClass.deleteMany({ where: { examId: id } });
  await tx.examClass.createMany({
    data: classIds.map((classId) => ({ classId, examId: id })),
  });
}

export async function replaceQuestions(
  tx: Tx,
  id: string,
  teacherId: string,
  questions: z.infer<typeof fixedQuestionsSchema>["questions"],
) {
  check(
    new Set(questions.map((q) => q.questionId)).size === questions.length,
    400,
    "DUPLICATE_QUESTION",
  );
  check(
    (await tx.question.count({
      where: {
        id: { in: questions.map((q) => q.questionId) },
        isArchived: false,
        bank: { ownerTeacherId: teacherId, isArchived: false },
      },
    })) === questions.length,
    400,
    "INVALID_QUESTION",
  );
  await tx.examQuestion.deleteMany({ where: { examId: id } });
  await tx.examQuestion.createMany({
    data: questions.map((q, orderIndex) => ({ ...q, examId: id, orderIndex })),
  });
}

export async function replacePools(
  tx: Tx,
  id: string,
  teacherId: string,
  pools: z.infer<typeof poolsSchema>["pools"],
) {
  const bankIds = [...new Set(pools.map((p) => p.questionBankId))];
  check(
    (await tx.questionBank.count({
      where: {
        id: { in: bankIds },
        ownerTeacherId: teacherId,
        isArchived: false,
      },
    })) === bankIds.length,
    400,
    "INVALID_BANK",
  );
  await tx.examQuestionPool.deleteMany({ where: { examId: id } });
  await tx.examQuestionPool.createMany({
    data: pools.map((p) => ({ ...p, examId: id })),
  });
}

// Caller holds the exam row lock (or created it) and the teacher catalog lock.
export async function validatePublishedExam(
  tx: Tx,
  id: string,
  teacherId: string,
  publishing = false,
) {
  const exam = await ownExam(tx, id, teacherId);
  check(exam.classes.length > 0, 400, "CLASS_REQUIRED");
  check(
    (await tx.class.count({
      where: {
        id: { in: exam.classes.map((c) => c.classId) },
        teacherId,
        archivedAt: null,
      },
    })) === exam.classes.length,
    400,
    "INVALID_CLASS",
  );
  check(
    exam.closeAt > exam.openAt && (!publishing || exam.closeAt > new Date()),
    400,
    "INVALID_SCHEDULE",
  );
  await materializeSources(tx, exam, false);
}

export async function writeConfiguration(
  tx: Tx,
  id: string,
  teacherId: string,
  data: z.infer<typeof configurationSchema>,
) {
  await tx.exam.update({ where: { id }, data: data.exam });
  await replaceClasses(tx, id, teacherId, data.classIds);
  await replaceQuestions(tx, id, teacherId, data.questions);
  await replacePools(tx, id, teacherId, data.pools);
  if (data.publish) {
    const exam = await ownExam(tx, id, teacherId);
    check(exam.status === "DRAFT", 409, "EXAM_NOT_DRAFT");
    await validatePublishedExam(tx, id, teacherId, true);
    await tx.exam.update({
      where: { id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
  }
  return ownExam(tx, id, teacherId);
}
