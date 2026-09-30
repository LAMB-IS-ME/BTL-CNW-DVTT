import type { Db } from "../db/client.js";
import type { MonitorSnapshot, PresenceStatus } from "@exam/shared";
export class Presence {
  private entries = new Map<
    string,
    { sockets: Set<string>; timer?: ReturnType<typeof setTimeout> }
  >();
  constructor(
    private changed: (examId: string) => void,
    private graceMs = 10000,
  ) {}
  join(attemptId: string, socketId: string, examId: string) {
    const entry = this.entries.get(attemptId) || { sockets: new Set<string>() };
    clearTimeout(entry.timer);
    entry.timer = undefined;
    entry.sockets.add(socketId);
    this.entries.set(attemptId, entry);
    this.changed(examId);
  }
  leave(attemptId: string, socketId: string, examId: string) {
    const entry = this.entries.get(attemptId);
    if (!entry) return;
    entry.sockets.delete(socketId);
    if (entry.sockets.size) return;
    entry.timer = setTimeout(() => {
      this.entries.delete(attemptId);
      this.changed(examId);
    }, this.graceMs);
    entry.timer.unref();
  }
  online(id: string) {
    return this.entries.has(id);
  }
  close() {
    for (const e of this.entries.values()) clearTimeout(e.timer);
    this.entries.clear();
  }
}
export async function monitorSnapshot(
  db: Db,
  examId: string,
  presence?: Presence,
): Promise<MonitorSnapshot> {
  const students = await db.user.findMany({
    where: {
      OR: [
        { memberships: { some: { class: { exams: { some: { examId } } } } } },
        { attempts: { some: { examId } } },
      ],
    },
    select: {
      id: true,
      fullName: true,
      studentCode: true,
      attempts: { where: { examId }, orderBy: { attemptNo: "desc" }, take: 1 },
    },
    orderBy: { fullName: "asc" },
  });
  return {
    examId,
    serverNow: new Date().toISOString(),
    rows: students.map((s) => {
      const a = s.attempts[0];
      const status: PresenceStatus = !a
        ? "NOT_STARTED"
        : a.status !== "IN_PROGRESS"
          ? "SUBMITTED"
          : presence?.online(a.id)
            ? "IN_PROGRESS"
            : "DISCONNECTED";
      return {
        studentId: s.id,
        fullName: s.fullName,
        studentCode: s.studentCode,
        status,
        attemptId: a?.id || null,
        startedAt: a?.startedAt.toISOString() || null,
        expiresAt: a?.expiresAt.toISOString() || null,
        lastActivityAt: a?.lastActivityAt.toISOString() || null,
      };
    }),
  };
}
