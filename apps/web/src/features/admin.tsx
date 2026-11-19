import {
  useCatalogPage,
  CatalogControls,
  CatalogPager,
} from "./catalog-pagination";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UserDto } from "@exam/shared";
import { api } from "../lib/api";
import "../styles/management-refinement.css";
import {
  Field,
  ErrorBox,
  Loading,
  Pager,
  ConfirmButton,
  Empty,
} from "../components/ui";
export function AdminUsers() {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [role, setRole] = useState(""),
    [error, setError] = useState<unknown>();
  const q = useQuery({
    queryKey: ["users", page, search, role],
    queryFn: () =>
      api<{ items: UserDto[]; total: number }>(
        `/admin/users?page=${page}&search=${encodeURIComponent(search)}${role ? `&role=${role}` : ""}`,
      ),
  });
  return (
    <>
      <h1>Quản lý tài khoản</h1>
      <section className="card">
        <h2>Tạo tài khoản</h2>
        <form
          className="management-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = e.currentTarget;
            const d = Object.fromEntries(new FormData(f));
            try {
              await api("/admin/users", "POST", d);
              f.reset();
              await q.refetch();
              setError(undefined);
            } catch (e) {
              setError(e);
            }
          }}
        >
          <div className="management-form-fields management-form-fields-account">
            <Field label="Họ tên">
              <input name="fullName" required minLength={2} />
            </Field>
            <Field label="Email">
              <input type="email" name="email" required />
            </Field>
            <Field label="Mật khẩu">
              <input type="password" name="password" minLength={10} required />
            </Field>
            <Field label="Role">
              <select name="role">
                <option>STUDENT</option>
                <option>TEACHER</option>
                <option>ADMIN</option>
              </select>
            </Field>
          </div>
          <div className="management-form-actions">
            <button>Tạo tài khoản</button>
          </div>
        </form>
      </section>
      <ErrorBox error={error || q.error} />
      <div className="actions">
        <input
          aria-label="Tìm user"
          placeholder="Tên, email, mã sinh viên"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="Lọc role"
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả role</option>
          <option>STUDENT</option>
          <option>TEACHER</option>
          <option>ADMIN</option>
        </select>
      </div>
      {q.isPending ? (
        <Loading />
      ) : (
        <div className="table-wrap account-table">
          <table role="table" aria-label="Danh sách tài khoản">
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader" scope="col">
                  Họ tên
                </th>
                <th role="columnheader" scope="col">
                  Email
                </th>
                <th role="columnheader" scope="col">
                  Role
                </th>
                <th role="columnheader" scope="col">
                  Trạng thái
                </th>
                <th role="columnheader" scope="col">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {q.data?.items.map((u) => (
                <tr role="row" key={u.id}>
                  <td role="cell" className="account-name">
                    {u.fullName}
                  </td>
                  <td role="cell" className="account-email">
                    {u.email}
                  </td>
                  <td role="cell">
                    <span className="account-mobile-label" aria-hidden="true">
                      Role
                    </span>
                    <select
                      aria-label={`Role ${u.fullName}`}
                      value={u.role}
                      onChange={async (e) => {
                        try {
                          await api(`/admin/users/${u.id}/role`, "PATCH", {
                            role: e.target.value,
                          });
                          await q.refetch();
                          setError(undefined);
                        } catch (e) {
                          setError(e);
                        }
                      }}
                    >
                      <option>ADMIN</option>
                      <option>TEACHER</option>
                      <option>STUDENT</option>
                    </select>
                  </td>
                  <td role="cell">
                    <span className="account-mobile-label" aria-hidden="true">
                      Trạng thái
                    </span>
                    {u.status}
                  </td>
                  <td role="cell" className="account-action">
                    <ConfirmButton
                      onConfirm={async () => {
                        await api(`/admin/users/${u.id}/status`, "PATCH", {
                          status: u.status === "ACTIVE" ? "LOCKED" : "ACTIVE",
                        });
                        await q.refetch();
                      }}
                    >
                      {u.status === "ACTIVE" ? "Khóa tài khoản" : "Mở khóa"}
                    </ConfirmButton>
                  </td>
                </tr>
              ))}
              {!q.error && q.data?.items.length === 0 && (
                <tr role="row" className="account-empty">
                  <td role="cell" colSpan={5}>
                    Không tìm thấy tài khoản phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <Pager
        className="management-pager"
        page={page}
        total={q.data?.total || 0}
        onChange={setPage}
      />
    </>
  );
}
function AdminClasses() {
  const paging = useCatalogPage<{
    id: string;
    name: string;
    teacher: UserDto;
    _count: { members: number };
  }>("admin-classes", "/admin/classes", true);
  return (
    <>
      <h1>Tổng quan lớp học</h1>
      <CatalogControls paging={paging} label="Tìm lớp" />
      {paging.items.map((c) => (
        <div className="card" key={c.id}>
          <h2>{c.name}</h2>
          <p>
            {c.teacher.fullName} · {c._count.members} sinh viên
          </p>
        </div>
      ))}
      {paging.query.isSuccess &&
        !paging.query.isFetching &&
        !paging.waiting &&
        paging.items.length === 0 && (
          <Empty>
            {paging.search.trim()
              ? "Không tìm thấy lớp học phù hợp. Thử từ khóa khác."
              : "Chưa có lớp học nào."}
          </Empty>
        )}
      <CatalogPager paging={paging} />
    </>
  );
}
export function AdminOverview({ classes = false }: { classes?: boolean }) {
  return classes ? <AdminClasses /> : <AdminStats />;
}
function AdminStats() {
  const labels: Record<string, string> = {
    users: "Tài khoản",
    classes: "Lớp học",
    exams: "Bài thi",
    quizzes: "Live Quiz",
  };
  const q = useQuery({
    queryKey: ["admin", false],
    queryFn: () => api<Record<string, number>>("/admin/stats"),
  });
  return (
    <>
      <h1>Tổng quan hệ thống</h1>
      <ErrorBox error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : (
        <div className="grid">
          {Object.entries(q.data || {}).map(([k, v]) => (
            <div className="card" key={k}>
              <h2>{v}</h2>
              <p>{labels[k] || k}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
