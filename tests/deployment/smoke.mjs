import { chromium, expect } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
const database = process.env.TEST_DATABASE_URL;
if (!database || !new URL(database).pathname.includes("test"))
  throw new Error(
    "A dedicated TEST_DATABASE_URL with test in its database name is required",
  );
const directory = await mkdtemp(join(tmpdir(), "exam-pages-"));
const origin = "http://localhost:5174";
const api = "http://localhost:3001";
let backend, browser, site;
try {
  execFileSync(
    "npm",
    [
      "exec",
      "-w",
      "@exam/web",
      "--",
      "vite",
      "build",
      "--base",
      "/project/",
      "--outDir",
      directory,
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        VITE_API_BASE_URL: `${api}/api/v1`,
        VITE_SOCKET_URL: api,
      },
    },
  );
  await copyFile(join(directory, "index.html"), join(directory, "404.html"));
  backend = spawn(process.execPath, ["dist/server.js"], {
    cwd: "apps/api",
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: "3001",
      DATABASE_URL: database,
      SESSION_SECRET: "deployment-smoke-only-secret-32-characters",
      CLIENT_ORIGIN: origin,
      COOKIE_SECURE: "false",
      COOKIE_SAME_SITE: "lax",
    },
  });
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`${api}/api/health`)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 20000 },
    )
    .toBe(200);
  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".woff2": "font/woff2",
  };
  site = createServer(async (req, res) => {
    const path = new URL(req.url, origin).pathname;
    if (!path.startsWith("/project/") || path.includes("..")) {
      res.writeHead(404).end();
      return;
    }
    const relative = path.slice("/project/".length) || "index.html";
    try {
      const body = await readFile(join(directory, relative));
      res
        .writeHead(200, {
          "Content-Type":
            types[extname(relative)] || "application/octet-stream",
        })
        .end(body);
    } catch {
      res
        .writeHead(404, { "Content-Type": "text/html" })
        .end(await readFile(join(directory, "404.html")));
    }
  });
  await new Promise((resolve) => site.listen(5174, resolve));
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(`${origin}/project/teacher/exams`);
  expect(response.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Đăng nhập vào ExamSpace", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("teacher1@exam.local");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("DevOnly!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
  await page.goto(`${origin}/project/teacher/exams`);
  await page.reload();
  await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
  const pdf = await page.request.get(
    `${api}/api/v1/teacher/exams/00000000-0000-4000-8000-000000000402/students/00000000-0000-4000-8000-000000000005/result.pdf`,
  );
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  expect(errors).toEqual([]);
  console.info(
    "PASS: production artifacts, subpath 404 fallback, deep-route refresh, persistent login, bundled API + PDF font",
  );
} finally {
  await browser?.close();
  if (site) await new Promise((resolve) => site.close(resolve));
  if (backend && backend.exitCode === null) {
    backend.kill("SIGTERM");
    await new Promise((resolve) => backend.once("exit", resolve));
  }
  await rm(directory, { recursive: true, force: true });
}
