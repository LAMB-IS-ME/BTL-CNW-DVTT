import { it, expect } from "vitest";
import { quizPoints } from "./logic.js";
it("scores correct answers deterministically with a bounded speed bonus", () => {
  expect(quizPoints(false, 1000, 20000, 20000)).toBe(0);
  expect(quizPoints(true, 1000, 20000, 20000)).toBe(1500);
  expect(quizPoints(true, 1000, 10000, 20000)).toBe(1250);
  expect(quizPoints(true, 1000, -1, 20000)).toBe(1000);
  expect(quizPoints(true, 1000, 99999, 20000)).toBe(1500);
});
