import { expect, it } from "vitest";
import request from "supertest";
import { testContext } from "./helpers.js";

it("shares the 30-request IP budget across login/register, while a new app has an independent store", async () => {
  const first = testContext();
  const second = testContext();
  try {
    const client = request.agent(first.app);
    const csrf = (await client.get("/api/v1/auth/csrf")).body.data.token;
    const headers = {
      Origin: "http://localhost:5173",
      "X-CSRF-Token": csrf,
    };
    // Invalid payloads consume the real limiter without creating users or sessions of users.
    for (let index = 0; index < 30; index++) {
      const path = index % 2 ? "register" : "login";
      expect(
        (await client.post(`/api/v1/auth/${path}`).set(headers).send({}))
          .status,
      ).toBe(400);
    }
    const blocked = await client
      .post("/api/v1/auth/login")
      .set(headers)
      .send({});
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(Number(blocked.headers["retry-after"])).toBeLessThanOrEqual(900);
    expect((await client.get("/api/v1/auth/csrf")).status).toBe(200);

    // Same IP and database, fresh app/limiter: no shared database counter.
    const fresh = request.agent(second.app);
    const freshCsrf = (await fresh.get("/api/v1/auth/csrf")).body.data.token;
    expect(
      (
        await fresh
          .post("/api/v1/auth/login")
          .set({ ...headers, "X-CSRF-Token": freshCsrf })
          .send({})
      ).status,
    ).toBe(400);
    expect(
      (await client.post("/api/v1/auth/register").set(headers).send({})).status,
    ).toBe(429);
  } finally {
    await first.cleanup();
    await second.cleanup();
  }
});
