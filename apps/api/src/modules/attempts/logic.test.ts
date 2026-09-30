import { it, expect } from "vitest";
import {
  eligibility,
  expiresAt,
  makeSnapshot,
  publicQuestion,
  gradeObjective,
} from "./logic.js";
import type { Snapshot } from "@exam/shared";
const q: Snapshot = {
  id: "q",
  type: "SINGLE_CHOICE",
  promptMarkdown: "Hello",
  explanationMarkdown: "Secret",
  options: [
    { id: "a", contentMarkdown: "A", isCorrect: true },
    { id: "b", contentMarkdown: "B", isCorrect: false },
  ],
};
it("caps duration at exam closing time", () => {
  const start = new Date("2026-01-01T00:00:00Z");
  expect(
    expiresAt(start, 60, new Date("2026-01-01T00:30:00Z")).toISOString(),
  ).toBe("2026-01-01T00:30:00.000Z");
  expect(
    expiresAt(start, 10, new Date("2026-01-01T00:30:00Z")).getTime() -
      start.getTime(),
  ).toBe(600000);
});
it("checks assignment, open/close window, status and attempt limit", () => {
  const now = new Date(),
    e = {
      status: "PUBLISHED",
      openAt: new Date(+now - 1000),
      closeAt: new Date(+now + 1000),
      maxAttempts: 2,
    };
  expect(() => eligibility(e, true, 0, now)).not.toThrow();
  for (const args of [
    [e, false, 0, now],
    [e, true, 2, now],
    [{ ...e, status: "DRAFT" }, true, 0, now],
    [e, true, 0, e.closeAt],
    [e, true, 0, new Date(+e.openAt - 1)],
  ] as const)
    expect(() => eligibility(args[0], args[1], args[2], args[3])).toThrow();
});
it("snapshots are independent and student projection never includes answer keys or explanation", () => {
  const snap = makeSnapshot(q, true);
  snap.options[0]!.contentMarkdown = "changed";
  expect(q.options.some((o) => o.contentMarkdown === "changed")).toBe(false);
  expect(JSON.stringify(publicQuestion(snap))).not.toMatch(
    /isCorrect|explanationMarkdown|Secret/,
  );
});
it("grades single, true/false and multiple exact set with duplicate protection", () => {
  expect(gradeObjective(q, ["a"], 2)).toBe(2);
  expect(gradeObjective(q, ["b"], 2)).toBe(0);
  expect(gradeObjective({ ...q, type: "TRUE_FALSE" }, ["a"], 2)).toBe(2);
  const m = {
    ...q,
    type: "MULTIPLE_CHOICE" as const,
    options: q.options.map((o) => ({ ...o, isCorrect: true })),
  };
  expect(gradeObjective(m, ["b", "a"], 3)).toBe(3);
  expect(gradeObjective(m, ["a"], 3)).toBe(0);
  expect(gradeObjective(m, ["a", "a"], 3)).toBe(0);
  expect(gradeObjective({ ...q, type: "ESSAY" }, [], 2)).toBeNull();
});
