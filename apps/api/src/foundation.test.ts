import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { parseEnv } from "./config/env.js";
describe("foundation", () => {
  it("returns a secret-free health response", async () => {
    const r = await request(createApp()).get("/api/health");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ data: { status: "ok", service: "exam-api" } });
  });
  it("requires database and strong session secret", () => {
    expect(() => parseEnv({})).toThrow();
  });
  it("rejects insecure production cookies", () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: "postgres://localhost/test",
        SESSION_SECRET: "x".repeat(32),
        NODE_ENV: "production",
      }),
    ).toThrow();
  });
});
