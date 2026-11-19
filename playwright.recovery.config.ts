import { defineConfig } from "@playwright/test";
const database = process.env.TEST_DATABASE_URL;
if (
  !database ||
  !new URL(database).pathname.includes("test") ||
  !["localhost", "127.0.0.1"].includes(new URL(database).hostname)
)
  throw new Error("Recovery tests require isolated loopback test PostgreSQL");
export default defineConfig({
  testDir: "tests/recovery",
  workers: 1,
  retries: 0,
  timeout: 90000,
  expect: { timeout: 10000 },
  use: {
    baseURL: "http://localhost:5173",
    browserName: "chromium",
    locale: "vi-VN",
  },
  webServer: {
    command: "npm run dev -w @exam/web",
    url: "http://localhost:5173",
    reuseExistingServer: false,
    env: {
      VITE_API_BASE_URL: "http://localhost:3000/api/v1",
      VITE_SOCKET_URL: "http://localhost:3000",
    },
  },
});
