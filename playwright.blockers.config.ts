import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Own fresh API/rate-limit stores; keep blocking regressions independent of core login quotas.
export default defineConfig(base, {
  testDir: "tests/recovery",
  testIgnore: [],
  testMatch: "builder-blockers.spec.ts",
  outputDir: "test-results/blockers",
  timeout: 90000,
});
