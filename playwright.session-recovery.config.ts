import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// A separate invocation owns new servers; DB fixtures may persist, IP counters do not.
export default defineConfig(base, {
  testIgnore: [],
  testMatch: "**/session-recovery.spec.ts",
  outputDir: "test-results/session-recovery",
});
