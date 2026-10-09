import { describe, expect, it } from "vitest";
import { examAvailability, type AssignedExam } from "./student-exam-state";
const now = Date.parse("2026-10-08T10:00:00Z");
const exam: AssignedExam = {
  id: "exam",
  title: "Exam",
  descriptionMarkdown: "",
  status: "PUBLISHED",
  openAt: new Date(now - 1000).toISOString(),
  closeAt: new Date(now + 60000).toISOString(),
  durationMinutes: 45,
  maxAttempts: 1,
  attempts: [],
};
describe("Student availability follows start/resume boundaries", () => {
  it("opens at the exact opening boundary and closes at the exact deadline", () => {
    expect(examAvailability(exam, now - 1001)).toMatchObject({
      canStart: false,
      label: "Chưa mở bài",
    });
    expect(examAvailability(exam, now - 1000).canStart).toBe(true);
    expect(examAvailability(exam, now + 60000)).toMatchObject({
      canStart: false,
      label: "Đã đóng bài",
    });
  });
  it("does not allow another attempt after the limit or archive", () => {
    const attempts = [
      { id: "a", status: "GRADED", attemptNo: 1, expiresAt: exam.closeAt },
    ];
    expect(examAvailability({ ...exam, attempts }, now)).toMatchObject({
      canStart: false,
      label: "Đã hết lượt làm bài",
    });
    expect(
      examAvailability({ ...exam, status: "ARCHIVED" }, now).canStart,
    ).toBe(false);
  });
  it("resumes an active attempt even when no new attempts can be started", () => {
    const attempts = [
      { id: "a", status: "IN_PROGRESS", attemptNo: 1, expiresAt: exam.closeAt },
    ];
    expect(
      examAvailability({ ...exam, status: "ARCHIVED", attempts }, now),
    ).toMatchObject({ canStart: true, resume: true });
  });
  it("does not present an expired attempt as resumable", () => {
    const attempts = [
      {
        id: "a",
        status: "IN_PROGRESS",
        attemptNo: 1,
        expiresAt: new Date(now).toISOString(),
      },
    ];
    expect(examAvailability({ ...exam, attempts }, now)).toMatchObject({
      canStart: false,
      resume: false,
    });
  });
});
