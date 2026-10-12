import { useState, useEffect, useCallback, useRef, memo } from "react";
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
import "../styles/live-quiz.css";
const QuizMarkdown = memo(Markdown);
const QuizAnswerControl = memo(AnswerControl);
function ReceiptMark() {
  return (
    <svg
      className="lq-receipt-mark"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m7 12 3 3 7-7" />
    </svg>
  );
}
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
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["quizzes", page],
    queryFn: () => api<Quiz[]>(`/teacher/quizzes?page=${page}&pageSize=20`),
  });
  return (
    <div className="lq lq-index">
      <div className="lq-heading">
        <div>
          <h1>Live Quiz</h1>
          <p>Chọn một Quiz để chuẩn bị và mở phòng cho sinh viên.</p>
        </div>
        <Link className="button" to="/teacher/quizzes/new">
          Tạo Quiz
        </Link>
      </div>
      <ErrorBox
        error={
          q.error instanceof TypeError
            ? "Không tải được danh sách Quiz. Kiểm tra kết nối rồi thử lại."
            : q.error
        }
      />
      {q.isError && (
        <button
          className="secondary"
          onClick={() => void q.refetch()}
          disabled={q.isFetching}
        >
          Thử tải lại
        </button>
      )}
      {q.isPending ? (
        <Loading />
      ) : !q.isError && !q.data?.length ? (
        <section className="lq-empty">
          <h2>{page === 1 ? "Bắt đầu với một Quiz" : "Đã hết danh sách"}</h2>
          <p>
            {page === 1
              ? "Chọn câu hỏi từ ngân hàng, chuẩn bị Quiz rồi mở phòng cho lớp."
              : "Quay lại trang trước để chọn Quiz."}
          </p>
          {page === 1 && (
            <Link className="button" to="/teacher/quizzes/new">
              Tạo Quiz đầu tiên
            </Link>
          )}
        </section>
      ) : (
        <div className="lq-quiz-list">
          {q.data?.map((v) => (
            <Link
              className="lq-quiz-row"
              key={v.id}
              to={`/teacher/quizzes/${v.id}/edit`}
            >
              <div>
                <h2>{v.title}</h2>
                <p data-archived={v.isArchived}>
                  {v.isArchived ? "Đã lưu trữ" : "Sẵn sàng tạo phòng"}
                </p>
              </div>
              <span>
                {v.isArchived ? "Xem Quiz" : "Chuẩn bị phiên"}{" "}
                <span aria-hidden="true">→</span>
              </span>
            </Link>
          ))}
        </div>
      )}
      {(page > 1 || q.data?.length === 20) && (
        <nav className="lq-pagination" aria-label="Trang Quiz">
          <button
            className="secondary"
            disabled={page === 1 || q.isFetching}
            onClick={() => setPage(page - 1)}
          >
            Trang trước
          </button>
          <span>Trang {page}</span>
          <button
            className="secondary"
            disabled={q.data?.length !== 20 || q.isFetching}
            onClick={() => setPage(page + 1)}
          >
            Trang sau
          </button>
        </nav>
      )}
    </div>
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
    <div className="lq lq-builder">
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
    </div>
  );
}
export function QuizJoin() {
  const [code, setCode] = useState(""),
    [joining, setJoining] = useState(false),
    [error, setError] = useState<unknown>();
  const nav = useNavigate();
  return (
    <section className="lq lq-join">
      <div className="lq-join-intro">
        <p className="lq-context">Live Quiz</p>
        <h1>Tham gia phòng</h1>
        <p>Cùng lớp trả lời từng câu hỏi, theo nhịp của giảng viên.</p>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (joining) return;
          setJoining(true);
          setError(undefined);
          try {
            const room = await api<{ id: string }>(
              `/student/quiz-rooms/by-code/${code}`,
            );
            nav(`/student/quiz/${room.id}/lobby`);
          } catch (e) {
            setError(e);
          } finally {
            setJoining(false);
          }
        }}
      >
        <h2>Nhập mã từ giảng viên</h2>
        <p className="lq-note" id="lq-code-help">
          Mã phòng gồm 6 chữ số.
        </p>
        <Field label="Mã phòng">
          <input
            inputMode="numeric"
            aria-describedby="lq-code-help"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
          />
        </Field>
        <ErrorBox error={error} />
        <button disabled={joining}>
          {joining ? "Đang tìm phòng…" : "Vào phòng"}
        </button>
      </form>
    </section>
  );
}
export function QuizRoom({ host = false }: { host?: boolean }) {
  const { id } = useParams();
  const [state, setState] = useState<QuizState | null>(null),
    [error, setError] = useState<unknown>(),
    [connected, setConnected] = useState(false),
    [joining, setJoining] = useState(false),
    [joinFailed, setJoinFailed] = useState(false),
    [answer, setAnswer] = useState<AnswerInput>({
      selectedOptionIds: [],
      answerText: "",
    }),
    [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now()),
    [received, setReceived] = useState(Date.now());
  const [socket] = useState(connectSocket);
  const requestGeneration = useRef(0);
  const currentSnapshot = useRef<QuizState | null>(null);
  const prompt = useRef<HTMLDivElement>(null);
  const room = useRef<HTMLDivElement>(null);
  const previousQuestion = useRef<string | undefined>(undefined);
  const applySnapshot = useCallback((s: QuizState) => {
    const previous = currentSnapshot.current;
    const sameQuestion =
      !!s.question && s.question.id === previous?.question?.id;
    // These server facts are irreversible within one room. A late broadcast
    // may refresh presence, but cannot reopen a revealed question or undo an answer.
    if (previous?.roomId === s.roomId) {
      if (
        ((previous.status === "FINISHED" || previous.status === "CANCELLED") &&
          s.status !== previous.status) ||
        (previous.status === "LIVE" && s.status === "LOBBY") ||
        (previous.currentIndex ?? -1) > (s.currentIndex ?? -1) ||
        (sameQuestion && previous.reveal && !s.reveal)
      )
        return;
      if (sameQuestion && previous.ownAnswer !== null && s.ownAnswer === null) {
        s = { ...s, ownAnswer: previous.ownAnswer };
      }
    }
    if (s.question?.id !== previous?.question?.id) {
      requestGeneration.current++;
      setBusy(false);
      setError(undefined);
    }
    currentSnapshot.current = s;
    setState(s);
    const receivedAt = Date.now();
    setReceived(receivedAt);
    setNow(receivedAt);
  }, []);
  useEffect(() => {
    let connectionGeneration = 0;
    let active = true;
    let joinDeadline: ReturnType<typeof setTimeout> | undefined;
    const update = (s: QuizState) => {
      if (active) applySnapshot(s);
    };
    socket.on("connect", () => {
      const generation = ++connectionGeneration;
      setConnected(false);
      setJoining(true);
      setJoinFailed(false);
      setError(undefined);
      clearTimeout(joinDeadline);
      joinDeadline = setTimeout(() => {
        if (!active || generation !== connectionGeneration) return;
        connectionGeneration++;
        setJoining(false);
        setJoinFailed(true);
        setError(
          new Error("Chưa nhận được xác nhận vào phòng. Hãy thử kết nối lại."),
        );
      }, 8000);
      socket.emit("quiz:room:join", { roomId: id! }, (r) => {
        if (!active || generation !== connectionGeneration) return;
        clearTimeout(joinDeadline);
        setJoining(false);
        if ("error" in r) {
          setJoinFailed(true);
          setError(new Error(r.error.message));
        } else {
          update(r.data);
          setConnected(true);
        }
      });
    });
    socket.on("disconnect", () => {
      connectionGeneration++;
      requestGeneration.current++;
      clearTimeout(joinDeadline);
      setBusy(false);
      setConnected(false);
      setJoining(false);
    });
    socket.on("connect_error", (e) => {
      clearTimeout(joinDeadline);
      setConnected(false);
      setJoining(false);
      setError(e);
    });
    socket.on("quiz:state", update);
    socket.on("quiz:error", (e) => setError(new Error(e.message)));
    socket.connect();
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => {
      active = false;
      requestGeneration.current++;
      clearTimeout(joinDeadline);
      clearInterval(timer);
      socket.emit("quiz:room:leave", { roomId: id! }, () => {});
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [id, socket, applySnapshot]);
  useEffect(() => {
    setAnswer({ selectedOptionIds: state?.ownAnswer || [], answerText: "" });
    setAccepted(state?.ownAnswer !== null && state?.ownAnswer !== undefined);
  }, [state?.question?.id, state?.ownAnswer]);
  useEffect(() => {
    const questionId = state?.question?.id;
    if (
      previousQuestion.current &&
      questionId !== previousQuestion.current &&
      (document.activeElement === document.body ||
        room.current?.contains(document.activeElement))
    ) {
      prompt.current?.focus();
    }
    previousQuestion.current = questionId;
  }, [state?.question?.id]);
  const remaining = state?.closesAt
    ? remainingSeconds(state.closesAt, state.serverNow, received, now)
    : 0;
  async function command(event: "quiz:host:start" | "quiz:host:next") {
    const generation = requestGeneration.current;
    setError(undefined);
    setBusy(true);
    try {
      const r = await socket.timeout(8000).emitWithAck(event, { roomId: id! });
      if (generation !== requestGeneration.current) return;
      if ("error" in r) throw new Error(r.error.message);
      applySnapshot(r.data);
    } catch (e) {
      if (generation === requestGeneration.current) setError(e);
    } finally {
      if (generation === requestGeneration.current) setBusy(false);
    }
  }
  const phase = !state
    ? "Đang mở phiên"
    : state.status === "LOBBY"
      ? "Phòng chờ"
      : state.status === "FINISHED"
        ? "Đã kết thúc"
        : state.status === "CANCELLED"
          ? "Phòng đã đóng"
          : state.reveal
            ? "Đã công bố đáp án"
            : "Đang nhận câu trả lời";
  const membership = connected
    ? "joined"
    : joinFailed || error
      ? "failed"
      : joining
        ? "pending"
        : state
          ? "reconnecting"
          : "connecting";
  const connectionLabel = {
    joined: "Trực tuyến · Đã vào phòng",
    failed: "Chưa vào phòng",
    pending: "Đang xác nhận vào phòng…",
    reconnecting: "Mất kết nối · Đang kết nối lại…",
    connecting: "Đang kết nối…",
  }[membership];
  const lobbyCopy = {
    joined: [
      "Bạn đã vào phòng",
      "Chờ giảng viên bắt đầu…",
      "Câu hỏi sẽ xuất hiện tại đây khi phiên bắt đầu.",
    ],
    failed: [
      "Kết nối chưa được xác nhận",
      "Chưa thể vào phòng",
      "Xem thông báo lỗi và thử kết nối lại để tiếp tục.",
    ],
    pending: [
      "Đang xác nhận tham gia",
      "Chờ xác nhận vào phòng…",
      "Máy chủ đang xác nhận yêu cầu vào phòng.",
    ],
    reconnecting: [
      "Kết nối bị gián đoạn",
      "Đang kết nối lại…",
      "Chờ kết nối và xác nhận từ phòng để tiếp tục.",
    ],
    connecting: [
      "Đang kết nối",
      "Đang mở kết nối…",
      "Chờ kết nối với máy chủ để vào phòng.",
    ],
  }[membership];
  const participants = state && (
    <section className="lq-roster" aria-label="Người tham gia">
      <h2>
        <span>{state.participants.length}</span> người tham gia
      </h2>
      {state.participants.length === 0 && (
        <p>Chờ sinh viên nhập mã phòng để tham gia.</p>
      )}
      <ul>
        {state.participants.map((p) => (
          <li key={p.id} data-online={p.isConnected}>
            <span className="lq-avatar" aria-hidden="true">
              {p.fullName
                .split(/\s+/)
                .filter(Boolean)
                .slice(-2)
                .map((n) => n[0])
                .join("")}
            </span>
            <div>
              <span>{p.fullName}</span>
              <small>{p.isConnected ? "Trực tuyến" : "Mất kết nối"}</small>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
  const hostControl = state && host && (
    <section className="lq-control" aria-label="Điều khiển phiên">
      <p className="lq-label">Điều khiển phiên</p>
      {state.status === "LOBBY" ? (
        <>
          <h2>Sẵn sàng bắt đầu?</h2>
          <p>
            Câu đầu tiên mở ngay khi bắt đầu. Sinh viên cần vào phòng trước thời
            điểm này.
          </p>
          <button
            disabled={busy || !state.participants.length || !connected}
            onClick={() => void command("quiz:host:start")}
          >
            Bắt đầu Quiz
          </button>
        </>
      ) : state.status === "LIVE" && state.reveal ? (
        <>
          <h2>Tiếp tục phiên</h2>
          <p>Đáp án đã công bố. Chuyển câu khi bạn sẵn sàng.</p>
          <button
            disabled={busy || !connected}
            onClick={() => void command("quiz:host:next")}
          >
            Câu tiếp theo
          </button>
        </>
      ) : state.status === "LIVE" ? (
        <>
          <h2>Đang nhận câu trả lời</h2>
          <p>Đáp án tự công bố khi tất cả đã trả lời hoặc hết thời gian.</p>
        </>
      ) : (
        <>
          <h2>Phiên đã kết thúc</h2>
          <p>Kết quả cuối cùng đã sẵn sàng.</p>
          <Link className="button" to="/teacher/quizzes">
            Về danh sách
          </Link>
        </>
      )}
    </section>
  );
  const leaderboard = state?.reveal && (
    <section
      className="lq-ranking"
      data-final={state.status === "FINISHED"}
      aria-labelledby="lq-ranking-title"
    >
      <div className="lq-section-title">
        <h2 id="lq-ranking-title">
          {state.status === "FINISHED" ? "Kết quả cuối cùng" : "Bảng xếp hạng"}
        </h2>
        <span>
          {state.status === "FINISHED"
            ? `${state.total} câu đã kết thúc`
            : `Sau câu ${(state.currentIndex ?? 0) + 1}`}
        </span>
      </div>
      <table>
        <thead>
          <tr>
            <th scope="col">Hạng</th>
            <th scope="col">Người tham gia</th>
            <th scope="col">Điểm</th>
          </tr>
        </thead>
        <tbody>
          {state.leaderboard.map((p) => (
            <tr key={p.id} data-leading={p.rank === 1}>
              <td>
                <span className="lq-rank-number">{p.rank}</span>
              </td>
              <th scope="row">
                {p.fullName}
                {p.rank === 1 && <span className="lq-rank-label">Dẫn đầu</span>}
              </th>
              <td>
                <strong>{p.score.toLocaleString("vi-VN")}</strong>
                <span className="lq-score-unit">điểm</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!host && state.status === "FINISHED" && (
        <Link className="button" to="/student/quiz/join">
          Về danh sách
        </Link>
      )}
      {!host && state.status === "LIVE" && (
        <p className="lq-note">Chờ giảng viên chuyển sang câu tiếp theo.</p>
      )}
    </section>
  );
  return (
    <div
      ref={room}
      className={`lq ${host ? "lq-host" : "lq-player"}`}
      data-phase={state?.status}
      data-revealed={!!state?.reveal}
      data-membership={membership}
    >
      <div className="lq-heading">
        <div>
          <p className="lq-context">
            Live Quiz · {host ? "Điều phối phiên" : "Tham gia trực tiếp"}
          </p>
          <h1>{state?.title || "Live Quiz"}</h1>
        </div>
        {state && (
          <p className="lq-session-code">
            Mã phòng <strong>{state.code}</strong>
          </p>
        )}
      </div>
      <div className="lq-status-line" role="status" data-connected={connected}>
        <strong>{phase}</strong>
        <span>{connectionLabel}</span>
      </div>
      <ErrorBox error={error} />
      {!connected && (state || error || joinFailed) && (
        <button
          className="secondary lq-reconnect"
          disabled={joining}
          onClick={() => {
            socket.disconnect();
            setError(undefined);
            setJoinFailed(false);
            setJoining(true);
            socket.connect();
          }}
        >
          {joining ? "Đang xác nhận vào phòng…" : "Kết nối lại"}
        </button>
      )}
      {!connected && state && (
        <p className="lq-note">
          Đây là trạng thái phòng gần nhất; kết nối của bạn chưa được xác nhận.
        </p>
      )}
      {!state ? (
        joinFailed || error ? (
          <p className="lq-note">
            Chưa thể mở phiên.{" "}
            <Link to={host ? "/teacher/quizzes" : "/student/quiz/join"}>
              Về danh sách
            </Link>
          </p>
        ) : (
          <Loading />
        )
      ) : state.status === "CANCELLED" ? (
        <Empty>Phòng đã đóng.</Empty>
      ) : state.status === "LOBBY" ? (
        <div className="lq-lobby-layout">
          <section className="lq-waiting">
            <p className="lq-label">{host ? "Mã tham gia" : lobbyCopy[0]}</p>
            {host ? (
              <>
                <strong
                  className="lq-code"
                  aria-label={`Mã tham gia ${state.code}`}
                >
                  {state.code}
                </strong>
                <p>Sinh viên đăng nhập, mở Live Quiz và nhập mã này.</p>
                {hostControl}
              </>
            ) : (
              <>
                <h2>{lobbyCopy[1]}</h2>
                <p>{lobbyCopy[2]}</p>
                {connected && (
                  <p className="lq-note">
                    Mỗi câu chỉ nhận một lần trả lời. Bạn có thể chọn lại trước
                    khi gửi.
                  </p>
                )}
              </>
            )}
          </section>
          {participants}
        </div>
      ) : (
        <div className="lq-live-layout">
          <div className="lq-main">
            {state.status === "FINISHED" && leaderboard}
            <section className="lq-question" aria-label="Câu hỏi hiện tại">
              <div className="lq-question-bar">
                <strong className="lq-question-position">
                  <span>Câu</span>{" "}
                  <b>
                    {String((state.currentIndex ?? 0) + 1).padStart(2, "0")}
                  </b>{" "}
                  <span>/ {state.total}</span>
                </strong>
                <div className="lq-clock" data-closed={!!state.reveal}>
                  <span>
                    {state.reveal ? "Trạng thái câu" : "Thời gian còn lại"}
                  </span>
                  <strong role="timer" aria-live="off">
                    {state.reveal ? "Đã đóng" : formatTime(remaining)}
                  </strong>
                </div>
              </div>
              {state.question && (
                <>
                  <div
                    ref={prompt}
                    tabIndex={-1}
                    className="lq-prompt"
                    role="heading"
                    aria-level={2}
                  >
                    <QuizMarkdown>{state.question.promptMarkdown}</QuizMarkdown>
                  </div>
                  {host ? (
                    <ol className="lq-host-options">
                      {state.question.options.map((o, i) => (
                        <li key={o.id}>
                          <span aria-hidden="true">
                            {String.fromCharCode(65 + i)}
                          </span>
                          <QuizMarkdown>{o.contentMarkdown}</QuizMarkdown>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <>
                      <fieldset className="lq-answers" data-accepted={accepted}>
                        <legend>
                          {state.question.type === "MULTIPLE_CHOICE"
                            ? "Chọn các đáp án đúng"
                            : "Chọn một đáp án"}
                        </legend>
                        <QuizAnswerControl
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
                      </fieldset>
                      <div className="lq-answer-action">
                        {accepted ? (
                          <p role="status" className="lq-accepted">
                            <ReceiptMark />
                            {state.reveal
                              ? "Đã nhận câu trả lời."
                              : "Đã nhận câu trả lời. Chờ công bố đáp án."}
                          </p>
                        ) : !state.reveal ? (
                          <>
                            <button
                              disabled={
                                busy ||
                                !connected ||
                                remaining === 0 ||
                                !answer.selectedOptionIds.length
                              }
                              onClick={async () => {
                                const generation = requestGeneration.current;
                                setError(undefined);
                                setBusy(true);
                                try {
                                  const r = await socket
                                    .timeout(8000)
                                    .emitWithAck("quiz:answer", {
                                      roomId: id!,
                                      questionId: state.question!.id,
                                      selectedOptionIds:
                                        answer.selectedOptionIds,
                                    });
                                  if (generation !== requestGeneration.current)
                                    return;
                                  if ("error" in r)
                                    throw new Error(r.error.message);
                                  setAccepted(true);
                                } catch (e) {
                                  if (
                                    generation === requestGeneration.current &&
                                    currentSnapshot.current?.ownAnswer == null
                                  )
                                    setError(e);
                                } finally {
                                  if (generation === requestGeneration.current)
                                    setBusy(false);
                                }
                              }}
                            >
                              Gửi câu trả lời
                            </button>
                            <p role="status">
                              {busy
                                ? "Đang chờ xác nhận từ máy chủ…"
                                : remaining === 0
                                  ? "Đã hết thời gian. Chờ công bố đáp án."
                                  : "Chỉ gửi một lần cho mỗi câu hỏi."}
                            </p>
                          </>
                        ) : (
                          <p>Chưa có câu trả lời được ghi nhận cho câu này.</p>
                        )}
                      </div>
                    </>
                  )}
                  {state.reveal && (
                    <section className="lq-reveal">
                      <h3>Đáp án đúng</h3>
                      {state.question.options
                        .filter((o) =>
                          state.reveal!.correctOptionIds.includes(o.id),
                        )
                        .map((o) => (
                          <QuizMarkdown key={o.id}>
                            {o.contentMarkdown}
                          </QuizMarkdown>
                        ))}
                      <QuizMarkdown>
                        {state.reveal.explanationMarkdown || ""}
                      </QuizMarkdown>
                      <p className="lq-note">
                        {state.reveal.answerCount} câu trả lời được nhận
                      </p>
                    </section>
                  )}
                </>
              )}
            </section>
            {state.status !== "FINISHED" && leaderboard}
          </div>
          {host && (
            <aside className="lq-rail">
              {hostControl}
              {participants}
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
