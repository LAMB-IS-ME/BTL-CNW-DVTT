import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  loginSchema,
  registerSchema,
  type UserDto,
  type Role,
} from "@exam/shared";
import { z } from "zod";
import { api } from "../lib/api";
import { ErrorBox, Field, Loading } from "../components/ui";
const AuthContext = createContext<{ user: UserDto | null; loading: boolean }>({
  user: null,
  loading: true,
});
export function AuthProvider({ children }: { children: ReactNode }) {
  const q = useQuery({
    queryKey: ["me"],
    queryFn: () => api<UserDto>("/auth/me"),
    retry: false,
  });
  return (
    <AuthContext.Provider
      value={{ user: q.data || null, loading: q.isPending }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
export function Guard({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to="/403" replace />;
  return <>{children}</>;
}
export function AuthForm({ register = false }: { register?: boolean }) {
  const nav = useNavigate(),
    cache = useQueryClient();
  const [error, setError] = useState<unknown>();
  const schema = register
    ? registerSchema
    : loginSchema.extend({
        fullName: z.string(),
        studentCode: z.string().optional(),
      });
  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", fullName: "" },
  });
  return (
    <div className="auth card">
      <p className="eyebrow">EXAMSPACE</p>
      <h1>{register ? "Tạo tài khoản sinh viên" : "Chào mừng trở lại"}</h1>
      <p>Không gian học tập, kiểm tra và kết nối.</p>
      <form
        onSubmit={form.handleSubmit(async (data) => {
          try {
            setError(undefined);
            if (register) {
              await api("/auth/register", "POST", data);
              nav("/login");
            } else {
              const r = await api<{ user: UserDto }>(
                "/auth/login",
                "POST",
                data,
              );
              cache.setQueryData(["me"], r.user);
              nav(`/${r.user.role.toLowerCase()}`);
            }
          } catch (e) {
            setError(e);
          }
        })}
      >
        {register && (
          <>
            <Field label="Họ và tên">
              <input {...form.register("fullName")} autoComplete="name" />
            </Field>
            <Field label="Mã sinh viên (không bắt buộc)">
              <input
                {...form.register("studentCode", {
                  setValueAs: (v) => v || undefined,
                })}
              />
            </Field>
          </>
        )}
        <Field label="Email">
          <input
            type="email"
            {...form.register("email")}
            autoComplete="email"
          />
        </Field>
        <Field label="Mật khẩu (ít nhất 10 ký tự)">
          <input
            type="password"
            {...form.register("password")}
            autoComplete={register ? "new-password" : "current-password"}
          />
        </Field>
        {Object.values(form.formState.errors).map((e, i) => (
          <p className="error" key={i}>
            {e.message}
          </p>
        ))}
        <ErrorBox error={error} />
        <button disabled={form.formState.isSubmitting}>
          {register ? "Đăng ký" : "Đăng nhập"}
        </button>
      </form>
      <p>
        <Link to={register ? "/login" : "/register"}>
          {register
            ? "Đã có tài khoản? Đăng nhập"
            : "Chưa có tài khoản? Đăng ký sinh viên"}
        </Link>
      </p>
    </div>
  );
}
