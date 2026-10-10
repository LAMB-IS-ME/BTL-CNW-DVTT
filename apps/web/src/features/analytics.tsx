import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { api, download } from "../lib/api";
import {
  ErrorBox,
  Loading,
  Pager,
  ConfirmButton,
  Empty,
} from "../components/ui";
import { Markdown } from "../components/Markdown";
import {
  AttemptState,
  strategyLabel,
  useResultExam,
} from "./result-presentation";
import { RecordRetry } from "./record-pagination";
type Stats = {
  totalAssigned: number;
  notStarted: number;
  inProgress: number;
  submitted: number;
  graded: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
  passRate: number | null;
  distribution: { range: string; count: number }[];
  questions: {
    questionId: string;
    prompt: string;
    correctRate: number;
    responses: number;
  }[];
};
type Row = {
  student: {
    id: string;
    fullName: string;
    studentCode: string | null;
    email: string;
  };
  attemptCount: number;
  finalAttempt: {
    attemptNo: number;
    totalScore: string | null;
    maxScore: string;
    status: string;
  } | null;
};
export function TeacherResults() {
  const { id } = useParams();
  const exam = useResultExam(id);
  const cache = useQueryClient();
  const [exporting, setExporting] = useState<string | null>(null);
  async function exportFile(path: string, name: string) {
    setExporting(path);
    setError(undefined);
    try {
      await download(path, name);
    } catch (e) {
      setError(e);
    } finally {
      setExporting(null);
    }
  }
  const [page, setPage] = useState(1),
    [error, setError] = useState<unknown>(),
    [notice, setNotice] = useState("");
  const q = useQuery({
    staleTime: 0,
    queryKey: ["analytics", id],
    queryFn: () => api<Stats>(`/teacher/exams/${id}/analytics`),
  });
  const rows = useQuery({
    staleTime: 0,
    queryKey: ["results", id, page],
    queryFn: () =>
      api<{ items: Row[]; total: number }>(
        `/teacher/exams/${id}/results?page=${page}`,
      ),
  });
  return (
    <div className="record-page results-register">
      <nav className="record-breadcrumb" aria-label="Đường dẫn kết quả">
        <Link to="/teacher/exams">Bài thi</Link>
        <span aria-hidden="true">/</span>
        <span>Kết quả & phân tích</span>
      </nav>
      <div className="record-heading">
        <div>
          <p className="record-context">Sổ kết quả</p>
          <h1>{exam.data?.title || "Kết quả & phân tích"}</h1>
          <p className="record-meta">
            {exam.data && strategyLabel(exam.data.resultStrategy)}
          </p>
        </div>
        <div className="record-tools">
          <Link to={`/teacher/exams/${id}/grading`}>Chấm tự luận →</Link>
          <button
            className="secondary"
            disabled={!!exporting}
            onClick={() =>
              void exportFile(
                `/teacher/exams/${id}/export.xlsx`,
                "ket-qua.xlsx",
              )
            }
          >
            {exporting?.endsWith(".xlsx") ? "Đang xuất…" : "Xuất Excel"}
          </button>
        </div>
      </div>
      <ErrorBox error={error} />
      <RecordRetry
        error={exam.error}
        busy={exam.isFetching}
        retry={exam.refetch}
      />
      {exam.data && (
        <div className="record-release">
          <div>
            <strong>Công bố kết quả</strong>
            <p>
              {exam.data.resultReleaseMode === "MANUAL"
                ? exam.data.manualResultsReleasedAt
                  ? "Đã công bố · Sinh viên xem được các lượt đã chấm xong."
                  : "Chưa công bố · Sinh viên chưa xem được điểm."
                : exam.data.resultReleaseMode === "IMMEDIATE"
                  ? "Sinh viên xem kết quả ngay khi lượt thi được chấm xong."
                  : `Sinh viên xem lượt đã chấm sau khi đóng bài: ${new Date(exam.data.closeAt).toLocaleString("vi-VN")}.`}
            </p>
          </div>
          {exam.data.resultReleaseMode === "MANUAL" && (
            <ConfirmButton
              onConfirm={async () => {
                await api(`/teacher/exams/${id}/release-results`, "POST");
                setNotice("Đã công bố kết quả cho các lượt đã chấm xong.");
                await Promise.all([
                  exam.refetch(),
                  cache.invalidateQueries({
                    queryKey: ["student-results", id],
                  }),
                ]);
              }}
            >
              Công bố kết quả
            </ConfirmButton>
          )}
        </div>
      )}
      <p className="record-notice" role="status">
        {exporting ? "Đang chuẩn bị tệp tải xuống…" : notice}
      </p>
      <div className="record-rule-heading">
        <h2>Danh sách kết quả</h2>
        <span>{rows.data ? `${rows.data.total} sinh viên` : ""}</span>
      </div>
      {q.data && (
        <p className="record-meta record-counts">
          {q.data.submitted} đã nộp · {q.data.graded} có lượt được tính đã chấm
          · {q.data.inProgress} đang thi · {q.data.notStarted} chưa thi
        </p>
      )}
      <RecordRetry
        error={rows.error}
        busy={rows.isFetching}
        retry={rows.refetch}
      />
      {rows.isPending ? (
        <Loading />
      ) : (
        rows.data &&
        (rows.data.items.length === 0 ? (
          <Empty>Chưa có sinh viên trong danh sách kết quả.</Empty>
        ) : (
          <>
            <p className="record-scroll-hint">
              Bảng có thể cuộn ngang để xem đủ trạng thái và tải PDF.
            </p>
            <div
              className="record-table-scroll"
              role="region"
              aria-label="Bảng kết quả sinh viên, có thể cuộn ngang"
              tabIndex={0}
            >
              <table className="record-table">
                <caption className="record-sr-only">
                  Kết quả theo lượt được tính; dấu gạch ngang nghĩa là chưa có
                  điểm.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Sinh viên</th>
                    <th scope="col">Số lượt</th>
                    <th scope="col">Lượt tính</th>
                    <th scope="col">Điểm</th>
                    <th scope="col">Chấm bài</th>
                    <th scope="col">Phiếu kết quả</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.data.items.map((r) => (
                    <tr key={r.student.id}>
                      <th scope="row">
                        <strong>{r.student.fullName}</strong>
                        <small>
                          {r.student.studentCode || r.student.email}
                        </small>
                      </th>
                      <td>{r.attemptCount}</td>
                      <td>{r.finalAttempt?.attemptNo || "—"}</td>
                      <td className="record-numeric">
                        {r.finalAttempt?.totalScore ?? "—"}
                        <span> / {r.finalAttempt?.maxScore || "—"}</span>
                      </td>
                      <td>
                        <AttemptState
                          status={r.finalAttempt?.status || "NOT_STARTED"}
                        />
                      </td>
                      <td>
                        <button
                          className="secondary"
                          disabled={!!exporting}
                          aria-label={`Tải PDF · ${r.student.fullName}`}
                          onClick={() =>
                            void exportFile(
                              `/teacher/exams/${id}/students/${r.student.id}/result.pdf`,
                              "phieu-ket-qua.pdf",
                            )
                          }
                        >
                          {exporting?.includes(r.student.id)
                            ? "Đang xuất…"
                            : "Tải PDF"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul
              className="record-mobile-results"
              aria-label="Kết quả từng sinh viên"
            >
              {rows.data.items.map((r) => (
                <li key={r.student.id}>
                  <div className="record-mobile-identity">
                    <strong>{r.student.fullName}</strong>
                    <small>{r.student.studentCode || r.student.email}</small>
                  </div>
                  <div className="record-mobile-score">
                    <span>Điểm</span>
                    <strong>
                      {r.finalAttempt?.totalScore ?? "—"}
                      <small> / {r.finalAttempt?.maxScore || "—"}</small>
                    </strong>
                  </div>
                  <div>
                    <AttemptState
                      status={r.finalAttempt?.status || "NOT_STARTED"}
                    />
                    <p className="record-meta">
                      {r.attemptCount} lượt thi · Lượt tính:{" "}
                      {r.finalAttempt?.attemptNo || "—"}
                    </p>
                  </div>
                  <button
                    className="secondary"
                    disabled={!!exporting}
                    aria-label={`Tải PDF · ${r.student.fullName}`}
                    onClick={() =>
                      void exportFile(
                        `/teacher/exams/${id}/students/${r.student.id}/result.pdf`,
                        "phieu-ket-qua.pdf",
                      )
                    }
                  >
                    {exporting?.includes(r.student.id)
                      ? "Đang xuất…"
                      : "Tải PDF"}
                  </button>
                </li>
              ))}
            </ul>
            <Pager page={page} total={rows.data.total} onChange={setPage} />
          </>
        ))
      )}
      <details className="record-analysis">
        <summary>Phân tích bài thi</summary>
        <p className="record-meta">
          Thống kê theo lượt được tính. Chỉ lượt đã chấm xong được tính điểm.
        </p>
        <RecordRetry error={q.error} busy={q.isFetching} retry={q.refetch} />
        {q.isPending ? (
          <Loading />
        ) : (
          q.data && (
            <>
              <dl className="record-statistics">
                {(
                  [
                    ["totalAssigned", "Sinh viên"],
                    ["notStarted", "Chưa thi"],
                    ["inProgress", "Đang thi"],
                    ["submitted", "Đã nộp"],
                    ["graded", "Đã chấm"],
                    ["average", "Trung bình (%)"],
                    ["highest", "Cao nhất (%)"],
                    ["lowest", "Thấp nhất (%)"],
                    ["passRate", "Tỷ lệ đạt (%)"],
                  ] as const
                ).map(([key, title]) => (
                  <div key={key}>
                    <dt>{title}</dt>
                    <dd>
                      {q.data![key] === null
                        ? "—"
                        : ["average", "highest", "lowest", "passRate"].includes(
                              key,
                            )
                          ? q.data![key]?.toFixed(1)
                          : q.data![key]}
                    </dd>
                  </div>
                ))}
              </dl>
              <section className="record-distribution">
                <h2>Phân bố điểm</h2>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={q.data.distribution}>
                    <XAxis dataKey="range" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" name="Sinh viên" fill="#24574e" />
                  </BarChart>
                </ResponsiveContainer>
                <p className="record-meta">
                  {q.data.distribution
                    .map((d) => `${d.range}%: ${d.count} sinh viên`)
                    .join(" · ")}
                </p>
              </section>
              <section>
                <h2>Tỷ lệ đúng theo câu khách quan</h2>
                {q.data.questions.map((v) => (
                  <div className="record-question-stat" key={v.questionId}>
                    <Markdown>{v.prompt}</Markdown>
                    <progress
                      max={100}
                      value={v.correctRate}
                      aria-label="Tỷ lệ đúng"
                    />
                    <span>
                      {" "}
                      {v.correctRate.toFixed(1)}% · {v.responses} lượt được tính
                    </span>
                  </div>
                ))}
              </section>
            </>
          )
        )}
      </details>
    </div>
  );
}
