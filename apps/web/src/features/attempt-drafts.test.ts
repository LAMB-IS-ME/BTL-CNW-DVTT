// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { AttemptDto } from "@exam/shared";
import {
  AttemptDraftStore,
  clearUserDrafts,
  DRAFT_PREFIX,
  DRAFT_TTL,
  draftKey,
  sameDraftAnswer,
} from "./attempt-drafts";

const now = Date.parse("2026-10-25T10:00:00.000Z");
const identity = { userId: "student", examId: "exam", attemptId: "attempt" };
const empty = { selectedOptionIds: [], answerText: "" };
const attempt: AttemptDto = {
  id: "attempt",
  examId: "exam",
  title: "Test",
  attemptNo: 1,
  status: "IN_PROGRESS",
  startedAt: new Date(now).toISOString(),
  serverNow: new Date(now).toISOString(),
  expiresAt: new Date(now + 60000).toISOString(),
  submittedAt: null,
  questions: [
    {
      id: "essay",
      type: "ESSAY",
      promptMarkdown: "Private prompt",
      options: [],
      points: 1,
      answer: { ...empty, savedAt: null },
    },
    {
      id: "choice",
      type: "MULTIPLE_CHOICE",
      promptMarkdown: "Other prompt",
      options: [
        { id: "a", contentMarkdown: "A" },
        { id: "b", contentMarkdown: "B" },
      ],
      points: 1,
      answer: { ...empty, savedAt: null },
    },
  ],
};
const store = (userId = "student", time = now) =>
  new AttemptDraftStore(
    { ...identity, userId },
    () => localStorage,
    () => time,
  );
const all = () =>
  Object.keys(localStorage)
    .filter((k) => k.startsWith(DRAFT_PREFIX))
    .map((k) => JSON.parse(localStorage.getItem(k)!));
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

it("persists only answer/identity/revision metadata synchronously, including a long essay", () => {
  const s = store();
  expect(
    s.put("essay", { ...empty, answerText: "x".repeat(50000) }, null),
  ).toBe(true);
  const [r] = all();
  expect(r).toMatchObject({
    schemaVersion: 1,
    ...identity,
    questionId: "essay",
    baseSavedAt: null,
    editedAt: now,
  });
  expect(r.answer.answerText).toHaveLength(50000);
  expect(Object.keys(r).sort()).toEqual(
    [
      "schemaVersion",
      "userId",
      "examId",
      "attemptId",
      "questionId",
      "writerId",
      "recordId",
      "editId",
      "logoutEpoch",
      "baseSavedAt",
      "answer",
      "editedAt",
      "recordedAt",
    ].sort(),
  );
  expect(store().read(attempt).records).toHaveLength(1);
});

it("preserves empty essay and deselected options when the server still has content", () => {
  const s = store();
  s.put("essay", empty, null);
  s.put("choice", empty, null);
  const remote = structuredClone(attempt);
  remote.questions[0]!.answer.answerText = "Server text";
  remote.questions[1]!.answer.selectedOptionIds = ["a"];
  expect(
    store()
      .read(remote)
      .records.map((r) => r.answer),
  ).toEqual([empty, empty]);
});

it("bounds records to one per writer/question and never deletes another writer or question", () => {
  const a = store(),
    b = store();
  b.put("essay", { ...empty, answerText: "Other tab" }, null);
  a.put("choice", { ...empty, selectedOptionIds: ["a"] }, null);
  for (let n = 0; n < 30; n++)
    a.put("essay", { ...empty, answerText: `Edit ${n}` }, null);
  expect(all()).toHaveLength(3);
  const sent = a.latest.get("essay")!;
  a.acknowledge("essay", sent.editId, "2026-10-25T10:00:01.000Z");
  expect(all()).toHaveLength(2);
  expect(all().some((r) => r.writerId === b.writerId)).toBe(true);
});

it("an older ACK rebases the newer owned edit without deleting it or extending its TTL", () => {
  const s = store();
  s.put("essay", { ...empty, answerText: "First" }, null);
  const old = s.latest.get("essay")!;
  s.put("essay", { ...empty, answerText: "Second" }, null);
  const next = s.latest.get("essay")!;
  s.acknowledge("essay", old.editId, "2026-10-25T10:00:01.000Z");
  expect(all()).toHaveLength(1);
  expect(all()[0]).toMatchObject({
    answer: next.answer,
    editId: next.editId,
    editedAt: next.editedAt,
    baseSavedAt: "2026-10-25T10:00:01.000Z",
  });
  expect(all()[0].recordId).not.toBe(next.recordId);
});

it("writes before cleanup and keeps the previous durable draft when quota is exceeded", () => {
  const s = store();
  s.put("essay", { ...empty, answerText: "Durable" }, null);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Full", "QuotaExceededError");
  });
  expect(s.put("essay", { ...empty, answerText: "Only in memory" }, null)).toBe(
    false,
  );
  expect(all()[0].answer.answerText).toBe("Durable");
  expect(s.latest.get("essay")!.answer.answerText).toBe("Only in memory");
});

it("reports storage access and cleanup errors without throwing", () => {
  const s = new AttemptDraftStore(identity, () => {
    throw new DOMException("Denied", "SecurityError");
  });
  expect(s.read(attempt).failed).toBe(true);
  expect(s.put("essay", empty, null)).toBe(false);
  expect(s.latest.has("essay")).toBe(true);
});

it("expires at exactly 24 hours after the edit and prunes old attempts on access", () => {
  const s = store("student", now - DRAFT_TTL);
  s.put("essay", { ...empty, answerText: "Expired" }, null);
  const other = new AttemptDraftStore(
    { ...identity, attemptId: "old-attempt" },
    () => localStorage,
    () => now - DRAFT_TTL,
  );
  other.put("essay", { ...empty, answerText: "Old attempt" }, null);
  expect(store().read(attempt)).toEqual({
    records: [],
    failed: false,
    discarded: true,
  });
  expect(all()).toHaveLength(0);
});

it("rejects corrupt JSON, mismatched keys, unknown fields/questions/options and inconsistent timestamps", () => {
  const s = store();
  s.put("essay", { ...empty, answerText: "Valid" }, null);
  const original = s.latest.get("essay")!;
  const mutations = [
    { questionId: "unknown" },
    { answer: { ...empty, selectedOptionIds: ["invalid"] } },
    { schemaVersion: 2 },
    { token: "must-not-be-accepted" },
    { editedAt: now + 60001 },
  ];
  for (const mutation of mutations) {
    const r = { ...original, ...mutation, recordId: crypto.randomUUID() };
    localStorage.setItem(draftKey(r), JSON.stringify(r));
  }
  localStorage.setItem(`${DRAFT_PREFIX}student:broken`, "{");
  localStorage.setItem(
    `${DRAFT_PREFIX}student:wrong-key`,
    JSON.stringify(original),
  );
  const result = store().read(attempt);
  expect(result.records).toEqual([original]);
  expect(result.discarded).toBe(true);
  expect(all()).toHaveLength(1);
});

it("does not read or remove another account and isolates exam/attempt identity", () => {
  store("other").put(
    "essay",
    { ...empty, answerText: "Other account secret" },
    null,
  );
  new AttemptDraftStore(
    { ...identity, examId: "other-exam" },
    () => localStorage,
    () => now,
  ).put("essay", { ...empty, answerText: "Other exam" }, null);
  new AttemptDraftStore(
    { ...identity, attemptId: "other-attempt" },
    () => localStorage,
    () => now,
  ).put("essay", { ...empty, answerText: "Other attempt" }, null);
  expect(store().read(attempt).records).toHaveLength(0);
  expect(all()).toHaveLength(3);
});

it("identical server content is synchronized even when an ACK was lost, without retaining a duplicate", () => {
  const s = store();
  s.put("choice", { ...empty, selectedOptionIds: ["b", "a"] }, null);
  const remote = structuredClone(attempt);
  remote.questions[1]!.answer = {
    ...empty,
    selectedOptionIds: ["a", "b"],
    savedAt: "2026-10-25T10:00:01.000Z",
  };
  expect(store().read(remote).records).toHaveLength(0);
  expect(all()).toHaveLength(0);
  expect(
    sameDraftAnswer(
      { ...empty, selectedOptionIds: ["a", "b"] },
      { ...empty, selectedOptionIds: ["b", "a"] },
    ),
  ).toBe(true);
});

it("returns divergent writers and stale revisions for explicit review instead of rebasing or choosing a timestamp", () => {
  const a = store(),
    b = store();
  a.put("essay", { ...empty, answerText: "A" }, null);
  b.put("essay", { ...empty, answerText: "B" }, "2026-10-25T09:59:59.000Z");
  const records = store().read(attempt).records;
  expect(records.map((r) => r.answer.answerText).sort()).toEqual(["A", "B"]);
  expect(records.find((r) => r.writerId === b.writerId)!.baseSavedAt).toBe(
    "2026-10-25T09:59:59.000Z",
  );
});

it("removing an explicitly reviewed immutable record cannot delete the writer's subsequent edit", () => {
  const a = store(),
    reviewer = store();
  a.put("essay", { ...empty, answerText: "Seen" }, null);
  const seen = a.latest.get("essay")!;
  a.put("essay", { ...empty, answerText: "New unseen edit" }, null);
  reviewer.remove([seen]);
  expect(all()[0].answer.answerText).toBe("New unseen edit");
});

it("logout removes only that user's drafts and fences old writers and late ACKs", () => {
  const a = store(),
    b = store("other");
  a.put("essay", { ...empty, answerText: "A" }, null);
  const sent = a.latest.get("essay")!;
  b.put("essay", { ...empty, answerText: "B" }, null);
  expect(clearUserDrafts("student")).toBe(true);
  expect(a.put("essay", { ...empty, answerText: "Late" }, null)).toBe(false);
  expect(a.acknowledge("essay", sent.editId, "2026-10-25T10:00:01.000Z")).toBe(
    false,
  );
  expect(all().map((r) => r.userId)).toEqual(["other"]);
  expect(
    store().put("essay", { ...empty, answerText: "New session" }, null),
  ).toBe(true);
});

it("stopping a session preserves durable drafts but blocks later writes", () => {
  const s = store();
  s.put("essay", { ...empty, answerText: "Before expiry" }, null);
  s.stop();
  expect(s.put("essay", { ...empty, answerText: "Late" }, null)).toBe(false);
  expect(store().read(attempt).records[0]!.answer.answerText).toBe(
    "Before expiry",
  );
});

it("a logout interleaved with setItem cannot resurrect a late draft", () => {
  const s = store();
  const original = Storage.prototype.setItem;
  let interleaved = false;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (!interleaved && key.startsWith(DRAFT_PREFIX)) {
      interleaved = true;
      clearUserDrafts("student");
    }
    original.call(this, key, value);
  });
  expect(s.put("essay", { ...empty, answerText: "Late write" }, null)).toBe(
    false,
  );
  expect(all()).toHaveLength(0);
  expect(s.revoked()).toBe(true);
});

it("enforces the last-edit TTL on the next write without extending unrelated drafts", () => {
  let time = now;
  const s = new AttemptDraftStore(
    identity,
    () => localStorage,
    () => time,
  );
  s.put("essay", { ...empty, answerText: "Old edit" }, null);
  time += DRAFT_TTL;
  s.put("choice", { ...empty, selectedOptionIds: ["a"] }, null);
  expect(all().map((r) => r.questionId)).toEqual(["choice"]);
});

it("access by another account prunes expired records without exposing their content", () => {
  store("previous-account", now - DRAFT_TTL).put(
    "essay",
    { ...empty, answerText: "Expired private draft" },
    null,
  );
  const result = store().read(attempt);
  expect(result.records).toHaveLength(0);
  expect(all()).toHaveLength(0);
});

it("different server response latencies across tabs cannot delete another writer's valid draft", () => {
  const slowerAnchor = store();
  const fasterAnchor = store("student", now + 60 * 60 * 1000);
  fasterAnchor.put("essay", { ...empty, answerText: "Other live tab" }, null);
  slowerAnchor.put("choice", { ...empty, selectedOptionIds: ["a"] }, null);
  expect(all()).toHaveLength(2);
  expect(
    slowerAnchor
      .read(attempt)
      .records.some((r) => r.answer.answerText === "Other live tab"),
  ).toBe(true);
});

it("a draft left behind by failed logout cleanup is revoked even after a new document opens", () => {
  const s = store();
  s.put("essay", { ...empty, answerText: "Before explicit logout" }, null);
  const old = s.latest.get("essay")!;
  clearUserDrafts("student");
  // Simulate a record that survived a denied removeItem / browser termination.
  localStorage.setItem(draftKey(old), JSON.stringify(old));
  const result = store().read(attempt);
  expect(result.records).toHaveLength(0);
  expect(result.discarded).toBe(true);
  expect(all()).toHaveLength(0);
});

it("logout frees draft quota before retrying the revocation barrier and final cleanup", () => {
  const s = store();
  s.put("essay", { ...empty, answerText: "Fills the origin quota" }, null);
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (key.includes("student-draft.logout:") && all().length)
      throw new DOMException("Full", "QuotaExceededError");
    original.call(this, key, value);
  });
  expect(clearUserDrafts("student")).toBe(true);
  expect(all()).toHaveLength(0);
  expect(s.revoked()).toBe(true);
});
