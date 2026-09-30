import { beforeAll, afterAll, it, expect } from "vitest";
import { testContext, account } from "./helpers.js";
import { examFixture } from "./fixture.js";
import { expireAttempts } from "../src/modules/attempts/service.js";
import type { AttemptDto } from "@exam/shared";
let ctx: ReturnType<typeof testContext>;
beforeAll(() => {
  ctx = testContext();
});
afterAll(async () => ctx?.cleanup());
it("serializes concurrent start, hides keys, preserves snapshots, autosaves/resumes and submits idempotently", async () => {
  const f = await examFixture(ctx);
  const path = `/api/v1/student/exams/${f.exam.id}/attempts`;
  const [r1, r2] = await Promise.all([
    f.student.agent.post(path).set(f.student.headers),
    f.student.agent.post(path).set(f.student.headers),
  ]);
  expect(r1.status).toBe(201);
  expect(r2.status).toBe(201);
  const a = r1.body.data as AttemptDto;
  expect(a.id).toBe(r2.body.data.id);
  expect(JSON.stringify(a)).not.toMatch(
    /isCorrect|Secret explanation|objectiveScore/,
  );
  await ctx.db.question.update({
    where: { id: f.question.id },
    data: { promptMarkdown: "Edited later", isArchived: true },
  });
  const q = a.questions[0]!;
  expect(
    (
      await f.student.agent
        .put(`/api/v1/student/attempts/${a.id}/answers/${q.id}`)
        .set(f.student.headers)
        .send({ selectedOptionIds: [f.question.options[0]!.id] })
    ).status,
  ).toBe(200);
  const resumed = await f.student.agent.get(`/api/v1/student/attempts/${a.id}`);
  expect(resumed.body.data.questions[0].promptMarkdown).toBe("Original prompt");
  expect(resumed.body.data.expiresAt).toBe(a.expiresAt);
  expect(resumed.body.data.questions[0].answer.selectedOptionIds).toEqual([
    f.question.options[0]!.id,
  ]);
  const other = await account(ctx, "STUDENT");
  expect(
    (await other.agent.get(`/api/v1/student/attempts/${a.id}`)).status,
  ).toBe(404);
  const end = `/api/v1/student/attempts/${a.id}/submit`;
  expect(
    (await f.student.agent.post(end).set(f.student.headers)).body.data.status,
  ).toBe("GRADED");
  expect((await f.student.agent.post(end).set(f.student.headers)).status).toBe(
    200,
  );
  const stored = await ctx.db.examAttempt.findUniqueOrThrow({
    where: { id: a.id },
  });
  expect(Number(stored.totalScore)).toBe(2);
  expect(
    (await f.student.agent.post(path).set(f.student.headers)).body.error.code,
  ).toBe("ATTEMPT_LIMIT_REACHED");
});
it("rejects late saves but commits auto-finalization and handles expiry job", async () => {
  const f = await examFixture(ctx, true);
  const start = await f.student.agent
    .post(`/api/v1/student/exams/${f.exam.id}/attempts`)
    .set(f.student.headers);
  const a = start.body.data as AttemptDto;
  await ctx.db.examAttempt.update({
    where: { id: a.id },
    data: {
      startedAt: new Date(Date.now() - 60000),
      expiresAt: new Date(Date.now() - 1000),
    },
  });
  const r = await f.student.agent
    .put(`/api/v1/student/attempts/${a.id}/answers/${a.questions[0]!.id}`)
    .set(f.student.headers)
    .send({ answerText: "Too late" });
  expect(r.body.error.code).toBe("ATTEMPT_EXPIRED");
  const stored = await ctx.db.examAttempt.findUniqueOrThrow({
    where: { id: a.id },
    include: { questions: { include: { answer: true } } },
  });
  expect(stored.status).toBe("PENDING_MANUAL_GRADING");
  expect(stored.autoSubmitted).toBe(true);
  expect(stored.questions.every((q) => q.answer?.answerText === null)).toBe(
    true,
  );
  await expireAttempts(ctx.db);
  expect(
    (await ctx.db.examAttempt.findUniqueOrThrow({ where: { id: a.id } }))
      .submittedAt,
  ).toEqual(stored.submittedAt);
});
it("blocks unassigned students and structural edits after start", async () => {
  const f = await examFixture(ctx);
  const s = await account(ctx, "STUDENT");
  expect(
    (
      await s.agent
        .post(`/api/v1/student/exams/${f.exam.id}/attempts`)
        .set(s.headers)
    ).status,
  ).toBe(403);
  await f.student.agent
    .post(`/api/v1/student/exams/${f.exam.id}/attempts`)
    .set(f.student.headers);
  expect(
    (
      await f.teacher.agent
        .put(`/api/v1/teacher/exams/${f.exam.id}/questions`)
        .set(f.teacher.headers)
        .send({ questions: [] })
    ).body.error.code,
  ).toBe("EXAM_HAS_ATTEMPTS");
});
