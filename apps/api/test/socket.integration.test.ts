import { beforeAll, afterAll, it, expect } from "vitest";
import { createServer } from "node:http";
import { io as client, type Socket } from "socket.io-client";
import type { ClientEvents, ServerEvents, MonitorSnapshot } from "@exam/shared";
import { testContext } from "./helpers.js";
import { examFixture } from "./fixture.js";
import { createRealtime } from "../src/sockets/server.js";
let ctx: ReturnType<typeof testContext>,
  realtime: ReturnType<typeof createRealtime>,
  url: string;
const sockets: Socket<ServerEvents, ClientEvents>[] = [];
beforeAll(async () => {
  ctx = testContext();
  const server = createServer(ctx.app);
  realtime = createRealtime(server, ctx.app, ctx.db, ctx.config, 80);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  url = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await realtime.close();
  await ctx.cleanup();
});
function connect(cookie = "") {
  const s = client(url, {
    transports: ["websocket"],
    extraHeaders: { Origin: "http://localhost:5173", Cookie: cookie },
    forceNew: true,
    reconnection: false,
  }) as Socket<ServerEvents, ClientEvents>;
  sockets.push(s);
  return s;
}
it("rejects unauthenticated sockets", async () => {
  const s = connect();
  const error = await new Promise<Error>((r) => s.once("connect_error", r));
  expect(error.message).toBe("UNAUTHENTICATED");
});
it("changes exam presence on join/disconnect/reconnect and sends sanitized monitor", async () => {
  const f = await examFixture(ctx);
  const start = await f.student.agent
    .post(`/api/v1/student/exams/${f.exam.id}/attempts`)
    .set(f.student.headers);
  const id = start.body.data.id;
  const teacher = connect(f.teacher.cookie);
  await new Promise<void>((r) => teacher.once("connect", r));
  const states: MonitorSnapshot[] = [];
  teacher.on("exam:monitor:snapshot", (s) => states.push(s));
  await teacher.emitWithAck("exam:monitor:join", { examId: f.exam.id });
  let student = connect(f.student.cookie);
  await new Promise<void>((r) => student.once("connect", r));
  await student.emitWithAck("exam:attempt:presence:join", { attemptId: id });
  await expect.poll(() => states.at(-1)?.rows[0]?.status).toBe("IN_PROGRESS");
  expect(JSON.stringify(states)).not.toMatch(/answerJson|isCorrect/);
  student.disconnect();
  await expect.poll(() => states.at(-1)?.rows[0]?.status).toBe("DISCONNECTED");
  student = connect(f.student.cookie);
  await new Promise<void>((r) => student.once("connect", r));
  await student.emitWithAck("exam:attempt:presence:join", { attemptId: id });
  await expect.poll(() => states.at(-1)?.rows[0]?.status).toBe("IN_PROGRESS");
  await f.student.agent
    .post(`/api/v1/student/attempts/${id}/submit`)
    .set(f.student.headers);
  await expect.poll(() => states.at(-1)?.rows[0]?.status).toBe("SUBMITTED");
});
