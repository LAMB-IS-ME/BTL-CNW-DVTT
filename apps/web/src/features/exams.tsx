import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ExamDto, ExamInput, QuestionDto } from "@exam/shared";
import { api } from "../lib/api";
import {
  Field,
  ErrorBox,
  Loading,
  Pager,
  ConfirmButton,
} from "../components/ui";
import { Markdown } from "../components/Markdown";
export function TeacherExams() {
  const q = useQuery({
    queryKey: ["teacher-exams"],
    queryFn: () => api<ExamDto[]>("/teacher/exams"),
  });
  return (
    <>
      <div className="actions">
        <h1>Bài thi của tôi</h1>
        <Link className="button" to="/teacher/exams/new">
          Tạo bài thi
        </Link>
      </div>
      <ErrorBox error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : (
        <div className="grid">
          {q.data?.map((e) => (
            <article className="card" key={e.id}>
              <span className="eyebrow">{e.status}</span>
              <h2>{e.title}</h2>
              <p>
                {new Date(e.openAt).toLocaleString("vi-VN")} ·{" "}
                {e.durationMinutes} phút
              </p>
              <div className="actions">
                <Link to={`/teacher/exams/${e.id}/edit`}>Chỉnh sửa</Link>
                <Link to={`/teacher/exams/${e.id}/preview`}>Xem trước</Link>
                <Link to={`/teacher/exams/${e.id}/monitor`}>Giám sát</Link>
                <Link to={`/teacher/exams/${e.id}/grading`}>Chấm bài</Link>
                <Link to={`/teacher/exams/${e.id}/results`}>Kết quả</Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
export function ExamBuilder({ preview = false }: { preview?: boolean }) {
  const { id } = useParams();
  const q = useQuery({
    queryKey: ["exam", id],
    queryFn: () => api<ExamDto>(`/teacher/exams/${id}`),
    enabled: !!id,
  });
  if (id && q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  return <BuilderForm key={id || "new"} exam={q.data} preview={preview} />;
}
const defaults: ExamInput = {
  title: "",
  descriptionMarkdown: "",
  openAt: new Date().toISOString(),
  closeAt: new Date(Date.now() + 86400000).toISOString(),
  durationMinutes: 45,
  maxAttempts: 1,
  resultStrategy: "HIGHEST_SCORE",
  resultReleaseMode: "MANUAL",
  shuffleQuestions: false,
  shuffleOptions: false,
  showCorrectAnswers: false,
  showExplanations: false,
  showDetailedScore: true,
  passScorePercent: 50,
};
const localDate = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
function BuilderForm({ exam, preview }: { exam?: ExamDto; preview: boolean }) {
  const nav = useNavigate();
  const [d, setD] = useState<ExamInput>(
      exam
        ? { ...exam, passScorePercent: Number(exam.passScorePercent) }
        : defaults,
    ),
    [step, setStep] = useState(preview ? 4 : 0),
    [classes, setClasses] = useState(exam?.classes.map((c) => c.classId) || []),
    [fixed, setFixed] = useState(
      exam?.questions.map((q) => ({ ...q, points: Number(q.points) })) || [],
    ),
    [pools, setPools] = useState(
      exam?.pools.map((p) => ({ ...p, pointsEach: Number(p.pointsEach) })) ||
        [],
    ),
    [bank, setBank] = useState(""),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [error, setError] = useState<unknown>(),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const cs = useQuery({
    queryKey: ["classes"],
    queryFn: () =>
      api<{ id: string; name: string; archivedAt: string | null }[]>(
        "/teacher/classes?pageSize=100",
      ),
  });
  const bs = useQuery({
    queryKey: ["banks-picker"],
    queryFn: () =>
      api<{ id: string; title: string; isArchived: boolean }[]>(
        "/teacher/question-banks?pageSize=100",
      ),
  });
  const qs = useQuery({
    queryKey: ["bank-questions", bank, page, search],
    queryFn: () =>
      api<{ items: QuestionDto[]; total: number }>(
        `/teacher/question-banks/${bank}/questions?page=${page}&search=${encodeURIComponent(search)}`,
      ),
    enabled: !!bank,
  });
  const patch = (v: Partial<ExamInput>) => {
    setNotice("");
    setD({ ...d, ...v });
  };
  async function save(publish = false) {
    setBusy(true);
    setError(undefined);
    try {
      const e = await api<ExamDto>(
        exam ? `/teacher/exams/${exam.id}` : "/teacher/exams",
        exam ? "PATCH" : "POST",
        d,
      );
      await api(`/teacher/exams/${e.id}/classes`, "PUT", { classIds: classes });
      await api(`/teacher/exams/${e.id}/questions`, "PUT", {
        questions: fixed.map((q) => ({
          questionId: q.questionId,
          points: q.points,
        })),
      });
      await api(`/teacher/exams/${e.id}/pools`, "PUT", { pools });
      if (publish) await api(`/teacher/exams/${e.id}/publish`, "POST");
      setNotice(publish ? "Đã công bố bài thi" : "Đã lưu cấu hình");
      if (!exam || publish) nav("/teacher/exams");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>
        {preview
          ? "Xem trước bài thi"
          : exam
            ? "Chỉnh sửa bài thi"
            : "Tạo bài thi"}
      </h1>
      <nav className="steps">
        {[
          "Thông tin",
          "Lớp & lịch thi",
          "Câu hỏi",
          "Cài đặt",
          "Kiểm tra & công bố",
        ].map((s, i) => (
          <button
            className={step === i ? "" : "secondary"}
            key={s}
            onClick={() => setStep(i)}
          >
            {i + 1}. {s}
          </button>
        ))}
      </nav>
      <ErrorBox error={error || cs.error || bs.error || qs.error} />
      {notice && <p role="status">{notice}</p>}
      {step === 0 && (
        <section className="card">
          <Field label="Tên bài thi">
            <input
              value={d.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </Field>
          <Field label="Mô tả Markdown">
            <textarea
              value={d.descriptionMarkdown || ""}
              onChange={(e) => patch({ descriptionMarkdown: e.target.value })}
            />
          </Field>
          <Markdown>{d.descriptionMarkdown || ""}</Markdown>
        </section>
      )}
      {step === 1 && (
        <section className="card">
          <h2>Giao cho lớp</h2>
          {cs.data
            ?.filter((c) => !c.archivedAt)
            .map((c) => (
              <label className="choice" key={c.id}>
                <input
                  type="checkbox"
                  checked={classes.includes(c.id)}
                  onChange={(e) =>
                    setClasses(
                      e.target.checked
                        ? [...classes, c.id]
                        : classes.filter((id) => id !== c.id),
                    )
                  }
                />
                {c.name}
              </label>
            ))}
          <div className="grid">
            <Field label="Mở bài (giờ địa phương)">
              <input
                type="datetime-local"
                value={localDate(d.openAt)}
                onChange={(e) => {
                  if (e.target.value)
                    patch({ openAt: new Date(e.target.value).toISOString() });
                }}
              />
            </Field>
            <Field label="Đóng bài">
              <input
                type="datetime-local"
                value={localDate(d.closeAt)}
                onChange={(e) => {
                  if (e.target.value)
                    patch({ closeAt: new Date(e.target.value).toISOString() });
                }}
              />
            </Field>
            <Field label="Thời lượng (phút)">
              <input
                type="number"
                min="1"
                value={d.durationMinutes}
                onChange={(e) =>
                  patch({ durationMinutes: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Số lần thi">
              <input
                type="number"
                min="1"
                value={d.maxAttempts}
                onChange={(e) => patch({ maxAttempts: Number(e.target.value) })}
              />
            </Field>
          </div>
        </section>
      )}
      {step === 2 && (
        <>
          <section className="card">
            <h2>Câu hỏi cố định</h2>
            <Field label="Ngân hàng">
              <select
                value={bank}
                onChange={(e) => {
                  setBank(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Chọn ngân hàng</option>
                {bs.data
                  ?.filter((b) => !b.isArchived)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
              </select>
            </Field>
            <input
              aria-label="Tìm câu hỏi"
              placeholder="Tìm nội dung câu hỏi"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            {qs.data?.items.map((q) => (
              <div className="choice" key={q.id}>
                <input
                  type="checkbox"
                  aria-label={`Chọn ${q.promptMarkdown}`}
                  checked={fixed.some((f) => f.questionId === q.id)}
                  onChange={(e) =>
                    setFixed(
                      e.target.checked
                        ? [
                            ...fixed,
                            {
                              questionId: q.id,
                              points: Number(q.defaultPoints),
                              question: q,
                            },
                          ]
                        : fixed.filter((f) => f.questionId !== q.id),
                    )
                  }
                />
                <Markdown>{q.promptMarkdown}</Markdown>
              </div>
            ))}
            {bank && (
              <Pager
                page={page}
                total={qs.data?.total || 0}
                onChange={setPage}
              />
            )}
            <h3>Đã chọn ({fixed.length})</h3>
            {fixed.map((f, i) => (
              <div className="choice" key={f.questionId}>
                <Markdown>{f.question.promptMarkdown}</Markdown>
                <Field label="Điểm câu">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={f.points}
                    onChange={(e) =>
                      setFixed(
                        fixed.map((a, j) =>
                          j === i
                            ? { ...a, points: Number(e.target.value) }
                            : a,
                        ),
                      )
                    }
                  />
                </Field>
                <button
                  className="secondary"
                  onClick={() => setFixed(fixed.filter((_, j) => i !== j))}
                >
                  Bỏ
                </button>
              </div>
            ))}
          </section>
          <section className="card">
            <h2>Random pools</h2>
            {pools.map((p, i) => (
              <div className="grid" key={i}>
                <Field label="Ngân hàng pool">
                  <select
                    value={p.questionBankId}
                    onChange={(e) =>
                      setPools(
                        pools.map((a, j) =>
                          j === i
                            ? { ...a, questionBankId: e.target.value }
                            : a,
                        ),
                      )
                    }
                  >
                    {bs.data?.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Số câu">
                  <input
                    type="number"
                    min="1"
                    value={p.pickCount}
                    onChange={(e) =>
                      setPools(
                        pools.map((a, j) =>
                          j === i
                            ? { ...a, pickCount: Number(e.target.value) }
                            : a,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="Điểm mỗi câu">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={p.pointsEach}
                    onChange={(e) =>
                      setPools(
                        pools.map((a, j) =>
                          j === i
                            ? { ...a, pointsEach: Number(e.target.value) }
                            : a,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="Độ khó">
                  <select
                    value={p.difficultyFilter || ""}
                    onChange={(e) =>
                      setPools(
                        pools.map((a, j) =>
                          j === i
                            ? {
                                ...a,
                                difficultyFilter:
                                  (e.target
                                    .value as typeof p.difficultyFilter) ||
                                  null,
                              }
                            : a,
                        ),
                      )
                    }
                  >
                    <option value="">Tất cả</option>
                    <option>EASY</option>
                    <option>MEDIUM</option>
                    <option>HARD</option>
                  </select>
                </Field>
                <Field label="Tags">
                  <input
                    value={p.tagFilter.join(",")}
                    onChange={(e) =>
                      setPools(
                        pools.map((a, j) =>
                          j === i
                            ? {
                                ...a,
                                tagFilter: e.target.value
                                  .split(",")
                                  .filter(Boolean),
                              }
                            : a,
                        ),
                      )
                    }
                  />
                </Field>
                <button
                  className="danger"
                  onClick={() => setPools(pools.filter((_, j) => i !== j))}
                >
                  Bỏ pool
                </button>
              </div>
            ))}
            <button
              disabled={!bs.data?.length}
              onClick={() =>
                setPools([
                  ...pools,
                  {
                    questionBankId: bs.data![0]!.id,
                    pickCount: 1,
                    pointsEach: 1,
                    tagFilter: [],
                    difficultyFilter: null,
                  },
                ])
              }
            >
              Thêm pool
            </button>
          </section>
        </>
      )}
      {step === 3 && (
        <section className="card">
          <div className="grid">
            <Field label="Chiến lược kết quả">
              <select
                value={d.resultStrategy}
                onChange={(e) =>
                  patch({
                    resultStrategy: e.target
                      .value as ExamInput["resultStrategy"],
                  })
                }
              >
                <option>HIGHEST_SCORE</option>
                <option>LATEST_ATTEMPT</option>
              </select>
            </Field>
            <Field label="Công bố kết quả">
              <select
                value={d.resultReleaseMode}
                onChange={(e) =>
                  patch({
                    resultReleaseMode: e.target
                      .value as ExamInput["resultReleaseMode"],
                  })
                }
              >
                <option>IMMEDIATE</option>
                <option>AFTER_CLOSE</option>
                <option>MANUAL</option>
              </select>
            </Field>
            <Field label="Ngưỡng đạt (%)">
              <input
                type="number"
                min="0"
                max="100"
                value={d.passScorePercent}
                onChange={(e) =>
                  patch({ passScorePercent: Number(e.target.value) })
                }
              />
            </Field>
          </div>
          {(
            [
              ["shuffleQuestions", "Xáo trộn câu hỏi"],
              ["shuffleOptions", "Xáo trộn lựa chọn"],
              ["showCorrectAnswers", "Cho xem đáp án đúng"],
              ["showExplanations", "Cho xem giải thích"],
              ["showDetailedScore", "Cho xem điểm từng câu"],
            ] as const
          ).map(([k, label]) => (
            <label className="choice" key={k}>
              <input
                type="checkbox"
                checked={d[k]}
                onChange={(e) => patch({ [k]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </section>
      )}
      {step === 4 && (
        <section className="card">
          <h2>{d.title || "Chưa nhập tên"}</h2>
          <Markdown>{d.descriptionMarkdown || ""}</Markdown>
          <p>
            {classes.length} lớp · {d.durationMinutes} phút · {d.maxAttempts}{" "}
            lượt thi
          </p>
          <p>
            {new Date(d.openAt).toLocaleString()} →{" "}
            {new Date(d.closeAt).toLocaleString()}
          </p>
          <p>
            {fixed.length} câu cố định +{" "}
            {pools.reduce((n, p) => n + p.pickCount, 0)} câu random · Tổng điểm:{" "}
            {fixed.reduce((n, q) => n + q.points, 0) +
              pools.reduce((n, p) => n + p.pickCount * p.pointsEach, 0)}
          </p>
          <p>
            {d.resultStrategy} · {d.resultReleaseMode}
          </p>
          {fixed.map((q, i) => (
            <div className="card" key={q.questionId}>
              <h3>
                Câu {i + 1} · {q.points} điểm
              </h3>
              <Markdown>{q.question.promptMarkdown}</Markdown>
              {q.question.options.map((o) => (
                <Markdown key={o.id}>{o.contentMarkdown}</Markdown>
              ))}
            </div>
          ))}
          {pools.map((p, i) => (
            <p key={i}>
              Pool {i + 1}: {p.pickCount} câu · {p.pointsEach} điểm/câu ·{" "}
              {p.difficultyFilter || "Mọi độ khó"} · {p.tagFilter.join(", ")}
            </p>
          ))}
          <p>
            Máy chủ kiểm tra lịch, lớp, nguồn câu hỏi và khả năng chọn không
            trùng khi công bố.
          </p>
        </section>
      )}
      <div className="actions">
        <button
          disabled={step === 0}
          className="secondary"
          onClick={() => setStep(step - 1)}
        >
          Trước
        </button>
        <button
          disabled={step === 4}
          className="secondary"
          onClick={() => setStep(step + 1)}
        >
          Tiếp
        </button>
        {!preview && (
          <>
            <button disabled={busy} onClick={() => save()}>
              Lưu bài thi
            </button>
            {(!exam || exam.status === "DRAFT") && (
              <button disabled={busy} onClick={() => save(true)}>
                Lưu & công bố
              </button>
            )}
          </>
        )}
        {exam && (
          <ConfirmButton
            onConfirm={async () => {
              await api(`/teacher/exams/${exam.id}/archive`, "POST");
              nav("/teacher/exams");
            }}
          >
            Lưu trữ bài thi
          </ConfirmButton>
        )}
      </div>
    </>
  );
}
