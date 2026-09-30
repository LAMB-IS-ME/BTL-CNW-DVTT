import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
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
      command: "npm run dev -w @exam/api",
      url: "http://localhost:3000/api/health",
      reuseExistingServer: false,
      env: {
        NODE_ENV: "test",
        PORT: "3000",
        DATABASE_URL: process.env.TEST_DATABASE_URL || "",
        SESSION_SECRET: "playwright-local-only-secret-32-characters",
        CLIENT_ORIGIN: "http://localhost:5173",
        COOKIE_SECURE: "false",
      },
    },
    {
      command: "npm run dev -w @exam/web",
      url: "http://localhost:5173",
      reuseExistingServer: false,
    },
  ],
});
