import { expect, it } from "vitest";
import {
  acknowledgeGrade,
  isGradeDirty,
  sameGrade,
  type GradeDraft,
} from "./grading-draft";
it("compares persisted scores numerically but preserves empty, invalid and feedback changes", () => {
  const base = { score: "2", feedback: "Nhận xét" };
  expect(sameGrade(base, { ...base, score: "2.00" })).toBe(true);
  for (const score of ["", "bad", "-1", "2.555", "4"])
    expect(sameGrade(base, { ...base, score })).toBe(false);
  expect(sameGrade(base, { ...base, feedback: "" })).toBe(false);
  expect(
    sameGrade(
      { score: "", feedback: "", invalid: true },
      { score: "", feedback: "" },
    ),
  ).toBe(false);
  expect(
    sameGrade({ score: "", feedback: "" }, { score: "0", feedback: "" }),
  ).toBe(false);
});
it("a late response acknowledges sent values without overwriting a newer draft", () => {
  const sent = { score: "2", feedback: "Đã gửi" };
  const newer = { score: "2.5", feedback: "Bản nháp mới" };
  const draft: GradeDraft = {
    values: newer,
    persisted: { score: "1", feedback: "" },
    state: "saving",
  };
  const result = acknowledgeGrade(draft, sent);
  expect(result.values).toEqual(newer);
  expect(result.persisted).toEqual(sent);
  expect(isGradeDirty(result)).toBe(true);
  expect(
    isGradeDirty(acknowledgeGrade({ ...result, values: sent }, sent)),
  ).toBe(false);
});
