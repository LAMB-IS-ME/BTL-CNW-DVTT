import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { UserDto, QuestionDto, QuestionInput } from "@exam/shared";
import { questionTypes } from "@exam/shared";
import { api } from "../lib/api";
import {
  ErrorBox,
  Field,
  Loading,
  Empty,
  Pager,
  ConfirmButton,
} from "../components/ui";
import { Markdown } from "../components/Markdown";
type Catalog = {
  id: string;
  name?: string;
  title?: string;
  description?: string;
  subject?: string;
  code?: string;
  archivedAt?: string;
  isArchived?: boolean;
  members?: { student: UserDto }[];
  exams?: { exam: { id: string; title: string } }[];
};
export function CatalogList({ bank = false }: { bank?: boolean }) {
  const path = bank ? "question-banks" : "classes";
  const [error, setError] = useState<unknown>();
  const q = useQuery({
    queryKey: [path],
    queryFn: () => api<Catalog[]>(`/teacher/${path}`),
  });
  return (
    <>
      <h1>{bank ? "Ngân hàng câu hỏi" : "Lớp học của tôi"}</h1>
      <form
        className="card grid"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = e.currentTarget;
          try {
            await api(
              `/teacher/${path}`,
              "POST",
              Object.fromEntries(new FormData(f)),
            );
            f.reset();
            await q.refetch();
          } catch (e) {
            setError(e);
          }
        }}
      >
        <Field label={bank ? "Tên ngân hàng" : "Tên lớp"}>
          <input name={bank ? "title" : "name"} required />
        </Field>
        <Field label={bank ? "Môn học" : "Mã lớp"}>
          <input name={bank ? "subject" : "code"} />
        </Field>
        <Field label="Mô tả">
          <input name="description" />
        </Field>
        <button>Tạo {bank ? "ngân hàng" : "lớp học"}</button>
      </form>
      <ErrorBox error={error || q.error} />
      {q.isPending ? (
        <Loading />
      ) : (
        <div className="grid">
          {q.data?.map((c) => (
            <Link className="card" key={c.id} to={`/teacher/${path}/${c.id}`}>
              <h2>{c.title || c.name}</h2>
              <p>{c.description}</p>
              <span>
                {c.isArchived || c.archivedAt ? "Đã lưu trữ" : "Đang hoạt động"}{" "}
                →
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
export function CatalogDetail({ bank = false }: { bank?: boolean }) {
  const { id } = useParams();
  const path = bank ? "question-banks" : "classes";
  const [error, setError] = useState<unknown>(),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: [path, id],
    queryFn: () => api<Catalog>(`/teacher/${path}/${id}`),
  });
  const list = useQuery<{ items: QuestionDto[]; total: number } | UserDto[]>({
    queryKey: [path, id, "items", search, page],
    queryFn: () =>
      bank
        ? api<{ items: QuestionDto[]; total: number }>(
            `/teacher/question-banks/${id}/questions?search=${encodeURIComponent(search)}&page=${page}`,
          )
        : api<UserDto[]>(
            `/teacher/students?search=${encodeURIComponent(search)}`,
          ),
  });
  if (q.isPending) return <Loading />;
  const c = q.data;
  if (!c) return <ErrorBox error={q.error} />;
  return (
    <>
      <h1>{c.title || c.name}</h1>
      <ErrorBox error={error} />
      <form
        className="card grid"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api(
              `/teacher/${path}/${id}`,
              "PATCH",
              Object.fromEntries(new FormData(e.currentTarget)),
            );
            await q.refetch();
          } catch (e) {
            setError(e);
          }
        }}
      >
        <Field label="Tên">
          <input
            name={bank ? "title" : "name"}
            defaultValue={c.title || c.name}
            required
          />
        </Field>
        <Field label="Mô tả">
          <input name="description" defaultValue={c.description} />
        </Field>
        <button>Lưu thông tin</button>
        <ConfirmButton
          onConfirm={async () => {
            await api(`/teacher/${path}/${id}`, "DELETE");
            await q.refetch();
          }}
        >
          Lưu trữ
        </ConfirmButton>
      </form>
      <div className="actions">
        <input
          aria-label="Tìm kiếm"
          placeholder={bank ? "Tìm câu hỏi" : "Tìm sinh viên để thêm"}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        {bank && (
          <Link className="button" to={`/teacher/question-banks/${id}/new`}>
            Thêm câu hỏi
          </Link>
        )}
      </div>
      <ErrorBox error={list.error} />
      {bank ? (
        list.data &&
        !Array.isArray(list.data) && (
          <>
            <div className="grid">
              {list.data.items.map((v) => (
                <article className="card" key={v.id}>
                  <span className="eyebrow">
                    {v.type} · {v.difficulty}
                  </span>
                  <Markdown>{v.promptMarkdown}</Markdown>
                  <Link to={`/teacher/questions/${v.id}/edit`}>
                    Chỉnh sửa →
                  </Link>
                </article>
              ))}
            </div>
            <Pager page={page} total={list.data.total} onChange={setPage} />
          </>
        )
      ) : (
        <>
          <h2>Thêm sinh viên</h2>
          <div className="grid">
            {Array.isArray(list.data) &&
              list.data.map((u) => (
                <div className="card" key={u.id}>
                  <p>
                    {u.fullName} · {u.email}
                  </p>
                  <button
                    disabled={c.members?.some((m) => m.student.id === u.id)}
                    onClick={async () => {
                      try {
                        await api(`/teacher/classes/${id}/students`, "POST", {
                          studentId: u.id,
                        });
                        await q.refetch();
                      } catch (e) {
                        setError(e);
                      }
                    }}
                  >
                    Thêm vào lớp
                  </button>
                </div>
              ))}
          </div>
          <h2>Danh sách lớp ({c.members?.length})</h2>
          {c.members?.map(({ student: u }) => (
            <div className="card actions" key={u.id}>
              <span>
                {u.fullName} · {u.studentCode || u.email}
              </span>
              <ConfirmButton
                onConfirm={async () => {
                  await api(
                    `/teacher/classes/${id}/students/${u.id}`,
                    "DELETE",
                  );
                  await q.refetch();
                }}
              >
                Xóa khỏi lớp
              </ConfirmButton>
            </div>
          ))}
          <h2>Bài thi đã giao</h2>
          {c.exams?.map(({ exam }) => (
            <p key={exam.id}>
              <Link to={`/teacher/exams/${exam.id}/results`}>
                {exam.title} · Kết quả lớp
              </Link>
            </p>
          ))}
        </>
      )}
    </>
  );
}
const initial: QuestionInput = {
  type: "SINGLE_CHOICE",
  promptMarkdown: "",
  explanationMarkdown: "",
  difficulty: "MEDIUM",
  tags: [],
  defaultPoints: 1,
  options: [
    { contentMarkdown: "", isCorrect: true },
    { contentMarkdown: "", isCorrect: false },
  ],
};
export function QuestionEditor() {
  const { id, questionId } = useParams();
  const q = useQuery({
    queryKey: ["question", questionId],
    queryFn: () => api<QuestionDto>(`/teacher/questions/${questionId}`),
    enabled: !!questionId,
  });
  if (questionId && q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  return <QuestionForm key={q.data?.id || id} bankId={id} question={q.data} />;
}
function QuestionForm({
  bankId,
  question,
}: {
  bankId?: string;
  question?: QuestionDto;
}) {
  const nav = useNavigate();
  const [d, setD] = useState<QuestionInput>(
      question
        ? { ...question, defaultPoints: Number(question.defaultPoints) }
        : initial,
    ),
    [error, setError] = useState<unknown>(),
    [saved, setSaved] = useState(false);
  const patch = (v: Partial<QuestionInput>) => {
    setSaved(false);
    setD({ ...d, ...v });
  };
  return (
    <>
      <h1>{question ? "Chỉnh sửa" : "Tạo"} câu hỏi</h1>
      <ErrorBox error={error} />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const q = await api<QuestionDto>(
              question
                ? `/teacher/questions/${question.id}`
                : `/teacher/question-banks/${bankId}/questions`,
              question ? "PATCH" : "POST",
              d,
            );
            setSaved(true);
            if (!question) nav(`/teacher/questions/${q.id}/edit`);
          } catch (e) {
            setError(e);
          }
        }}
      >
        <div className="grid">
          <section className="card">
            <Field label="Loại câu hỏi">
              <select
                value={d.type}
                onChange={(e) => {
                  const type = e.target.value as QuestionInput["type"];
                  patch({
                    type,
                    options:
                      type === "ESSAY"
                        ? []
                        : type === "TRUE_FALSE"
                          ? [
                              { contentMarkdown: "True", isCorrect: true },
                              { contentMarkdown: "False", isCorrect: false },
                            ]
                          : initial.options,
                  });
                }}
              >
                {questionTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Nội dung (Markdown, LaTeX, code)">
              <textarea
                rows={10}
                value={d.promptMarkdown}
                onChange={(e) => patch({ promptMarkdown: e.target.value })}
                required
              />
            </Field>
            <Field label="Giải thích">
              <textarea
                value={d.explanationMarkdown || ""}
                onChange={(e) => patch({ explanationMarkdown: e.target.value })}
              />
            </Field>
            <div className="grid">
              <Field label="Độ khó">
                <select
                  value={d.difficulty}
                  onChange={(e) =>
                    patch({
                      difficulty: e.target.value as QuestionInput["difficulty"],
                    })
                  }
                >
                  <option>EASY</option>
                  <option>MEDIUM</option>
                  <option>HARD</option>
                </select>
              </Field>
              <Field label="Điểm">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={d.defaultPoints}
                  onChange={(e) =>
                    patch({ defaultPoints: Number(e.target.value) })
                  }
                />
              </Field>
            </div>
            <Field label="Tags (phân cách dấu phẩy)">
              <input
                value={d.tags.join(",")}
                onChange={(e) =>
                  patch({ tags: e.target.value.split(",").filter(Boolean) })
                }
              />
            </Field>
            <h2>Lựa chọn</h2>
            {d.options.map((o, i) => (
              <div className="actions" key={i}>
                <input
                  aria-label={`Đáp án đúng ${i + 1}`}
                  type="checkbox"
                  checked={o.isCorrect}
                  onChange={(e) =>
                    patch({
                      options: d.options.map((a, j) => ({
                        ...a,
                        isCorrect:
                          j === i
                            ? e.target.checked
                            : d.type === "MULTIPLE_CHOICE"
                              ? a.isCorrect
                              : false,
                      })),
                    })
                  }
                />
                <input
                  aria-label={`Lựa chọn ${i + 1}`}
                  disabled={d.type === "TRUE_FALSE"}
                  value={o.contentMarkdown}
                  onChange={(e) =>
                    patch({
                      options: d.options.map((a, j) =>
                        j === i ? { ...a, contentMarkdown: e.target.value } : a,
                      ),
                    })
                  }
                />
                {d.type !== "TRUE_FALSE" && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      patch({ options: d.options.filter((_, j) => j !== i) })
                    }
                  >
                    Xóa
                  </button>
                )}
              </div>
            ))}
            {["SINGLE_CHOICE", "MULTIPLE_CHOICE"].includes(d.type) && (
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  patch({
                    options: [
                      ...d.options,
                      { contentMarkdown: "", isCorrect: false },
                    ],
                  })
                }
              >
                Thêm lựa chọn
              </button>
            )}
            <div className="actions">
              <button>Lưu câu hỏi</button>
              {saved && <span role="status">Đã lưu</span>}
            </div>
          </section>
          <section className="card">
            <h2>Xem trước</h2>
            <Markdown>{d.promptMarkdown}</Markdown>
            {d.options.map((o, i) => (
              <div className="card" key={i}>
                <Markdown>{`${o.isCorrect ? "✓ " : ""}${o.contentMarkdown}`}</Markdown>
              </div>
            ))}
            <Markdown>{d.explanationMarkdown || ""}</Markdown>
            {question ? (
              <Field label="Thêm ảnh (PNG/JPEG/WebP, tối đa 5 MB)">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      const form = new FormData();
                      form.set("file", f);
                      const a = await api<{ id: string }>(
                        `/teacher/questions/${question.id}/assets`,
                        "POST",
                        form,
                      );
                      patch({
                        promptMarkdown:
                          d.promptMarkdown +
                          `\n![Hình minh họa](asset:${a.id})`,
                      });
                    } catch (e) {
                      setError(e);
                    }
                  }}
                />
              </Field>
            ) : (
              <Empty>Lưu câu hỏi trước khi tải ảnh lên.</Empty>
            )}
          </section>
        </div>
      </form>
      {question && (
        <ConfirmButton
          onConfirm={async () => {
            await api(`/teacher/questions/${question.id}`, "DELETE");
            nav(`/teacher/question-banks/${question.bankId}`);
          }}
        >
          Lưu trữ câu hỏi
        </ConfirmButton>
      )}
    </>
  );
}
