import { it, expect } from "vitest";
import { questionSchema } from "./index.js";
it("enforces all four question types and true/false semantics", () => {
  const q = {
    promptMarkdown: "Test",
    type: "SINGLE_CHOICE",
    options: [
      { contentMarkdown: "A", isCorrect: true },
      { contentMarkdown: "B", isCorrect: false },
    ],
  };
  expect(questionSchema.safeParse(q).success).toBe(true);
  expect(
    questionSchema.safeParse({ ...q, type: "MULTIPLE_CHOICE" }).success,
  ).toBe(true);
  expect(questionSchema.safeParse({ ...q, type: "ESSAY" }).success).toBe(false);
  expect(
    questionSchema.safeParse({ ...q, type: "ESSAY", options: [] }).success,
  ).toBe(true);
  expect(questionSchema.safeParse({ ...q, type: "TRUE_FALSE" }).success).toBe(
    false,
  );
  expect(
    questionSchema.safeParse({
      ...q,
      type: "TRUE_FALSE",
      options: [
        { contentMarkdown: "True", isCorrect: true },
        { contentMarkdown: "False", isCorrect: false },
      ],
    }).success,
  ).toBe(true);
});
