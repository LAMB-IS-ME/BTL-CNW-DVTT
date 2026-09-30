import { beforeAll, afterAll, it, expect } from "vitest";
import { testContext, account } from "./helpers.js";
let ctx: ReturnType<typeof testContext>;
beforeAll(() => {
  ctx = testContext();
});
afterAll(async () => ctx?.cleanup());
it("requires class and question source, checks ownership, validates pools, publishes valid mixed exam", async () => {
  const t = await account(ctx, "TEACHER"),
    o = await account(ctx, "TEACHER");
  const data = {
    title: "Exam Builder",
    openAt: new Date(Date.now() - 1000).toISOString(),
    closeAt: new Date(Date.now() + 3600000).toISOString(),
    durationMinutes: 30,
  };
  const e = await t.agent
    .post("/api/v1/teacher/exams")
    .set(t.headers)
    .send(data);
  expect(e.status).toBe(201);
  const base = `/api/v1/teacher/exams/${e.body.data.id}`;
  expect(
    (await t.agent.post(`${base}/publish`).set(t.headers)).body.error.code,
  ).toBe("CLASS_REQUIRED");
  expect((await o.agent.get(base)).status).toBe(404);
  const c = await ctx.db.class.create({
    data: { name: "Lớp", teacherId: t.user.id },
  });
  await t.agent
    .put(`${base}/classes`)
    .set(t.headers)
    .send({ classIds: [c.id] });
  const b = await ctx.db.questionBank.create({
    data: { title: "Bank", ownerTeacherId: t.user.id },
  });
  const q = await ctx.db.question.create({
    data: { bankId: b.id, type: "ESSAY", promptMarkdown: "Câu 1", tags: [] },
  });
  await ctx.db.question.create({
    data: { bankId: b.id, type: "ESSAY", promptMarkdown: "Câu 2", tags: [] },
  });
  expect(
    (
      await t.agent
        .put(`${base}/questions`)
        .set(t.headers)
        .send({ questions: [{ questionId: q.id, points: 2 }] })
    ).status,
  ).toBe(200);
  await t.agent
    .put(`${base}/pools`)
    .set(t.headers)
    .send({ pools: [{ questionBankId: b.id, pickCount: 2, pointsEach: 1 }] });
  expect(
    (await t.agent.post(`${base}/publish`).set(t.headers)).body.error.code,
  ).toBe("QUESTION_POOL_INSUFFICIENT");
  await t.agent
    .put(`${base}/pools`)
    .set(t.headers)
    .send({ pools: [{ questionBankId: b.id, pickCount: 1, pointsEach: 1 }] });
  expect(
    (await t.agent.post(`${base}/publish`).set(t.headers)).body.data.status,
  ).toBe("PUBLISHED");
});
