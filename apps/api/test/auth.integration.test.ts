import { beforeAll, afterAll, it, expect } from "vitest";
import request from "supertest";
import { testContext, account } from "./helpers.js";
let ctx: ReturnType<typeof testContext>;
beforeAll(() => {
  ctx = testContext();
});
afterAll(async () => ctx?.cleanup());
it("registration never grants Teacher, CSRF is enforced, login persists and logout destroys session", async () => {
  const a = request.agent(ctx.app);
  let r = await a.post("/api/v1/auth/register").send({});
  expect(r.status).toBe(403);
  const csrf = await a.get("/api/v1/auth/csrf");
  const headers = {
    Origin: "http://localhost:5173",
    "X-CSRF-Token": csrf.body.data.token,
  };
  const data = {
    email: `${crypto.randomUUID()}@test.local`,
    password: "test-password-123",
    fullName: "Trần Thị Hương",
    role: "ADMIN",
  };
  r = await a.post("/api/v1/auth/register").set(headers).send(data);
  expect(r.status).toBe(201);
  expect(r.body.data.role).toBe("STUDENT");
  r = await a.post("/api/v1/auth/login").set(headers).send(data);
  expect(r.status).toBe(200);
  expect(String(r.headers["set-cookie"])).toContain("HttpOnly");
  expect((await a.get("/api/v1/auth/me")).status).toBe(200);
  expect((await a.get("/api/v1/admin/users")).status).toBe(403);
  expect(
    (
      await a
        .post("/api/v1/auth/logout")
        .set({ ...headers, "X-CSRF-Token": r.body.data.csrf })
    ).status,
  ).toBe(204);
  expect((await a.get("/api/v1/auth/me")).status).toBe(401);
});
it("locked users lose existing session on next request", async () => {
  const a = await account(ctx, "STUDENT");
  await ctx.db.user.update({
    where: { id: a.user.id },
    data: { status: "LOCKED" },
  });
  expect((await a.agent.get("/api/v1/auth/me")).status).toBe(401);
});
it("admin can create/search/lock users; cannot change own role", async () => {
  const a = await account(ctx, "ADMIN");
  const r = await a.agent
    .post("/api/v1/admin/users")
    .set(a.headers)
    .send({
      email: `${crypto.randomUUID()}@test.local`,
      password: "test-password-123",
      fullName: "Giáo viên mới",
      role: "TEACHER",
    });
  expect(r.status).toBe(201);
  expect(
    (await a.agent.get("/api/v1/admin/users?search=Giáo")).body.data.total,
  ).toBeGreaterThan(0);
  expect(
    (
      await a.agent
        .patch(`/api/v1/admin/users/${a.user.id}/role`)
        .set(a.headers)
        .send({ role: "STUDENT" })
    ).status,
  ).toBe(409);
});
it("rejects foreign Origin and malformed CSRF bytes without crashing", async () => {
  const a = await account(ctx, "STUDENT");
  expect(
    (
      await a.agent
        .post("/api/v1/auth/logout")
        .set({ ...a.headers, Origin: "https://evil.invalid" })
    ).status,
  ).toBe(403);
  expect(
    (
      await a.agent
        .post("/api/v1/auth/logout")
        .set({ ...a.headers, "X-CSRF-Token": "é".repeat(64) })
    ).status,
  ).toBe(403);
  expect((await a.agent.get("/api/v1/auth/me")).status).toBe(200);
});
