import { afterAll, beforeAll, expect, it } from "vitest";
import request from "supertest";
import { Client } from "pg";
import { createServer } from "node:http";
import { io as connect, type Socket } from "socket.io-client";
import { account, testContext, url } from "./helpers.js";
import { lockAdminMutations } from "../src/modules/admin/lock.js";
import { createRealtime } from "../src/sockets/server.js";

let ctx: ReturnType<typeof testContext>;
let admin: Awaited<ReturnType<typeof account>>;
let realtime: ReturnType<typeof createRealtime>;
let socketUrl: string;
const sockets: Socket[] = [];
beforeAll(async () => {
  ctx = testContext();
  admin = await account(ctx, "ADMIN");
  const server = createServer(ctx.app);
  realtime = createRealtime(server, ctx.app, ctx.db, ctx.config);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No server address");
  socketUrl = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await realtime?.close();
  await ctx?.cleanup();
});
function patch(
  id: string,
  action: "role" | "status",
  value: string,
  actor = admin,
) {
  return actor.agent
    .patch(`/api/v1/admin/users/${id}/${action}`)
    .set(actor.headers)
    .send({ [action]: value });
}
async function socket(cookie: string) {
  const s = connect(socketUrl, {
    transports: ["websocket"],
    extraHeaders: { Origin: "http://localhost:5173", Cookie: cookie },
    reconnection: false,
    forceNew: true,
  });
  sockets.push(s);
  await new Promise<void>((resolve, reject) => {
    s.once("connect", resolve);
    s.once("connect_error", reject);
  });
  return s;
}
async function login(email: string) {
  const agent = request.agent(ctx.app);
  const csrf = await agent.get("/api/v1/auth/csrf");
  return agent
    .post("/api/v1/auth/login")
    .set("Origin", "http://localhost:5173")
    .set("X-CSRF-Token", csrf.body.data.token)
    .send({ email, password: "test-password-123" });
}
it("creates Teacher/Student with the existing validation and duplicate/password policy", async () => {
  for (const role of ["TEACHER", "STUDENT"]) {
    const data = {
      email: `${crypto.randomUUID()}@test.local`,
      fullName: "Admin regression",
      password: "test-password-123",
      role,
    };
    const created = await admin.agent
      .post("/api/v1/admin/users")
      .set(admin.headers)
      .send(data);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      email: data.email,
      role,
      status: "ACTIVE",
    });
    expect(created.body.data).not.toHaveProperty("passwordHash");
    expect((await login(data.email)).status).toBe(200);
    const duplicate = await admin.agent
      .post("/api/v1/admin/users")
      .set(admin.headers)
      .send(data);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("DUPLICATE");
    for (const invalid of [
      { password: "short" },
      { email: "invalid" },
      { fullName: "x" },
      { role: "OWNER" },
    ]) {
      expect(
        (
          await admin.agent
            .post("/api/v1/admin/users")
            .set(admin.headers)
            .send({ ...data, ...invalid })
        ).status,
      ).toBe(400);
    }
  }
});
it("locks/unlocks persisted status, destroys a checked locked session and disconnects sockets", async () => {
  const target = await account(ctx, "STUDENT");
  const live = await socket(target.cookie);
  const disconnected = new Promise<string>((resolve) =>
    live.once("disconnect", resolve),
  );
  expect((await patch(target.user.id, "status", "LOCKED")).status).toBe(200);
  expect(await disconnected).toBe("io server disconnect");
  expect(
    await ctx.db.user.findUnique({ where: { id: target.user.id } }),
  ).toMatchObject({ status: "LOCKED" });
  const session = await target.agent.get("/api/v1/auth/me");
  expect(session.status).toBe(401);
  expect(session.body.error.code).toBe("ACCOUNT_LOCKED");
  const rejected = await login(target.user.email);
  expect(rejected.status).toBe(403);
  expect(rejected.body.error.code).toBe("ACCOUNT_LOCKED");
  expect((await patch(target.user.id, "status", "ACTIVE")).status).toBe(200);
  expect(
    await ctx.db.user.findUnique({ where: { id: target.user.id } }),
  ).toMatchObject({ status: "ACTIVE" });
  expect((await target.agent.get("/api/v1/auth/me")).status).toBe(401);
  expect((await login(target.user.email)).status).toBe(200);
});
it("changes Student ↔ Teacher, persists role and reauthorizes existing sessions", async () => {
  const target = await account(ctx, "STUDENT");
  const live = await socket(target.cookie);
  const disconnected = new Promise<string>((resolve) =>
    live.once("disconnect", resolve),
  );
  expect((await patch(target.user.id, "role", "TEACHER")).status).toBe(200);
  expect(await disconnected).toBe("io server disconnect");
  expect((await target.agent.get("/api/v1/auth/me")).body.data.role).toBe(
    "TEACHER",
  );
  expect((await target.agent.get("/api/v1/teacher/classes")).status).toBe(200);
  expect((await patch(target.user.id, "role", "STUDENT")).status).toBe(200);
  expect((await target.agent.get("/api/v1/teacher/classes")).status).toBe(403);
  const list = await admin.agent.get(
    `/api/v1/admin/users?search=${target.user.email}`,
  );
  expect(list.body.data.items).toEqual([
    expect.objectContaining({
      id: target.user.id,
      role: "STUDENT",
      status: "ACTIVE",
    }),
  ]);
  expect((await patch(target.user.id, "role", "OWNER")).status).toBe(400);
  expect((await patch(target.user.id, "status", "DISABLED")).status).toBe(400);
  expect((await patch(crypto.randomUUID(), "role", "TEACHER")).status).toBe(
    404,
  );
});
it("keeps self/dependency guards and releases locks after rejected transactions", async () => {
  for (const [action, value] of [
    ["status", "LOCKED"],
    ["status", "ACTIVE"],
    ["role", "STUDENT"],
  ] as const) {
    const self = await patch(admin.user.id, action, value);
    expect(self.status).toBe(409);
    expect(self.body.error.code).toBe("CANNOT_MODIFY_SELF");
  }
  const teacher = await account(ctx, "TEACHER");
  await ctx.db.class.create({
    data: { name: "Dependency guard", teacherId: teacher.user.id },
  });
  const blocked = await patch(teacher.user.id, "role", "STUDENT");
  expect(blocked.status).toBe(409);
  expect(blocked.body.error.code).toBe("ROLE_HAS_DEPENDENCIES");
  expect((await patch(teacher.user.id, "role", "TEACHER")).status).toBe(200);
  expect((await patch(teacher.user.id, "status", "LOCKED")).status).toBe(200);
  expect((await patch(teacher.user.id, "status", "ACTIVE")).status).toBe(200);
});
it("blocks Teacher, Student, anonymous and invalid Origin/CSRF direct Admin mutations", async () => {
  for (const role of ["TEACHER", "STUDENT"] as const) {
    const actor = await account(ctx, role);
    expect((await actor.agent.get("/api/v1/admin/users")).status).toBe(403);
    expect(
      (
        await actor.agent
          .post("/api/v1/admin/users")
          .set(actor.headers)
          .send({})
      ).status,
    ).toBe(403);
    for (const [action, value] of [
      ["role", "TEACHER"],
      ["status", "LOCKED"],
      ["status", "ACTIVE"],
    ] as const) {
      expect((await patch(admin.user.id, action, value, actor)).status).toBe(
        403,
      );
    }
  }
  const anonymous = request.agent(ctx.app);
  const csrf = await anonymous.get("/api/v1/auth/csrf");
  expect(
    (
      await anonymous
        .patch(`/api/v1/admin/users/${admin.user.id}/status`)
        .set("Origin", "http://localhost:5173")
        .set("X-CSRF-Token", csrf.body.data.token)
        .send({ status: "LOCKED" })
    ).status,
  ).toBe(401);
  for (const headers of [
    { Origin: "http://localhost:5173" },
    { ...admin.headers, Origin: "https://foreign.invalid" },
    { ...admin.headers, "X-CSRF-Token": "invalid" },
  ]) {
    expect(
      (
        await admin.agent
          .patch(`/api/v1/admin/users/${admin.user.id}/role`)
          .set(headers)
          .send({ role: "STUDENT" })
      ).status,
    ).toBe(403);
  }
  expect(
    await ctx.db.user.findUnique({ where: { id: admin.user.id } }),
  ).toMatchObject({ role: "ADMIN", status: "ACTIVE" });
});
it.each([false, true])(
  "holds the advisory lock across statements and releases on rollback=%s",
  async (rollback) => {
    const observer = new Client({ connectionString: url });
    await observer.connect();
    try {
      const transaction = ctx.db.$transaction(async (tx) => {
        await lockAdminMutations(tx);
        const locks = await tx.$queryRaw<
          { held: boolean }[]
        >`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid = pg_backend_pid() AND locktype = 'advisory' AND objid = 904201 AND granted) AS held`;
        expect(locks[0]?.held).toBe(true);
        await tx.user.count();
        expect(
          (
            await observer.query(
              "SELECT pg_try_advisory_xact_lock(904201) AS acquired",
            )
          ).rows[0].acquired,
        ).toBe(false);
        if (rollback) throw new Error("intentional rollback");
      });
      if (rollback)
        await expect(transaction).rejects.toThrow("intentional rollback");
      else await transaction;
      expect(
        (
          await observer.query(
            "SELECT pg_try_advisory_xact_lock(904201) AS acquired",
          )
        ).rows[0].acquired,
      ).toBe(true);
    } finally {
      await observer.end();
    }
  },
);
// A separate connection holds the production key. Observe actual PostgreSQL waiters,
// then release in a known order; no scheduling sleeps or mocked transaction clients.
async function queued(
  operations: (() => ReturnType<typeof patch>)[],
  beforeRelease?: (client: Client) => Promise<void>,
) {
  const holder = new Client({ connectionString: url });
  await holder.connect();
  const pending: Promise<Awaited<ReturnType<typeof patch>>>[] = [];
  try {
    await holder.query("BEGIN");
    await holder.query("SELECT pg_advisory_xact_lock(904201)");
    for (const operation of operations) {
      pending.push(operation().then((r) => r));
      await expect
        .poll(async () =>
          Number(
            (
              await holder.query(
                "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND objid=904201 AND NOT granted",
              )
            ).rows[0].count,
          ),
        )
        .toBe(pending.length);
    }
    await beforeRelease?.(holder);
    await holder.query("COMMIT");
    return await Promise.all(pending);
  } finally {
    await holder.query("ROLLBACK");
    await holder.end();
    await Promise.allSettled(pending);
  }
}
it("serializes concurrent role and lock/unlock operations on the same user", async () => {
  const target = await account(ctx, "STUDENT");
  const responses = await queued([
    () => patch(target.user.id, "role", "TEACHER"),
    () => patch(target.user.id, "role", "STUDENT"),
    () => patch(target.user.id, "status", "LOCKED"),
    () => patch(target.user.id, "status", "ACTIVE"),
  ]);
  expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200]);
  expect(responses.map((r) => [r.body.data.role, r.body.data.status])).toEqual([
    ["TEACHER", "ACTIVE"],
    ["STUDENT", "ACTIVE"],
    ["STUDENT", "LOCKED"],
    ["STUDENT", "ACTIVE"],
  ]);
  expect(
    await ctx.db.user.findUnique({ where: { id: target.user.id } }),
  ).toMatchObject({ role: "STUDENT", status: "ACTIVE" });
});
it.each(["role", "status"] as const)(
  "rechecks an actor after concurrent %s revocation while waiting for the lock",
  async (action) => {
    const actor = await account(ctx, "ADMIN"),
      target = await account(ctx, "STUDENT");
    const [revoked, rejected] = await queued([
      () =>
        patch(actor.user.id, action, action === "role" ? "TEACHER" : "LOCKED"),
      () =>
        patch(
          target.user.id,
          action,
          action === "role" ? "TEACHER" : "LOCKED",
          actor,
        ),
    ]);
    expect(revoked?.status).toBe(200);
    expect(rejected?.status).toBe(403);
    expect(rejected?.body.error.code).toBe("FORBIDDEN");
    expect(
      await ctx.db.user.findUnique({ where: { id: target.user.id } }),
    ).toMatchObject({ role: "STUDENT", status: "ACTIVE" });
  },
);
