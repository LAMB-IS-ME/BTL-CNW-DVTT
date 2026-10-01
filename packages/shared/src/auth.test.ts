import { expect, it } from "vitest";
import { loginSchema, registerSchema, newPasswordSchema } from "./index.js";
it("accepts existing short passwords at login but enforces the new-password policy", () => {
  const input = { email: "admin@exam.local", password: "iamadev" };
  expect(loginSchema.parse(input)).toEqual(input);
  expect(
    registerSchema.safeParse({ ...input, fullName: "Người dùng" }).success,
  ).toBe(false);
  expect(newPasswordSchema.safeParse("iamadev").success).toBe(false);
  expect(newPasswordSchema.safeParse("1234567890").success).toBe(true);
  expect(loginSchema.parse({ ...input, password: " x " }).password).toBe(" x ");
});
it("returns friendly Vietnamese messages for missing, invalid and oversized login fields", () => {
  const result = loginSchema.safeParse({ email: "", password: "" });
  expect(result.success).toBe(false);
  if (!result.success)
    expect(result.error.issues.map((i) => i.message)).toEqual([
      "Vui lòng nhập email.",
      "Vui lòng nhập mật khẩu.",
    ]);
  const invalid = loginSchema.safeParse({
    email: "not-email",
    password: "x".repeat(129),
  });
  expect(invalid.success).toBe(false);
  if (!invalid.success)
    expect(invalid.error.issues.map((i) => i.message)).toEqual([
      "Email không hợp lệ.",
      "Mật khẩu không được vượt quá 128 ký tự.",
    ]);
});
