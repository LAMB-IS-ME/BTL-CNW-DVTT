import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { testContext } from "./helpers.js";
import { examFixture } from "./fixture.js";
import type { AttemptDto } from "@exam/shared";

let ctx: ReturnType<typeof testContext>;
beforeAll(() => {
  ctx = testContext();
});
afterAll(async () => ctx?.cleanup());

it("rejects a delayed stale write without changing the newer persisted answer", async () => {
  const f = await examFixture(ctx);
  const a = (
    await f.student.agent
      .post(`/api/v1/student/exams/${f.exam.id}/attempts`)
      .set(f.student.headers)
  ).body.data as AttemptDto;
  const q = a.questions[0]!;
  const path = `/api/v1/student/attempts/${a.id}/answers/${q.id}`;
  const newer = await f.student.agent
    .put(path)
    .set(f.student.headers)
    .send({ selectedOptionIds: [q.options[1]!.id], expectedSavedAt: null });
  expect(newer.status).toBe(200);
  const stale = await f.student.agent
    .put(path)
    .set(f.student.headers)
    .send({ selectedOptionIds: [q.options[0]!.id], expectedSavedAt: null });
  expect(stale.status).toBe(409);
  expect(stale.body.error.code).toBe("ANSWER_CONFLICT");
  const stored = await ctx.db.attemptAnswer.findUniqueOrThrow({
    where: { attemptQuestionId: q.id },
  });
  expect(stored.answerJson).toEqual([q.options[1]!.id]);
  expect(stored.savedAt.toISOString()).toBe(newer.body.data.savedAt);
});

it("allows exactly one concurrent initial write and rejects an old-view submit", async () => {
  const f = await examFixture(ctx);
  const a = (
    await f.student.agent
      .post(`/api/v1/student/exams/${f.exam.id}/attempts`)
      .set(f.student.headers)
  ).body.data as AttemptDto;
  const q = a.questions[0]!;
  const path = `/api/v1/student/attempts/${a.id}`;
  const responses = await Promise.all(
    q.options.map((o) =>
      f.student.agent
        .put(`${path}/answers/${q.id}`)
        .set(f.student.headers)
        .send({ selectedOptionIds: [o.id], expectedSavedAt: null }),
    ),
  );
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(
    await ctx.db.attemptAnswer.count({ where: { attemptQuestionId: q.id } }),
  ).toBe(1);
  const submit = await f.student.agent
    .post(`${path}/submit`)
    .set(f.student.headers)
    .send({ expectedVersions: { [q.id]: null } });
  expect(submit.status).toBe(409);
  expect(submit.body.error.code).toBe("ATTEMPT_CONFLICT");
  expect(
    (await ctx.db.examAttempt.findUniqueOrThrow({ where: { id: a.id } }))
      .status,
  ).toBe("IN_PROGRESS");
});

it("requires a revision, rejects retries without mutation, and advances revisions within one millisecond", async () => {
  const f = await examFixture(ctx);
  const a = (
    await f.student.agent
      .post(`/api/v1/student/exams/${f.exam.id}/attempts`)
      .set(f.student.headers)
  ).body.data as AttemptDto;
  const q = a.questions[0]!;
  const path = `/api/v1/student/attempts/${a.id}/answers/${q.id}`;
  const payload = {
    selectedOptionIds: [q.options[0]!.id],
    expectedSavedAt: null,
  };
  expect(
    (
      await f.student.agent
        .put(path)
        .set(f.student.headers)
        .send({ selectedOptionIds: payload.selectedOptionIds })
    ).status,
  ).toBe(400);
  const frozen = vi.spyOn(Date, "now").mockReturnValue(Date.now());
  try {
    const first = await f.student.agent
      .put(path)
      .set(f.student.headers)
      .send(payload);
    expect(first.status).toBe(200);
    const before = await ctx.db.attemptAnswer.findUniqueOrThrow({
      where: { attemptQuestionId: q.id },
    });
    const retry = await f.student.agent
      .put(path)
      .set(f.student.headers)
      .send(payload);
    expect(retry.status).toBe(409);
    expect(retry.body.error.code).toBe("ANSWER_CONFLICT");
    expect(
      await ctx.db.attemptAnswer.findUniqueOrThrow({
        where: { id: before.id },
      }),
    ).toEqual(before);
    const next = await f.student.agent
      .put(path)
      .set(f.student.headers)
      .send({
        selectedOptionIds: [q.options[1]!.id],
        expectedSavedAt: first.body.data.savedAt,
      });
    expect(next.status).toBe(200);
    expect(Date.parse(next.body.data.savedAt)).toBeGreaterThan(
      Date.parse(first.body.data.savedAt),
    );
    const repeated = await f.student.agent
      .put(path)
      .set(f.student.headers)
      .send(payload);
    expect(repeated.status).toBe(409);
    expect(
      (
        await ctx.db.attemptAnswer.findUniqueOrThrow({
          where: { id: before.id },
        })
      ).answerJson,
    ).toEqual([q.options[1]!.id]);
  } finally {
    frozen.mockRestore();
  }
});

it("serializes concurrent updates and verifies the exact answer set on manual submission", async () => {
  const f = await examFixture(ctx);
  const a = (
    await f.student.agent
      .post(`/api/v1/student/exams/${f.exam.id}/attempts`)
      .set(f.student.headers)
  ).body.data as AttemptDto;
  const q = a.questions[0]!,
    path = `/api/v1/student/attempts/${a.id}`;
  const initial = await f.student.agent
    .put(`${path}/answers/${q.id}`)
    .set(f.student.headers)
    .send({ selectedOptionIds: [], expectedSavedAt: null });
  const updates = await Promise.all(
    q.options.map((o) =>
      f.student.agent
        .put(`${path}/answers/${q.id}`)
        .set(f.student.headers)
        .send({
          selectedOptionIds: [o.id],
          expectedSavedAt: initial.body.data.savedAt,
        }),
    ),
  );
  expect(updates.map((r) => r.status).sort()).toEqual([200, 409]);
  const winner = updates.findIndex((r) => r.status === 200);
  const version = updates[winner]!.body.data.savedAt;
  const payload = { expectedVersions: { [q.id]: version } };
  expect(
    (
      await f.student.agent
        .post(`${path}/submit`)
        .set(f.student.headers)
        .send({ expectedVersions: {} })
    ).status,
  ).toBe(409);
  expect(
    (await f.student.agent.post(`${path}/submit`).set(f.student.headers))
      .status,
  ).toBe(400);
  const submitted = await f.student.agent
    .post(`${path}/submit`)
    .set(f.student.headers)
    .send(payload);
  expect(submitted.status).toBe(200);
  expect(submitted.body.data.questions[0].answer.selectedOptionIds).toEqual([
    q.options[winner]!.id,
  ]);
  const before = await ctx.db.examAttempt.findUniqueOrThrow({
    where: { id: a.id },
    include: { questions: { include: { answer: true } } },
  });
  const repeats = await Promise.all(
    [1, 2].map(() =>
      f.student.agent
        .post(`${path}/submit`)
        .set(f.student.headers)
        .send(payload),
    ),
  );
  expect(repeats.map((r) => r.status)).toEqual([200, 200]);
  expect(
    await ctx.db.examAttempt.findUniqueOrThrow({
      where: { id: a.id },
      include: { questions: { include: { answer: true } } },
    }),
  ).toEqual(before);
  expect(before.questions[0]!.answer!.answerJson).toEqual([
    q.options[winner]!.id,
  ]);
});

it("cannot accept both a changed answer and submission based on the previous version", async () => {
  const f = await examFixture(ctx);
  const a = (
    await f.student.agent
      .post(`/api/v1/student/exams/${f.exam.id}/attempts`)
      .set(f.student.headers)
  ).body.data as AttemptDto;
  const q = a.questions[0]!,
    path = `/api/v1/student/attempts/${a.id}`;
  const [save, submit] = await Promise.all([
    f.student.agent
      .put(`${path}/answers/${q.id}`)
      .set(f.student.headers)
      .send({ selectedOptionIds: [q.options[0]!.id], expectedSavedAt: null }),
    f.student.agent
      .post(`${path}/submit`)
      .set(f.student.headers)
      .send({ expectedVersions: { [q.id]: null } }),
  ]);
  expect([save.status, submit.status].sort()).toEqual([200, 409]);
  const stored = await ctx.db.examAttempt.findUniqueOrThrow({
    where: { id: a.id },
    include: { questions: { include: { answer: true } } },
  });
  if (save.status === 200) {
    expect(submit.body.error.code).toBe("ATTEMPT_CONFLICT");
    expect(stored.status).toBe("IN_PROGRESS");
    expect(stored.questions[0]!.answer!.answerJson).toEqual([q.options[0]!.id]);
  } else {
    expect(save.body.error.code).toBe("ATTEMPT_ALREADY_SUBMITTED");
    expect(stored.status).toBe("GRADED");
    expect(stored.questions[0]!.answer!.answerJson).toBeNull();
  }
});
