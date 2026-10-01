import type { Db } from "../../db/client.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { check } from "../../utils/errors.js";
import { selectPools } from "./selection.js";
export type Tx = Prisma.TransactionClient;
export const examInclude = {
  classes: true,
  questions: {
    include: {
      question: {
        include: { options: { orderBy: { orderIndex: "asc" as const } } },
      },
    },
    orderBy: { orderIndex: "asc" as const },
  },
  pools: { orderBy: { createdAt: "asc" as const } },
} as const;
export async function lockExam(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Exam" WHERE id = ${id}::uuid FOR UPDATE`;
}
export async function ownExam(db: Db | Tx, id: string, teacherId: string) {
  const e = await db.exam.findUnique({ where: { id }, include: examInclude });
  check(e && e.teacherId === teacherId, 404, "NOT_FOUND");
  return e;
}
export async function materializeSources(
  tx: Tx,
  exam: Awaited<ReturnType<typeof ownExam>>,
  random = true,
) {
  const fixed = exam.questions;
  check(
    fixed.every((f) => !f.question.isArchived),
    400,
    "QUESTION_ARCHIVED",
  );
  // Fetch the union once: all queries in an interactive transaction share
  // one connection, so Promise.all here only queues work on the same pg client.
  const available = exam.pools.length
    ? await tx.question.findMany({
        where: {
          isArchived: false,
          bank: { isArchived: false },
          OR: exam.pools.map((p) => ({
            bankId: p.questionBankId,
            ...(p.difficultyFilter ? { difficulty: p.difficultyFilter } : {}),
            ...(p.tagFilter.length ? { tags: { hasEvery: p.tagFilter } } : {}),
          })),
        },
        include: { options: { orderBy: { orderIndex: "asc" } } },
        orderBy: { id: "asc" },
      })
    : [];
  const candidates = exam.pools.map((p) =>
    available.filter(
      (q) =>
        q.bankId === p.questionBankId &&
        (!p.difficultyFilter || q.difficulty === p.difficultyFilter) &&
        p.tagFilter.every((tag) => q.tags.includes(tag)),
    ),
  );
  const ids = selectPools(
    exam.pools.map((p, i) => ({
      ids: candidates[i]!.map((q) => q.id),
      pickCount: p.pickCount,
    })),
    fixed.map((f) => f.questionId),
    random,
  );
  const selected = fixed.map((f) => ({
    question: f.question,
    points: Number(f.points),
    sourceType: "FIXED" as "FIXED" | "RANDOM_POOL",
  }));
  ids.forEach((list, i) =>
    list.forEach((id) =>
      selected.push({
        question: candidates[i]!.find((q) => q.id === id)!,
        points: Number(exam.pools[i]!.pointsEach),
        sourceType: "RANDOM_POOL",
      }),
    ),
  );
  check(
    selected.length > 0 &&
      selected.length <= 500 &&
      selected.reduce((n, q) => n + q.points, 0) > 0,
    400,
    "INVALID_EXAM_QUESTIONS",
  );
  return selected;
}
