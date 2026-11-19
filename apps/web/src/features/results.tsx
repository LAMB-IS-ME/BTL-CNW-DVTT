import { useEffect, useRef, useState } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
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
import {
  AttemptState,
  strategyLabel,
  useResultExam,
} from "./result-presentation";
import {
  type GradeDraft,
  type GradeValues,
  isGradeDirty,
  acknowledgeGrade,
} from "./grading-draft";
import { GradingLeave } from "./grading-leave";
import { useRecordPage, RecordPager, RecordRetry } from "./record-pagination";
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
  submittedAt: string | null;
  status: string;
  student: { fullName: string; studentCode: string | null };
  questions: {
    id: string;
    points: string;
    orderIndex: number;
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
  return <GradingWorkspace key={id} id={id!} />;
}
function GradingWorkspace({ id }: { id: string }) {
  const exam = useResultExam(id);
  const cache = useQueryClient();
  const paging = useRecordPage<GradeAttempt>(
    ["grading", id],
    `/teacher/exams/${id}/grading`,
  );
  const q = paging.query;
  const [drafts, setDrafts] = useState<Record<string, GradeDraft>>({});
  const current = useRef(drafts);
  function update(answerId: string, draft: GradeDraft) {
    current.current = { ...current.current, [answerId]: draft };
    setDrafts(current.current);
  }
  function draftFor(
    answer: GradeAttempt["questions"][number]["answer"],
  ): GradeDraft {
    const values = {
      score: answer?.manualScore ?? "",
      feedback: answer?.feedback ?? "",
    };
    return (
      (answer && current.current[answer.id]) || {
        values,
        persisted: values,
        state: "idle",
      }
    );
  }
  async function save(
    answer: NonNullable<GradeAttempt["questions"][number]["answer"]>,
  ) {
    const draft = draftFor(answer);
    if (draft.state === "saving") return;
    const sent = { ...draft.values };
    update(answer.id, { ...draft, state: "saving", error: undefined });
    try {
      await api(`/teacher/answers/${answer.id}/grade`, "PUT", {
        score: Number(sent.score),
        feedback: sent.feedback,
      });
      update(answer.id, acknowledgeGrade(current.current[answer.id]!, sent));
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["grading", id] }),
        cache.invalidateQueries({ queryKey: ["results", id] }),
        cache.invalidateQueries({ queryKey: ["analytics", id] }),
        cache.invalidateQueries({ queryKey: ["student-results", id] }),
      ]);
    } catch (error) {
      update(answer.id, {
        ...current.current[answer.id]!,
        state: "failed",
        error,
      });
    }
  }
  const dirty = Object.values(drafts).filter(isGradeDirty).length;
  const saving = Object.values(drafts).some((d) => d.state === "saving");
  return (
    <div className="record-page marking-desk">
      <GradingLeave dirty={dirty > 0} saving={saving} />
      <nav className="record-breadcrumb" aria-label="Đường dẫn chấm bài">
        <Link to="/teacher/exams">Bài thi</Link>
        <span aria-hidden="true">/</span>
        <span>Chấm tự luận</span>
      </nav>
      <div className="record-heading">
        <div>
          <p className="record-context">Chấm tự luận</p>
          <h1>{exam.data?.title || "Chấm tự luận"}</h1>
        </div>
        <Link to={`/teacher/exams/${id}/results`}>Kết quả & công bố →</Link>
      </div>
      <RecordRetry
        error={exam.error}
        busy={exam.isFetching}
        retry={exam.refetch}
      />
      <RecordRetry error={q.error} busy={q.isFetching} retry={q.refetch} />
      {!!dirty && (
        <p className="record-draft-summary" role="status">
          {dirty} câu có thay đổi chưa lưu. Bản nháp được giữ khi chuyển trang
          danh sách; hãy lưu từng câu trước khi rời chấm bài.
        </p>
      )}
      <RecordPager
        page={paging.page}
        setPage={paging.setPage}
        hasNext={paging.hasNext}
        nextError={paging.next.error}
        checking={paging.next.isFetching}
        retry={paging.next.refetch}
      />
      <div className="record-rule-heading">
        <h2>Bài đã nộp</h2>
        <span>Mở bài để đọc và chấm từng câu tự luận</span>
      </div>
      {q.isPending ? (
        <Loading />
      ) : (
        q.data && (
          <>
            {!q.data.length && <Empty>Chưa có bài đã nộp để chấm.</Empty>}
            {q.data.map((a, i) => (
              <details className="marking-submission" key={a.id} open={i === 0}>
                <summary>
                  <span className="record-index" aria-hidden="true">
                    {String((paging.page - 1) * 20 + i + 1).padStart(2, "0")}
                  </span>
                  <span className="marking-student">
                    <strong>{a.student.fullName}</strong>
                    <small>
                      {a.student.studentCode || "Chưa có mã sinh viên"} · Lượt{" "}
                      {a.attemptNo}
                    </small>
                  </span>
                  <AttemptState status={a.status} />
                </summary>
                <div className="marking-submission-body">
                  {a.submittedAt && (
                    <p className="record-meta">
                      Nộp lúc {new Date(a.submittedAt).toLocaleString("vi-VN")}
                    </p>
                  )}
                  {a.questions.filter((q) => q.snapshotJson.type === "ESSAY")
                    .length === 0 && (
                    <Empty>Bài này không có câu tự luận.</Empty>
                  )}
                  {[...a.questions]
                    .sort((a, b) => a.orderIndex - b.orderIndex)
                    .map(
                      (question) =>
                        question.snapshotJson.type === "ESSAY" && (
                          <EssayGrade
                            key={question.id}
                            question={question}
                            studentContext={`${a.student.fullName} · Lượt ${a.attemptNo}`}
                            index={question.orderIndex + 1}
                            draft={draftFor(question.answer)}
                            change={(values) => {
                              if (question.answer)
                                update(question.answer.id, {
                                  ...draftFor(question.answer),
                                  values,
                                  error: undefined,
                                  state: "idle",
                                });
                            }}
                            save={() =>
                              question.answer
                                ? save(question.answer)
                                : Promise.resolve()
                            }
                          />
                        ),
                    )}
                </div>
              </details>
            ))}
          </>
        )
      )}
    </div>
  );
}
function EssayGrade({
  question: q,
  index,
  studentContext,
  draft,
  change,
  save,
}: {
  question: GradeAttempt["questions"][number];
  index: number;
  studentContext: string;
  draft: GradeDraft;
  change: (values: GradeValues) => void;
  save: () => Promise<void>;
}) {
  const dirty = isGradeDirty(draft);
  const state = draft.state;
  return (
    <form
      className="marking-question"
      onSubmit={(e) => {
        e.preventDefault();
        if (e.currentTarget.checkValidity()) void save();
      }}
    >
      <div className="marking-reading">
        <h3 className="record-question-title">
          Câu {index} <span>Tự luận · {q.points} điểm</span>
        </h3>
        <div className="marking-prompt">
          <Markdown>{q.snapshotJson.promptMarkdown}</Markdown>
        </div>
        <h4>Bài làm của sinh viên</h4>
        <p className="record-answer">
          {q.answer?.answerText || "(Chưa trả lời)"}
        </p>
      </div>
      <div className="marking-score">
        <p className="marking-score-context">
          {studentContext} · Câu {index}
        </p>
        <fieldset disabled={state === "saving" || !q.answer}>
          <legend>Điểm & nhận xét</legend>
          <Field label={`Điểm (0–${q.points})`}>
            <input
              type="number"
              min="0"
              max={q.points}
              step="0.01"
              name="score"
              value={draft.values.score}
              onChange={(e) =>
                change({
                  ...draft.values,
                  score: e.target.value,
                  invalid: e.target.validity.badInput,
                })
              }
              required
              aria-describedby={`score-help-${q.id}`}
            />
          </Field>
          <p id={`score-help-${q.id}`} className="record-meta">
            Tối đa {q.points} điểm · Bước nhập 0,01
          </p>
          <Field label="Nhận xét">
            <textarea
              name="feedback"
              rows={5}
              maxLength={10000}
              value={draft.values.feedback}
              onChange={(e) =>
                change({ ...draft.values, feedback: e.target.value })
              }
            />
          </Field>
          <button type="submit">
            {state === "saving" ? "Đang lưu…" : "Lưu điểm"}
          </button>
        </fieldset>
        <p className="marking-save-state" role="status">
          {state === "saved" && !dirty
            ? "Đã lưu điểm"
            : state === "saving"
              ? "Đang lưu điểm…"
              : dirty && state !== "failed"
                ? "Có thay đổi chưa lưu"
                : state === "failed"
                  ? "Chưa lưu được. Vui lòng thử lại."
                  : q.answer?.manualScore != null
                    ? "Điểm đã lưu · Có thể chỉnh sửa"
                    : "Chưa chấm câu này"}
        </p>
        <ErrorBox error={draft.error} />
        {!q.answer && <p role="alert">Không có dữ liệu đáp án để chấm.</p>}
      </div>
    </form>
  );
}
export function StudentResults() {
  const { id } = useParams();
  const location = useLocation();
  const back =
    (location.state as { resultsPage?: string } | null)?.resultsPage ||
    "/student/results";
  const q = useQuery({
    staleTime: 0,
    queryKey: ["student-results", id],
    queryFn: () => api<StudentResult>(`/student/exams/${id}/results`),
    enabled: !!id,
  });
  const paging = useRecordPage<{ id: string; title: string }>(
    ["student-result-exams"],
    "/student/exams",
    !id,
  );
  const list = paging.query;
  if (!id)
    return (
      <div className="record-page student-record">
        <p className="record-context">Hồ sơ học tập</p>
        <h1>Kết quả của tôi</h1>
        <p className="record-intro">
          Chọn bài thi để xem trạng thái chấm và kết quả từng lượt.
        </p>
        <RecordRetry
          error={list.error}
          busy={list.isFetching}
          retry={list.refetch}
        />
        <RecordPager
          page={paging.page}
          setPage={paging.setPage}
          hasNext={paging.hasNext}
          nextError={paging.next.error}
          checking={paging.next.isFetching}
          retry={paging.next.refetch}
        />
        {list.isPending ? (
          <Loading />
        ) : list.data?.length === 0 ? (
          <Empty>Chưa có bài thi trong danh sách kết quả.</Empty>
        ) : (
          list.data?.map((e, i) => (
            <Link
              className="student-result-link"
              key={e.id}
              to={`/student/results/${e.id}`}
              state={{ resultsPage: location.pathname + location.search }}
            >
              <span className="record-index" aria-hidden="true">
                {String((paging.page - 1) * 20 + i + 1).padStart(2, "0")}
              </span>
              <span>{e.title}</span>
              <span aria-hidden="true">→</span>
            </Link>
          ))
        )}
      </div>
    );
  if (q.isPending)
    return (
      <div className="record-page student-record">
        <Loading />
      </div>
    );
  if (!q.data || q.isError)
    return (
      <div className="record-page student-record">
        <Link to={back}>← Kết quả của tôi</Link>
        <RecordRetry error={q.error} busy={q.isFetching} retry={q.refetch} />
      </div>
    );
  return (
    <div className="record-page student-record">
      <nav className="record-breadcrumb" aria-label="Đường dẫn kết quả">
        <Link to={back}>Kết quả của tôi</Link>
        <span aria-hidden="true">/</span>
        <span>Chi tiết</span>
      </nav>
      <div className="record-heading">
        <div>
          <p className="record-context">Kết quả bài thi</p>
          <h1>{q.data.title}</h1>
          <p className="record-meta">{strategyLabel(q.data.resultStrategy)}</p>
        </div>
      </div>
      {!q.data.attempts.length && <Empty>Chưa có lượt thi.</Empty>}
      {q.data.attempts.map((a) => (
        <article className="student-attempt" key={a.id}>
          <div className="student-attempt-heading">
            <h2>Lượt {a.attemptNo}</h2>
            <span className="record-meta">
              {q.data.finalAttemptId === a.id
                ? "Lượt được chọn tính kết quả"
                : "Lịch sử lượt thi"}
            </span>
          </div>
          <p className="student-result-state">
            {a.status === "IN_PROGRESS"
              ? "Đang làm bài"
              : a.status === "PENDING_MANUAL_GRADING"
                ? "Đã nộp · Đang chờ chấm tự luận"
                : a.visible
                  ? "Đã chấm"
                  : "Đã nộp · Kết quả chưa công bố"}
          </p>
          {a.submittedAt && (
            <p className="record-meta">
              Nộp lúc {new Date(a.submittedAt).toLocaleString("vi-VN")}
            </p>
          )}
          {a.visible && (
            <>
              <div className="student-score-line">
                <span>Tổng điểm</span>
                <strong>
                  {a.totalScore}
                  <span> / {a.maxScore}</span>
                </strong>
                <span>{a.percentage?.toFixed(1)}%</span>
              </div>
              {a.questions?.map((q, i) => (
                <section className="student-question-record" key={q.id}>
                  <h3>
                    Câu {i + 1}{" "}
                    {q.score !== undefined
                      ? `· ${q.score}/${q.points} điểm`
                      : ""}
                  </h3>
                  <Markdown>{q.promptMarkdown}</Markdown>
                  {q.type === "ESSAY" ? (
                    <p className="record-answer">
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
                  {q.feedback && (
                    <p className="student-feedback">
                      <strong>Nhận xét của giảng viên</strong>
                      <br />
                      {q.feedback}
                    </p>
                  )}
                </section>
              ))}
            </>
          )}
        </article>
      ))}
    </div>
  );
}
