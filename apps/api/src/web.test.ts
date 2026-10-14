import { afterAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "./config/env.js";
import { webRoutes } from "./web.js";

const directory = mkdtempSync(join(tmpdir(), "exam-web-test-"));
mkdirSync(join(directory, "assets"));
writeFileSync(
  join(directory, "index.html"),
  "<!doctype html><title>ExamSpace</title>",
);
writeFileSync(join(directory, "assets", "app-123.js"), "export const app = 1;");
writeFileSync(join(directory, ".env"), "PRIVATE_TEST_FILE");
const config = parseEnv({
  DATABASE_URL: "postgresql://localhost/test",
  SESSION_SECRET: "unit-test-only-secret-32-characters",
  CLIENT_ORIGIN: "https://exam.example",
  SUPABASE_URL: "https://storage.example",
  SERVE_WEB: "true",
});
const app = express();
app.use(webRoutes(config, directory));
app.use((_req, res) => res.status(404).json({ error: "NOT_FOUND" }));
afterAll(() => rmSync(directory, { recursive: true }));

describe("single-origin production web", () => {
  it.each(["/", "/teacher/exams", "/student/exams/abc", "/admin/users"])(
    "serves HTML for %s without cache or session cookies",
    async (path) => {
      const res = await request(app).get(path).set("Accept", "text/html");
      expect(res.status).toBe(200);
      expect(res.type).toBe("text/html");
      expect(res.headers["cache-control"]).toBe("no-cache");
      expect(res.headers["set-cookie"]).toBeUndefined();
      expect(res.headers["content-security-policy"]).toContain(
        "script-src 'self'",
      );
      expect(res.headers["content-security-policy"]).toContain(
        "https://storage.example",
      );
      expect(res.headers["content-security-policy"]).toContain(
        "wss://exam.example",
      );
    },
  );
  it("serves immutable bundle assets with their correct MIME type", async () => {
    const res = await request(app).get("/assets/app-123.js");
    expect(res.status).toBe(200);
    expect(res.type).toMatch(/javascript/);
    expect(res.headers["cache-control"]).toContain("immutable");
  });
  it.each([
    "/api",
    "/api/health",
    "/api/v1/unknown",
    "/socket.io/",
    "/assets/missing.js",
    "/assets/missing",
    "/.env",
    "/src/server.ts",
    "/package.json",
  ])("never substitutes SPA HTML for %s", async (path) => {
    const res = await request(app).get(path).set("Accept", "text/html");
    expect(res.status).toBe(404);
    expect(res.type).not.toBe("text/html");
  });
  it("does not serve SPA for mutations or JSON requests", async () => {
    expect((await request(app).post("/teacher/exams")).status).toBe(404);
    expect(
      (
        await request(app)
          .get("/teacher/exams")
          .set("Accept", "application/json")
      ).status,
    ).toBe(404);
  });
  it("fails at startup if the bundle is absent", () => {
    expect(() => webRoutes(config, join(directory, "missing"))).toThrow(
      "Build the web bundle",
    );
  });
});
