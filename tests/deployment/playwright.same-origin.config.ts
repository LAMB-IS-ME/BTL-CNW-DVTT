import { defineConfig } from "@playwright/test";

// The production probe owns the local TLS proxy and isolated seeded database.
if (
  process.env.DEPLOYMENT_PROBE_ORIGIN !== "https://localhost:5443" ||
  !process.env.TEST_DATABASE_URL ||
  !["localhost", "127.0.0.1"].includes(
    new URL(process.env.TEST_DATABASE_URL).hostname,
  ) ||
  !new URL(process.env.TEST_DATABASE_URL).pathname.includes("test")
)
  throw new Error("Only the isolated local production probe is allowed");

export default defineConfig({
  testDir: "../e2e",
  testMatch: "core.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 10000 },
  outputDir: "/tmp/examspace-free-staging/browser-results",
  use: {
    baseURL: process.env.DEPLOYMENT_PROBE_ORIGIN,
    ignoreHTTPSErrors: true, // Ephemeral self-signed local certificate only.
    trace: "off", // Never persist sessions/cookies in deployment evidence.
    screenshot: "off",
  },
});
