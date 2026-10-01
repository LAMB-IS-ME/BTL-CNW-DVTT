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
it("verifies short existing passwords for all roles without weakening Session, CSRF or RBAC", async () => {
  const { hashPassword } = await import("../src/modules/auth/password.js");
  const passwordHash = await hashPassword("iamadev");
  for (const role of ["ADMIN", "TEACHER", "STUDENT"] as const) {
    const user = await ctx.db.user.create({
      data: {
        email: `${crypto.randomUUID()}@test.local`,
        fullName: "Tài khoản demo ngắn",
        role,
        passwordHash,
      },
    });
    const client = request.agent(ctx.app);
    const csrf = await client.get("/api/v1/auth/csrf");
    const headers = {
      Origin: "http://localhost:5173",
      "X-CSRF-Token": csrf.body.data.token,
    };
    const login = await client
      .post("/api/v1/auth/login")
      .set(headers)
      .send({ email: user.email, password: "iamadev" });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe(role);
    expect(String(login.headers["set-cookie"])).toContain("HttpOnly");
    expect(login.body.data.csrf).not.toBe(csrf.body.data.token);
    expect((await client.get("/api/v1/auth/me")).body.data.id).toBe(user.id);
    expect((await client.get("/api/v1/admin/users")).status).toBe(
      role === "ADMIN" ? 200 : 403,
    );
    expect((await client.post("/api/v1/auth/logout").set(headers)).status).toBe(
      403,
    );
    expect(
      (
        await client
          .post("/api/v1/auth/logout")
          .set({ ...headers, "X-CSRF-Token": login.body.data.csrf })
      ).status,
    ).toBe(204);
    expect((await client.get("/api/v1/auth/me")).status).toBe(401);
  }
});
it("rejects empty/wrong passwords, unknown credentials and locked accounts while retaining new-password policy", async () => {
  const { hashPassword } = await import("../src/modules/auth/password.js");
  const admin = await account(ctx, "ADMIN");
  const data = {
    email: `${crypto.randomUUID()}@test.local`,
    fullName: "Sinh viên thử",
    password: "iamadev",
  };
  const registration = await admin.agent
    .post("/api/v1/auth/register")
    .set(admin.headers)
    .send(data);
  expect(registration.status).toBe(400);
  expect(registration.body.error.details.fieldErrors.password).toContain(
    "Mật khẩu phải có ít nhất 10 ký tự.",
  );
  expect(
    (
      await admin.agent
        .post("/api/v1/admin/users")
        .set(admin.headers)
        .send({ ...data, role: "STUDENT" })
    ).status,
  ).toBe(400);
  expect(
    await ctx.db.user.findUnique({ where: { email: data.email } }),
  ).toBeNull();
  const user = await ctx.db.user.create({
    data: {
      email: data.email,
      fullName: data.fullName,
      passwordHash: await hashPassword("iamadev"),
    },
  });
  const client = request.agent(ctx.app);
  const csrf = await client.get("/api/v1/auth/csrf");
  const headers = {
    Origin: "http://localhost:5173",
    "X-CSRF-Token": csrf.body.data.token,
  };
  expect(
    (
      await client
        .post("/api/v1/auth/login")
        .set(headers)
        .send({ email: data.email, password: "" })
    ).status,
  ).toBe(400);
  const wrong = await client
    .post("/api/v1/auth/login")
    .set(headers)
    .send({ ...data, password: "wrong" });
  const unknown = await client
    .post("/api/v1/auth/login")
    .set(headers)
    .send({ ...data, email: `missing-${crypto.randomUUID()}@test.local` });
  expect(wrong.status).toBe(401);
  expect(unknown.status).toBe(401);
  expect(wrong.body.error).toEqual(unknown.body.error);
  expect(wrong.body.error.message).toBe("Email hoặc mật khẩu không đúng.");
  await ctx.db.user.update({
    where: { id: user.id },
    data: { status: "LOCKED" },
  });
  const locked = await client
    .post("/api/v1/auth/login")
    .set(headers)
    .send(data);
  expect(locked.status).toBe(403);
  expect(locked.body.error.code).toBe("ACCOUNT_LOCKED");
});
