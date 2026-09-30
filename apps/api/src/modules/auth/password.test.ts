import { it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";
it("hashes Argon2id with random salt and verifies without accepting wrong passwords", async () => {
  const a = await hashPassword("strong-password");
  const b = await hashPassword("strong-password");
  expect(a).toMatch(/^\$argon2id\$/);
  expect(a).not.toBe(b);
  expect(await verifyPassword(a, "strong-password")).toBe(true);
  expect(await verifyPassword(a, "wrong")).toBe(false);
});
