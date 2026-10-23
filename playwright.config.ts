import { defineConfig } from "@playwright/test";
const database = process.env.TEST_DATABASE_URL;
if (!database || !new URL(database).pathname.includes("test"))
  throw new Error(
    "A dedicated TEST_DATABASE_URL with test in its database name is required",
  );
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(database).hostname))
  throw new Error(
    "Browser mutation tests require an isolated loopback PostgreSQL database",
  );
export default defineConfig({
  testDir: "tests/e2e",
  // Separate invocations give Student Exam and recovery fresh API rate-limit stores.
  testIgnore: [
    "**/session-recovery.spec.ts",
    "**/student-exam-integrity.spec.ts",
  ],
  outputDir: "test-results/core",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node tests/e2e/storage-fixture.mjs",
      url: "http://127.0.0.1:54329/health",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -w @exam/api",
      url: "http://localhost:3000/api/health",
      reuseExistingServer: false,
      env: {
        NODE_ENV: "test",
        PORT: "3000",
        DATABASE_URL: database,
        DOTENV_CONFIG_PATH: "/dev/null",
        SUPABASE_URL: "http://127.0.0.1:54329",
        SUPABASE_SERVICE_ROLE_KEY: "local-test-provider-only",
        SESSION_SECRET: "playwright-local-only-secret-32-characters",
        CLIENT_ORIGIN: "http://localhost:5173",
        COOKIE_SECURE: "false",
      },
    },
    {
      command: "npm run dev -w @exam/web",
      env: {
        VITE_API_BASE_URL: "http://localhost:3000/api/v1",
        VITE_SOCKET_URL: "http://localhost:3000",
      },
      url: "http://localhost:5173",
      reuseExistingServer: false,
    },
  ],
});
