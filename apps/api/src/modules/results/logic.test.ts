import { it, expect } from "vitest";
import { resultVisible, finalAttempt } from "./logic.js";
it("enforces all release modes and requires grading to finish", () => {
  const now = new Date(),
    e = {
      resultReleaseMode: "IMMEDIATE",
      closeAt: new Date(+now + 1000),
      manualResultsReleasedAt: null,
    };
  expect(resultVisible(e, "GRADED", now)).toBe(true);
  expect(resultVisible(e, "PENDING_MANUAL_GRADING", now)).toBe(false);
  expect(
    resultVisible({ ...e, resultReleaseMode: "AFTER_CLOSE" }, "GRADED", now),
  ).toBe(false);
  expect(
    resultVisible(
      { ...e, resultReleaseMode: "AFTER_CLOSE" },
      "GRADED",
      e.closeAt,
    ),
  ).toBe(true);
  expect(
    resultVisible({ ...e, resultReleaseMode: "MANUAL" }, "GRADED", now),
  ).toBe(false);
  expect(
    resultVisible(
      { ...e, resultReleaseMode: "MANUAL", manualResultsReleasedAt: now },
      "GRADED",
      now,
    ),
  ).toBe(true);
});
it("selects highest graded or latest even when latest waits for grading", () => {
  const a = [
    { attemptNo: 1, status: "GRADED", totalScore: 8 },
    { attemptNo: 2, status: "GRADED", totalScore: 4 },
    { attemptNo: 3, status: "PENDING_MANUAL_GRADING", totalScore: null },
  ];
  expect(finalAttempt(a, "HIGHEST_SCORE")?.attemptNo).toBe(1);
  expect(finalAttempt(a, "LATEST_ATTEMPT")?.attemptNo).toBe(3);
});
