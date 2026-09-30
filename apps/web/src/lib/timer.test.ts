import { it, expect } from "vitest";
import { remainingSeconds, formatTime } from "./timer";
it("uses server offset and clamps expiry without trusting client clock", () => {
  expect(
    remainingSeconds(
      "2026-01-01T00:01:00Z",
      "2026-01-01T00:00:00Z",
      1000,
      11000,
    ),
  ).toBe(50);
  expect(
    remainingSeconds(
      "2026-01-01T00:01:00Z",
      "2026-01-01T00:00:00Z",
      1000,
      100000,
    ),
  ).toBe(0);
  expect(formatTime(3661)).toBe("01:01:01");
});
