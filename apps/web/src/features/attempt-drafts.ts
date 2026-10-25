import { z } from "zod";
import type { AnswerInput, AttemptDto } from "@exam/shared";

export const DRAFT_TTL = 24 * 60 * 60 * 1000;
export const DRAFT_PREFIX = "examspace.student-draft.v1:";
const LOGOUT_PREFIX = "examspace.student-draft.logout:";
const id = z.string().min(1).max(128);
const recordSchema = z
  .object({
    schemaVersion: z.literal(1),
    userId: id,
    examId: id,
    attemptId: id,
    questionId: id,
    writerId: id,
    recordId: id,
    editId: id,
    // Local cleanup epoch, never an authentication/session credential.
    logoutEpoch: id.nullable(),
    baseSavedAt: z.iso.datetime().nullable(),
    answer: z
      .object({
        answerText: z.string().max(50000),
        selectedOptionIds: z
          .array(id)
          .max(20)
          .refine((v) => new Set(v).size === v.length),
      })
      .strict(),
    editedAt: z.number().finite().nonnegative(),
    recordedAt: z.number().finite().nonnegative(),
  })
  .strict()
  .refine((r) => r.editedAt <= r.recordedAt);
export type DraftRecord = z.infer<typeof recordSchema>;
export type DraftIdentity = Pick<
  DraftRecord,
  "userId" | "examId" | "attemptId"
>;
type StorageAccess = () => Storage;
const userPrefix = (userId: string) =>
  `${DRAFT_PREFIX}${encodeURIComponent(userId)}:`;
export const draftLogoutKey = (userId: string) =>
  `${LOGOUT_PREFIX}${encodeURIComponent(userId)}`;
export const draftKey = (
  r: Pick<
    DraftRecord,
    "userId" | "examId" | "attemptId" | "questionId" | "writerId" | "recordId"
  >,
) =>
  userPrefix(r.userId) +
  [r.examId, r.attemptId, r.questionId, r.writerId, r.recordId]
    .map(encodeURIComponent)
    .join(":");
const keys = (s: Storage) =>
  Array.from({ length: s.length }, (_, i) => s.key(i)).filter(
    (k): k is string => k !== null,
  );
const browserStorage = () => window.localStorage;
// Retrying a denied logout cleanup must precede any later read in this document.
const pendingPurges = new Set<string>();

export function sameDraftAnswer(a: AnswerInput, b: AnswerInput) {
  return (
    a.answerText === b.answerText &&
    a.selectedOptionIds.length === b.selectedOptionIds.length &&
    a.selectedOptionIds.every((v) => b.selectedOptionIds.includes(v))
  );
}

export function clearUserDrafts(
  userId: string,
  access: StorageAccess = browserStorage,
): boolean {
  pendingPurges.add(userId);
  try {
    const s = access();
    // A barrier fences still-open writers before removing any records. It contains no answer data.
    const epoch = crypto.randomUUID();
    try {
      s.setItem(draftLogoutKey(userId), epoch);
    } catch {
      // A full origin may have no room for a new barrier. Free only this user's
      // drafts, then establish the barrier and sweep again to cover concurrent writers.
      for (const k of keys(s))
        if (k.startsWith(userPrefix(userId))) s.removeItem(k);
      s.setItem(draftLogoutKey(userId), epoch);
    }
    for (const k of keys(s))
      if (k.startsWith(userPrefix(userId))) s.removeItem(k);
    pendingPurges.delete(userId);
    return true;
  } catch {
    return false;
  }
}

export class AttemptDraftStore {
  readonly writerId = crypto.randomUUID();
  readonly latest = new Map<string, DraftRecord>();
  readonly unpersisted = new Set<string>();
  private barrier: string | null = null;
  private barrierKnown = false;
  private ended = false;
  private expiries = new Map<string, number>();
  private pruned = false;

  constructor(
    readonly identity: DraftIdentity,
    private access: StorageAccess = browserStorage,
    private now: () => number = Date.now,
  ) {
    try {
      if (
        pendingPurges.has(identity.userId) &&
        !clearUserDrafts(identity.userId, access)
      )
        throw new Error("Draft cleanup unavailable");
      this.barrier = access().getItem(draftLogoutKey(identity.userId));
      this.barrierKnown = true;
    } catch {
      /* Report unavailable storage on the first read/write. */
    }
  }

  stop() {
    this.ended = true;
  }

  revoked() {
    try {
      if (
        this.barrierKnown &&
        this.access().getItem(draftLogoutKey(this.identity.userId)) !==
          this.barrier
      )
        this.stop();
    } catch {
      /* Storage denial must not disable P1 autosave. */
    }
    return this.ended;
  }

  private storage() {
    if (this.ended) throw new Error("Draft writer ended");
    if (!this.barrierKnown)
      throw new Error("Draft storage unavailable at entry");
    if (
      pendingPurges.has(this.identity.userId) &&
      !clearUserDrafts(this.identity.userId, this.access)
    )
      throw new Error("Draft cleanup unavailable");
    const s = this.access();
    const barrier = s.getItem(draftLogoutKey(this.identity.userId));
    if (this.barrierKnown && barrier !== this.barrier) {
      this.stop();
      throw new Error("Draft writer revoked by logout");
    }
    this.barrier = barrier;
    this.barrierKnown = true;
    // Keys are immutable: cache only timestamps, so a long essay is not parsed
    // again on every keystroke. Enforce retention on writes/cleanup as well as entry.
    // Retention also applies to expired records left by a previously signed-in
    // account. Only timestamps are used here; read() exposes this user's answers.
    const present = keys(s).filter((k) => k.startsWith(DRAFT_PREFIX));
    const presentSet = new Set(present);
    for (const k of this.expiries.keys())
      if (!presentSet.has(k)) this.expiries.delete(k);
    for (const k of present) {
      let editedAt = this.expiries.get(k);
      if (editedAt === undefined) {
        try {
          const value = JSON.parse(s.getItem(k) ?? "null");
          if (
            typeof value?.editedAt === "number" &&
            Number.isFinite(value.editedAt)
          ) {
            editedAt = value.editedAt;
            this.expiries.set(k, editedAt!);
          }
        } catch {
          /* Full schema validation and malformed-record cleanup happen in read(). */
        }
      }
      // Independent response anchors may lag by different amounts. A future
      // timestamp relative to this document is not grounds to delete another writer.
      if (editedAt !== undefined && this.now() - editedAt >= DRAFT_TTL) {
        s.removeItem(k);
        this.expiries.delete(k);
        this.pruned = true;
      }
    }
    return s;
  }

  read(attempt: AttemptDto): {
    records: DraftRecord[];
    failed: boolean;
    discarded: boolean;
  } {
    const records: DraftRecord[] = [];
    let discarded = false;
    try {
      const s = this.storage();
      discarded = this.pruned;
      this.pruned = false;
      for (const k of keys(s)) {
        // Never inspect another account's content.
        if (!k.startsWith(userPrefix(this.identity.userId))) continue;
        let r: DraftRecord;
        try {
          r = recordSchema.parse(JSON.parse(s.getItem(k) ?? "null"));
          if (
            draftKey(r) !== k ||
            r.userId !== this.identity.userId ||
            r.logoutEpoch !== this.barrier ||
            this.now() - r.editedAt >= DRAFT_TTL
          )
            throw new Error("Invalid or expired draft");
        } catch {
          s.removeItem(k);
          discarded = true;
          continue;
        }
        if (
          r.attemptId !== this.identity.attemptId ||
          r.examId !== this.identity.examId
        )
          continue;
        const q = attempt.questions.find((q) => q.id === r.questionId);
        const valid =
          q &&
          (q.type === "ESSAY"
            ? r.answer.selectedOptionIds.length === 0
            : r.answer.answerText === "" &&
              (q.type === "MULTIPLE_CHOICE" ||
                r.answer.selectedOptionIds.length <= 1) &&
              r.answer.selectedOptionIds.every((v) =>
                q.options.some((o) => o.id === v),
              ));
        if (!valid) {
          s.removeItem(k);
          discarded = true;
        } else if (!sameDraftAnswer(r.answer, q.answer)) records.push(r);
        else s.removeItem(k); // Exact immutable record; no duplicate PUT or deletion of a later edit.
      }
      return { records, failed: false, discarded };
    } catch {
      return { records, failed: true, discarded };
    }
  }

  put(
    questionId: string,
    answer: AnswerInput,
    baseSavedAt: string | null,
    edit: { editId: string; editedAt: number } = {
      editId: crypto.randomUUID(),
      editedAt: this.now(),
    },
  ): boolean {
    const r: DraftRecord = {
      schemaVersion: 1,
      ...this.identity,
      questionId,
      writerId: this.writerId,
      recordId: crypto.randomUUID(),
      editId: edit.editId,
      logoutEpoch: this.barrier,
      editedAt: edit.editedAt,
      baseSavedAt,
      answer: {
        answerText: answer.answerText,
        selectedOptionIds: [...answer.selectedOptionIds],
      },
      recordedAt: this.now(),
    };
    // Keep the newest edit in memory even when persistence fails.
    this.latest.set(questionId, r);
    this.unpersisted.add(questionId);
    try {
      const s = this.storage();
      recordSchema.parse(r);
      if (this.now() - r.editedAt >= DRAFT_TTL) return false;
      s.setItem(draftKey(r), JSON.stringify(r));
      this.expiries.set(draftKey(r), r.editedAt);
      // Another tab can log out between our preflight check and setItem.
      // Either its cleanup sees this record, or this postflight check removes it.
      if (s.getItem(draftLogoutKey(this.identity.userId)) !== this.barrier) {
        this.stop();
        s.removeItem(draftKey(r));
        return false;
      }
      // Write first, then prune only this writer/question. A crash leaves an extra recoverable record.
      const prefix = draftKey(r).slice(
        0,
        -encodeURIComponent(r.recordId).length,
      );
      for (const k of keys(s))
        if (k.startsWith(prefix) && k !== draftKey(r)) s.removeItem(k);
      this.unpersisted.delete(questionId);
      return true;
    } catch {
      return false;
    }
  }

  remove(records: DraftRecord[]): boolean {
    if (!records.length) return true;
    try {
      const s = this.storage();
      for (const r of records) {
        if (
          r.userId === this.identity.userId &&
          r.attemptId === this.identity.attemptId &&
          r.examId === this.identity.examId
        )
          s.removeItem(draftKey(r));
      }
      return true;
    } catch {
      return false;
    }
  }

  discardQuestion(questionId: string): boolean {
    const r = this.latest.get(questionId);
    this.latest.delete(questionId);
    this.unpersisted.delete(questionId);
    if (!r) return true;
    try {
      const s = this.storage();
      const prefix = draftKey(r).slice(
        0,
        -encodeURIComponent(r.recordId).length,
      );
      for (const k of keys(s)) if (k.startsWith(prefix)) s.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }

  acknowledge(
    questionId: string,
    editId: string | undefined,
    savedAt: string,
  ): boolean {
    const current = this.latest.get(questionId);
    if (!current) return true;
    if (current.editId === editId) return this.discardQuestion(questionId);
    // The ACK belongs to an older value. Rebase only our in-memory descendant,
    // never a recovered/stale record from another writer, and retain its edit time.
    return this.put(questionId, current.answer, savedAt, current);
  }
}
