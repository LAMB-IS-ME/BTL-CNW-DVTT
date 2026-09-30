import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  sourcemap: true,
  noExternal: ["@exam/shared"],
  clean: true,
});
