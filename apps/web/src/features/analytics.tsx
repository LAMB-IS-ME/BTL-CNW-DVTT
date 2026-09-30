import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { api, download } from "../lib/api";
import { ErrorBox, Loading, Pager, ConfirmButton } from "../components/ui";
import { Markdown } from "../components/Markdown";
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
  const [page, setPage] = useState(1),
    [error, setError] = useState<unknown>(),
    [notice, setNotice] = useState("");
  const q = useQuery({
    queryKey: ["analytics", id],
    queryFn: () => api<Stats>(`/teacher/exams/${id}/analytics`),
  });
  const rows = useQuery({
    queryKey: ["results", id, page],
    queryFn: () =>
      api<{ items: Row[]; total: number }>(
        `/teacher/exams/${id}/results?page=${page}`,
      ),
  });
  return (
    <>
      <h1>Kết quả & phân tích</h1>
      <div className="actions">
        <Link to={`/teacher/exams/${id}/grading`}>Chấm tự luận</Link>
        <button
          onClick={() =>
            void download(
              `/teacher/exams/${id}/export.xlsx`,
              "ket-qua.xlsx",
            ).catch(setError)
          }
        >
          Xuất Excel
        </button>
        <ConfirmButton
          onConfirm={async () => {
            await api(`/teacher/exams/${id}/release-results`, "POST");
            setNotice("Đã công bố kết quả cho chế độ MANUAL.");
          }}
        >
          Công bố kết quả
        </ConfirmButton>
      </div>
      <p role="status">{notice}</p>
      <ErrorBox error={error || q.error || rows.error} />
      {q.isPending ? (
        <Loading />
      ) : (
        q.data && (
          <>
            <div className="grid">
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
                <div className="card" key={key}>
                  <span className="eyebrow">{title}</span>
                  <h2>{q.data![key]?.toFixed(1) || "—"}</h2>
                </div>
              ))}
            </div>
            <section className="card">
              <h2>Phân bố điểm</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={q.data.distribution}>
                  <XAxis dataKey="range" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    name="Sinh viên"
                    fill="#176656"
                    radius={[5, 5, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
              <p>
                Thống kê tính theo lượt được chọn bởi chiến lược kết quả; chỉ
                lượt GRADED được tính điểm.
              </p>
            </section>
            <section className="card">
              <h2>Tỷ lệ đúng theo câu khách quan</h2>
              {q.data.questions.map((v) => (
                <div className="card" key={v.questionId}>
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
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Sinh viên</th>
              <th>Số lượt</th>
              <th>Lượt tính</th>
              <th>Điểm</th>
              <th>Trạng thái</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            {rows.data?.items.map((r) => (
              <tr key={r.student.id}>
                <td>
                  {r.student.fullName}
                  <br />
                  {r.student.studentCode || r.student.email}
                </td>
                <td>{r.attemptCount}</td>
                <td>{r.finalAttempt?.attemptNo || "—"}</td>
                <td>
                  {r.finalAttempt?.totalScore ?? "—"}/
                  {r.finalAttempt?.maxScore || "—"}
                </td>
                <td>{r.finalAttempt?.status || "NOT_STARTED"}</td>
                <td>
                  <button
                    className="secondary"
                    onClick={() =>
                      void download(
                        `/teacher/exams/${id}/students/${r.student.id}/result.pdf`,
                        "phieu-ket-qua.pdf",
                      ).catch(setError)
                    }
                  >
                    Tải PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={rows.data?.total || 0} onChange={setPage} />
    </>
  );
}
