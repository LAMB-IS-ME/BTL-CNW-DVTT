import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { QuestionDto, QuizState, AnswerInput } from "@exam/shared";
import { api } from "../lib/api";
import { connectSocket } from "../lib/socket";
import {
  Field,
  ErrorBox,
  Loading,
  Empty,
  ConfirmButton,
  Pager,
} from "../components/ui";
import { Markdown } from "../components/Markdown";
import { AnswerControl } from "./attempts";
import { remainingSeconds, formatTime } from "../lib/timer";
type Quiz = {
  id: string;
  title: string;
  descriptionMarkdown: string | null;
  isArchived: boolean;
  questions: {
    questionId: string;
    timeLimitSeconds: number;
    basePoints: number;
    question: QuestionDto;
  }[];
  rooms: { id: string; code: string; status: string }[];
};
export function QuizList() {
  const q = useQuery({
    queryKey: ["quizzes"],
    queryFn: () => api<Quiz[]>("/teacher/quizzes"),
  });
  return (
    <>
      <div className="actions">
        <h1>Live Quiz</h1>
        <Link className="button" to="/teacher/quizzes/new">
          Tạo Quiz
        </Link>
      </div>
      <ErrorBox error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : (
        <div className="grid">
          {q.data?.map((v) => (
            <Link
              className="card"
              key={v.id}
              to={`/teacher/quizzes/${v.id}/edit`}
            >
              <h2>{v.title}</h2>
              <p>{v.isArchived ? "Đã lưu trữ" : "Sẵn sàng tạo phòng"} →</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
export function QuizBuilder() {
  const { id } = useParams();
  const q = useQuery({
    queryKey: ["quiz", id],
    queryFn: () => api<Quiz>(`/teacher/quizzes/${id}`),
    enabled: !!id,
  });
  if (id && q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  return <QuizForm key={id || "new"} initial={q.data} />;
}
function QuizForm({ initial }: { initial?: Quiz }) {
  const nav = useNavigate();
  const [title, setTitle] = useState(initial?.title || ""),
    [description, setDescription] = useState(
      initial?.descriptionMarkdown || "",
    ),
    [questions, setQuestions] = useState(initial?.questions || []),
    [bank, setBank] = useState(""),
    [page, setPage] = useState(1),
    [error, setError] = useState<unknown>(),
    [notice, setNotice] = useState("");
  const banks = useQuery({
    queryKey: ["banks-picker"],
    queryFn: () =>
      api<{ id: string; title: string }[]>(
        "/teacher/question-banks?pageSize=100",
      ),
  });
  const qs = useQuery({
    queryKey: ["quiz-questions", bank, page],
    queryFn: () =>
      api<{ items: QuestionDto[]; total: number }>(
        `/teacher/question-banks/${bank}/questions?page=${page}`,
      ),
    enabled: !!bank,
  });
  async function save() {
    const q = await api<Quiz>(
      initial ? `/teacher/quizzes/${initial.id}` : "/teacher/quizzes",
      initial ? "PATCH" : "POST",
      { title, descriptionMarkdown: description },
    );
    await api(`/teacher/quizzes/${q.id}/questions`, "PUT", {
      questions: questions.map((q) => ({
        questionId: q.questionId,
        timeLimitSeconds: q.timeLimitSeconds,
        basePoints: q.basePoints,
      })),
    });
    setNotice("Đã lưu Quiz");
    if (!initial) nav(`/teacher/quizzes/${q.id}/edit`);
    return q;
  }
  return (
    <>
      <h1>{initial ? "Chỉnh sửa" : "Tạo"} Live Quiz</h1>
      <ErrorBox error={error || banks.error || qs.error} />
      <p role="status">{notice}</p>
      <section className="card">
        <Field label="Tên Quiz">
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Mô tả">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="Ngân hàng">
          <select
            value={bank}
            onChange={(e) => {
              setBank(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Chọn ngân hàng</option>
            {banks.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </Field>
        {qs.data?.items
          .filter((q) => q.type !== "ESSAY")
          .map((q) => (
            <label className="choice" key={q.id}>
              <input
                type="checkbox"
                checked={questions.some((v) => v.questionId === q.id)}
                onChange={(e) =>
                  setQuestions(
                    e.target.checked
                      ? [
                          ...questions,
                          {
                            questionId: q.id,
                            timeLimitSeconds: 20,
                            basePoints: 1000,
                            question: q,
                          },
                        ]
                      : questions.filter((v) => v.questionId !== q.id),
                  )
                }
              />
              <Markdown>{q.promptMarkdown}</Markdown>
            </label>
          ))}
        {bank && (
          <Pager page={page} total={qs.data?.total || 0} onChange={setPage} />
        )}
      </section>
      <h2>Câu hỏi trong Quiz</h2>
      {questions.map((q, i) => (
        <section className="card" key={q.questionId}>
          <p className="eyebrow">CÂU {i + 1}</p>
          <Markdown>{q.question.promptMarkdown}</Markdown>
          <div className="grid">
            <Field label="Thời gian (5–300 giây)">
              <input
                type="number"
                min="5"
                max="300"
                value={q.timeLimitSeconds}
                onChange={(e) =>
                  setQuestions(
                    questions.map((v, j) =>
                      i === j
                        ? { ...v, timeLimitSeconds: Number(e.target.value) }
                        : v,
                    ),
                  )
                }
              />
            </Field>
            <Field label="Điểm cơ bản">
              <input
                type="number"
                min="1"
                value={q.basePoints}
                onChange={(e) =>
                  setQuestions(
                    questions.map((v, j) =>
                      i === j
                        ? { ...v, basePoints: Number(e.target.value) }
                        : v,
                    ),
                  )
                }
              />
            </Field>
          </div>
          <div className="actions">
            <button
              className="secondary"
              disabled={i === 0}
              onClick={() => {
                const list = [...questions];
                [list[i - 1], list[i]] = [list[i]!, list[i - 1]!];
                setQuestions(list);
              }}
            >
              Lên
            </button>
            <button
              className="secondary"
              onClick={() => setQuestions(questions.filter((_, j) => j !== i))}
            >
              Bỏ câu
            </button>
          </div>
        </section>
      ))}
      <div className="actions">
        <button onClick={() => void save().catch(setError)}>Lưu Quiz</button>
        <button
          disabled={!questions.length}
          onClick={async () => {
            try {
              const q = await save();
              const room = await api<{ id: string }>(
                `/teacher/quizzes/${q.id}/rooms`,
                "POST",
              );
              nav(`/teacher/quiz-rooms/${room.id}/host`);
            } catch (e) {
              setError(e);
            }
          }}
        >
          Lưu & tạo phòng
        </button>
        {initial && (
          <ConfirmButton
            onConfirm={async () => {
              await api(`/teacher/quizzes/${initial.id}`, "DELETE");
              nav("/teacher/quizzes");
            }}
          >
            Lưu trữ Quiz
          </ConfirmButton>
        )}
      </div>
      {initial?.rooms.length ? (
        <section className="card">
          <h2>Phòng gần đây</h2>
          {initial.rooms.map((r) => (
            <p key={r.id}>
              <Link to={`/teacher/quiz-rooms/${r.id}/host`}>
                {r.code} · {r.status} →
              </Link>
            </p>
          ))}
        </section>
      ) : null}
    </>
  );
}
export function QuizJoin() {
  const [code, setCode] = useState(""),
    [error, setError] = useState<unknown>();
  const nav = useNavigate();
  return (
    <section className="auth card">
      <p className="eyebrow">LIVE QUIZ</p>
      <h1>Tham gia phòng</h1>
      <p>Nhập mã 6 chữ số từ giảng viên.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const room = await api<{ id: string }>(
              `/student/quiz-rooms/by-code/${code}`,
            );
            nav(`/student/quiz/${room.id}/lobby`);
          } catch (e) {
            setError(e);
          }
        }}
      >
        <Field label="Mã phòng">
          <input
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
          />
        </Field>
        <ErrorBox error={error} />
        <button>Vào phòng</button>
      </form>
    </section>
  );
}
export function QuizRoom({ host = false }: { host?: boolean }) {
  const { id } = useParams();
  const [state, setState] = useState<QuizState | null>(null),
    [error, setError] = useState<unknown>(),
    [connected, setConnected] = useState(false),
    [answer, setAnswer] = useState<AnswerInput>({
      selectedOptionIds: [],
      answerText: "",
    }),
    [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now()),
    [received, setReceived] = useState(Date.now());
  const [socket] = useState(connectSocket);
  useEffect(() => {
    const update = (s: QuizState) => {
      setState(s);
      setReceived(Date.now());
    };
    socket.on("connect", () => {
      setConnected(true);
      setError(undefined);
      socket.emit("quiz:room:join", { roomId: id! }, (r) => {
        if ("error" in r) setError(new Error(r.error.message));
        else update(r.data);
      });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", setError);
    socket.on("quiz:state", update);
    socket.on("quiz:error", (e) => setError(new Error(e.message)));
    socket.connect();
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => {
      clearInterval(timer);
      socket.emit("quiz:room:leave", { roomId: id! }, () => {});
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [id, socket]);
  useEffect(() => {
    setAnswer({ selectedOptionIds: state?.ownAnswer || [], answerText: "" });
    setAccepted(state?.ownAnswer !== null && state?.ownAnswer !== undefined);
  }, [state?.question?.id, state?.ownAnswer]);
  const remaining = state?.closesAt
    ? remainingSeconds(state.closesAt, state.serverNow, received, now)
    : 0;
  async function command(event: "quiz:host:start" | "quiz:host:next") {
    setBusy(true);
    try {
      const r = await socket.timeout(8000).emitWithAck(event, { roomId: id! });
      if ("error" in r) throw new Error(r.error.message);
      setState(r.data);
      setReceived(Date.now());
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="actions between">
        <h1>{state?.title || "Live Quiz"}</h1>
        <span role="status">
          {connected ? "● Trực tuyến" : "Đang kết nối lại…"}
        </span>
      </div>
      <ErrorBox error={error} />
      {!state ? (
        <Loading />
      ) : state.status === "LOBBY" ? (
        <section className="card quiz-lobby">
          <p className="eyebrow">MÃ THAM GIA</p>
          <strong className="room-code">{state.code}</strong>
          <h2>{state.participants.length} người tham gia</h2>
          <div className="grid">
            {state.participants.map((p) => (
              <div className="participant" key={p.id}>
                {p.fullName} {p.isConnected ? "●" : "○"}
              </div>
            ))}
          </div>
          {host ? (
            <button
              disabled={busy || !state.participants.length || !connected}
              onClick={() => void command("quiz:host:start")}
            >
              Bắt đầu Quiz
            </button>
          ) : (
            <p>Chờ giảng viên bắt đầu…</p>
          )}
        </section>
      ) : (
        <>
          <section className="card quiz-question">
            <div className="actions between">
              <p className="eyebrow">
                CÂU {(state.currentIndex ?? 0) + 1}/{state.total}
              </p>
              <strong className="timer">
                {state.reveal ? "Đã đóng" : formatTime(remaining)}
              </strong>
            </div>
            {state.question && (
              <>
                <Markdown>{state.question.promptMarkdown}</Markdown>
                {host ? (
                  state.question.options.map((o) => (
                    <div className="choice" key={o.id}>
                      <Markdown>{o.contentMarkdown}</Markdown>
                    </div>
                  ))
                ) : (
                  <>
                    <AnswerControl
                      question={state.question}
                      value={answer}
                      onChange={setAnswer}
                      disabled={
                        !connected ||
                        accepted ||
                        busy ||
                        !!state.reveal ||
                        remaining === 0
                      }
                    />
                    {accepted ? (
                      <p role="status">
                        {state.reveal
                          ? "Đã nhận câu trả lời."
                          : "Đã nhận câu trả lời. Chờ công bố đáp án."}
                      </p>
                    ) : (
                      !state.reveal && (
                        <button
                          disabled={
                            busy ||
                            !connected ||
                            remaining === 0 ||
                            !answer.selectedOptionIds.length
                          }
                          onClick={async () => {
                            setBusy(true);
                            try {
                              const r = await socket
                                .timeout(8000)
                                .emitWithAck("quiz:answer", {
                                  roomId: id!,
                                  questionId: state.question!.id,
                                  selectedOptionIds: answer.selectedOptionIds,
                                });
                              if ("error" in r)
                                throw new Error(r.error.message);
                              setAccepted(true);
                            } catch (e) {
                              setError(e);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Gửi câu trả lời
                        </button>
                      )
                    )}
                  </>
                )}
                {state.reveal && (
                  <div className="reveal">
                    <h2>Đáp án đúng</h2>
                    {state.question.options
                      .filter((o) =>
                        state.reveal!.correctOptionIds.includes(o.id),
                      )
                      .map((o) => (
                        <Markdown key={o.id}>{o.contentMarkdown}</Markdown>
                      ))}
                    <Markdown>
                      {state.reveal.explanationMarkdown || ""}
                    </Markdown>
                    <p>{state.reveal.answerCount} câu trả lời được nhận</p>
                  </div>
                )}
              </>
            )}
          </section>
          {state.reveal && (
            <section className="card">
              <h2>
                {state.status === "FINISHED"
                  ? "Kết quả cuối cùng"
                  : "Bảng xếp hạng"}
              </h2>
              {state.leaderboard.map((p) => (
                <div className="leaderboard-row" key={p.id}>
                  <strong>#{p.rank}</strong>
                  <span>{p.fullName}</span>
                  <strong>{p.score} điểm</strong>
                </div>
              ))}
              {host && state.status === "LIVE" && (
                <button
                  disabled={busy || !connected}
                  onClick={() => void command("quiz:host:next")}
                >
                  Câu tiếp theo
                </button>
              )}
              {state.status === "FINISHED" && (
                <Link
                  className="button"
                  to={host ? "/teacher/quizzes" : "/student/quiz/join"}
                >
                  Về danh sách
                </Link>
              )}
            </section>
          )}
        </>
      )}
      {state?.status === "CANCELLED" && <Empty>Phòng đã đóng.</Empty>}
    </>
  );
}
