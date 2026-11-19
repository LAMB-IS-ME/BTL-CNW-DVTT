import { submissionInput } from "./helpers.js";
import { beforeAll, afterAll, it, expect } from "vitest";
import { testContext, account } from "./helpers.js";
import {
  joinRoom,
  createRoom,
  startRoom,
  roomState,
} from "../src/modules/live-quiz/service.js";
import { examFixture } from "./fixture.js";
let ctx: ReturnType<typeof testContext>;
beforeAll(() => {
  ctx = testContext();
});
afterAll(async () => ctx?.cleanup());
it("archives/restores all four types idempotently; filters, pagination and ownership apply to every mutation", async () => {
  const t = await account(ctx, "TEACHER"),
    other = await account(ctx, "TEACHER"),
    s = await account(ctx, "STUDENT");
  const b = await ctx.db.questionBank.create({
    data: {
      title: "TEST_lifecycle",
      subject: "Web",
      ownerTeacherId: t.user.id,
    },
  });
  for (const type of [
    "SINGLE_CHOICE",
    "MULTIPLE_CHOICE",
    "TRUE_FALSE",
    "ESSAY",
  ] as const) {
    const endpoint = `/api/v1/teacher/question-banks/${b.id}/questions`;
    const data = {
      type,
      promptMarkdown: `TEST_${type}`,
      options:
        type === "ESSAY"
          ? []
          : [
              {
                contentMarkdown: type === "TRUE_FALSE" ? "True" : "A",
                isCorrect: true,
              },
              {
                contentMarkdown: type === "TRUE_FALSE" ? "False" : "B",
                isCorrect: type === "MULTIPLE_CHOICE",
              },
            ],
    };
    const created = await t.agent.post(endpoint).set(t.headers).send(data);
    expect(created.status).toBe(201);
    const path = `/api/v1/teacher/questions/${created.body.data.id}`;
    for (const user of [other, s]) {
      const status = user === other ? 404 : 403;
      expect((await user.agent.get(path)).status).toBe(status);
      expect(
        (await user.agent.patch(path).set(user.headers).send(data)).status,
      ).toBe(status);
      expect((await user.agent.delete(path).set(user.headers)).status).toBe(
        status,
      );
      expect(
        (await user.agent.post(`${path}/restore`).set(user.headers)).status,
      ).toBe(status);
    }
    expect(
      (
        await t.agent
          .patch(path)
          .set(t.headers)
          .send({ ...data, promptMarkdown: "Edited" })
      ).status,
    ).toBe(200);
    expect((await t.agent.get(path)).body.data.promptMarkdown).toBe("Edited");
    for (let i = 0; i < 2; i++)
      expect((await t.agent.delete(path).set(t.headers)).status).toBe(204);
    expect(
      (await t.agent.get(`${endpoint}?type=${type}`)).body.data.total,
    ).toBe(0);
    expect(
      (await t.agent.get(`${endpoint}?status=archived&type=${type}`)).body.data
        .total,
    ).toBe(1);
    for (let i = 0; i < 2; i++)
      expect(
        (await t.agent.post(`${path}/restore`).set(t.headers)).status,
      ).toBe(200);
    expect(
      (await t.agent.get(`${endpoint}?type=${type}&search=Edited`)).body.data
        .total,
    ).toBe(1);
  }
  const bankPath = `/api/v1/teacher/question-banks/${b.id}`;
  expect((await t.agent.delete(bankPath).set(t.headers)).status).toBe(204);
  expect(
    (
      await t.agent
        .post(`${bankPath}/questions`)
        .set(t.headers)
        .send({ type: "ESSAY", promptMarkdown: "x" })
    ).body.error.code,
  ).toBe("BANK_ARCHIVED");
  const list = await t.agent.get(
    "/api/v1/teacher/question-banks?view=manage&status=archived&subject=Web&search=lifecycle&pageSize=1",
  );
  expect(list.body.data.total).toBe(1);
  expect(list.body.data.items[0]._count.questions).toBe(4);
  expect(list.body.data.subjects).toContain("Web");
  expect(
    (await other.agent.post(`${bankPath}/restore`).set(other.headers)).status,
  ).toBe(404);
  expect(
    (await s.agent.post(`${bankPath}/restore`).set(s.headers)).status,
  ).toBe(403);
  expect(
    (await t.agent.post(`${bankPath}/restore`).set(t.headers)).status,
  ).toBe(200);
  expect(
    Array.isArray(
      (await t.agent.get("/api/v1/teacher/question-banks")).body.data,
    ),
  ).toBe(true);
});
it("rejects archive that breaks a published fixed exam; archives after closing without changing an active attempt", async () => {
  const f = await examFixture(ctx);
  const path = `/api/v1/teacher/questions/${f.question.id}`;
  const bank = `/api/v1/teacher/question-banks/${f.bank.id}`;
  expect(
    (await f.teacher.agent.delete(path).set(f.teacher.headers)).body.error.code,
  ).toBe("SOURCE_IN_USE");
  expect(
    (await f.teacher.agent.delete(bank).set(f.teacher.headers)).body.error.code,
  ).toBe("SOURCE_IN_USE");
  expect(
    (await ctx.db.question.findUniqueOrThrow({ where: { id: f.question.id } }))
      .isArchived,
  ).toBe(false);
  const start = await f.student.agent
    .post(`/api/v1/student/exams/${f.exam.id}/attempts`)
    .set(f.student.headers);
  expect(start.status).toBe(201);
  await f.teacher.agent
    .post(`/api/v1/teacher/exams/${f.exam.id}/archive`)
    .set(f.teacher.headers);
  expect(
    (await f.teacher.agent.delete(path).set(f.teacher.headers)).status,
  ).toBe(204);
  const attempt = `/api/v1/student/attempts/${start.body.data.id}`;
  expect(
    (await f.student.agent.get(attempt)).body.data.questions[0].promptMarkdown,
  ).toBe("Original prompt");
  expect(
    (
      await f.student.agent
        .put(`${attempt}/answers/${start.body.data.questions[0].id}`)
        .set(f.student.headers)
        .send({
          selectedOptionIds: [f.question.options[0]!.id],
          expectedSavedAt: null,
        })
    ).status,
  ).toBe(200);
  expect(
    (
      await f.student.agent
        .post(`${attempt}/submit`)
        .set(f.student.headers)
        .send(await submissionInput(ctx.db, start.body.data.id))
    ).status,
  ).toBe(200);
  expect(
    (await f.teacher.agent.post(`${path}/restore`).set(f.teacher.headers))
      .status,
  ).toBe(200);
});
it("allows surplus pool archive, rejects shortage, excludes archived sources and checks bank archive at publish", async () => {
  const f = await examFixture(ctx);
  await ctx.db.examQuestion.deleteMany({ where: { examId: f.exam.id } });
  await ctx.db.examQuestionPool.create({
    data: {
      examId: f.exam.id,
      questionBankId: f.bank.id,
      pickCount: 1,
      pointsEach: 1,
      tagFilter: [],
    },
  });
  const spare = await ctx.db.question.create({
    data: {
      bankId: f.bank.id,
      type: "ESSAY",
      promptMarkdown: "Spare",
      tags: [],
    },
  });
  expect(
    (
      await f.teacher.agent
        .delete(`/api/v1/teacher/questions/${f.question.id}`)
        .set(f.teacher.headers)
    ).status,
  ).toBe(204);
  expect(
    (
      await f.teacher.agent
        .delete(`/api/v1/teacher/questions/${spare.id}`)
        .set(f.teacher.headers)
    ).body.error.code,
  ).toBe("SOURCE_IN_USE");
  const a = await f.student.agent
    .post(`/api/v1/student/exams/${f.exam.id}/attempts`)
    .set(f.student.headers);
  expect(a.status).toBe(201);
  expect(a.body.data.questions[0].promptMarkdown).toBe("Spare");
  const draft = await ctx.db.exam.create({
    data: {
      teacherId: f.teacher.user.id,
      title: "TEST_draft",
      openAt: new Date(),
      closeAt: new Date(Date.now() + 3600000),
      durationMinutes: 5,
      classes: { create: { classId: f.class.id } },
      questions: { create: { questionId: spare.id, orderIndex: 0, points: 1 } },
    },
  });
  await ctx.db.questionBank.update({
    where: { id: f.bank.id },
    data: { isArchived: true },
  });
  expect(
    (
      await f.teacher.agent
        .post(`/api/v1/teacher/exams/${draft.id}/publish`)
        .set(f.teacher.headers)
    ).body.error.code,
  ).toBe("QUESTION_ARCHIVED");
});
it("keeps Quiz sources available until removed/archived; restore within an archived bank is rejected", async () => {
  const t = await account(ctx, "TEACHER");
  const bank = await ctx.db.questionBank.create({
    data: { title: "TEST_quiz_source", ownerTeacherId: t.user.id },
  });
  const q = await ctx.db.question.create({
    data: {
      bankId: bank.id,
      type: "TRUE_FALSE",
      promptMarkdown: "x",
      tags: [],
      options: {
        create: [
          { contentMarkdown: "True", isCorrect: true, orderIndex: 0 },
          { contentMarkdown: "False", isCorrect: false, orderIndex: 1 },
        ],
      },
    },
  });
  const quiz = await ctx.db.liveQuiz.create({
    data: {
      teacherId: t.user.id,
      title: "TEST_quiz",
      questions: {
        create: {
          questionId: q.id,
          orderIndex: 0,
          timeLimitSeconds: 5,
          basePoints: 100,
        },
      },
    },
  });
  const path = `/api/v1/teacher/questions/${q.id}`;
  expect((await t.agent.delete(path).set(t.headers)).body.error.code).toBe(
    "SOURCE_IN_USE",
  );
  const room = await createRoom(ctx.db, quiz.id, t.user.id);
  const player = await account(ctx, "STUDENT");
  await joinRoom(ctx.db, room.id, player.user);
  await startRoom(ctx.db, room.id, t.user);
  const snapshot = await ctx.db.liveRoomQuestion.findMany({
    where: { roomId: room.id },
  });
  await t.agent.delete(`/api/v1/teacher/quizzes/${quiz.id}`).set(t.headers);
  expect((await t.agent.delete(path).set(t.headers)).status).toBe(204);
  expect(
    (
      await t.agent
        .delete(`/api/v1/teacher/question-banks/${bank.id}`)
        .set(t.headers)
    ).status,
  ).toBe(204);
  expect(
    (await t.agent.post(`${path}/restore`).set(t.headers)).body.error.code,
  ).toBe("BANK_ARCHIVED");
  expect(
    await ctx.db.liveRoomQuestion.findMany({ where: { roomId: room.id } }),
  ).toEqual(snapshot);
  expect(
    (await roomState(ctx.db, room.id, t.user)).question?.promptMarkdown,
  ).toBe("x");
});

it("serializes simultaneous pool archives so exactly one candidate remains for a published exam", async () => {
  const f = await examFixture(ctx);
  await ctx.db.examQuestion.deleteMany({ where: { examId: f.exam.id } });
  await ctx.db.examQuestionPool.create({
    data: {
      examId: f.exam.id,
      questionBankId: f.bank.id,
      pickCount: 1,
      pointsEach: 1,
      tagFilter: [],
    },
  });
  const spare = await ctx.db.question.create({
    data: {
      bankId: f.bank.id,
      type: "ESSAY",
      promptMarkdown: "Concurrent spare",
      tags: [],
    },
  });
  const responses = await Promise.all(
    [f.question.id, spare.id].map((id) =>
      f.teacher.agent
        .delete(`/api/v1/teacher/questions/${id}`)
        .set(f.teacher.headers),
    ),
  );
  expect(responses.map((r) => r.status).sort()).toEqual([204, 409]);
  expect(
    await ctx.db.question.count({
      where: { bankId: f.bank.id, isArchived: false },
    }),
  ).toBe(1);
  expect(
    (
      await f.student.agent
        .post(`/api/v1/student/exams/${f.exam.id}/attempts`)
        .set(f.student.headers)
    ).status,
  ).toBe(201);
});
