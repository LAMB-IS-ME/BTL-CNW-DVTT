import { beforeAll, afterAll, it, expect } from "vitest";
import { createServer } from "node:http";
import { io as client, type Socket } from "socket.io-client";
import type { ClientEvents, ServerEvents, QuizState } from "@exam/shared";
import { testContext, account } from "./helpers.js";
import { examFixture } from "./fixture.js";
import { createRealtime } from "../src/sockets/server.js";
import {
  closeExpiredQuestions,
  quizEvents,
} from "../src/modules/live-quiz/service.js";
let ctx: ReturnType<typeof testContext>,
  rt: ReturnType<typeof createRealtime>,
  url: string;
const sockets: Socket<ServerEvents, ClientEvents>[] = [];
beforeAll(async () => {
  ctx = testContext();
  const server = createServer(ctx.app);
  rt = createRealtime(server, ctx.app, ctx.db, ctx.config, 50);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const a = server.address();
  if (!a || typeof a === "string") throw new Error("no address");
  url = `http://127.0.0.1:${a.port}`;
});
afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await new Promise((r) => setTimeout(r, 100));
  await rt.close();
  await ctx.cleanup();
});
async function connect(cookie: string) {
  const s = client(url, {
    transports: ["websocket"],
    extraHeaders: { Origin: "http://localhost:5173", Cookie: cookie },
    forceNew: true,
    reconnection: false,
  }) as Socket<ServerEvents, ClientEvents>;
  sockets.push(s);
  await new Promise<void>((resolve, reject) => {
    s.once("connect", resolve);
    s.once("connect_error", reject);
  });
  return s;
}
it("runs authenticated lobby/start/first-answer/duplicate/deadline/reveal/next/final and reconnect recovery", async () => {
  const f = await examFixture(ctx),
    second = await account(ctx, "STUDENT");
  const quiz = await f.teacher.agent
    .post("/api/v1/teacher/quizzes")
    .set(f.teacher.headers)
    .send({ title: "Live Quiz test" });
  expect(quiz.status).toBe(201);
  const quizId = quiz.body.data.id;
  expect(
    (
      await f.teacher.agent
        .put(`/api/v1/teacher/quizzes/${quizId}/questions`)
        .set(f.teacher.headers)
        .send({
          questions: [
            {
              questionId: f.question.id,
              timeLimitSeconds: 30,
              basePoints: 1000,
            },
            {
              questionId: f.question.id,
              timeLimitSeconds: 30,
              basePoints: 1000,
            },
          ],
        })
    ).status,
  ).toBe(200);
  const room = await f.teacher.agent
    .post(`/api/v1/teacher/quizzes/${quizId}/rooms`)
    .set(f.teacher.headers);
  expect(room.status).toBe(201);
  const roomId = room.body.data.id;
  const host = await connect(f.teacher.cookie),
    student = await connect(f.student.cookie),
    s2 = await connect(second.cookie);
  const updates: QuizState[] = [];
  host.on("quiz:state", (s) => updates.push(s));
  await host.emitWithAck("quiz:room:join", { roomId });
  await student.emitWithAck("quiz:room:join", { code: room.body.data.code });
  await student.emitWithAck("quiz:room:join", { roomId });
  await s2.emitWithAck("quiz:room:join", { roomId });
  await expect.poll(() => updates.at(-1)?.participants.length).toBe(2);
  expect(
    await student.emitWithAck("quiz:host:start", { roomId }),
  ).toHaveProperty("error");
  const started = await host.emitWithAck("quiz:host:start", { roomId });
  expect(started).toHaveProperty("data");
  if ("error" in started) throw new Error(started.error.message);
  const q = started.data.question!;
  expect(JSON.stringify(started.data)).not.toMatch(
    /isCorrect|Secret explanation/,
  );
  expect(started.data.reveal).toBeNull();
  expect(started.data.leaderboard).toEqual([]);
  await ctx.db.question.update({
    where: { id: f.question.id },
    data: { promptMarkdown: "Changed after Start" },
  });
  const results = await Promise.all([
    student.emitWithAck("quiz:answer", {
      roomId,
      questionId: q.id,
      selectedOptionIds: [f.question.options[0]!.id],
    }),
    student.emitWithAck("quiz:answer", {
      roomId,
      questionId: q.id,
      selectedOptionIds: [f.question.options[0]!.id],
    }),
  ]);
  expect(results.filter((r) => "data" in r)).toHaveLength(1);
  expect(results.find((r) => "error" in r)).toMatchObject({
    error: { code: "QUIZ_DUPLICATE_ANSWER" },
  });
  student.disconnect();
  const reconnect = await connect(f.student.cookie);
  const recovered = await reconnect.emitWithAck("quiz:room:join", { roomId });
  if ("error" in recovered) throw new Error(recovered.error.message);
  expect(recovered.data.question?.promptMarkdown).toBe("Original prompt");
  expect(recovered.data.ownAnswer).toEqual([f.question.options[0]!.id]);
  await ctx.db.quizRoom.update({
    where: { id: roomId },
    data: { questionClosesAt: new Date(Date.now() - 1) },
  });
  expect(
    await s2.emitWithAck("quiz:answer", {
      roomId,
      questionId: q.id,
      selectedOptionIds: [f.question.options[0]!.id],
    }),
  ).toMatchObject({ error: { code: "QUIZ_ANSWER_TOO_LATE" } });
  await expect.poll(() => updates.at(-1)?.reveal !== null).toBe(true);
  const next = await host.emitWithAck("quiz:host:next", { roomId });
  if ("error" in next) throw new Error(next.error.message);
  expect(next.data.currentIndex).toBe(1);
  expect(next.data.reveal).toBeNull();
  await ctx.db.quizRoom.update({
    where: { id: roomId },
    data: { questionClosesAt: new Date(Date.now() - 1) },
  });
  await closeExpiredQuestions(ctx.db);
  await expect.poll(() => updates.at(-1)?.status).toBe("FINISHED");
  expect(updates.at(-1)?.leaderboard[0]?.score).toBeGreaterThanOrEqual(1000);
  expect(
    await ctx.db.quizAnswer.count({ where: { roomQuestionId: q.id } }),
  ).toBe(1);
});
it("rejects essay questions in live quiz builder", async () => {
  const f = await examFixture(ctx, true);
  const q = await f.teacher.agent
    .post("/api/v1/teacher/quizzes")
    .set(f.teacher.headers)
    .send({ title: "Essay rejected" });
  expect(
    (
      await f.teacher.agent
        .put(`/api/v1/teacher/quizzes/${q.body.data.id}/questions`)
        .set(f.teacher.headers)
        .send({
          questions: [
            { questionId: f.essay!.id, timeLimitSeconds: 20, basePoints: 100 },
          ],
        })
    ).body.error.code,
  ).toBe("QUIZ_INVALID_QUESTIONS");
});

it("keeps ownership, join eligibility and progression guards on the real transport", async () => {
  const f = await examFixture(ctx);
  const foreign = await account(ctx, "TEACHER");
  const late = await account(ctx, "STUDENT");
  const quiz = await f.teacher.agent
    .post("/api/v1/teacher/quizzes")
    .set(f.teacher.headers)
    .send({ title: "Live Quiz ownership audit" });
  const configured = await f.teacher.agent
    .put(`/api/v1/teacher/quizzes/${quiz.body.data.id}/questions`)
    .set(f.teacher.headers)
    .send({
      questions: [
        { questionId: f.question.id, timeLimitSeconds: 30, basePoints: 1000 },
      ],
    });
  expect(configured.status).toBe(200);
  const room = await f.teacher.agent
    .post(`/api/v1/teacher/quizzes/${quiz.body.data.id}/rooms`)
    .set(f.teacher.headers);
  const roomId = room.body.data.id;
  const host = await connect(f.teacher.cookie);
  const student = await connect(f.student.cookie);
  const stranger = await connect(foreign.cookie);
  const lateStudent = await connect(late.cookie);
  expect(await host.emitWithAck("quiz:host:start", { roomId })).toMatchObject({
    error: { code: "QUIZ_NO_PARTICIPANTS" },
  });
  expect(
    await stranger.emitWithAck("quiz:room:join", { roomId }),
  ).toHaveProperty("error");
  expect(
    await stranger.emitWithAck("quiz:host:start", { roomId }),
  ).toHaveProperty("error");
  expect(
    (await foreign.agent.get(`/api/v1/teacher/quiz-rooms/${roomId}`)).status,
  ).toBe(403);
  await host.emitWithAck("quiz:room:join", { roomId });
  await student.emitWithAck("quiz:room:join", { roomId });
  const repeat = await student.emitWithAck("quiz:room:join", { roomId });
  if ("error" in repeat) throw new Error(repeat.error.message);
  expect(repeat.data.participants).toHaveLength(1);
  const started = await host.emitWithAck("quiz:host:start", { roomId });
  if ("error" in started) throw new Error(started.error.message);
  expect(await host.emitWithAck("quiz:host:start", { roomId })).toMatchObject({
    error: { code: "QUIZ_ALREADY_STARTED" },
  });
  expect(await host.emitWithAck("quiz:host:next", { roomId })).toMatchObject({
    error: { code: "QUIZ_QUESTION_NOT_CLOSED" },
  });
  expect(
    await lateStudent.emitWithAck("quiz:room:join", { roomId }),
  ).toMatchObject({ error: { code: "QUIZ_ROOM_NOT_JOINABLE" } });
  expect(
    await lateStudent.emitWithAck("quiz:answer", {
      roomId,
      questionId: started.data.question!.id,
      selectedOptionIds: [f.question.options[0]!.id],
    }),
  ).toMatchObject({ error: { code: "QUIZ_NOT_JOINED" } });
  expect(
    await stranger.emitWithAck("quiz:host:next", { roomId }),
  ).toHaveProperty("error");
  const answered = await student.emitWithAck("quiz:answer", {
    roomId,
    questionId: started.data.question!.id,
    selectedOptionIds: [f.question.options[0]!.id],
  });
  expect(answered).toHaveProperty("data.accepted", true);
  const final = await student.emitWithAck("quiz:room:join", { roomId });
  if ("error" in final) throw new Error(final.error.message);
  expect(final.data.status).toBe("FINISHED");
  expect(final.data.ownAnswer).toEqual([f.question.options[0]!.id]);
  expect(
    await lateStudent.emitWithAck("quiz:room:join", { roomId }),
  ).toMatchObject({ error: { code: "QUIZ_ROOM_NOT_JOINABLE" } });
});

it("does not leave a phantom online participant when the transport closes during a blocked join", async () => {
  const f = await examFixture(ctx);
  const quiz = await ctx.db.liveQuiz.create({
    data: { teacherId: f.teacher.user.id, title: "Interrupted join" },
  });
  const created = await f.teacher.agent
    .post(`/api/v1/teacher/quizzes/${quiz.id}/rooms`)
    .set(f.teacher.headers);
  const roomId: string = created.body.data.id;
  const student = await connect(f.student.cookie);
  let release!: () => void;
  let locked!: () => void;
  const ready = new Promise<void>((r) => {
    locked = r;
  });
  const hold = new Promise<void>((r) => {
    release = r;
  });
  const transaction = ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "QuizRoom" WHERE id=${roomId}::uuid FOR UPDATE`;
    locked();
    await hold;
  });
  await ready;
  try {
    student.emit("quiz:room:join", { roomId }, () => {});
    await expect
      .poll(async () => {
        const rows = await ctx.db.$queryRaw<
          { count: bigint }[]
        >`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%QuizRoom%'`;
        return Number(rows[0]!.count);
      })
      .toBeGreaterThan(0);
    student.disconnect();
  } finally {
    release();
    await transaction;
  }
  await expect
    .poll(() => ctx.db.quizParticipant.count({ where: { roomId } }))
    .toBe(1);
  await expect
    .poll(() =>
      ctx.db.quizParticipant.count({ where: { roomId, isConnected: true } }),
    )
    .toBe(0);
  // A later valid join restores the same member; another tab keeps it online.
  const first = await connect(f.student.cookie),
    second = await connect(f.student.cookie);
  await first.emitWithAck("quiz:room:join", { roomId });
  await second.emitWithAck("quiz:room:join", { roomId });
  await first.emitWithAck("quiz:room:leave", { roomId });
  expect(
    await ctx.db.quizParticipant.count({
      where: { roomId, isConnected: true },
    }),
  ).toBe(1);
  await second.emitWithAck("quiz:room:leave", { roomId });
  expect(
    await ctx.db.quizParticipant.count({
      where: { roomId, isConnected: true },
    }),
  ).toBe(0);
  expect(await ctx.db.quizParticipant.count({ where: { roomId } })).toBe(1);
});

it("serializes two near-simultaneous tab disconnects without duplicate offline events", async () => {
  const f = await examFixture(ctx);
  const quiz = await ctx.db.liveQuiz.create({
    data: { teacherId: f.teacher.user.id, title: "Two tabs disconnect" },
  });
  const created = await f.teacher.agent
    .post(`/api/v1/teacher/quizzes/${quiz.id}/rooms`)
    .set(f.teacher.headers);
  const roomId: string = created.body.data.id;
  const a = await connect(f.student.cookie),
    b = await connect(f.student.cookie);
  await Promise.all([
    a.emitWithAck("quiz:room:join", { roomId }),
    b.emitWithAck("quiz:room:join", { roomId }),
  ]);
  expect(await rt.io.in(`quiz-room:${roomId}`).fetchSockets()).toHaveLength(2);
  expect(
    await ctx.db.quizParticipant.count({
      where: { roomId, isConnected: true },
    }),
  ).toBe(1);
  let offlineEvents = 0;
  const changed = (id: string, kind: string) => {
    if (id === roomId && kind === "left") offlineEvents++;
  };
  quizEvents.on("changed", changed);
  try {
    a.disconnect();
    b.disconnect();
    await expect
      .poll(
        async () =>
          (await rt.io.in(`quiz-room:${roomId}`).fetchSockets()).length,
      )
      .toBe(0);
    await expect
      .poll(() =>
        ctx.db.quizParticipant.count({ where: { roomId, isConnected: true } }),
      )
      .toBe(0);
    expect(offlineEvents).toBe(1);
    expect(await ctx.db.quizParticipant.count({ where: { roomId } })).toBe(1);
    const recovered = await connect(f.student.cookie);
    const state = await recovered.emitWithAck("quiz:room:join", { roomId });
    if ("error" in state) throw new Error(state.error.message);
    expect(state.data.participants).toHaveLength(1);
    expect(state.data.participants[0]!.isConnected).toBe(true);
    expect(await rt.io.in(`quiz-room:${roomId}`).fetchSockets()).toHaveLength(
      1,
    );
  } finally {
    quizEvents.off("changed", changed);
  }
});
