export function resultVisible(
  exam: {
    resultReleaseMode: string;
    closeAt: Date;
    manualResultsReleasedAt: Date | null;
  },
  status: string,
  now = new Date(),
) {
  return (
    status === "GRADED" &&
    (exam.resultReleaseMode === "IMMEDIATE" ||
      (exam.resultReleaseMode === "AFTER_CLOSE" && now >= exam.closeAt) ||
      (exam.resultReleaseMode === "MANUAL" &&
        exam.manualResultsReleasedAt !== null))
  );
}
export function finalAttempt<
  T extends { status: string; attemptNo: number; totalScore: unknown },
>(attempts: T[], strategy: string): T | undefined {
  const latest = [...attempts].sort((a, b) => b.attemptNo - a.attemptNo);
  if (strategy === "LATEST_ATTEMPT") return latest[0];
  return (
    latest
      .filter((a) => a.status === "GRADED")
      .sort(
        (a, b) =>
          Number(b.totalScore) - Number(a.totalScore) ||
          b.attemptNo - a.attemptNo,
      )[0] || latest[0]
  );
}
