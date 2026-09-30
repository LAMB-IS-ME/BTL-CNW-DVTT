import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["apps/**/*.integration.test.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
