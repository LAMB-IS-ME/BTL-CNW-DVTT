import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testDir: "tests/ui",
  timeout: 120000,
  use: { ...base.use, locale: "vi-VN", timezoneId: "Asia/Bangkok" },
});
