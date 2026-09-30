import { beforeAll, afterAll, it, expect } from "vitest";
import { createServer } from "node:http";
import { io as client, type Socket } from "socket.io-client";
import type { ClientEvents, ServerEvents, QuizState } from "@exam/shared";
import { testContext, account } from "./helpers.js";
import { examFixture } from "./fixture.js";
import { createRealtime } from "../src/sockets/server.js";
import { closeExpiredQuestions } from "../src/modules/live-quiz/service.js";
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
