export function remainingSeconds(
  expiresAt: string,
  serverNow: string,
  receivedAt: number,
  now: number,
) {
  const offset = Date.parse(serverNow) - receivedAt;
  return Math.max(
    0,
    Math.ceil((Date.parse(expiresAt) - (now + offset)) / 1000),
  );
}
export function formatTime(seconds: number) {
  return `${Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0")}:${Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
