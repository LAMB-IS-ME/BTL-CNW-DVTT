import type { Db } from "../db/client.js";
import { expireAttempts } from "../modules/attempts/service.js";
export function startExpiryJob(db: Db) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await expireAttempts(db);
    } catch {
      console.error(JSON.stringify({ event: "expiry_job_failed" }));
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 15000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
