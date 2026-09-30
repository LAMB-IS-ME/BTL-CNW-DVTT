import request from "supertest";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { parseEnv } from "../src/config/env.js";
import { hashPassword } from "../src/modules/auth/password.js";
export const url = process.env.TEST_DATABASE_URL;
export function testContext() {
  if (!url)
    throw new Error(
      "TEST_DATABASE_URL required; integration tests must use a dedicated PostgreSQL database",
    );
  if (!new URL(url).pathname.includes("test"))
    throw new Error("Test database name must contain test");
  const db = createDb(url);
  const config = parseEnv({
    NODE_ENV: "test",
    DATABASE_URL: url,
    SESSION_SECRET: "integration-only-secret-32-characters",
    CLIENT_ORIGIN: "http://localhost:5173",
  });
  const app = createApp({ db, config });
  return {
    db,
    app,
    config,
    async cleanup() {
      app.locals.sessionStore.close();
      await app.locals.sessionPool.end();
      await db.$disconnect();
    },
  };
}
export async function account(
  ctx: ReturnType<typeof testContext>,
  role: "ADMIN" | "TEACHER" | "STUDENT",
) {
  const email = `${crypto.randomUUID()}@test.local`;
  const password = "test-password-123";
  const user = await ctx.db.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      fullName: "Nguyễn Hoàng Anh",
      role,
    },
  });
  const agent = request.agent(ctx.app);
  const csrf = await agent.get("/api/v1/auth/csrf");
  const login = await agent
    .post("/api/v1/auth/login")
    .set("Origin", "http://localhost:5173")
    .set("X-CSRF-Token", csrf.body.data.token)
    .send({ email, password });
  if (login.status !== 200) throw new Error("Test login failed");
  const headers = {
    Origin: "http://localhost:5173",
    "X-CSRF-Token": String(login.body.data.csrf),
  };
  return {
    user,
    agent,
    headers,
    cookie: (login.headers["set-cookie"] as unknown as string[])
      .map((c) => c.split(";")[0])
      .join("; "),
  };
}
