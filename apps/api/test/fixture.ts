import { account, testContext } from "./helpers.js";
export async function examFixture(
  ctx: ReturnType<typeof testContext>,
  essay = false,
) {
  const teacher = await account(ctx, "TEACHER"),
    student = await account(ctx, "STUDENT");
  const c = await ctx.db.class.create({
    data: {
      name: "Integration class",
      teacherId: teacher.user.id,
      members: { create: { studentId: student.user.id } },
    },
  });
  const b = await ctx.db.questionBank.create({
    data: { title: "Integration bank", ownerTeacherId: teacher.user.id },
  });
  const q = await ctx.db.question.create({
    data: {
      bankId: b.id,
      type: "SINGLE_CHOICE",
      promptMarkdown: "Original prompt",
      explanationMarkdown: "Secret explanation",
      tags: [],
      options: {
        create: [
          { contentMarkdown: "Correct", isCorrect: true, orderIndex: 0 },
          { contentMarkdown: "Wrong", isCorrect: false, orderIndex: 1 },
        ],
      },
    },
    include: { options: { orderBy: { orderIndex: "asc" } } },
  });
  const e = essay
    ? await ctx.db.question.create({
        data: {
          bankId: b.id,
          type: "ESSAY",
          promptMarkdown: "Giải thích",
          tags: [],
        },
      })
    : null;
  const exam = await ctx.db.exam.create({
    data: {
      teacherId: teacher.user.id,
      title: "Integration exam",
      status: "PUBLISHED",
      openAt: new Date(Date.now() - 60000),
      closeAt: new Date(Date.now() + 3600000),
      durationMinutes: 30,
      maxAttempts: 1,
      shuffleQuestions: true,
      shuffleOptions: true,
      resultReleaseMode: "IMMEDIATE",
      classes: { create: { classId: c.id } },
      questions: {
        create: [
          { questionId: q.id, orderIndex: 0, points: 2 },
          ...(e ? [{ questionId: e.id, orderIndex: 1, points: 3 }] : []),
        ],
      },
    },
  });
  return { teacher, student, exam, question: q, essay: e, bank: b, class: c };
}
