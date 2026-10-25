import { useAttemptPresence } from "../lib/socket";
import { ApiFailure } from "../lib/api";
import { memo, useState, useEffect, useRef, useCallback } from "react";
import { Link, useParams, useNavigate, useBlocker } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type {
  AttemptDto,
  AnswerInput,
  AnswerWrite,
  AttemptSubmission,
  StudentQuestion,
} from "@exam/shared";
import { api } from "../lib/api";
import { formatTime, remainingSeconds } from "../lib/timer";
import { ErrorBox, Loading } from "../components/ui";
import { Markdown } from "../components/Markdown";
// Timer ticks must not remount prompt images or disturb rich-content scrolling.
const FocusPrompt = memo(Markdown);
import { examAvailability, type AssignedExam } from "./student-exam-state";
import { useAuth } from "./auth";
import {
  endSession,
  onSessionEnded,
  sessionEnded,
  sessionGeneration,
} from "../lib/session";
import {
  AttemptDraftStore,
  DRAFT_TTL,
  draftLogoutKey,
  sameDraftAnswer,
  type DraftRecord,
} from "./attempt-drafts";

function FocusLoad({
  pending,
  error,
  retry,
}: {
  pending: boolean;
  error: unknown;
  retry: () => void;
}) {
  return (
    <section className="focus-entry" aria-label="Tải bài thi">
      {pending ? (
        <Loading />
      ) : (
        <>
          <ErrorBox error={error} />
          <button className="secondary" onClick={retry}>
            Thử tải lại
          </button>
        </>
      )}
    </section>
  );
}
export function StudentExams() {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["student-exams", page],
    queryFn: () =>
      api<AssignedExam[]>(`/student/exams?page=${page}&pageSize=20`),
    staleTime: 0,
  });
  return (
    <section className="focus-entry focus-catalog">
      <p className="focus-context">Không gian học tập</p>
      <h1>Bài thi được giao</h1>
      <p className="focus-entry-note">
        Xem lịch thi hoặc tiếp tục lượt thi đang làm.
      </p>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <>
          <ErrorBox error={q.error} />
          <button className="secondary" onClick={() => void q.refetch()}>
            Thử tải lại
          </button>
        </>
      ) : q.data?.length ? (
        <div className="focus-exam-list">
          {q.data.map((e) => {
            const state = examAvailability(e, Date.now());
            return (
              <article key={e.id}>
                <p className="focus-context">{state.label}</p>
                <h2>
                  <Link to={`/student/exams/${e.id}`}>{e.title}</Link>
                </h2>
                <p>
                  {e.durationMinutes} phút · {e.attempts.length}/{e.maxAttempts}{" "}
                  lượt đã dùng
                </p>
                <p>
                  Mở: {new Date(e.openAt).toLocaleString()} · Đóng:{" "}
                  {new Date(e.closeAt).toLocaleString()}
                </p>
                <Link className="focus-exam-open" to={`/student/exams/${e.id}`}>
                  {state.resume ? "Tiếp tục làm bài" : "Xem bài thi"} →
                </Link>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="focus-empty">
          {page === 1
            ? "Bạn chưa được giao bài thi."
            : "Không còn bài thi ở trang này."}
        </p>
      )}
      {(page > 1 || (q.data?.length ?? 0) === 20) && (
        <nav className="focus-paging" aria-label="Trang bài thi">
          <button
            className="secondary"
            disabled={page === 1 || q.isFetching}
            onClick={() => setPage((p) => p - 1)}
          >
            Trang trước
          </button>
          <span>Trang {page}</span>
          <button
            className="secondary"
            disabled={q.isFetching || !!q.error || (q.data?.length ?? 0) < 20}
            onClick={() => setPage((p) => p + 1)}
          >
            Trang tiếp
          </button>
        </nav>
      )}
    </section>
  );
}
export function StudentExam() {
  const { id } = useParams(),
    nav = useNavigate();
  const [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const q = useQuery({
    queryKey: ["student-exam", id],
    queryFn: () => api<AssignedExam>(`/student/exams/${id}`),
    staleTime: 0,
  });
  if (q.isPending || !q.data)
    return (
      <FocusLoad
        pending={q.isPending}
        error={q.error}
        retry={() => void q.refetch()}
      />
    );
  const e = q.data;
  const availability = examAvailability(
    e,
    e.serverNow
      ? Date.parse(e.serverNow) + Math.max(0, now - q.dataUpdatedAt)
      : now,
  );
  return (
    <section className="focus-entry">
      <p className="focus-context">Trước khi làm bài</p>
      <h1>{e.title}</h1>
      <FocusPrompt>{e.descriptionMarkdown || ""}</FocusPrompt>
      <dl className="focus-entry-facts">
        <div>
          <dt>Thời lượng</dt>
          <dd>{e.durationMinutes} phút / lượt</dd>
        </div>
        <div>
          <dt>Lượt đã dùng</dt>
          <dd>
            {e.attempts.length} / {e.maxAttempts}
          </dd>
        </div>
        <div>
          <dt>Đóng bài</dt>
          <dd>{new Date(e.closeAt).toLocaleString()}</dd>
        </div>
      </dl>
      <p className="focus-entry-note">
        Bài tự động nộp khi hết thời gian làm bài hoặc tới thời điểm đóng bài.
        Đáp án được lưu tự động trong quá trình làm bài.
      </p>
      {!availability.canStart && (
        <p className="focus-entry-note">
          {availability.label}. Lịch mở bài:{" "}
          {new Date(e.openAt).toLocaleString()}.
        </p>
      )}
      <ErrorBox error={error} />
      <button
        disabled={busy || !availability.canStart}
        onClick={async () => {
          setBusy(true);
          try {
            const a = await api<AttemptDto>(
              `/student/exams/${id}/attempts`,
              "POST",
            );
            nav(`/student/attempts/${a.id}`);
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy
          ? "Đang mở bài…"
          : !availability.canStart
            ? availability.label
            : availability.resume
              ? "Tiếp tục làm bài"
              : "Bắt đầu làm bài"}
      </button>
      <div className="focus-entry-history">
        <h2>Lịch sử lượt thi</h2>
        {!e.attempts.length && <p>Bạn chưa bắt đầu lượt thi nào.</p>}
        {e.attempts.map((a) => (
          <p key={a.id}>
            Lượt {a.attemptNo} ·{" "}
            {a.status === "IN_PROGRESS"
              ? "Đang làm bài"
              : a.status === "PENDING_MANUAL_GRADING"
                ? "Chờ chấm tự luận"
                : "Đã chấm"}{" "}
            ·{" "}
            <Link
              to={
                a.status === "IN_PROGRESS"
                  ? `/student/attempts/${a.id}`
                  : `/student/results/${e.id}`
              }
            >
              {a.status === "IN_PROGRESS" ? "Tiếp tục" : "Xem kết quả"}
            </Link>
          </p>
        ))}
      </div>
    </section>
  );
}
export function AnswerControl({
  question,
  value,
  onChange,
  disabled = false,
}: {
  question: StudentQuestion;
  value: AnswerInput;
  onChange: (value: AnswerInput) => void;
  disabled?: boolean;
}) {
  return question.type === "ESSAY" ? (
    <label className="field">
      <span>Bài làm tự luận</span>
      <textarea
        aria-label="Bài làm tự luận"
        rows={9}
        value={value.answerText}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, answerText: e.target.value })}
      />
    </label>
  ) : (
    <div>
      {question.options.map((o) => (
        <label className="choice" key={o.id}>
          <input
            type={question.type === "MULTIPLE_CHOICE" ? "checkbox" : "radio"}
            name={question.id}
            value={o.id}
            checked={value.selectedOptionIds.includes(o.id)}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                answerText: "",
                selectedOptionIds:
                  question.type === "MULTIPLE_CHOICE"
                    ? e.target.checked
                      ? [...value.selectedOptionIds, o.id]
                      : value.selectedOptionIds.filter((id) => id !== o.id)
                    : [o.id],
              })
            }
          />
          <Markdown>{o.contentMarkdown}</Markdown>
        </label>
      ))}
    </div>
  );
}
export function AttemptPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [visit] = useState(() => crypto.randomUUID());
  const q = useQuery({
    queryKey: ["attempt", user?.id, id, visit],
    enabled: !!user,
    queryFn: async () => ({
      data: await api<AttemptDto>(`/student/attempts/${id}`),
      receivedAt: performance.now(),
    }),
    // A workspace owns mutable answers; never remount it from an old query snapshot.
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (!user || q.isPending || !q.data)
    return (
      <FocusLoad
        pending={q.isPending}
        error={q.error}
        retry={() => void q.refetch()}
      />
    );
  return (
    <AttemptWorkspace
      key={`${user.id}:${id}`}
      userId={user.id}
      initial={q.data.data}
      receivedAt={q.data.receivedAt}
    />
  );
}
const StudentAnswerControl = memo(AnswerControl);
function DraftReview({
  state,
  records,
  closed = false,
  busy,
  onResolve,
  onClear,
}: {
  state: AttemptDto;
  records: DraftRecord[];
  closed?: boolean;
  busy: boolean;
  onResolve?: (questionId: string, chosen?: DraftRecord) => Promise<void>;
  onClear?: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const preview = (q: StudentQuestion, value: AnswerInput) =>
    q.type === "ESSAY"
      ? value.answerText
      : q.options
          .filter((o) => value.selectedOptionIds.includes(o.id))
          .map((o) => o.contentMarkdown)
          .join("\n");
  return (
    <section
      className="focus-entry-note"
      aria-labelledby="draft-review-title"
      aria-busy={busy}
    >
      <h2 id="draft-review-title" ref={heading} tabIndex={-1}>
        {closed
          ? "Bản nháp của lượt thi đã khóa"
          : "Kiểm tra bản nháp trên thiết bị"}
      </h2>
      <p>
        {closed
          ? "Nội dung dưới đây chỉ để xem và sao chép, không được gửi vào bài đã nộp."
          : "Bản nháp chưa được xác nhận lưu trên máy chủ. Hãy quyết định cho từng câu trước khi tiếp tục làm bài hoặc nộp bài. Chọn một bản sẽ bỏ các bản còn lại đang hiển thị của câu đó."}
      </p>
      <p>
        Bản nháp không được mã hóa, chỉ có trên trình duyệt này và được giữ tối
        đa 24 giờ từ lần sửa cuối. Hãy đăng xuất khi dùng thiết bị chung.
      </p>
      {state.questions.map((q, index) => {
        const candidates = records.filter((r) => r.questionId === q.id);
        if (!candidates.length) return null;
        return (
          <article key={q.id}>
            <h3>Câu {index + 1}</h3>
            <label className="field">
              <span>Đáp án trên máy chủ — Câu {index + 1}</span>
              <textarea
                readOnly
                rows={3}
                style={{ minHeight: 0, height: "7rem" }}
                placeholder="Để trống"
                value={preview(q, q.answer)}
              />
            </label>
            {candidates.map((r, n) => (
              <div key={r.recordId}>
                <label className="field">
                  <span>
                    Bản nháp {n + 1} — Câu {index + 1} — nguồn{" "}
                    {r.writerId.slice(0, 8)}
                  </span>
                  <textarea
                    readOnly
                    rows={3}
                    style={{ minHeight: 0, height: "7rem" }}
                    placeholder="Để trống"
                    value={preview(q, r.answer)}
                  />
                </label>
                {!closed && (
                  <>
                    <p>
                      {r.baseSavedAt === q.answer.savedAt
                        ? "Bản nháp dựa trên phiên bản máy chủ hiện tại."
                        : "Phiên bản máy chủ đã khác. Không thể tự phục hồi bản này; bạn có thể sao chép nội dung, nhận đáp án máy chủ rồi chủ động chỉnh lại nếu lượt thi còn mở."}
                    </p>
                    <button
                      className="secondary"
                      disabled={busy || r.baseSavedAt !== q.answer.savedAt}
                      onClick={() => void onResolve?.(q.id, r)}
                    >
                      Phục hồi bản nháp {n + 1} của câu {index + 1}
                    </button>
                  </>
                )}
              </div>
            ))}
            {!closed && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void onResolve?.(q.id)}
              >
                Dùng đáp án máy chủ cho câu {index + 1}
              </button>
            )}
          </article>
        );
      })}
      {closed && (
        <button className="secondary" onClick={onClear}>
          Đã xem, xóa bản nháp trên thiết bị
        </button>
      )}
    </section>
  );
}
function isLockedFailure(error: unknown) {
  return (
    error instanceof ApiFailure &&
    ["ATTEMPT_EXPIRED", "ATTEMPT_ALREADY_SUBMITTED"].includes(error.code)
  );
}
function isConflictFailure(error: unknown) {
  return (
    error instanceof ApiFailure &&
    ["ANSWER_CONFLICT", "ATTEMPT_CONFLICT"].includes(error.code)
  );
}
function sameAnswer(left: AnswerInput, right: AnswerInput) {
  return (
    left.answerText === right.answerText &&
    left.selectedOptionIds.length === right.selectedOptionIds.length &&
    left.selectedOptionIds.every((id) => right.selectedOptionIds.includes(id))
  );
}
function StudentLeave({
  busy,
  saved,
  onStay,
  onSave,
}: {
  busy: boolean;
  saved: boolean;
  onStay: () => void;
  onSave: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current!;
    node.showModal();
    return () => {
      node.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="focus-dialog"
      aria-labelledby="focus-leave-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!inFlight.current) onStay();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        );
        const first = buttons[0],
          last = buttons[buttons.length - 1];
        if (!first || !last) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <h2 id="focus-leave-title">Đáp án chưa được lưu</h2>
      <p>
        {busy
          ? "Đang xác nhận nộp bài. Hãy chờ máy chủ phản hồi."
          : saved
            ? "Các đáp án đã được lưu. Bạn có thể rời trang."
            : "Thay đổi đang nằm trên trang này. Hãy lưu thành công trước khi rời bài thi."}
      </p>
      <ErrorBox error={error} />
      <div className="actions">
        <button
          autoFocus
          className="secondary"
          disabled={saving}
          onClick={onStay}
        >
          Tiếp tục làm bài
        </button>
        <button
          disabled={saving || busy}
          onClick={async () => {
            if (inFlight.current) return;
            inFlight.current = true;
            setSaving(true);
            setError(undefined);
            try {
              await onSave();
            } catch (e) {
              setError(e);
            } finally {
              inFlight.current = false;
              setSaving(false);
            }
          }}
        >
          {saving ? "Đang lưu…" : "Lưu và rời trang"}
        </button>
      </div>
    </dialog>
  );
}
function AttemptWorkspace({
  initial,
  receivedAt,
  userId,
}: {
  initial: AttemptDto;
  receivedAt: number;
  userId: string;
}) {
  const [a, setA] = useState(initial),
    [clock, setClock] = useState({ serverNow: initial.serverNow, receivedAt }),
    [now, setNow] = useState(performance.now()),
    [current, setCurrent] = useState(0),
    [indexOpen, setIndexOpen] = useState(false),
    [answers, setAnswers] = useState<Record<string, AnswerInput>>(() =>
      Object.fromEntries(initial.questions.map((q) => [q.id, q.answer])),
    ),
    [status, setStatus] = useState("Đã lưu"),
    [error, setError] = useState<unknown>(),
    [submitting, setSubmitting] = useState(false),
    [conflicted, setConflicted] = useState(false),
    [resolvingConflict, setResolvingConflict] = useState(false),
    [unsavedAtLock, setUnsavedAtLock] = useState(false),
    [compactClock, setCompactClock] = useState(false),
    [checkingDrafts, setCheckingDrafts] = useState(true),
    [draftReview, setDraftReview] = useState<DraftRecord[]>([]),
    [closedDrafts, setClosedDrafts] = useState<DraftRecord[]>([]),
    [storageFailed, setStorageFailed] = useState(false),
    [discardedDrafts, setDiscardedDrafts] = useState(false),
    [choosingDraft, setChoosingDraft] = useState(false),
    [localPersisted, setLocalPersisted] = useState(false);
  const pending = useRef(new Map<string, AnswerInput>()),
    queue = useRef<Promise<void> | null>(null),
    debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    active = useRef(initial.status === "IN_PROGRESS"),
    submittingRef = useRef(false),
    revisions = useRef(new Map<string, number>()),
    versions = useRef<Record<string, string | null>>(
      Object.fromEntries(
        initial.questions.map((q) => [q.id, q.answer.savedAt]),
      ),
    ),
    conflict = useRef(false),
    readSequence = useRef(0),
    live = useRef(true),
    generation = useRef(sessionGeneration()),
    reviewing = useRef(true),
    reviewRecords = useRef<DraftRecord[]>([]),
    adoptedSources = useRef(new Map<string, DraftRecord[]>()),
    choosing = useRef(false);
  const [drafts] = useState(
    () =>
      new AttemptDraftStore(
        { userId, examId: initial.examId, attemptId: initial.id },
        undefined,
        () =>
          Date.parse(initial.serverNow) +
          Math.max(0, performance.now() - receivedAt),
      ),
  );
  const isLive = useCallback(
    () =>
      live.current &&
      !sessionEnded() &&
      generation.current === sessionGeneration() &&
      !drafts.revoked(),
    [drafts],
  );
  const ensureLive = useCallback(() => {
    if (!isLive())
      throw new ApiFailure(
        "UNAUTHENTICATED",
        "Phiên đăng nhập đã kết thúc.",
        401,
      );
  }, [isLive]);
  const persistenceResult = useCallback(
    (ok: boolean) => {
      if (!isLive()) return;
      if (!ok) setStorageFailed(true);
      setLocalPersisted(ok && drafts.unpersisted.size === 0);
    },
    [isLive, drafts],
  );
  useEffect(() => {
    live.current = true;
    const found = drafts.read(initial);
    setStorageFailed(found.failed);
    setDiscardedDrafts(found.discarded);
    if (initial.status === "IN_PROGRESS") {
      reviewRecords.current = found.records;
      reviewing.current = found.records.length > 0;
      setDraftReview(found.records);
      if (found.records.length) setStatus("Cần kiểm tra bản nháp");
    } else {
      setClosedDrafts(found.records);
      reviewing.current = false;
    }
    setCheckingDrafts(false);
    const off = onSessionEnded(() => {
      active.current = false;
      clearTimeout(debounce.current);
      drafts.stop();
    });
    const logout = (event: StorageEvent) => {
      if (event.key === draftLogoutKey(userId) && drafts.revoked())
        endSession("expired");
    };
    window.addEventListener("storage", logout);
    return () => {
      live.current = false;
      off();
      window.removeEventListener("storage", logout);
    };
    // The workspace owns this authoritative entry snapshot; subsequent GETs reconcile below.
  }, [drafts, initial, userId]);
  const markConflict = useCallback(() => {
    conflict.current = true;
    setConflicted(true);
    setStatus("Cần kiểm tra đáp án");
  }, []);
  const nav = useNavigate();
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const indexGrid = useRef<HTMLElement>(null);
  const session = useRef<HTMLDivElement>(null);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname &&
      (submittingRef.current ||
        (active.current &&
          (pending.current.size > 0 || conflict.current || reviewing.current))),
  );
  useEffect(() => {
    const grid = indexGrid.current;
    const selected = grid?.querySelector<HTMLElement>("[aria-current]");
    if (!grid || !selected || !grid.clientHeight) return;
    const box = grid.getBoundingClientRect(),
      item = selected.getBoundingClientRect();
    if (item.top < box.top) grid.scrollTop -= box.top - item.top + 4;
    else if (item.bottom > box.bottom)
      grid.scrollTop += item.bottom - box.bottom + 4;
  }, [current, indexOpen]);
  useEffect(() => {
    const element = session.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      setCompactClock(
        !entry.isIntersecting && entry.boundingClientRect.bottom <= 0,
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const flush = useCallback(async () => {
    ensureLive();
    if (reviewing.current)
      throw new ApiFailure(
        "DRAFT_REVIEW_REQUIRED",
        "Hãy kiểm tra bản nháp trước khi lưu hoặc nộp bài.",
        0,
      );
    if (queue.current) return queue.current;
    const run = async () => {
      if (conflict.current)
        throw new ApiFailure(
          "ANSWER_CONFLICT",
          "Hãy kiểm tra đáp án trên máy chủ trước khi tiếp tục.",
          409,
        );
      while (pending.current.size && active.current && !conflict.current) {
        const [id, value] = pending.current.entries().next().value!;
        const sentEdit = drafts.latest.get(id)?.editId;
        setStatus("Đang lưu…");
        let last: unknown;
        for (let n = 0; n < 3; n++) {
          try {
            ensureLive();
            const saved = await api<{ savedAt: string }>(
              `/student/attempts/${initial.id}/answers/${id}`,
              "PUT",
              {
                ...value,
                expectedSavedAt: versions.current[id] ?? null,
              } satisfies AnswerWrite,
            );
            ensureLive();
            versions.current[id] = saved.savedAt;
            if (active.current) {
              persistenceResult(
                drafts.acknowledge(id, sentEdit, saved.savedAt),
              );
              const sources = adoptedSources.current.get(id) ?? [];
              if (sources.length) persistenceResult(drafts.remove(sources));
              adoptedSources.current.delete(id);
            }
            // Invalidate reads started before this acknowledgement, even when
            // no further keystroke occurred while the request was in flight.
            revisions.current.set(id, (revisions.current.get(id) ?? 0) + 1);
            last = undefined;
            break;
          } catch (e) {
            last = e;
            if (
              isLockedFailure(e) ||
              isConflictFailure(e) ||
              (e instanceof ApiFailure && [401, 403].includes(e.status))
            )
              break;
            if (n < 2)
              await new Promise((resolve) =>
                setTimeout(resolve, 500 * (n + 1)),
              );
          }
        }
        if (last) {
          if (!isLive()) throw last;
          if (isConflictFailure(last)) markConflict();
          else setStatus("Lỗi lưu");
          setError(last);
          throw last;
        }
        if (pending.current.get(id) === value) pending.current.delete(id);
      }
      if (conflict.current)
        throw new ApiFailure(
          "ANSWER_CONFLICT",
          "Hãy kiểm tra đáp án trên máy chủ trước khi tiếp tục.",
          409,
        );
      if (!pending.current.size && !conflict.current) {
        setStatus("Đã lưu");
        setError(undefined);
      }
    };
    queue.current = run().finally(() => {
      queue.current = null;
    });
    return queue.current;
  }, [initial.id, markConflict, drafts, ensureLive, isLive, persistenceResult]);
  const readState = useCallback(
    async (acceptRemote = false) => {
      // Edits may finish saving while this GET is in flight. Pending alone is not
      // enough to distinguish them from the older server snapshot.
      const beforeRead = new Map(revisions.current);
      const sequence = ++readSequence.current;
      const state = await api<AttemptDto>(`/student/attempts/${initial.id}`);
      if (!isLive() || sequence !== readSequence.current) return;
      const received = performance.now();
      setClock({ serverNow: state.serverNow, receivedAt: received });
      setNow(received);
      active.current = state.status === "IN_PROGRESS";
      if (!active.current) {
        // Keep unsent content available for read-only copying; it can never re-enter the queue.
        const stored = drafts.read(state);
        if (stored.failed) setStorageFailed(true);
        const unsent = [
          ...stored.records,
          ...drafts.latest.values(),
          ...reviewRecords.current,
        ].filter((r) =>
          state.questions.some(
            (q) =>
              q.id === r.questionId && !sameDraftAnswer(r.answer, q.answer),
          ),
        );
        setClosedDrafts([
          ...new Map(unsent.map((r) => [r.recordId, r])).values(),
        ]);
        reviewRecords.current = [];
        reviewing.current = false;
        setDraftReview([]);
        // A PUT may already be committed while its acknowledgement is delayed.
        // Compare pending content with the final server snapshot before warning.
        if (
          state.questions.some((q) => {
            const draft = pending.current.get(q.id);
            return draft && !sameAnswer(draft, q.answer);
          })
        )
          setUnsavedAtLock(true);
        pending.current.clear();
        conflict.current = false;
        setConflicted(false);
        setAnswers(
          Object.fromEntries(state.questions.map((q) => [q.id, q.answer])),
        );
        setA(state);
        return state;
      }
      setA(state);
      const accepted: Record<string, AnswerInput> = {};
      for (const q of state.questions) {
        // A deadline read may overlap an autosave. Its response must not reset
        // that save's revision or silently replace an edit still being sent.
        if (
          revisions.current.get(q.id) !== beforeRead.get(q.id) ||
          (queue.current && pending.current.has(q.id))
        )
          continue;
        if (reviewRecords.current.some((r) => r.questionId === q.id)) {
          // Unresolved candidates are read-only. Refresh their comparison without
          // treating the authoritative baseline as permission to rebase a draft.
          versions.current[q.id] = q.answer.savedAt;
          accepted[q.id] = q.answer;
          continue;
        }
        if (q.answer.savedAt === versions.current[q.id]) continue;
        if (!acceptRemote) {
          markConflict();
          continue;
        }
        accepted[q.id] = q.answer;
        versions.current[q.id] = q.answer.savedAt;
        revisions.current.set(q.id, (revisions.current.get(q.id) ?? 0) + 1);
        pending.current.delete(q.id);
        persistenceResult(drafts.discardQuestion(q.id));
        persistenceResult(
          drafts.remove(adoptedSources.current.get(q.id) ?? []),
        );
        adoptedSources.current.delete(q.id);
      }
      if (Object.keys(accepted).length)
        setAnswers((old) => ({ ...old, ...accepted }));
      if (acceptRemote) {
        conflict.current = false;
        setConflicted(false);
        setError(undefined);
        setStatus(pending.current.size ? "Đang lưu…" : "Đã lưu");
      }
      return state;
    },
    [initial.id, markConflict, drafts, isLive, persistenceResult],
  );
  const recover = useCallback(
    async (failure: unknown) => {
      if (!isLive()) return;
      setError(failure);
      if (isConflictFailure(failure)) {
        markConflict();
        await readState();
      } else if (isLockedFailure(failure)) {
        active.current = false;
        await readState();
      }
    },
    [readState, markConflict, isLive],
  );
  const refresh = useCallback(async () => {
    if (!isLive() || submittingRef.current) return;
    if (conflict.current || reviewing.current) {
      await readState();
      return;
    }
    try {
      await flush();
    } catch (e) {
      if (isLockedFailure(e) || isConflictFailure(e)) {
        await recover(e);
        return;
      }
      throw e;
    }
    await readState();
  }, [flush, readState, recover, isLive]);
  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 500);
    const online = () => void refresh().catch(setError);
    const visible = () => {
      if (document.visibilityState === "visible") online();
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (
        submittingRef.current ||
        (active.current &&
          (pending.current.size || conflict.current || reviewing.current))
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener("online", online);
    window.addEventListener("focus", online);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("beforeunload", unload);
    return () => {
      clearInterval(timer);
      clearTimeout(debounce.current);
      window.removeEventListener("online", online);
      window.removeEventListener("focus", online);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("beforeunload", unload);
    };
  }, [refresh]);
  useAttemptPresence(a.id, a.status === "IN_PROGRESS", refresh);
  const remaining = remainingSeconds(
    a.expiresAt,
    clock.serverNow,
    clock.receivedAt,
    now,
  );
  const expiryCheck = useRef({ busy: false, retryAt: 0, failures: 0 });
  useEffect(() => {
    if (
      remaining === 0 &&
      a.status === "IN_PROGRESS" &&
      !expiryCheck.current.busy &&
      now >= expiryCheck.current.retryAt
    ) {
      expiryCheck.current.busy = true;
      // GET finalizes only if the server deadline really passed. A countdown
      // estimate must never invoke manual submit or discard pending answers.
      readState()
        .then(() => {
          expiryCheck.current.failures = 0;
          expiryCheck.current.retryAt = 0;
        })
        .catch((e) => {
          setError(e);
          const failures = ++expiryCheck.current.failures;
          expiryCheck.current.retryAt =
            performance.now() +
            Math.min(15000, 1000 * 2 ** Math.min(failures - 1, 4));
        })
        .finally(() => {
          expiryCheck.current.busy = false;
        });
    }
  }, [remaining, a.status, now, readState]);
  useEffect(() => {
    if (a.status !== "IN_PROGRESS" && blocker.state === "blocked")
      blocker.reset();
  }, [a.status, blocker]);
  const question = a.questions[current]!;
  const change = useCallback(
    (value: AnswerInput) => {
      if (!isLive() || !active.current || conflict.current || reviewing.current)
        return;
      setAnswers((old) => ({ ...old, [question.id]: value }));
      revisions.current.set(
        question.id,
        (revisions.current.get(question.id) ?? 0) + 1,
      );
      pending.current.set(question.id, value);
      persistenceResult(
        drafts.put(question.id, value, versions.current[question.id] ?? null),
      );
      setStatus("Đang lưu…");
      clearTimeout(debounce.current);
      debounce.current = setTimeout(
        () => void flush().catch((e) => recover(e).catch(setError)),
        700,
      );
    },
    [question.id, flush, recover, drafts, isLive, persistenceResult],
  );
  const resolveDraft = async (questionId: string, chosen?: DraftRecord) => {
    if (choosing.current || !isLive()) return;
    choosing.current = true;
    setChoosingDraft(true);
    setError(undefined);
    try {
      // A decision is always checked against a new server read, including its deadline.
      const state = await readState();
      if (!state || !active.current || !isLive()) return;
      const q = state.questions.find((q) => q.id === questionId);
      if (!q || Date.parse(state.serverNow) >= Date.parse(state.expiresAt))
        return;
      const candidates = reviewRecords.current.filter(
        (r) => r.questionId === questionId,
      );
      if (!candidates.length) return;
      if (chosen) {
        if (
          !candidates.some((r) => r.recordId === chosen.recordId) ||
          Date.parse(state.serverNow) - chosen.editedAt >= DRAFT_TTL ||
          chosen.baseSavedAt !== q.answer.savedAt
        ) {
          setError(
            new Error(
              "Bản nháp đã hết hạn hoặc phiên bản máy chủ đã khác. Hãy xem lại và dùng đáp án máy chủ.",
            ),
          );
          return;
        }
        persistenceResult(
          drafts.put(questionId, chosen.answer, chosen.baseSavedAt, {
            editId: crypto.randomUUID(),
            editedAt: chosen.editedAt,
          }),
        );
        adoptedSources.current.set(questionId, [chosen]);
        pending.current.set(questionId, chosen.answer);
        revisions.current.set(
          questionId,
          (revisions.current.get(questionId) ?? 0) + 1,
        );
        setAnswers((old) => ({ ...old, [questionId]: chosen.answer }));
      } else {
        setAnswers((old) => ({ ...old, [questionId]: q.answer }));
      }
      // Only exact immutable candidates explicitly reviewed by this user are removed.
      persistenceResult(
        drafts.remove(
          candidates.filter((r) => r.recordId !== chosen?.recordId),
        ),
      );
      reviewRecords.current = reviewRecords.current.filter(
        (r) => r.questionId !== questionId,
      );
      reviewing.current = reviewRecords.current.length > 0;
      setDraftReview(reviewRecords.current);
      if (!reviewing.current) await flush();
    } catch (e) {
      await recover(e).catch(setError);
    } finally {
      choosing.current = false;
      if (isLive()) setChoosingDraft(false);
    }
  };
  const storageNotice = storageFailed && (
    <p role="alert" className="error">
      Không thể bảo đảm lưu hoặc dọn bản nháp trên thiết bị.{" "}
      {a.status === "IN_PROGRESS"
        ? "Đáp án đang sửa vẫn được giữ trên trang và tiếp tục tự lưu lên máy chủ; phần chưa được máy chủ xác nhận có thể mất nếu tải lại hoặc đóng tab."
        : "Lượt thi đã khóa; bản nháp không được gửi lại. Bạn có thể sao chép nội dung còn hiển thị."}
    </p>
  );
  if (a.status !== "IN_PROGRESS")
    return (
      <section className="focus-entry">
        <p className="focus-context">Hoàn tất lượt thi</p>
        <h1>Đã nộp bài thành công</h1>
        <p>
          Lượt {a.attemptNo} ·{" "}
          {a.status === "PENDING_MANUAL_GRADING"
            ? "Đang chờ chấm tự luận"
            : "Đã chấm"}
        </p>
        {unsavedAtLock && (
          <p role="alert" className="error">
            Lượt thi đã khóa. Một số thay đổi chưa kịp lưu; bài nộp sử dụng đáp
            án đã được máy chủ ghi nhận.
          </p>
        )}
        {storageNotice}
        {closedDrafts.length > 0 && (
          <DraftReview
            state={a}
            records={closedDrafts}
            closed
            busy={false}
            onClear={() => {
              persistenceResult(drafts.remove(closedDrafts));
              drafts.latest.clear();
              setClosedDrafts([]);
            }}
          />
        )}
        <Link className="button" to={`/student/results/${a.examId}`}>
          Xem trạng thái kết quả
        </Link>
      </section>
    );
  const isAnswered = (id: string) =>
    Boolean(answers[id]?.answerText || answers[id]?.selectedOptionIds.length);
  const answeredCount = a.questions.filter((q) => isAnswered(q.id)).length;
  const goToQuestion = (index: number) => {
    setCurrent(index);
    setIndexOpen(false);
    // Announce the new question and keep keyboard users in the reading flow.
    requestAnimationFrame(() => questionHeading.current?.focus());
  };
  return (
    <>
      {blocker.state === "blocked" && (
        <StudentLeave
          busy={submitting}
          saved={
            pending.current.size === 0 && !conflicted && !reviewing.current
          }
          onStay={() => blocker.reset()}
          onSave={async () => {
            await flush();
            blocker.proceed();
          }}
        />
      )}
      {compactClock && (
        <div className="focus-compact-clock" aria-hidden="true">
          <span>
            Câu {current + 1} / {a.questions.length}
          </span>
          <span>
            Còn lại{" "}
            <strong className={remaining < 60 ? "warning" : undefined}>
              {formatTime(remaining)}
            </strong>
          </span>
        </div>
      )}
      <div className="focus-session" ref={session}>
        <div>
          <p className="focus-context">
            Lượt thi {String(a.attemptNo).padStart(2, "0")}
          </p>
          <h1>{a.title}</h1>
        </div>
        <div className="focus-clock">
          <span>Thời gian còn lại</span>
          <strong
            className={remaining < 60 ? "warning" : undefined}
            aria-label="Thời gian còn lại"
          >
            {formatTime(remaining)}
          </strong>
        </div>
      </div>
      {storageNotice}
      {discardedDrafts && (
        <p className="focus-entry-note">
          Một số bản nháp không hợp lệ hoặc quá 24 giờ đã được bỏ. Đáp án máy
          chủ được giữ nguyên.
        </p>
      )}
      {checkingDrafts && <p>Đang kiểm tra bản nháp trên thiết bị…</p>}
      {draftReview.length > 0 && (
        <DraftReview
          state={a}
          records={draftReview}
          busy={choosingDraft || remaining === 0}
          onResolve={resolveDraft}
        />
      )}
      {conflicted && (
        <section className="error" role="alert">
          <p>
            Đáp án đã thay đổi ở tab khác hoặc lần lưu trước đã được máy chủ ghi
            nhận. Lựa chọn trên trang này được giữ nguyên và chưa được xác nhận
            để nộp.
          </p>
          <p>
            Dùng đáp án trên máy chủ để thay thế các câu bị xung đột, kiểm tra
            lại rồi tiếp tục làm bài hoặc nộp bài.
          </p>
          <button
            className="secondary"
            disabled={resolvingConflict}
            onClick={async () => {
              setResolvingConflict(true);
              try {
                await queue.current?.catch(() => {});
                await readState(true);
                if (active.current && !conflict.current) await flush();
              } catch (e) {
                setError(e);
              } finally {
                setResolvingConflict(false);
              }
            }}
          >
            Dùng đáp án trên máy chủ
          </button>
        </section>
      )}
      <ErrorBox error={isConflictFailure(error) ? undefined : error} />
      <div className="focus-workspace">
        <aside
          className={`focus-index${indexOpen ? " is-open" : ""}`}
          aria-label="Mục lục câu hỏi"
        >
          <h2>Mục lục câu hỏi</h2>
          <button
            className="focus-index-toggle"
            aria-expanded={indexOpen}
            aria-controls="focus-question-index"
            onClick={() => setIndexOpen(!indexOpen)}
          >
            <span>Mục lục câu hỏi {indexOpen ? "−" : "+"}</span>
            <span>
              {answeredCount}/{a.questions.length} đã trả lời
            </span>
          </button>
          <div className="focus-index-body" id="focus-question-index">
            <p className="focus-progress">
              {answeredCount} / {a.questions.length} câu đã trả lời
            </p>
            <nav
              ref={indexGrid}
              className="focus-index-grid"
              aria-label="Chuyển đến câu hỏi"
            >
              {a.questions.map((q, i) => (
                <button
                  key={q.id}
                  aria-label={`Câu ${i + 1}`}
                  aria-description={
                    isAnswered(q.id) ? "Đã trả lời" : "Chưa trả lời"
                  }
                  aria-current={i === current ? "step" : undefined}
                  data-answered={isAnswered(q.id)}
                  onClick={() => goToQuestion(i)}
                >
                  {String(i + 1).padStart(2, "0")}
                </button>
              ))}
            </nav>
            <p className="focus-index-legend">
              ✓ Đã trả lời · Số có viền: câu hiện tại
            </p>
          </div>
        </aside>
        <section
          className="focus-question"
          aria-labelledby="focus-question-heading"
        >
          <div className="focus-question-heading">
            <h2 id="focus-question-heading" ref={questionHeading} tabIndex={-1}>
              Câu {String(current + 1).padStart(2, "0")}{" "}
              <span>/ {a.questions.length}</span>
            </h2>
            <span>{question.points} điểm</span>
          </div>
          <div className="focus-prompt">
            <FocusPrompt>{question.promptMarkdown}</FocusPrompt>
          </div>
          <fieldset className="focus-answers">
            {question.type !== "ESSAY" && (
              <legend>
                {question.type === "MULTIPLE_CHOICE"
                  ? "Chọn tất cả đáp án phù hợp"
                  : "Chọn một đáp án"}
              </legend>
            )}
            <StudentAnswerControl
              question={question}
              value={
                answers[question.id] || {
                  selectedOptionIds: [],
                  answerText: "",
                }
              }
              onChange={change}
              disabled={
                checkingDrafts ||
                reviewing.current ||
                choosingDraft ||
                submitting ||
                conflicted ||
                remaining === 0 ||
                !active.current
              }
            />
          </fieldset>
          <div className="focus-paging">
            <button
              className="secondary"
              disabled={current === 0}
              onClick={() => goToQuestion(current - 1)}
            >
              Câu trước
            </button>
            <button
              className="secondary"
              disabled={current === a.questions.length - 1}
              onClick={() => goToQuestion(current + 1)}
            >
              Câu tiếp
            </button>
          </div>
          <div className="focus-save">
            <p role="status" data-error={status === "Lỗi lưu"}>
              {remaining === 0
                ? "Đã hết thời gian · Đang xác nhận nộp bài…"
                : status}
            </p>
            {status === "Lỗi lưu" && (
              <button
                className="secondary"
                onClick={() => void refresh().catch(setError)}
              >
                Thử lưu lại
              </button>
            )}
            <span>
              {status === "Lỗi lưu"
                ? "Thay đổi chưa được lưu."
                : conflicted
                  ? "Cần kiểm tra thay đổi ở tab khác."
                  : reviewing.current
                    ? "Chờ quyết định phục hồi bản nháp."
                    : "Đáp án được lưu tự động."}
            </span>
            <p aria-live="polite">
              {conflicted
                ? "Có xung đột · Chưa xác nhận đáp án hiện tại để nộp."
                : pending.current.size > 0
                  ? localPersisted
                    ? "Đã lưu nháp trên thiết bị · Chưa xác nhận lưu trên máy chủ."
                    : "Thay đổi đang ở bộ nhớ của trang · Chưa xác nhận lưu trên máy chủ."
                  : reviewing.current
                    ? "Bản nháp cần được kiểm tra trước khi tiếp tục."
                    : "Đáp án hiện tại đã được máy chủ xác nhận."}
            </p>
            <small>
              Bản nháp trên thiết bị không được mã hóa; đăng xuất để xóa khi
              dùng máy chung.
            </small>
          </div>
        </section>
        <div className="focus-submit">
          <StudentSubmit
            disabled={
              checkingDrafts ||
              reviewing.current ||
              choosingDraft ||
              submitting ||
              conflicted ||
              remaining === 0 ||
              !active.current
            }
            onConfirm={async () => {
              submittingRef.current = true;
              setSubmitting(true);
              try {
                await flush();
                ensureLive();
                if (!active.current || reviewing.current) return;
                const state = await api<AttemptDto>(
                  `/student/attempts/${a.id}/submit`,
                  "POST",
                  {
                    expectedVersions: { ...versions.current },
                  } satisfies AttemptSubmission,
                );
                ensureLive();
                active.current = false;
                submittingRef.current = false;
                pending.current.clear();
                readSequence.current++;
                setA(state);
                nav(`/student/results/${a.examId}`);
              } catch (e) {
                await recover(e);
                if (isConflictFailure(e)) return;
                throw e;
              } finally {
                submittingRef.current = false;
                setSubmitting(false);
              }
            }}
          />
          <p>Hãy chờ “Đã lưu” trước khi rời trang.</p>
        </div>
      </div>
    </>
  );
}

// Student-only presentation; the shared destructive ConfirmButton stays unchanged.
function StudentSubmit({
  disabled,
  onConfirm,
}: {
  disabled: boolean;
  onConfirm: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const inFlight = useRef(false);
  return (
    <>
      <button
        disabled={disabled}
        onClick={() => {
          setError(undefined);
          dialog.current?.showModal();
        }}
      >
        Nộp bài
      </button>
      <dialog
        className="focus-dialog"
        ref={dialog}
        aria-labelledby="focus-submit-title"
        aria-describedby="focus-submit-description"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const buttons =
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            );
          const first = buttons[0],
            last = buttons[buttons.length - 1];
          if (!first || !last) {
            event.preventDefault();
            return;
          }
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        onCancel={(event) => {
          if (inFlight.current) event.preventDefault();
        }}
      >
        <p className="focus-context">Kết thúc lượt thi</p>
        <h2 id="focus-submit-title">Nộp bài thi?</h2>
        <p id="focus-submit-description">
          Sau khi nộp, bạn không thể thay đổi đáp án của lượt thi này.
        </p>
        <ErrorBox error={error} />
        <div className="actions">
          <button
            className="secondary"
            autoFocus
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            Hủy
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              if (inFlight.current) return;
              inFlight.current = true;
              setBusy(true);
              setError(undefined);
              try {
                await onConfirm();
                dialog.current?.close();
              } catch (e) {
                setError(e);
              } finally {
                inFlight.current = false;
                setBusy(false);
              }
            }}
          >
            {busy ? "Đang nộp…" : "Xác nhận"}
          </button>
        </div>
      </dialog>
    </>
  );
}
