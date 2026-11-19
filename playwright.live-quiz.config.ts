import { defineConfig } from "@playwright/test";
import base from "./playwright.ui.config";

export default defineConfig({
  ...base,
  testMatch: ["live-quiz.spec.ts", "live-quiz-hardening.spec.ts"],
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    {
      name: "webkit",
      use: {
        browserName: "webkit",
        launchOptions: process.env.LIVE_QUIZ_WEBKIT_EXECUTABLE
          ? { executablePath: process.env.LIVE_QUIZ_WEBKIT_EXECUTABLE }
          : undefined,
      },
    },
  ],
});
