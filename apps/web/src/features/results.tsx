import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MonitorSnapshot,
  PresenceStatus,
  StudentResult,
  Snapshot,
} from "@exam/shared";
import { api } from "../lib/api";
import { connectSocket } from "../lib/socket";
import { ErrorBox, Loading, Field, Empty } from "../components/ui";
import { Markdown } from "../components/Markdown";
const labels: Record<PresenceStatus, string> = {
  NOT_STARTED: "Chưa bắt đầu",
  IN_PROGRESS: "Đang thi",
  DISCONNECTED: "Mất kết nối",
  SUBMITTED: "Đã nộp",
};
export function StatusBadge({ status }: { status: PresenceStatus }) {
  return (
    <span className={`badge badge-${status.toLowerCase()}`}>
      {labels[status]}
    </span>
  );
}
export function ExamMonitor() {
  const { id } = useParams();
  const cache = useQueryClient();
  const [connected, setConnected] = useState(false),
    [error, setError] = useState<unknown>(),
    [now, setNow] = useState(Date.now());
  const q = useQuery({
    queryKey: ["monitor", id],
    queryFn: () => api<MonitorSnapshot>(`/teacher/exams/${id}/monitor`),
  });
  useEffect(() => {
    const s = connectSocket();
    s.on("connect", () => {
      setConnected(true);
      s.emit("exam:monitor:join", { examId: id! }, (r) => {
        if ("error" in r) setError(new Error(r.error.message));
        else cache.setQueryData(["monitor", id], r.data);
      });
    });
    s.on("disconnect", () => setConnected(false));
    s.on("connect_error", setError);
    s.on("exam:monitor:snapshot", (d) =>
      cache.setQueryData(["monitor", id], d),
    );
    s.connect();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      s.disconnect();
    };
  }, [id, cache]);
  return (
    <>
      <h1>Giám sát bài thi</h1>
      <p role="status">
        {connected ? "● Kết nối realtime" : "Đang kết nối lại…"}
      </p>
      <ErrorBox error={error || q.error} />
      {q.isPending ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sinh viên</th>
                <th>Mã SV</th>
                <th>Trạng thái</th>
                <th>Bắt đầu</th>
                <th>Còn lại</th>
                <th>Hoạt động cuối</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.rows.map((s) => (
                <tr key={s.studentId}>
                  <td>{s.fullName}</td>
                  <td>{s.studentCode || "—"}</td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                  <td>
                    {s.startedAt
                      ? new Date(s.startedAt).toLocaleTimeString()
                      : "—"}
                  </td>
                  <td>
                    {s.expiresAt && s.status !== "SUBMITTED"
                      ? `${Math.max(0, Math.ceil((Date.parse(s.expiresAt) - now) / 60000))} phút`
                      : "—"}
                  </td>
                  <td>
                    {s.lastActivityAt
                      ? new Date(s.lastActivityAt).toLocaleTimeString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Link to={`/teacher/exams/${id}/grading`}>Chấm bài tự luận →</Link>
    </>
  );
}
type GradeAttempt = {
  id: string;
  attemptNo: number;
  status: string;
  student: { fullName: string; studentCode: string | null };
  questions: {
    id: string;
    points: string;
    snapshotJson: Snapshot;
    answer: {
      id: string;
      answerText: string | null;
      manualScore: string | null;
      feedback: string | null;
    } | null;
  }[];
};
export function Grading() {
  const { id } = useParams();
  const q = useQuery({
    queryKey: ["grading", id],
    queryFn: () =>
      api<GradeAttempt[]>(`/teacher/exams/${id}/grading?pageSize=100`),
  });
  return (
    <>
      <h1>Chấm tự luận</h1>
      <ErrorBox error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : (
        q.data?.map((a) => (
          <section className="card" key={a.id}>
            <h2>
              {a.student.fullName} · Lượt {a.attemptNo}
            </h2>
            <p>{a.status}</p>
            {a.questions
              .filter((q) => q.snapshotJson.type === "ESSAY")
              .map((q) => (
                <EssayGrade
                  key={q.id}
                  question={q}
                  refresh={() => qRefetch()}
                />
              ))}
          </section>
        ))
      )}
      <Link to={`/teacher/exams/${id}/results`}>Kết quả & công bố →</Link>
    </>
  );
  async function qRefetch() {
    await q.refetch();
  }
}
function EssayGrade({
  question: q,
  refresh,
}: {
  question: GradeAttempt["questions"][number];
  refresh: () => Promise<void>;
}) {
  const [error, setError] = useState<unknown>(),
    [saved, setSaved] = useState(false);
  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const d = new FormData(e.currentTarget);
          await api(`/teacher/answers/${q.answer?.id}/grade`, "PUT", {
            score: Number(d.get("score")),
            feedback: d.get("feedback"),
          });
          setSaved(true);
          await refresh();
        } catch (e) {
          setError(e);
        }
      }}
    >
      <Markdown>{q.snapshotJson.promptMarkdown}</Markdown>
      <h3>Bài làm</h3>
      <p style={{ whiteSpace: "pre-wrap" }}>
        {q.answer?.answerText || "(Chưa trả lời)"}
      </p>
      <Field label={`Điểm (0–${q.points})`}>
        <input
          type="number"
          min="0"
          max={q.points}
          step="0.01"
          name="score"
          defaultValue={q.answer?.manualScore || ""}
          required
        />
      </Field>
      <Field label="Nhận xét">
        <textarea name="feedback" defaultValue={q.answer?.feedback || ""} />
      </Field>
      <ErrorBox error={error} />
      <button>Lưu điểm</button>
      {saved && <p role="status">Đã lưu điểm</p>}
    </form>
  );
}
export function StudentResults() {
  const { id } = useParams();
  const q = useQuery({
    queryKey: ["student-results", id],
    queryFn: () => api<StudentResult>(`/student/exams/${id}/results`),
    enabled: !!id,
  });
  const list = useQuery({
    queryKey: ["student-exams"],
    queryFn: () => api<{ id: string; title: string }[]>("/student/exams"),
    enabled: !id,
  });
  if (!id)
    return (
      <>
        <h1>Kết quả của tôi</h1>
        <ErrorBox error={list.error} />
        {list.isPending ? (
          <Loading />
        ) : (
          list.data?.map((e) => (
            <Link
              className="card"
              style={{ display: "block" }}
              key={e.id}
              to={`/student/results/${e.id}`}
            >
              {e.title} →
            </Link>
          ))
        )}
      </>
    );
  if (q.isPending) return <Loading />;
  if (!q.data) return <ErrorBox error={q.error} />;
  return (
    <>
      <h1>{q.data.title}</h1>
      <p>Chiến lược: {q.data.resultStrategy}</p>
      {!q.data.attempts.length && <Empty>Chưa có lượt thi.</Empty>}
      {q.data.attempts.map((a) => (
        <article className="card" key={a.id}>
          <h2>
            Lượt {a.attemptNo}{" "}
            {q.data.finalAttemptId === a.id ? "· Kết quả được tính" : ""}
          </h2>
          <p>
            {a.status === "IN_PROGRESS"
              ? "Đang làm bài"
              : a.status === "PENDING_MANUAL_GRADING"
                ? "Đã nộp · Đang chờ chấm tự luận"
                : a.visible
                  ? "Đã chấm"
                  : "Đã nộp · Kết quả chưa công bố"}
          </p>
          {a.visible && (
            <>
              <strong className="score">
                {a.totalScore}/{a.maxScore} · {a.percentage?.toFixed(1)}%
              </strong>
              {a.questions?.map((q, i) => (
                <section className="card" key={q.id}>
                  <h3>
                    Câu {i + 1}{" "}
                    {q.score !== undefined
                      ? `· ${q.score}/${q.points} điểm`
                      : ""}
                  </h3>
                  <Markdown>{q.promptMarkdown}</Markdown>
                  {q.type === "ESSAY" ? (
                    <p style={{ whiteSpace: "pre-wrap" }}>
                      {q.answerText || "(Chưa trả lời)"}
                    </p>
                  ) : (
                    q.options.map((o) => (
                      <div className="choice" key={o.id}>
                        <span>
                          {q.selectedOptionIds.includes(o.id) ? "●" : "○"}{" "}
                          {o.isCorrect ? "✓ Đúng" : ""}
                        </span>
                        <Markdown>{o.contentMarkdown}</Markdown>
                      </div>
                    ))
                  )}
                  {q.explanationMarkdown && (
                    <>
                      <h3>Giải thích</h3>
                      <Markdown>{q.explanationMarkdown}</Markdown>
                    </>
                  )}
                  {q.feedback && <p>Nhận xét: {q.feedback}</p>}
                </section>
              ))}
            </>
          )}
        </article>
      ))}
    </>
  );
}
