import { beforeAll, afterAll, it, expect } from "vitest";
import { testContext, account } from "./helpers.js";
import { examFixture } from "./fixture.js";
let ctx: ReturnType<typeof testContext>;
beforeAll(() => {
  ctx = testContext();
});
afterAll(async () => ctx?.cleanup());

it("keeps partial essay grading hidden, supports regrading and preserves feedback", async () => {
  const f = await examFixture(ctx, true);
  const essay2 = await ctx.db.question.create({
    data: {
      bankId: f.bank.id,
      type: "ESSAY",
      promptMarkdown: "Câu tự luận thứ hai",
      tags: [],
    },
  });
  await ctx.db.examQuestion.create({
    data: {
      examId: f.exam.id,
      questionId: essay2.id,
      orderIndex: 2,
      points: 2,
    },
  });
  const start = await f.student.agent
    .post(`/api/v1/student/exams/${f.exam.id}/attempts`)
    .set(f.student.headers);
  const id = start.body.data.id;
  await f.student.agent
    .post(`/api/v1/student/attempts/${id}/submit`)
    .set(f.student.headers);
  const a = await ctx.db.examAttempt.findUniqueOrThrow({
    where: { id },
    include: { questions: { include: { answer: true } } },
  });
  const first = a.questions.find((q) => q.originalQuestionId === f.essay!.id)!
    .answer!.id;
  const second = a.questions.find((q) => q.originalQuestionId === essay2.id)!
    .answer!.id;
  const grade = (
    answer: string,
    score: number,
    feedback = "Nhận xét được giữ",
  ) =>
    f.teacher.agent
      .put(`/api/v1/teacher/answers/${answer}/grade`)
      .set(f.teacher.headers)
      .send({ score, feedback });
  expect((await grade(first, -0.01)).status).toBe(400);
  expect((await grade(first, 3.01)).status).toBe(400);
  const partial = await grade(first, 2.5);
  expect(partial.body.data.status).toBe("PENDING_MANUAL_GRADING");
  expect(partial.body.data.totalScore).toBeNull();
  let result = await f.student.agent.get(
    `/api/v1/student/exams/${f.exam.id}/results`,
  );
  expect(result.body.data.attempts[0]).not.toHaveProperty("questions");
  expect(result.body.data.attempts[0]).not.toHaveProperty("totalScore");
  expect((await grade(second, 0)).body.data.status).toBe("GRADED");
  expect((await grade(first, 3)).body.data.totalScore).toBe("3");
  result = await f.student.agent.get(
    `/api/v1/student/exams/${f.exam.id}/results`,
  );
  expect(result.body.data.attempts[0].totalScore).toBe(3);
  expect(
    result.body.data.attempts[0].questions.find(
      (q: { feedback: string }) => q.feedback === "Nhận xét được giữ",
    ),
  ).toBeTruthy();
  const persisted = await f.teacher.agent.get(`/api/v1/teacher/attempts/${id}`);
  expect(persisted.status).toBe(200);
  expect(persisted.body.data.status).toBe("GRADED");
});

it("isolates student records and rejects non-owner grading, release, results and exports", async () => {
  const f = await examFixture(ctx, true),
    outsider = await account(ctx, "TEACHER"),
    otherStudent = await account(ctx, "STUDENT");
  const started = await f.student.agent
    .post(`/api/v1/student/exams/${f.exam.id}/attempts`)
    .set(f.student.headers);
  const id = started.body.data.id;
  await f.student.agent
    .post(`/api/v1/student/attempts/${id}/submit`)
    .set(f.student.headers);
  const a = await ctx.db.examAttempt.findUniqueOrThrow({
    where: { id },
    include: { questions: { include: { answer: true } } },
  });
  const answerId = a.questions.find(
    (q) => q.originalQuestionId === f.essay!.id,
  )!.answer!.id;
  for (const suffix of [
    "grading",
    "grading?page=2&pageSize=20",
    "results",
    "results?page=2",
    "analytics",
    "export.xlsx",
    `students/${f.student.user.id}/result.pdf`,
  ]) {
    expect(
      (await outsider.agent.get(`/api/v1/teacher/exams/${f.exam.id}/${suffix}`))
        .status,
    ).toBe(404);
    expect(
      (
        await f.student.agent.get(
          `/api/v1/teacher/exams/${f.exam.id}/${suffix}`,
        )
      ).status,
    ).toBe(403);
  }
  expect(
    (
      await outsider.agent
        .post(`/api/v1/teacher/exams/${f.exam.id}/release-results`)
        .set(outsider.headers)
    ).status,
  ).toBe(404);
  expect(
    (
      await outsider.agent
        .put(`/api/v1/teacher/answers/${answerId}/grade`)
        .set(outsider.headers)
        .send({ score: 1 })
    ).status,
  ).toBe(404);
  expect(
    (await otherStudent.agent.get(`/api/v1/student/exams/${f.exam.id}/results`))
      .status,
  ).toBe(404);
  await ctx.db.classMember.create({
    data: { classId: f.class.id, studentId: otherStudent.user.id },
  });
  const ownEmpty = await otherStudent.agent.get(
    `/api/v1/student/exams/${f.exam.id}/results`,
  );
  expect(ownEmpty.status).toBe(200);
  expect(ownEmpty.body.data.attempts).toEqual([]);
  expect(
    (await f.teacher.agent.get(`/api/v1/student/exams/${f.exam.id}/results`))
      .status,
  ).toBe(403);
});

it("enforces AFTER_CLOSE and independently withholds answer keys, explanations and per-question scores", async () => {
  const f = await examFixture(ctx);
  await ctx.db.exam.update({
    where: { id: f.exam.id },
    data: { resultReleaseMode: "AFTER_CLOSE", showDetailedScore: false },
  });
  const started = await f.student.agent
    .post(`/api/v1/student/exams/${f.exam.id}/attempts`)
    .set(f.student.headers);
  await f.student.agent
    .post(`/api/v1/student/attempts/${started.body.data.id}/submit`)
    .set(f.student.headers);
  const path = `/api/v1/student/exams/${f.exam.id}/results`;
  const hidden = (await f.student.agent.get(path)).body.data.attempts[0];
  expect(hidden.visible).toBe(false);
  expect(hidden).not.toHaveProperty("totalScore");
  expect(hidden).not.toHaveProperty("questions");
  await ctx.db.exam.update({
    where: { id: f.exam.id },
    data: { closeAt: new Date(Date.now() - 1000) },
  });
  const released = (await f.student.agent.get(path)).body.data.attempts[0];
  expect(released.visible).toBe(true);
  expect(released.totalScore).toBe(0);
  expect(released.questions[0]).not.toHaveProperty("score");
  expect(released.questions[0]).not.toHaveProperty("explanationMarkdown");
  expect(released.questions[0].options[0]).not.toHaveProperty("isCorrect");
});
