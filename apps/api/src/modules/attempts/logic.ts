import { z } from "zod";
import type { Snapshot } from "@exam/shared";
import { questionTypes } from "@exam/shared";
import { check } from "../../utils/errors.js";
import { shuffle } from "../exams/selection.js";
export const snapshotSchema = z.object({
  id: z.string(),
  type: z.enum(questionTypes),
  promptMarkdown: z.string(),
  explanationMarkdown: z.string().nullable(),
  options: z.array(
    z.object({
      id: z.string(),
      contentMarkdown: z.string(),
      isCorrect: z.boolean(),
    }),
  ),
});
export function makeSnapshot(q: Snapshot, shuffleOptions: boolean): Snapshot {
  return snapshotSchema.parse({
    ...q,
    options:
      shuffleOptions && ["SINGLE_CHOICE", "MULTIPLE_CHOICE"].includes(q.type)
        ? shuffle(q.options)
        : q.options,
  });
}
export function expiresAt(start: Date, duration: number, close: Date) {
  return new Date(
    Math.min(start.getTime() + duration * 60000, close.getTime()),
  );
}
export function eligibility(
  e: { status: string; openAt: Date; closeAt: Date; maxAttempts: number },
  member: boolean,
  attempts: number,
  now: Date,
) {
  check(member, 403, "EXAM_NOT_ASSIGNED");
  check(e.status === "PUBLISHED", 409, "EXAM_NOT_PUBLISHED");
  check(now >= e.openAt, 409, "EXAM_NOT_OPEN");
  check(now < e.closeAt, 409, "EXAM_CLOSED");
  check(attempts < e.maxAttempts, 409, "ATTEMPT_LIMIT_REACHED");
}
export function gradeObjective(
  q: Snapshot,
  selected: string[],
  points: number,
) {
  if (q.type === "ESSAY") return null;
  const key = q.options.filter((o) => o.isCorrect).map((o) => o.id);
  const set = new Set(selected);
  return set.size === selected.length &&
    set.size === key.length &&
    key.every((id) => set.has(id))
    ? points
    : 0;
}
export function publicQuestion(q: Snapshot) {
  return {
    type: q.type,
    promptMarkdown: q.promptMarkdown,
    options: q.options.map((o) => ({
      id: o.id,
      contentMarkdown: o.contentMarkdown,
    })),
  };
}
export function validateAnswer(q: Snapshot, input: unknown) {
  const a = z
    .object({
      selectedOptionIds: z.array(z.string()).max(20).default([]),
      answerText: z.string().max(50000).default(""),
    })
    .parse(input);
  check(
    new Set(a.selectedOptionIds).size === a.selectedOptionIds.length,
    400,
    "INVALID_ANSWER",
  );
  if (q.type === "ESSAY")
    check(a.selectedOptionIds.length === 0, 400, "INVALID_ANSWER");
  else {
    check(!a.answerText, 400, "INVALID_ANSWER");
    check(
      a.selectedOptionIds.every((id) => q.options.some((o) => o.id === id)),
      400,
      "INVALID_ANSWER",
    );
    check(
      q.type === "MULTIPLE_CHOICE" || a.selectedOptionIds.length <= 1,
      400,
      "INVALID_ANSWER",
    );
  }
  return a;
}
