import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { UserDto, QuestionDto } from "@exam/shared";
import { api } from "../lib/api";
import {
  ErrorBox,
  Field,
  Loading,
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
