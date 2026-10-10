export type GradeValues = {
  score: string;
  feedback: string;
  invalid?: boolean;
};
export type GradeDraft = {
  values: GradeValues;
  persisted: GradeValues;
  state: "idle" | "saving" | "saved" | "failed";
  error?: unknown;
};

export function sameGrade(a: GradeValues, b: GradeValues) {
  if (a.invalid || b.invalid) return false;
  const scoreEqual =
    a.score === b.score ||
    (a.score !== "" && b.score !== "" && Number(a.score) === Number(b.score));
  return scoreEqual && a.feedback === b.feedback;
}
export const isGradeDirty = (draft: GradeDraft) =>
  !sameGrade(draft.values, draft.persisted);

// A response acknowledges only the values sent by that request.
export function acknowledgeGrade(
  draft: GradeDraft,
  sent: GradeValues,
): GradeDraft {
  return { ...draft, persisted: sent, state: "saved", error: undefined };
}
