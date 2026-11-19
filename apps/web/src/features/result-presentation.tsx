import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import "../styles/grading-results.css";

export const attemptLabel = (status: string) =>
  ({
    NOT_STARTED: "Chưa thi",
    IN_PROGRESS: "Đang thi",
    SUBMITTED: "Đã nộp",
    PENDING_MANUAL_GRADING: "Chờ chấm tự luận",
    GRADED: "Đã chấm",
  })[status] || status;

export const strategyLabel = (strategy: string) =>
  strategy === "HIGHEST_SCORE"
    ? "Lấy lượt có điểm cao nhất"
    : "Lấy lượt thi mới nhất";

export function AttemptState({ status }: { status: string }) {
  return (
    <span
      className={`record-state ${status === "PENDING_MANUAL_GRADING" ? "record-waiting" : ""}`}
    >
      {attemptLabel(status)}
    </span>
  );
}

export function useResultExam(id: string | undefined) {
  return useQuery({
    staleTime: 0,
    queryKey: ["result-exam", id],
    queryFn: () =>
      api<{
        title: string;
        resultStrategy: string;
        resultReleaseMode: string;
        closeAt: string;
        manualResultsReleasedAt: string | null;
      }>(`/teacher/exams/${id}`),
    enabled: !!id,
  });
}
