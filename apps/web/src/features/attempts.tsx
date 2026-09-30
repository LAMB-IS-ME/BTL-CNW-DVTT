import { useAttemptPresence } from "../lib/socket";
import { ApiFailure } from "../lib/api";
import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { AttemptDto, AnswerInput, StudentQuestion } from "@exam/shared";
import { api } from "../lib/api";
import { formatTime, remainingSeconds } from "../lib/timer";
import { ErrorBox, Loading, ConfirmButton, Empty } from "../components/ui";
import { Markdown } from "../components/Markdown";
type AssignedExam = {
  id: string;
  title: string;
  descriptionMarkdown: string;
  status: string;
  openAt: string;
  closeAt: string;
  durationMinutes: number;
  maxAttempts: number;
  attempts: { id: string; status: string; attemptNo: number }[];
};
export function StudentExams() {
  const q = useQuery({
    queryKey: ["student-exams"],
    queryFn: () => api<AssignedExam[]>("/student/exams"),
  });
  return (
    <>
      <h1>Bài thi được giao</h1>
      <ErrorBox error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : q.data?.length ? (
        <div className="grid">
          {q.data.map((e) => (
            <article key={e.id} className="card">
              <span className="eyebrow">{e.status}</span>
              <h2>{e.title}</h2>
              <p>
                {e.durationMinutes} phút · {e.attempts.length}/{e.maxAttempts}{" "}
                lượt
              </p>
              <p>
                {new Date(e.openAt).toLocaleString()} →{" "}
                {new Date(e.closeAt).toLocaleString()}
              </p>
              <Link className="button" to={`/student/exams/${e.id}`}>
                Mở bài thi →
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <Empty>Bạn chưa được giao bài thi.</Empty>
      )}
    </>
  );
}
export function StudentExam() {
  const { id } = useParams(),
    nav = useNavigate();
  const [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["student-exam", id],
    queryFn: () => api<AssignedExam>(`/student/exams/${id}`),
  });
  if (q.isPending) return <Loading />;
  const e = q.data;
  if (!e) return <ErrorBox error={q.error} />;
  return (
    <section className="card">
      <h1>{e.title}</h1>
      <Markdown>{e.descriptionMarkdown || ""}</Markdown>
      <p>
        Thời lượng: {e.durationMinutes} phút. Đã dùng {e.attempts.length}/
        {e.maxAttempts} lượt.
      </p>
      <p>
        Bài tự động nộp khi hết giờ hoặc tới thời điểm đóng bài:{" "}
        {new Date(e.closeAt).toLocaleString()}.
      </p>
      <ErrorBox error={error} />
      <button
        disabled={busy}
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
        {e.attempts.some((a) => a.status === "IN_PROGRESS")
          ? "Tiếp tục làm bài"
          : "Bắt đầu làm bài"}
      </button>
      <h2>Lịch sử lượt thi</h2>
      {e.attempts.map((a) => (
        <p key={a.id}>
          Lượt {a.attemptNo} · {a.status} ·{" "}
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
  const q = useQuery({
    queryKey: ["attempt", id],
    queryFn: async () => ({
      data: await api<AttemptDto>(`/student/attempts/${id}`),
      receivedAt: Date.now(),
    }),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (q.isPending) return <Loading />;
  if (!q.data) return <ErrorBox error={q.error} />;
  return (
    <AttemptWorkspace
      key={id}
      initial={q.data.data}
      receivedAt={q.data.receivedAt}
    />
  );
}
function AttemptWorkspace({
  initial,
  receivedAt,
}: {
  initial: AttemptDto;
  receivedAt: number;
}) {
  const [a, setA] = useState(initial),
    [clock, setClock] = useState({ serverNow: initial.serverNow, receivedAt }),
    [now, setNow] = useState(Date.now()),
    [current, setCurrent] = useState(0),
    [answers, setAnswers] = useState<Record<string, AnswerInput>>(() =>
      Object.fromEntries(initial.questions.map((q) => [q.id, q.answer])),
    ),
    [status, setStatus] = useState("Đã lưu"),
    [error, setError] = useState<unknown>(),
    [submitting, setSubmitting] = useState(false);
  const pending = useRef(new Map<string, AnswerInput>()),
    queue = useRef<Promise<void> | null>(null),
    debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    active = useRef(initial.status === "IN_PROGRESS");
  const nav = useNavigate();
  const flush = useCallback(async () => {
    if (queue.current) return queue.current;
    const run = async () => {
      while (pending.current.size && active.current) {
        const [id, value] = pending.current.entries().next().value!;
        setStatus("Đang lưu…");
        let last: unknown;
        for (let n = 0; n < 3; n++) {
          try {
            await api(
              `/student/attempts/${initial.id}/answers/${id}`,
              "PUT",
              value,
            );
            last = undefined;
            break;
          } catch (e) {
            last = e;
            if (n < 2)
              await new Promise((resolve) =>
                setTimeout(resolve, 500 * (n + 1)),
              );
          }
        }
        if (last) {
          setStatus("Lỗi lưu");
          setError(last);
          throw last;
        }
        if (pending.current.get(id) === value) pending.current.delete(id);
      }
      setStatus("Đã lưu");
      setError(undefined);
    };
    queue.current = run().finally(() => {
      queue.current = null;
    });
    return queue.current;
  }, [initial.id]);
  const refresh = useCallback(async () => {
    try {
      await flush();
    } catch (e) {
      if (
        e instanceof ApiFailure &&
        ["ATTEMPT_EXPIRED", "ATTEMPT_ALREADY_SUBMITTED"].includes(e.code)
      ) {
        pending.current.clear();
        active.current = false;
      } else throw e;
    }
    const state = await api<AttemptDto>(`/student/attempts/${initial.id}`);
    setClock({ serverNow: state.serverNow, receivedAt: Date.now() });
    setA(state);
    active.current = state.status === "IN_PROGRESS";
    setAnswers((old) => ({
      ...Object.fromEntries(state.questions.map((q) => [q.id, q.answer])),
      ...Object.fromEntries(
        [...pending.current.keys()].map((id) => [id, old[id]!]),
      ),
    }));
  }, [flush, initial.id]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    const online = () => void refresh().catch(setError);
    const unload = (e: BeforeUnloadEvent) => {
      if (pending.current.size) {
        e.preventDefault();
      }
    };
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", unload);
    return () => {
      clearInterval(timer);
      clearTimeout(debounce.current);
      window.removeEventListener("online", online);
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
  const autoRequested = useRef(false);
  useEffect(() => {
    if (
      remaining === 0 &&
      a.status === "IN_PROGRESS" &&
      !autoRequested.current
    ) {
      autoRequested.current = true;
      active.current = false;
      api<AttemptDto>(`/student/attempts/${a.id}/submit`, "POST")
        .then(setA)
        .catch((e) => {
          setError(e);
          autoRequested.current = false;
        });
    }
  }, [remaining, a.id, a.status, now]);
  if (a.status !== "IN_PROGRESS")
    return (
      <section className="card">
        <h1>Đã nộp bài thành công</h1>
        <p>
          Lượt {a.attemptNo} ·{" "}
          {a.status === "PENDING_MANUAL_GRADING"
            ? "Đang chờ chấm tự luận"
            : "Đã chấm"}
        </p>
        <Link className="button" to={`/student/results/${a.examId}`}>
          Xem trạng thái kết quả
        </Link>
      </section>
    );
  const question = a.questions[current]!;
  const change = (value: AnswerInput) => {
    setAnswers((old) => ({ ...old, [question.id]: value }));
    pending.current.set(question.id, value);
    setStatus("Đang lưu…");
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void flush().catch(() => {}), 700);
  };
  return (
    <>
      <div className="actions between">
        <div>
          <span className="eyebrow">LƯỢT THI {a.attemptNo}</span>
          <h1>{a.title}</h1>
        </div>
        <strong
          className={`timer ${remaining < 60 ? "warning" : ""}`}
          aria-label="Thời gian còn lại"
        >
          {formatTime(remaining)}
        </strong>
      </div>
      <ErrorBox error={error} />
      <div className="attempt-layout">
        <aside className="card">
          <h2>Câu hỏi</h2>
          <div className="question-nav">
            {a.questions.map((q, i) => (
              <button
                key={q.id}
                aria-label={`Câu ${i + 1}`}
                aria-current={i === current ? "step" : undefined}
                className={
                  i === current
                    ? ""
                    : answers[q.id]?.answerText ||
                        answers[q.id]?.selectedOptionIds.length
                      ? "answered"
                      : "secondary"
                }
                onClick={() => setCurrent(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <p role="status">{status}</p>
          {status === "Lỗi lưu" && (
            <button onClick={() => void refresh().catch(setError)}>
              Thử lưu lại
            </button>
          )}
          <p>Đáp án được lưu tự động. Hãy chờ “Đã lưu” trước khi rời trang.</p>
        </aside>
        <section className="card">
          <p className="eyebrow">
            CÂU {current + 1} · {question.points} ĐIỂM
          </p>
          <Markdown>{question.promptMarkdown}</Markdown>
          <AnswerControl
            question={question}
            value={
              answers[question.id] || { selectedOptionIds: [], answerText: "" }
            }
            onChange={change}
            disabled={submitting || remaining === 0}
          />
          <div className="actions">
            <button
              className="secondary"
              disabled={current === 0}
              onClick={() => setCurrent(current - 1)}
            >
              Câu trước
            </button>
            <button
              className="secondary"
              disabled={current === a.questions.length - 1}
              onClick={() => setCurrent(current + 1)}
            >
              Câu tiếp
            </button>
            <ConfirmButton
              onConfirm={async () => {
                setSubmitting(true);
                try {
                  await flush();
                  const state = await api<AttemptDto>(
                    `/student/attempts/${a.id}/submit`,
                    "POST",
                  );
                  active.current = false;
                  setA(state);
                  nav(`/student/results/${a.examId}`);
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              Nộp bài
            </ConfirmButton>
          </div>
        </section>
      </div>
    </>
  );
}
