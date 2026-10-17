import {
  useCatalogPage,
  CatalogControls,
  CatalogPager,
} from "./catalog-pagination";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserDto, QuestionDto } from "@exam/shared";
import { api } from "../lib/api";
import {
  ErrorBox,
  Empty,
  Field,
  Loading,
  Pager,
  ConfirmButton,
} from "../components/ui";
import { Markdown } from "../components/Markdown";
import "../styles/management-refinement.css";
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
  const cache = useQueryClient();
  const paging = useCatalogPage<Catalog>(path, `/teacher/${path}`, true);
  const q = paging.query;
  return (
    <>
      <h1>{bank ? "Ngân hàng câu hỏi" : "Lớp học của tôi"}</h1>
      <form
        className={bank ? "card grid" : "card management-form"}
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
            await cache.invalidateQueries({ queryKey: [path] });
            setError(undefined);
          } catch (e) {
            setError(e);
          }
        }}
      >
        <div className={bank ? undefined : "management-form-fields"}>
          <Field label={bank ? "Tên ngân hàng" : "Tên lớp"}>
            <input name={bank ? "title" : "name"} required />
          </Field>
          <Field label={bank ? "Môn học" : "Mã lớp"}>
            <input name={bank ? "subject" : "code"} />
          </Field>
          <Field label="Mô tả">
            <input name="description" />
          </Field>
        </div>
        <div className={bank ? undefined : "management-form-actions"}>
          <button>Tạo {bank ? "ngân hàng" : "lớp học"}</button>
        </div>
      </form>
      <CatalogControls
        paging={paging}
        label={bank ? "Tìm ngân hàng" : "Tìm lớp"}
      />
      <ErrorBox error={error} />
      {q.isPending ? (
        <Loading />
      ) : (
        <div className="grid">
          {paging.items.map((c) => (
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
      {!bank &&
        q.isSuccess &&
        !q.isFetching &&
        !paging.waiting &&
        paging.items.length === 0 && (
          <Empty>Không tìm thấy lớp học phù hợp.</Empty>
        )}
      <CatalogPager paging={paging} />
    </>
  );
}
export function CatalogDetail({ bank = false }: { bank?: boolean }) {
  const { id } = useParams();
  const cache = useQueryClient();
  const students = useCatalogPage<UserDto>(
    "students",
    "/teacher/students",
    false,
    "",
    !bank,
  );
  const path = bank ? "question-banks" : "classes";
  const [error, setError] = useState<unknown>(),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: [path, id],
    queryFn: () => api<Catalog>(`/teacher/${path}/${id}`),
  });
  const list = useQuery<{ items: QuestionDto[]; total: number } | UserDto[]>({
    enabled: bank,
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
        className={bank ? "card grid" : "card management-form"}
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api(
              `/teacher/${path}/${id}`,
              "PATCH",
              Object.fromEntries(new FormData(e.currentTarget)),
            );
            await cache.invalidateQueries({ queryKey: [path] });
          } catch (e) {
            setError(e);
          }
        }}
      >
        <div className={bank ? undefined : "management-form-fields"}>
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
        </div>
        <div className={bank ? undefined : "management-form-actions"}>
          <button>Lưu thông tin</button>
          <ConfirmButton
            onConfirm={async () => {
              await api(`/teacher/${path}/${id}`, "DELETE");
              await cache.invalidateQueries({ queryKey: [path] });
            }}
          >
            Lưu trữ
          </ConfirmButton>
        </div>
      </form>
      {bank && (
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
      )}
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
          <CatalogControls paging={students} label="Tìm sinh viên để thêm" />
          <div className="grid">
            {students.items.map((u) => (
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
                      await cache.invalidateQueries({ queryKey: [path] });
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
          {students.query.isSuccess &&
            !students.query.isFetching &&
            !students.waiting &&
            students.items.length === 0 && (
              <Empty>Không tìm thấy sinh viên phù hợp.</Empty>
            )}
          <CatalogPager paging={students} />
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
                  await cache.invalidateQueries({ queryKey: [path] });
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
