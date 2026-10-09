export type AssignedExam = {
  id: string;
  title: string;
  descriptionMarkdown: string;
  status: string;
  openAt: string;
  closeAt: string;
  durationMinutes: number;
  maxAttempts: number;
  serverNow?: string;
  attempts: {
    id: string;
    status: string;
    attemptNo: number;
    expiresAt: string;
  }[];
};
// Mirror existing start/resume policy for presentation. The server still decides.
export function examAvailability(exam: AssignedExam, now: number) {
  const resume = exam.attempts.some(
    (a) => a.status === "IN_PROGRESS" && Date.parse(a.expiresAt) > now,
  );
  if (resume) return { label: "Đang làm bài", canStart: true, resume };
  const label =
    exam.status !== "PUBLISHED"
      ? "Đã lưu trữ"
      : now < Date.parse(exam.openAt)
        ? "Chưa mở bài"
        : now >= Date.parse(exam.closeAt)
          ? "Đã đóng bài"
          : exam.attempts.length >= exam.maxAttempts
            ? "Đã hết lượt làm bài"
            : "Có thể bắt đầu";
  return { label, canStart: label === "Có thể bắt đầu", resume };
}
