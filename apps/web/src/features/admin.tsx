import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UserDto } from "@exam/shared";
import { api } from "../lib/api";
import {
  Field,
  ErrorBox,
  Loading,
  Pager,
  ConfirmButton,
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
          className="grid"
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
          <button>Tạo tài khoản</button>
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
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Họ tên</th>
                <th>Email</th>
                <th>Role</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.items.map((u) => (
                <tr key={u.id}>
                  <td>{u.fullName}</td>
                  <td>{u.email}</td>
                  <td>
                    <select
                      aria-label={`Role ${u.fullName}`}
                      value={u.role}
                      onChange={async (e) => {
                        try {
                          await api(`/admin/users/${u.id}/role`, "PATCH", {
                            role: e.target.value,
                          });
                          await q.refetch();
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
                  <td>{u.status}</td>
                  <td>
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
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} total={q.data?.total || 0} onChange={setPage} />
    </>
  );
}
export function AdminOverview({ classes = false }: { classes?: boolean }) {
  const q = useQuery({
    queryKey: ["admin", classes],
    queryFn: () =>
      api<
        | Record<string, number>
        | {
            id: string;
            name: string;
            teacher: UserDto;
            _count: { members: number };
          }[]
      >(classes ? "/admin/classes" : "/admin/stats"),
  });
  return (
    <>
      <h1>{classes ? "Tổng quan lớp học" : "Tổng quan hệ thống"}</h1>
      <ErrorBox error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : Array.isArray(q.data) ? (
        q.data.map((c) => (
          <div className="card" key={c.id}>
            <h2>{c.name}</h2>
            <p>
              {c.teacher.fullName} · {c._count.members} sinh viên
            </p>
          </div>
        ))
      ) : (
        <div className="grid">
          {Object.entries(q.data || {}).map(([k, v]) => (
            <div className="card" key={k}>
              <h2>{v}</h2>
              <p>{k}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
