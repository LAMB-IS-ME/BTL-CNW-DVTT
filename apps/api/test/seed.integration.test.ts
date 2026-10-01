import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { testContext } from "./helpers.js";
import { examFixture } from "./fixture.js";
import { completeDemoAttempt, seedDemo } from "../prisma/seed.js";
import * as attempts from "../src/modules/attempts/service.js";
let ctx: ReturnType<typeof testContext>;
beforeAll(() => {
  ctx = testContext();
});
afterAll(async () => ctx?.cleanup());
async function counts() {
  return {
    users: await ctx.db.user.count(),
    classes: await ctx.db.class.count(),
    banks: await ctx.db.questionBank.count(),
    questions: await ctx.db.question.count(),
    options: await ctx.db.questionOption.count(),
    exams: await ctx.db.exam.count(),
    fixed: await ctx.db.examQuestion.count(),
    pools: await ctx.db.examQuestionPool.count(),
    quizzes: await ctx.db.liveQuiz.count(),
    quizQuestions: await ctx.db.liveQuizQuestion.count(),
    attempts: await ctx.db.examAttempt.count(),
    snapshots: await ctx.db.attemptQuestion.count(),
    answers: await ctx.db.attemptAnswer.count(),
  };
}
it("resumes a seed interrupted before submit; reruns preserve IDs, saved answers, counts and final result", async () => {
  // This suite is restricted to a disposable test DB by testContext(). Remove
  // only its previous demo attempt fixture so the interruption can be repeated.
  const previous = await ctx.db.examAttempt.findMany({
    where: {
      examId: "00000000-0000-4000-8000-000000000402",
      student: { email: "student2@exam.local" },
    },
    select: { id: true },
  });
  const ids = previous.map((a) => a.id);
  await ctx.db.$transaction(async (tx) => {
    await tx.attemptAnswer.deleteMany({
      where: { question: { attemptId: { in: ids } } },
    });
    await tx.attemptQuestion.deleteMany({ where: { attemptId: { in: ids } } });
    await tx.examAttempt.deleteMany({ where: { id: { in: ids } } });
  });
  const interrupted = new Error("Injected interruption before submit");
  const fail = vi
    .spyOn(attempts, "submitAttempt")
    .mockRejectedValueOnce(interrupted);
  try {
    await expect(seedDemo(ctx.db)).rejects.toBe(interrupted);
  } finally {
    fail.mockRestore();
  }
  const student = await ctx.db.user.findUniqueOrThrow({
    where: { email: "student2@exam.local" },
  });
  const where = {
    examId: "00000000-0000-4000-8000-000000000402",
    studentId: student.id,
  };
  const before = await ctx.db.examAttempt.findFirstOrThrow({
    where,
    include: attempts.attemptInclude,
  });
  expect(before.status).toBe("IN_PROGRESS");
  expect(before.questions.every((q) => q.answer !== null)).toBe(true);
  const initialCounts = await counts();
  const first = await seedDemo(ctx.db);
  expect(first.demoAttempt).toMatchObject({
    id: before.id,
    status: "GRADED",
    attemptNo: 1,
  });
  const finished = await ctx.db.examAttempt.findUniqueOrThrow({
    where: { id: before.id },
    include: attempts.attemptInclude,
  });
  expect(Number(finished.totalScore)).toBe(Number(finished.maxScore));
  expect(
    finished.questions.map((q) => [
      q.id,
      q.answer!.id,
      q.answer!.savedAt,
      q.answer!.answerJson,
    ]),
  ).toEqual(
    before.questions.map((q) => [
      q.id,
      q.answer!.id,
      q.answer!.savedAt,
      q.answer!.answerJson,
    ]),
  );
  const submit = vi.spyOn(attempts, "submitAttempt");
  try {
    await seedDemo(ctx.db);
    expect(submit).not.toHaveBeenCalled();
  } finally {
    submit.mockRestore();
  }
  expect(await counts()).toEqual(initialCounts);
  expect(
    await ctx.db.examAttempt.findUniqueOrThrow({ where: { id: before.id } }),
  ).toMatchObject({ submittedAt: finished.submittedAt, status: "GRADED" });
  expect(
    await ctx.db.examAttempt.count({
      where: { ...where, status: "IN_PROGRESS" },
    }),
  ).toBe(0);
});
it("preserves a saved wrong answer when resuming and skips a legacy SUBMITTED attempt", async () => {
  const f = await examFixture(ctx);
  const a = await attempts.startAttempt(ctx.db, f.exam.id, f.student.user.id);
  await attempts.saveAnswer(
    ctx.db,
    a.id,
    a.questions[0]!.id,
    f.student.user.id,
    { selectedOptionIds: [f.question.options[1]!.id] },
  );
  const result = await completeDemoAttempt(
    ctx.db,
    f.exam.id,
    f.student.user.id,
  );
  expect(Number(result.totalScore)).toBe(0);
  await ctx.db.examAttempt.update({
    where: { id: a.id },
    data: { status: "SUBMITTED" },
  });
  const submit = vi.spyOn(attempts, "submitAttempt");
  try {
    expect(
      (await completeDemoAttempt(ctx.db, f.exam.id, f.student.user.id)).status,
    ).toBe("SUBMITTED");
    expect(submit).not.toHaveBeenCalled();
  } finally {
    submit.mockRestore();
  }
});
it("finalizes the same expired partial attempt without accepting late answers or extending its deadline", async () => {
  const f = await examFixture(ctx);
  const a = await attempts.startAttempt(ctx.db, f.exam.id, f.student.user.id);
  const expiresAt = new Date(Date.now() - 1000);
  await ctx.db.examAttempt.update({
    where: { id: a.id },
    data: { startedAt: new Date(Date.now() - 60000), expiresAt },
  });
  const result = await completeDemoAttempt(
    ctx.db,
    f.exam.id,
    f.student.user.id,
  );
  expect(result).toMatchObject({
    id: a.id,
    status: "GRADED",
    autoSubmitted: true,
  });
  expect(Number(result.totalScore)).toBe(0);
  const stored = await attempts.readAttempt(ctx.db, a.id);
  expect(stored!.expiresAt).toEqual(expiresAt);
  expect(stored!.questions[0]!.answer!.answerJson).toBeNull();
  expect(await ctx.db.examAttempt.count({ where: { examId: f.exam.id } })).toBe(
    1,
  );
});
it("rolls back all batched grading if commit is aborted, then safely resumes the attempt", async () => {
  const f = await examFixture(ctx);
  const a = await attempts.startAttempt(ctx.db, f.exam.id, f.student.user.id);
  const aborted = new Error("Abort after finalize, before commit");
  await expect(
    ctx.db.$transaction(async (tx) => {
      await attempts.finalizeTx(tx, a.id);
      throw aborted;
    }),
  ).rejects.toBe(aborted);
  const stored = await attempts.readAttempt(ctx.db, a.id);
  expect(stored!.status).toBe("IN_PROGRESS");
  expect(stored!.questions[0]!.answer).toBeNull();
  expect(
    (await completeDemoAttempt(ctx.db, f.exam.id, f.student.user.id)).status,
  ).toBe("GRADED");
});
it("allows a cloud-latency transaction over five seconds with the shared bounded timeout", async () => {
  await ctx.db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_sleep(5.1)`;
  });
});
