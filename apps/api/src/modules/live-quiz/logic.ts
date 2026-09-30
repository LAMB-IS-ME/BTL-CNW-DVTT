export function quizPoints(
  correct: boolean,
  base: number,
  remainingMs: number,
  totalMs: number,
) {
  if (!correct) return 0;
  const ratio = Math.max(0, Math.min(1, remainingMs / totalMs));
  return base + Math.round(base * 0.5 * ratio);
}
