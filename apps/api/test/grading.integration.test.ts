import { beforeAll, afterAll, it, expect } from "vitest";
import { testContext, account } from "./helpers.js";
import { examFixture } from "./fixture.js";
let ctx: ReturnType<typeof testContext>;
beforeAll(() => {
  ctx = testContext();
});
afterAll(async () => ctx?.cleanup());
it("grades essay with ownership/range validation and enforces score/key/explanation release on server", async () => {
  const f = await examFixture(ctx, true),
    o = await account(ctx, "TEACHER");
  await ctx.db.exam.update({
    where: { id: f.exam.id },
    data: { resultReleaseMode: "MANUAL" },
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
  const essay = a.questions.find((q) => q.originalQuestionId === f.essay!.id)!;
  const grade = `/api/v1/teacher/answers/${essay.answer!.id}/grade`;
  expect(
    (await o.agent.put(grade).set(o.headers).send({ score: 1 })).status,
  ).toBe(404);
  expect(
    (await f.teacher.agent.put(grade).set(f.teacher.headers).send({ score: 4 }))
      .status,
  ).toBe(400);
  expect(
    (
      await f.teacher.agent
        .put(grade)
        .set(f.teacher.headers)
        .send({ score: 2.5, feedback: "Lập luận tốt" })
    ).body.data.status,
  ).toBe("GRADED");
  const result = `/api/v1/student/exams/${f.exam.id}/results`;
  let r = await f.student.agent.get(result);
  expect(r.body.data.attempts[0].visible).toBe(false);
  expect(r.body.data.attempts[0]).not.toHaveProperty("totalScore");
  await f.teacher.agent
    .post(`/api/v1/teacher/exams/${f.exam.id}/release-results`)
    .set(f.teacher.headers);
  r = await f.student.agent.get(result);
  expect(r.body.data.attempts[0].totalScore).toBe(2.5);
  expect(JSON.stringify(r.body)).not.toMatch(/isCorrect|explanationMarkdown/);
  await ctx.db.exam.update({
    where: { id: f.exam.id },
    data: {
      showCorrectAnswers: true,
      showExplanations: true,
      showDetailedScore: false,
    },
  });
  r = await f.student.agent.get(result);
  expect(JSON.stringify(r.body)).toContain("isCorrect");
  expect(JSON.stringify(r.body)).toContain("Secret explanation");
  expect(r.body.data.attempts[0].questions[0]).not.toHaveProperty("score");
});
