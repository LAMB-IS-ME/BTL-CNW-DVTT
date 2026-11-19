import { afterAll, beforeAll, expect, it } from "vitest";
import { account, testContext } from "./helpers.js";
import { examFixture } from "./fixture.js";
import {
  createRoom,
  joinRoom,
  startRoom,
} from "../src/modules/live-quiz/service.js";
let ctx: ReturnType<typeof testContext>;
beforeAll(() => {
  if (
    !process.env.TEST_DATABASE_URL ||
    !["127.0.0.1", "localhost", "[::1]"].includes(
      new URL(process.env.TEST_DATABASE_URL).hostname,
    )
  )
    throw new Error(
      "Published invariant tests require a dedicated loopback PostgreSQL test database",
    );
  ctx = testContext();
});
afterAll(async () => ctx?.cleanup());
const metadata = (title = "Atomic configuration") => ({
  title,
  openAt: new Date(Date.now() - 60000).toISOString(),
  closeAt: new Date(Date.now() + 3600000).toISOString(),
  durationMinutes: 30,
});
const questionData = (prompt = "Valid edit") => ({
  type: "SINGLE_CHOICE",
  promptMarkdown: prompt,
  defaultPoints: 1,
  difficulty: "EASY",
  tags: ["required"],
  options: [
    { contentMarkdown: "Yes", isCorrect: true },
    { contentMarkdown: "No", isCorrect: false },
  ],
});
async function contents(id: string) {
  return ctx.db.exam.findUniqueOrThrow({
    where: { id },
    include: { classes: true, questions: true, pools: true },
  });
}

it("rejects empty published assignments/questions, invalid schedules/pools and class archive without changing data", async () => {
  const f = await examFixture(ctx),
    path = `/api/v1/teacher/exams/${f.exam.id}`;
  const before = await contents(f.exam.id);
  for (const [suffix, payload, code] of [
    ["/classes", { classIds: [] }, "CLASS_REQUIRED"],
    ["/questions", { questions: [] }, "INVALID_EXAM_QUESTIONS"],
    [
      "/pools",
      { pools: [{ questionBankId: f.bank.id, pickCount: 2, pointsEach: 1 }] },
      "QUESTION_POOL_INSUFFICIENT",
    ],
  ] as const) {
    const r = await f.teacher.agent
      .put(path + suffix)
      .set(f.teacher.headers)
      .send(payload);
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe(code);
    expect(await contents(f.exam.id)).toEqual(before);
  }
  const invalid = await f.teacher.agent
    .patch(path)
    .set(f.teacher.headers)
    .send({
      ...metadata("Must not persist"),
      closeAt: new Date(Date.now() - 120000).toISOString(),
    });
  expect(invalid.status).toBe(400);
  expect(await contents(f.exam.id)).toEqual(before);
  const archive = await f.teacher.agent
    .delete(`/api/v1/teacher/classes/${f.class.id}`)
    .set(f.teacher.headers);
  expect(archive.status).toBe(409);
  expect(archive.body.error.code).toBe("CLASS_IN_USE");
  expect(
    (await ctx.db.class.findUniqueOrThrow({ where: { id: f.class.id } }))
      .archivedAt,
  ).toBeNull();
  const rename = await f.teacher.agent
    .patch(path)
    .set(f.teacher.headers)
    .send(metadata("Valid rename"));
  expect(rename.status).toBe(200);
  expect(rename.body.data.status).toBe("PUBLISHED");
});

it("atomically replaces fixed questions with a pool and rolls back every field on invalid complete configuration", async () => {
  const f = await examFixture(ctx),
    path = `/api/v1/teacher/exams/${f.exam.id}/configuration`;
  const before = await contents(f.exam.id);
  const input = {
    exam: metadata("Rejected metadata"),
    classIds: [f.class.id],
    questions: [],
    pools: [{ questionBankId: f.bank.id, pickCount: 2, pointsEach: 3 }],
  };
  const rejected = await f.teacher.agent
    .put(path)
    .set(f.teacher.headers)
    .send(input);
  expect(rejected.status).toBe(400);
  expect(await contents(f.exam.id)).toEqual(before);
  const accepted = await f.teacher.agent
    .put(path)
    .set(f.teacher.headers)
    .send({
      ...input,
      exam: metadata("Valid swap"),
      pools: [{ questionBankId: f.bank.id, pickCount: 1, pointsEach: 3 }],
    });
  expect(accepted.status).toBe(200);
  expect(accepted.body.data.status).toBe("PUBLISHED");
  const state = await contents(f.exam.id);
  expect(state.title).toBe("Valid swap");
  expect(state.questions).toHaveLength(0);
  expect(state.pools).toHaveLength(1);
  const started = await f.student.agent
    .post(`/api/v1/student/exams/${f.exam.id}/attempts`)
    .set(f.student.headers);
  expect(started.status).toBe(201);
  expect(started.body.data.questions).toHaveLength(1);
  const locked = await f.teacher.agent
    .put(path)
    .set(f.teacher.headers)
    .send(input);
  expect(locked.status).toBe(409);
  expect(locked.body.error.code).toBe("EXAM_HAS_ATTEMPTS");
  expect(await contents(f.exam.id)).toEqual(state);
});

it("does not persist a partially created Exam/Quiz when configuration validation or publish fails", async () => {
  const t = await account(ctx, "TEACHER"),
    foreign = await account(ctx, "TEACHER");
  const title = crypto.randomUUID();
  const exam = await t.agent
    .post("/api/v1/teacher/exams/configuration")
    .set(t.headers)
    .send({
      exam: metadata(title),
      classIds: [],
      questions: [],
      pools: [],
      publish: true,
    });
  expect(exam.status).toBe(400);
  expect(exam.body.error.code).toBe("CLASS_REQUIRED");
  expect(await ctx.db.exam.count({ where: { teacherId: t.user.id } })).toBe(0);
  const bank = await ctx.db.questionBank.create({
    data: { title: "Essay bank", ownerTeacherId: t.user.id },
  });
  const essay = await ctx.db.question.create({
    data: { bankId: bank.id, type: "ESSAY", promptMarkdown: "Essay", tags: [] },
  });
  const quiz = await t.agent
    .post("/api/v1/teacher/quizzes/configuration")
    .set(t.headers)
    .send({
      quiz: { title },
      questions: [
        { questionId: essay.id, timeLimitSeconds: 20, basePoints: 100 },
      ],
    });
  expect(quiz.status).toBe(400);
  expect(quiz.body.error.code).toBe("QUIZ_INVALID_QUESTIONS");
  expect(await ctx.db.liveQuiz.count({ where: { teacherId: t.user.id } })).toBe(
    0,
  );
  const draft = await t.agent
    .post("/api/v1/teacher/exams/configuration")
    .set(t.headers)
    .send({ exam: metadata(title), classIds: [], questions: [], pools: [] });
  expect(draft.status).toBe(201);
  expect(draft.body.data.status).toBe("DRAFT");
  expect(
    (
      await foreign.agent
        .put(`/api/v1/teacher/exams/${draft.body.data.id}/configuration`)
        .set(foreign.headers)
        .send({ exam: metadata(), classIds: [], questions: [], pools: [] })
    ).status,
  ).toBe(404);
});

it("rolls back source type/filter/options edits that would break the last candidate of a published pool", async () => {
  const f = await examFixture(ctx);
  await ctx.db.question.update({
    where: { id: f.question.id },
    data: { difficulty: "EASY", tags: ["required"] },
  });
  const path = `/api/v1/teacher/questions/${f.question.id}`;
  await ctx.db.examQuestion.deleteMany({ where: { examId: f.exam.id } });
  await ctx.db.examQuestionPool.create({
    data: {
      examId: f.exam.id,
      questionBankId: f.bank.id,
      pickCount: 1,
      pointsEach: 2,
      difficultyFilter: "EASY",
      tagFilter: ["required"],
    },
  });
  const before = await ctx.db.question.findUniqueOrThrow({
    where: { id: f.question.id },
    include: { options: { orderBy: { orderIndex: "asc" } } },
  });
  for (const edit of [{ difficulty: "HARD" }, { tags: [] }]) {
    const r = await f.teacher.agent
      .patch(path)
      .set(f.teacher.headers)
      .send({ ...questionData("Must roll back"), ...edit });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("SOURCE_IN_USE");
    expect(
      await ctx.db.question.findUniqueOrThrow({
        where: { id: f.question.id },
        include: { options: { orderBy: { orderIndex: "asc" } } },
      }),
    ).toEqual(before);
  }
  expect(
    (
      await f.teacher.agent
        .patch(path)
        .set(f.teacher.headers)
        .send(questionData())
    ).status,
  ).toBe(200);
  const replacement = await ctx.db.question.create({
    data: {
      bankId: f.bank.id,
      type: "ESSAY",
      promptMarkdown: "Eligible spare",
      difficulty: "EASY",
      tags: ["required"],
    },
  });
  expect(
    (
      await f.teacher.agent
        .patch(path)
        .set(f.teacher.headers)
        .send({ ...questionData(), difficulty: "HARD" })
    ).status,
  ).toBe(200);
  expect(await ctx.db.question.count({ where: { id: replacement.id } })).toBe(
    1,
  );
});

it("keeps an objective Quiz source valid, rejects empty lobby config atomically and allows valid replacement", async () => {
  const f = await examFixture(ctx);
  const quiz = await f.teacher.agent
    .post("/api/v1/teacher/quizzes/configuration")
    .set(f.teacher.headers)
    .send({
      quiz: { title: "Protected Quiz" },
      questions: [
        { questionId: f.question.id, timeLimitSeconds: 20, basePoints: 100 },
      ],
    });
  expect(quiz.status).toBe(201);
  const quizId = quiz.body.data.id,
    qPath = `/api/v1/teacher/questions/${f.question.id}`;
  const before = await ctx.db.question.findUniqueOrThrow({
    where: { id: f.question.id },
    include: { options: true },
  });
  const invalid = await f.teacher.agent
    .patch(qPath)
    .set(f.teacher.headers)
    .send({
      type: "ESSAY",
      promptMarkdown: "Invalid change",
      defaultPoints: 1,
      options: [],
    });
  expect(invalid.status).toBe(409);
  expect(invalid.body.error.code).toBe("SOURCE_IN_USE");
  expect(
    await ctx.db.question.findUniqueOrThrow({
      where: { id: f.question.id },
      include: { options: true },
    }),
  ).toEqual(before);
  expect(
    (
      await f.teacher.agent
        .patch(qPath)
        .set(f.teacher.headers)
        .send(questionData("Valid objective edit"))
    ).status,
  ).toBe(200);
  const room = await createRoom(ctx.db, quizId, f.teacher.user.id);
  const quizBefore = await ctx.db.liveQuiz.findUniqueOrThrow({
    where: { id: quizId },
    include: { questions: true },
  });
  const clear = await f.teacher.agent
    .put(`/api/v1/teacher/quizzes/${quizId}/configuration`)
    .set(f.teacher.headers)
    .send({ quiz: { title: "Must roll back" }, questions: [] });
  expect(clear.status).toBe(400);
  expect(clear.body.error.code).toBe("QUIZ_INVALID_QUESTIONS");
  expect(
    await ctx.db.liveQuiz.findUniqueOrThrow({
      where: { id: quizId },
      include: { questions: true },
    }),
  ).toEqual(quizBefore);
  expect(
    (
      await f.teacher.agent
        .put(`/api/v1/teacher/quizzes/${quizId}/questions`)
        .set(f.teacher.headers)
        .send({ questions: [] })
    ).status,
  ).toBe(400);
  expect(
    (
      await f.teacher.agent
        .delete(`/api/v1/teacher/quizzes/${quizId}`)
        .set(f.teacher.headers)
    ).body.error.code,
  ).toBe("QUIZ_HAS_LOBBY");
  const valid = await f.teacher.agent
    .put(`/api/v1/teacher/quizzes/${quizId}/configuration`)
    .set(f.teacher.headers)
    .send({
      quiz: { title: "Valid Quiz update" },
      questions: [
        { questionId: f.question.id, timeLimitSeconds: 30, basePoints: 200 },
      ],
    });
  expect(valid.status).toBe(200);
  await joinRoom(ctx.db, room.id, f.student.user);
  await startRoom(ctx.db, room.id, f.teacher.user);
  const snapshot = await ctx.db.liveRoomQuestion.findMany({
    where: { roomId: room.id },
  });
  expect(
    (
      await f.teacher.agent
        .delete(`/api/v1/teacher/quizzes/${quizId}`)
        .set(f.teacher.headers)
    ).status,
  ).toBe(204);
  expect(
    (
      await f.teacher.agent
        .put(`/api/v1/teacher/quizzes/${quizId}/configuration`)
        .set(f.teacher.headers)
        .send({ quiz: { title: "Archived edit" }, questions: [] })
    ).body.error.code,
  ).toBe("QUIZ_ARCHIVED");
  await expect(
    createRoom(ctx.db, quizId, f.teacher.user.id),
  ).rejects.toMatchObject({ code: "QUIZ_ARCHIVED" });
  expect(
    await ctx.db.liveRoomQuestion.findMany({ where: { roomId: room.id } }),
  ).toEqual(snapshot);
});

it("refuses a room for an empty or legacy-invalid Quiz before any room is persisted", async () => {
  const f = await examFixture(ctx);
  const quiz = await ctx.db.liveQuiz.create({
    data: { teacherId: f.teacher.user.id, title: "Empty draft" },
  });
  await expect(
    createRoom(ctx.db, quiz.id, f.teacher.user.id),
  ).rejects.toMatchObject({ code: "QUIZ_INVALID_QUESTIONS" });
  expect(await ctx.db.quizRoom.count({ where: { quizId: quiz.id } })).toBe(0);
  await ctx.db.liveQuizQuestion.create({
    data: {
      quizId: quiz.id,
      questionId: f.question.id,
      orderIndex: 0,
      timeLimitSeconds: 20,
      basePoints: 100,
    },
  });
  await ctx.db.question.update({
    where: { id: f.question.id },
    data: { isArchived: true },
  });
  await expect(
    createRoom(ctx.db, quiz.id, f.teacher.user.id),
  ).rejects.toMatchObject({ code: "QUIZ_INVALID_QUESTIONS" });
  expect(await ctx.db.quizRoom.count({ where: { quizId: quiz.id } })).toBe(0);
});

it("serializes simultaneous filter edits so a published pool retains one eligible candidate", async () => {
  const f = await examFixture(ctx);
  await ctx.db.question.update({
    where: { id: f.question.id },
    data: { difficulty: "EASY", tags: ["required"] },
  });
  const spare = await ctx.db.question.create({
    data: {
      bankId: f.bank.id,
      type: "ESSAY",
      promptMarkdown: "Spare",
      difficulty: "EASY",
      tags: ["required"],
    },
  });
  expect(
    (
      await f.teacher.agent
        .put(`/api/v1/teacher/exams/${f.exam.id}/configuration`)
        .set(f.teacher.headers)
        .send({
          exam: metadata(),
          classIds: [f.class.id],
          questions: [],
          pools: [
            {
              questionBankId: f.bank.id,
              pickCount: 1,
              pointsEach: 1,
              difficultyFilter: "EASY",
            },
          ],
        })
    ).status,
  ).toBe(200);
  const responses = await Promise.all(
    [f.question.id, spare.id].map((id) =>
      f.teacher.agent
        .patch(`/api/v1/teacher/questions/${id}`)
        .set(f.teacher.headers)
        .send({ ...questionData(), difficulty: "HARD" }),
    ),
  );
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(
    await ctx.db.question.count({
      where: { bankId: f.bank.id, difficulty: "EASY", isArchived: false },
    }),
  ).toBe(1);
});

it("serializes adding a Quiz source against changing it to ESSAY without leaving an invalid definition", async () => {
  const f = await examFixture(ctx);
  const quiz = await ctx.db.liveQuiz.create({
    data: { teacherId: f.teacher.user.id, title: "Racing source" },
  });
  const [attach, change] = await Promise.all([
    f.teacher.agent
      .put(`/api/v1/teacher/quizzes/${quiz.id}/questions`)
      .set(f.teacher.headers)
      .send({
        questions: [
          { questionId: f.question.id, timeLimitSeconds: 20, basePoints: 100 },
        ],
      }),
    f.teacher.agent
      .patch(`/api/v1/teacher/questions/${f.question.id}`)
      .set(f.teacher.headers)
      .send({
        type: "ESSAY",
        promptMarkdown: "Changed",
        defaultPoints: 1,
        options: [],
      }),
  ]);
  expect([attach.status, change.status].filter((s) => s === 200)).toHaveLength(
    1,
  );
  expect(
    [attach.status, change.status].some((s) => s === 400 || s === 409),
  ).toBe(true);
  const sources = await ctx.db.liveQuizQuestion.findMany({
    where: { quizId: quiz.id },
    include: { question: true },
  });
  expect(sources.every((q) => q.question.type !== "ESSAY")).toBe(true);
});
