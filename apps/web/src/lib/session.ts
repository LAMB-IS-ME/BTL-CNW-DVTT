// A generation fences responses/retries started under an earlier identity.
let generation = 0;
let ended = false;
type SessionEndReason = "expired" | "logout";
const listeners = new Set<(reason: SessionEndReason) => void>();
export const sessionGeneration = () => generation;
export const sessionEnded = () => ended;
export function endSession(reason: SessionEndReason = "expired") {
  if (ended) return;
  ended = true;
  generation++;
  listeners.forEach((listener) => listener(reason));
}
export function beginSession() {
  generation++;
  ended = false;
}
export function onSessionEnded(listener: (reason: SessionEndReason) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
