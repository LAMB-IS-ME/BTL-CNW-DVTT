// Local TLS probe of production bundles. Never point this at a hosted database.
// Run from the repository root after generate/migrate/seed/build.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, copyFile, rm } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { tmpdir } from "node:os";
import { join, extname, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { io } from "socket.io-client";

const database = process.env.TEST_DATABASE_URL;
if (!database) throw new Error("TEST_DATABASE_URL required");
const dbUrl = new URL(database);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(dbUrl.hostname) ||
  !dbUrl.pathname.includes("test")
)
  throw new Error("Only an isolated loopback test database is allowed");

const directory = await mkdtemp(join(tmpdir(), "exam-production-readiness-"));
const sameOrigin = process.env.DEPLOYMENT_SAME_ORIGIN === "true";
const origin = "https://localhost:5443";
const api = sameOrigin ? origin : "https://localhost:5444";
const secret = randomBytes(48).toString("hex");
const checks = [];
let backend, browser, site, proxy;
const sockets = new Set();
const transports = new Set();
const check = (name) => checks.push(name);
const stopBackend = async (signal = "SIGTERM") => {
  if (backend && backend.exitCode === null && backend.signalCode === null) {
    const child = backend;
    const exited = once(child, "exit");
    child.kill(signal);
    const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
    try {
      const [code, receivedSignal] = await exited;
      if (signal === "SIGTERM") assert.equal(code, 0);
      else assert.equal(receivedSignal, signal);
    } finally {
      clearTimeout(timer);
    }
  }
};
const startBackend = async () => {
  backend = spawn(process.execPath, ["dist/server.js"], {
    cwd: resolve("apps/api"),
    stdio: "ignore",
    env: {
      ...process.env,
      DOTENV_CONFIG_PATH: "/dev/null",
      NODE_ENV: "production",
      SERVE_WEB: String(sameOrigin),
      PORT: "3002",
      DATABASE_URL: database,
      SESSION_SECRET: secret,
      SESSION_COOKIE_NAME: "online_exam_sid",
      SESSION_MAX_AGE_MS: "28800000",
      CLIENT_ORIGIN: origin,
      COOKIE_SECURE: "true",
      COOKIE_SAME_SITE: "lax",
      TRUST_PROXY: "1",
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
    },
  });
  await expect
    .poll(
      async () => {
        try {
          return (await fetch("http://127.0.0.1:3002/api/health")).status;
        } catch {
          return 0;
        }
      },
      { timeout: 20000 },
    )
    .toBe(200);
};
const connect = async (
  cookie,
  allowedOrigin = origin,
  shouldConnect = true,
) => {
  const socket = io(api, {
    transports: ["websocket"],
    reconnection: false,
    timeout: 5000,
    rejectUnauthorized: false, // This probe's ephemeral self-signed certificate only.
    extraHeaders: {
      Origin: allowedOrigin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  sockets.add(socket);
  const result = await new Promise((resolveResult) => {
    socket.once("connect", () => resolveResult(true));
    socket.once("connect_error", () => resolveResult(false));
  });
  assert.equal(result, shouldConnect);
  return socket;
};
try {
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      join(directory, "key.pem"),
      "-out",
      join(directory, "cert.pem"),
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost",
    ],
    { stdio: "ignore" },
  );
  const tls = {
    key: await readFile(join(directory, "key.pem")),
    cert: await readFile(join(directory, "cert.pem")),
  };
  const web = join(directory, "web");
  if (!sameOrigin) {
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
        "/",
        "--outDir",
        web,
      ],
      {
        stdio: "ignore",
        env: {
          ...process.env,
          VITE_API_BASE_URL: `${api}/api/v1`,
          VITE_SOCKET_URL: api,
        },
      },
    );
    await copyFile(join(web, "index.html"), join(web, "404.html"));
    const types = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".woff2": "font/woff2",
    };
    site = https.createServer(tls, async (req, res) => {
      const path = new URL(req.url, origin).pathname;
      try {
        const file = join(web, path === "/" ? "index.html" : path);
        const data = await readFile(file);
        res
          .writeHead(200, {
            "Content-Type": types[extname(file)] || "application/octet-stream",
          })
          .end(data);
      } catch {
        res
          .writeHead(404, { "Content-Type": "text/html" })
          .end(await readFile(join(web, "404.html")));
      }
    });
  }
  // The local edge overwrites forwarding headers; production ingress must do so too.
  proxy = https.createServer(tls, (req, res) => {
    const upstream = http.request(
      {
        host: "127.0.0.1",
        port: 3002,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          "x-forwarded-proto": "https",
          "x-forwarded-for": "127.0.0.1",
        },
      },
      (response) => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      },
    );
    upstream.on("error", () => res.writeHead(502).end());
    req.pipe(upstream);
  });
  proxy.on("upgrade", (req, socket, head) => {
    const upstream = net.connect(3002, "127.0.0.1", () => {
      const headers = {
        ...req.headers,
        "x-forwarded-proto": "https",
        "x-forwarded-for": "127.0.0.1",
      };
      upstream.write(
        `${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\r\n")}\r\n\r\n`,
      );
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    transports.add(upstream);
    upstream.on("close", () => {
      transports.delete(upstream);
      socket.destroy();
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
    socket.on("close", () => upstream.destroy());
  });
  if (site) await new Promise((ready) => site.listen(5443, "localhost", ready));
  await new Promise((ready) =>
    proxy.listen(sameOrigin ? 5443 : 5444, "localhost", ready),
  );
  await startBackend();
  check("NODE_ENV=production bundle startup and health");
  browser = await chromium.launch();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const errors = [];
  const assetFailures = [];
  page.on("pageerror", (e) => errors.push(e.name));
  page.on("response", (r) => {
    if (r.url().includes("/assets/") && r.status() !== 200)
      assetFailures.push(r.status());
  });
  assert.equal(
    (await page.goto(`${origin}/teacher/exams`)).status(),
    sameOrigin ? 200 : 404,
  );
  await page.getByLabel("Email", { exact: true }).fill("teacher1@exam.local");
  const seedSource = await readFile("apps/api/prisma/seed.ts", "utf8");
  const password =
    process.env.DEMO_PASSWORD ||
    seedSource.match(/process\.env\.DEMO_PASSWORD\s*\|\|\s*"([^"]+)"/)[1];
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
  await page.goto(`${origin}/teacher/exams`);
  await page.reload();
  await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
  assert.deepEqual(errors, []);
  assert.deepEqual(assetFailures, []);
  check(
    sameOrigin
      ? "HTTPS same-origin browser login, production assets, HTTP200 SPA deep-link and refresh"
      : "HTTPS cross-origin browser login, production assets, SPA deep-link and refresh",
  );
  const cookies = await context.cookies(api);
  const sid = cookies.find((c) => c.name === "online_exam_sid");
  assert.ok(sid?.secure && sid.httpOnly && sid.sameSite === "Lax");
  assert.equal(sid.domain, "localhost");
  check("Secure HttpOnly SameSite=Lax host-only session cookie");
  const me = await context.request.get(`${api}/api/v1/auth/me`, {
    headers: { Origin: origin },
  });
  assert.equal(me.status(), 200);
  assert.equal(me.headers()["access-control-allow-origin"], origin);
  assert.equal(me.headers()["access-control-allow-credentials"], "true");
  assert.equal(
    (
      await context.request.get(`${api}/api/v1/auth/me`, {
        headers: { Origin: "https://untrusted.invalid" },
      })
    ).status(),
    403,
  );
  assert.equal(
    (
      await context.request.post(`${api}/api/v1/auth/logout`, {
        headers: { Origin: origin },
      })
    ).status(),
    403,
  );
  assert.equal(
    (await context.request.post(`${api}/api/v1/auth/logout`)).status(),
    403,
  );
  check(
    "Credentialed exact CORS; wrong origin, absent origin and absent CSRF rejected",
  );
  const cookie = `${sid.name}=${sid.value}`;
  const socket = await connect(cookie);
  const ack = await socket.timeout(5000).emitWithAck("exam:monitor:join", {
    examId: "00000000-0000-4000-8000-000000000402",
  });
  assert.ok(ack.data && !ack.error);
  await connect(undefined, origin, false);
  await connect(cookie, "https://untrusted.invalid", false);
  check(
    "Authenticated WSS monitor ACK; anonymous and untrusted-origin WSS rejected",
  );
  socket.disconnect();
  await stopBackend();
  await startBackend();
  assert.equal(
    (await context.request.get(`${api}/api/v1/auth/me`)).status(),
    200,
  );
  check(
    "Graceful SIGTERM exit 0; database session survives restart with same secret",
  );
  await stopBackend("SIGKILL");
  await startBackend();
  assert.equal(
    (await context.request.get(`${api}/api/v1/auth/me`)).status(),
    200,
  );
  check("Session survives unexpected process death and restart");
  const reconnected = await connect(cookie);
  const disconnected = once(reconnected, "disconnect");
  const csrf = (
    await (await context.request.get(`${api}/api/v1/auth/csrf`)).json()
  ).data.token;
  assert.equal(
    (
      await context.request.post(`${api}/api/v1/auth/logout`, {
        headers: { Origin: origin, "X-CSRF-Token": csrf },
      })
    ).status(),
    204,
  );
  await Promise.race([
    disconnected,
    new Promise((_, reject) => {
      const t = setTimeout(
        () => reject(new Error("Socket logout timeout")),
        5000,
      );
      t.unref();
    }),
  ]);
  assert.equal(
    (await context.request.get(`${api}/api/v1/auth/me`)).status(),
    401,
  );
  check("CSRF-valid logout revokes HTTP session and disconnects WSS");
  if (sameOrigin) {
    const child = spawn(
      process.execPath,
      [
        "node_modules/@playwright/test/cli.js",
        "test",
        "--config",
        "tests/deployment/playwright.same-origin.config.ts",
      ],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          DOTENV_CONFIG_PATH: "/dev/null",
          DEPLOYMENT_PROBE_ORIGIN: origin,
          DEPLOYMENT_SCREENSHOT_DIR: "docs/screenshots/free-staging/local/",
        },
      },
    );
    const [exitCode] = await once(child, "exit");
    assert.equal(exitCode, 0, "Same-origin production Exam/Quiz browser flows");
    check(
      "Production HTTPS Teacher/Student Exam, autosave, grading, results and Live Quiz browser flows with WSS",
    );
  }
  console.info(
    JSON.stringify(
      {
        status: "PASS",
        scope: sameOrigin ? "LOCAL_SINGLE_ORIGIN_TLS_ONLY" : "LOCAL_TLS_ONLY",
        checks,
        hostedStagingVerified: false,
      },
      null,
      2,
    ),
  );
} finally {
  for (const socket of sockets) socket.disconnect();
  await browser?.close();
  await stopBackend();
  for (const transport of transports) transport.destroy();
  for (const server of [site, proxy]) {
    if (server?.listening) {
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    }
  }
  await rm(directory, { recursive: true, force: true });
}
