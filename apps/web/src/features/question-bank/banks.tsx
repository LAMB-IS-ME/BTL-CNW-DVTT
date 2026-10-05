import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { QuestionDto } from "@exam/shared";
import { api } from "../../lib/api";
import { Field } from "./ui";
import {
  ConfirmAction,
  Dialog,
  ErrorNotice,
  Menu,
  Pager,
  Skeleton,
  Status,
  difficultyLabels,
  typeLabels,
  useDebounced,
} from "./ui";
export type Bank = {
  id: string;
  title: string;
  subject: string | null;
  description: string | null;
  isArchived: boolean;
  updatedAt: string;
  _count?: { questions: number };
};
export type BankQuestion = QuestionDto & {
  isArchived: boolean;
  updatedAt: string;
  bank?: Bank;
};
export function useCatalogRefresh() {
  const cache = useQueryClient();
  return async () => {
    await Promise.all(
      [
        "qb-banks",
        "qb-bank",
        "qb-questions",
        "banks-picker",
        "bank-questions",
        "quiz-questions",
      ].map((key) => cache.invalidateQueries({ queryKey: [key] })),
    );
  };
}
function BankForm({
  bank,
  close,
  saved,
}: {
  bank?: Bank;
  close: () => void;
  saved: (bank: Bank) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  return (
    <Dialog
      title={bank ? "Chỉnh sửa ngân hàng" : "Tạo ngân hàng"}
      busy={busy}
      onClose={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const data = Object.fromEntries(new FormData(e.currentTarget));
          setBusy(true);
          setError(undefined);
          try {
            const result = await api<Bank>(
              bank
                ? `/teacher/question-banks/${bank.id}`
                : "/teacher/question-banks",
              bank ? "PATCH" : "POST",
              data,
            );
            saved(result);
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="qb-dialog-body">
          <p className="qb-muted">
            Nhóm câu hỏi theo môn học để tái sử dụng trong bài thi và Live Quiz.
          </p>
          <Field label="Tên ngân hàng">
            <input
              name="title"
              defaultValue={bank?.title}
              required
              maxLength={150}
              data-dialog-focus
              placeholder="Ví dụ: Công nghệ Web"
              disabled={busy}
            />
          </Field>
          <Field label="Môn học">
            <input
              name="subject"
              defaultValue={bank?.subject || ""}
              maxLength={150}
              placeholder="Ví dụ: Công nghệ thông tin"
              disabled={busy}
            />
          </Field>
          <Field label="Mô tả">
            <textarea
              name="description"
              defaultValue={bank?.description || ""}
              maxLength={5000}
              rows={3}
              placeholder="Phạm vi kiến thức, học phần…"
              disabled={busy}
            />
          </Field>
          <ErrorNotice error={error} />
        </div>
        <div className="qb-dialog-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={close}
          >
            Hủy
          </button>
          <button disabled={busy}>
            {busy ? "Đang lưu…" : bank ? "Lưu thông tin" : "Tạo ngân hàng"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
function BankLifecycle({
  bank,
  done,
}: {
  bank: Bank;
  done: (message: string) => Promise<void>;
}) {
  return (
    <ConfirmAction
      label={bank.isArchived ? "Khôi phục" : "Lưu trữ"}
      title={`${bank.isArchived ? "Khôi phục" : "Lưu trữ"} ngân hàng?`}
      danger={!bank.isArchived}
      onConfirm={async () => {
        await api(
          `/teacher/question-banks/${bank.id}${bank.isArchived ? "/restore" : ""}`,
          bank.isArchived ? "POST" : "DELETE",
        );
        await done(
          bank.isArchived
            ? "Đã khôi phục ngân hàng."
            : "Đã lưu trữ ngân hàng. Bạn có thể khôi phục qua bộ lọc trạng thái.",
        );
      }}
    >
      <p>
        <strong>{bank.title}</strong>
      </p>
      <p>
        {bank.isArchived
          ? "Ngân hàng sẽ hoạt động trở lại. Các câu được lưu trữ riêng vẫn giữ trạng thái của chúng."
          : "Ngân hàng sẽ ngừng nhận câu mới. Nội dung và lịch sử bài thi vẫn được giữ; bạn có thể khôi phục sau."}
      </p>
      <p className="qb-muted">
        Hệ thống sẽ kiểm tra các bài thi và Quiz đang sử dụng trước khi thay
        đổi.
      </p>
    </ConfirmAction>
  );
}
function useFilters() {
  const [params, setParams] = useSearchParams();
  const set = (key: string, value: string) =>
    setParams(
      (old) => {
        const next = new URLSearchParams(old);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== "page") next.delete("page");
        return next;
      },
      { replace: true },
    );
  const page = Math.max(1, Number(params.get("page")) || 1),
    search = params.get("search") || "",
    settled = useDebounced(search);
  const query = new URLSearchParams(params);
  query.set("search", settled);
  query.set("page", String(page));
  return {
    params,
    set,
    page,
    search,
    settling: search !== settled,
    query,
    reset: () => setParams({}, { replace: true }),
  };
}
export function BankList() {
  const f = useFilters(),
    refresh = useCatalogRefresh();
  const [editing, setEditing] = useState<Bank | "new" | null>(null),
    [notice, setNotice] = useState("");
  const query = f.query.toString();
  const q = useQuery({
    queryKey: ["qb-banks", query],
    enabled: !f.settling,
    queryFn: () =>
      api<{ items: Bank[]; total: number; subjects: string[] }>(
        `/teacher/question-banks?view=manage&${query}`,
      ),
  });
  const done = async (message: string) => {
    setNotice(message);
    await refresh();
  };
  return (
    <>
      <nav className="qb-breadcrumb" aria-label="Đường dẫn">
        <Link to="/teacher">Không gian giảng viên</Link>
        <span>/</span>
        <span aria-current="page">Ngân hàng câu hỏi</span>
      </nav>
      <div className="qb-page-heading">
        <div>
          <p className="qb-kicker">THƯ VIỆN GIẢNG DẠY</p>
          <h1>Ngân hàng câu hỏi</h1>
          <p>Tổ chức kiến thức. Soạn một lần, sử dụng trong nhiều bài thi.</p>
        </div>
        <button onClick={() => setEditing("new")}>
          <span aria-hidden="true">＋ </span>Tạo ngân hàng
        </button>
      </div>
      {notice && (
        <p className="qb-notice" role="status">
          {notice}
        </p>
      )}
      <section className="qb-surface" aria-label="Danh sách ngân hàng">
        <div className="qb-toolbar">
          <Field label="Tìm ngân hàng">
            <input
              type="search"
              value={f.search}
              maxLength={200}
              placeholder="Tìm theo tên ngân hàng…"
              onChange={(e) => f.set("search", e.target.value)}
            />
          </Field>
          <Field label="Môn học">
            <select
              value={f.params.get("subject") || ""}
              onChange={(e) => f.set("subject", e.target.value)}
            >
              <option value="">Tất cả môn học</option>
              {q.data?.subjects.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Trạng thái">
            <select
              value={f.params.get("status") || "all"}
              onChange={(e) => f.set("status", e.target.value)}
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Đang dùng</option>
              <option value="archived">Đã lưu trữ</option>
            </select>
          </Field>
          <Field label="Sắp xếp">
            <select
              value={f.params.get("sort") || "updated"}
              onChange={(e) => f.set("sort", e.target.value)}
            >
              <option value="updated">Cập nhật gần đây</option>
              <option value="newest">Mới tạo</option>
              <option value="title">Tên A–Z</option>
            </select>
          </Field>
        </div>
        <ErrorNotice error={q.error} retry={() => void q.refetch()} />
        {q.isPending || f.settling ? (
          <Skeleton label="Đang tải ngân hàng…" />
        ) : q.data?.items.length ? (
          <>
            <div className="qb-table-wrap">
              <table className="qb-table">
                <thead>
                  <tr>
                    <th>Ngân hàng</th>
                    <th>Câu đang dùng</th>
                    <th>Trạng thái</th>
                    <th>Cập nhật</th>
                    <th>
                      <span className="qb-sr-only">Thao tác</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.items.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <strong className="qb-row-title">{b.title}</strong>
                        <span className="qb-row-subtitle">
                          {b.subject || "Chưa phân môn học"}
                        </span>
                      </td>
                      <td data-label="Câu đang dùng">
                        {b._count?.questions || 0}
                      </td>
                      <td>
                        <Status archived={b.isArchived} />
                      </td>
                      <td className="qb-muted" data-label="Cập nhật">
                        {new Date(b.updatedAt).toLocaleDateString("vi-VN")}
                      </td>
                      <td>
                        <div className="qb-row-actions">
                          <Link
                            className="button secondary"
                            to={`/teacher/question-banks/${b.id}`}
                          >
                            Mở ngân hàng <span aria-hidden="true">↗</span>
                          </Link>
                          <Menu name={b.title}>
                            <button
                              className="secondary"
                              onClick={() => setEditing(b)}
                            >
                              Chỉnh sửa
                            </button>
                            <BankLifecycle bank={b} done={done} />
                          </Menu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={f.page}
              total={q.data.total}
              onChange={(p) => f.set("page", String(p))}
            />
          </>
        ) : (
          !q.error && (
            <div className="qb-empty">
              <span className="qb-empty-symbol" aria-hidden="true">
                ▤
              </span>
              <h2>
                {f.params.size
                  ? "Không tìm thấy ngân hàng phù hợp"
                  : "Bắt đầu thư viện câu hỏi của bạn"}
              </h2>
              <p>
                {f.params.size
                  ? "Thử tên khác hoặc bỏ bộ lọc để xem thêm ngân hàng."
                  : "Tạo ngân hàng đầu tiên để tập hợp câu hỏi theo môn học."}
              </p>
              <button
                className="secondary"
                onClick={() => (f.params.size ? f.reset() : setEditing("new"))}
              >
                {f.params.size ? "Bỏ bộ lọc" : "Tạo ngân hàng"}
              </button>
            </div>
          )
        )}
      </section>
      <p className="qb-footnote">
        Ngân hàng chỉ hiển thị với bạn. Lưu trữ giữ nguyên câu hỏi và lịch sử
        bài thi.
      </p>
      {editing && (
        <BankForm
          bank={editing === "new" ? undefined : editing}
          close={() => setEditing(null)}
          saved={(b) => {
            setEditing(null);
            void done(`Đã lưu ngân hàng “${b.title}”.`);
          }}
        />
      )}
    </>
  );
}
export function BankDetail() {
  const { id } = useParams(),
    f = useFilters(),
    refresh = useCatalogRefresh();
  const [editing, setEditing] = useState(false),
    [notice, setNotice] = useState("");
  const q = useQuery({
    queryKey: ["qb-bank", id],
    queryFn: () => api<Bank>(`/teacher/question-banks/${id}`),
  });
  const query = f.query.toString();
  const list = useQuery({
    queryKey: ["qb-questions", id, query],
    enabled: !f.settling,
    queryFn: () =>
      api<{ items: BankQuestion[]; total: number }>(
        `/teacher/question-banks/${id}/questions?${query}`,
      ),
  });
  const done = async (message: string) => {
    setNotice(message);
    await refresh();
  };
  if (q.isPending) return <Skeleton />;
  const b = q.data;
  if (!b) return <ErrorNotice error={q.error} retry={() => void q.refetch()} />;
  return (
    <>
      <nav className="qb-breadcrumb" aria-label="Đường dẫn">
        <Link to="/teacher">Giảng viên</Link>
        <span>/</span>
        <Link to="/teacher/question-banks">Ngân hàng câu hỏi</Link>
        <span>/</span>
        <span aria-current="page">{b.title}</span>
      </nav>
      <div className="qb-page-heading">
        <div>
          <p className="qb-kicker">{b.subject || "NGÂN HÀNG CÂU HỎI"}</p>
          <h1>{b.title}</h1>
          <p>
            {b.description ||
              "Quản lý, biên soạn và tái sử dụng câu hỏi trong ngân hàng này."}
          </p>
          <Status archived={b.isArchived} />
        </div>
        <div className="qb-heading-actions">
          <button className="secondary" onClick={() => setEditing(true)}>
            Chỉnh sửa ngân hàng
          </button>
          {!b.isArchived && (
            <Link className="button" to={`/teacher/question-banks/${id}/new`}>
              ＋ Thêm câu hỏi
            </Link>
          )}
          <Menu name="ngân hàng">
            <BankLifecycle bank={b} done={done} />
          </Menu>
        </div>
      </div>
      {b.isArchived && (
        <div className="qb-warning">
          Ngân hàng đang được lưu trữ. Khôi phục ngân hàng để tạo, sửa hoặc khôi
          phục câu hỏi.
        </div>
      )}
      {notice && (
        <p className="qb-notice" role="status">
          {notice}
        </p>
      )}
      <section className="qb-surface" aria-label="Danh sách câu hỏi">
        <div className="qb-section-title">
          <h2>
            Câu hỏi <span className="qb-count">{list.data?.total ?? "…"}</span>
          </h2>
          <span className="qb-muted">4 loại câu hỏi · Markdown & LaTeX</span>
        </div>
        <div className="qb-toolbar">
          <Field label="Tìm câu hỏi">
            <input
              type="search"
              maxLength={200}
              value={f.search}
              placeholder="Tìm trong nội dung…"
              onChange={(e) => f.set("search", e.target.value)}
            />
          </Field>
          <Field label="Loại câu hỏi">
            <select
              value={f.params.get("type") || ""}
              onChange={(e) => f.set("type", e.target.value)}
            >
              <option value="">Tất cả loại</option>
              {Object.entries(typeLabels).map(([v, label]) => (
                <option value={v} key={v}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Độ khó">
            <select
              value={f.params.get("difficulty") || ""}
              onChange={(e) => f.set("difficulty", e.target.value)}
            >
              <option value="">Tất cả độ khó</option>
              {Object.entries(difficultyLabels).map(([v, label]) => (
                <option value={v} key={v}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Trạng thái">
            <select
              value={f.params.get("status") || "active"}
              onChange={(e) => f.set("status", e.target.value)}
            >
              <option value="active">Đang dùng</option>
              <option value="archived">Đã lưu trữ</option>
              <option value="all">Tất cả trạng thái</option>
            </select>
          </Field>
        </div>
        <ErrorNotice error={list.error} retry={() => void list.refetch()} />
        {list.isPending || f.settling ? (
          <Skeleton label="Đang tải câu hỏi…" />
        ) : list.data?.items.length ? (
          <>
            <div className="qb-table-wrap">
              <table className="qb-table qb-question-table">
                <thead>
                  <tr>
                    <th>Nội dung câu hỏi</th>
                    <th>Loại / Độ khó</th>
                    <th>Điểm</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <p className="qb-prompt-summary">
                          {v.promptMarkdown
                            .replace(/!\[[^\]]*\]\([^)]*\)/g, "[Hình minh họa]")
                            .slice(0, 220)}
                        </p>
                        {v.tags.length > 0 && (
                          <span className="qb-row-subtitle">
                            {v.tags.join(" · ")}
                          </span>
                        )}
                      </td>
                      <td>
                        <span>{typeLabels[v.type]}</span>
                        <span className="qb-row-subtitle">
                          {difficultyLabels[v.difficulty]}
                        </span>
                      </td>
                      <td data-label="Điểm">{Number(v.defaultPoints)}</td>
                      <td>
                        <Status archived={v.isArchived} />
                      </td>
                      <td>
                        <div className="qb-row-actions">
                          <Link
                            className="qb-edit-link"
                            to={`/teacher/questions/${v.id}/edit`}
                          >
                            {v.isArchived || b.isArchived
                              ? "Xem câu hỏi"
                              : "Chỉnh sửa"}
                          </Link>
                          <ConfirmAction
                            label={v.isArchived ? "Khôi phục" : "Lưu trữ"}
                            title={
                              v.isArchived
                                ? "Khôi phục câu hỏi?"
                                : "Lưu trữ câu hỏi?"
                            }
                            danger={!v.isArchived}
                            disabled={b.isArchived}
                            onConfirm={async () => {
                              await api(
                                `/teacher/questions/${v.id}${v.isArchived ? "/restore" : ""}`,
                                v.isArchived ? "POST" : "DELETE",
                              );
                              await done(
                                v.isArchived
                                  ? "Đã khôi phục câu hỏi."
                                  : "Đã lưu trữ câu hỏi. Chọn “Đã lưu trữ” để xem hoặc khôi phục.",
                              );
                            }}
                          >
                            <p className="qb-confirm-prompt">
                              {v.promptMarkdown.slice(0, 180)}
                            </p>
                            <p>
                              {v.isArchived
                                ? "Câu hỏi sẽ trở lại danh sách đang dùng."
                                : "Câu hỏi sẽ được ẩn khỏi danh sách đang dùng. Có thể khôi phục; bài làm và ảnh trong lịch sử vẫn được giữ."}
                            </p>
                          </ConfirmAction>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={f.page}
              total={list.data.total}
              onChange={(p) => f.set("page", String(p))}
            />
          </>
        ) : (
          !list.error && (
            <div className="qb-empty">
              <span className="qb-empty-symbol" aria-hidden="true">
                ≡
              </span>
              <h2>
                {f.params.size
                  ? "Không có câu hỏi phù hợp"
                  : "Ngân hàng chưa có câu hỏi đang dùng"}
              </h2>
              <p>Thêm câu hỏi mới hoặc đổi bộ lọc để tìm câu đã lưu trữ.</p>
              {f.params.size ? (
                <button className="secondary" onClick={f.reset}>
                  Bỏ bộ lọc
                </button>
              ) : (
                !b.isArchived && (
                  <Link
                    className="button secondary"
                    to={`/teacher/question-banks/${id}/new`}
                  >
                    Thêm câu hỏi đầu tiên
                  </Link>
                )
              )}
            </div>
          )
        )}
      </section>
      {editing && (
        <BankForm
          bank={b}
          close={() => setEditing(false)}
          saved={() => {
            setEditing(false);
            void done("Đã lưu thông tin ngân hàng.");
          }}
        />
      )}
    </>
  );
}
