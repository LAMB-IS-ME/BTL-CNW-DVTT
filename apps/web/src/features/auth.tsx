import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
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
import { onSessionEnded } from "../lib/session";
import { clearUserDrafts } from "./attempt-drafts";
import { api, ApiFailure, isSessionFailure } from "../lib/api";
import { ErrorBox, Field, Loading } from "../components/ui";
const AuthContext = createContext<{
  user: UserDto | null;
  loading: boolean;
  error?: unknown;
  retry?: () => void;
}>({ user: null, loading: true });
export function AuthProvider({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  const [expired, setExpired] = useState(false);
  const knownUser = useRef(false);
  const userId = useRef<string | null>(null);
  const [draftCleanupFailed, setDraftCleanupFailed] = useState(false);
  const q = useQuery({
    queryKey: ["me"],
    queryFn: () => api<UserDto | null>("/auth/me"),
    retry: false,
    refetchInterval: (query) => (query.state.data ? 30000 : false),
    refetchIntervalInBackground: false,
  });
  if (q.data) {
    knownUser.current = true;
    userId.current = q.data.id;
  }
  useEffect(
    () =>
      onSessionEnded((reason) => {
        if (reason === "logout" && userId.current)
          setDraftCleanupFailed(!clearUserDrafts(userId.current));
        setExpired(reason === "expired" && knownUser.current);
        knownUser.current = false;
        userId.current = null;
        // Cancel before removing: late protected query results cannot repopulate cache.
        void cache.cancelQueries();
        cache.removeQueries({
          predicate: (query) => query.queryKey[0] !== "me",
        });
        cache.getMutationCache().clear();
        cache.setQueryData(["me"], null);
      }),
    [cache],
  );
  if (expired)
    return (
      <main className="auth card" aria-labelledby="session-ended-title">
        <h1
          id="session-ended-title"
          tabIndex={-1}
          ref={(node) => node?.focus()}
        >
          Phiên đăng nhập đã kết thúc
        </h1>
        <p role="alert">
          Phiên đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại.
        </p>
        <p>
          Các thay đổi chưa lưu trong đề thi, câu hỏi, chấm bài hoặc đáp án chưa
          được máy chủ xác nhận có thể đã mất. Đăng nhập lại để kiểm tra dữ liệu
          đã lưu.
        </p>
        <p>
          Bài đã nộp và điểm đã lưu không bị thay đổi. Không tự gửi lại thao tác
          trước đó.
        </p>
        <p>
          Bản nháp đáp án đã lưu trên thiết bị được giữ tối đa 24 giờ. Đăng nhập
          lại đúng tài khoản và mở lượt thi để kiểm tra, không tự gửi lại đáp
          án.
        </p>
        <a className="button" href={`${import.meta.env.BASE_URL}login`}>
          Đăng nhập lại
        </a>
      </main>
    );
  return (
    <AuthContext.Provider
      value={{
        user: isSessionFailure(q.error) ? null : q.data || null,
        loading: q.isPending,
        error: isSessionFailure(q.error) ? undefined : q.error,
        retry: () => {
          void q.refetch();
        },
      }}
    >
      {draftCleanupFailed && (
        <p role="alert" className="error">
          Không thể xóa hết bản nháp trên thiết bị. Trên máy dùng chung, hãy xóa
          dữ liệu trang trong trình duyệt.
        </p>
      )}
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
export function Guard({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading, error, retry } = useAuth();
  if (loading) return <Loading />;
  if (!user && error)
    return (
      <>
        <ErrorBox error={error} />
        <button onClick={retry}>Thử lại</button>
      </>
    );
  if (!user)
    return <Navigate to="/login" replace state={{ loginRequired: true }} />;
  if (user.role !== role) return <Navigate to="/403" replace />;
  return <>{children}</>;
}
export function AuthEntry({ register = false }: { register?: boolean }) {
  const { loading } = useAuth();
  // Settle the initial identity probe before a form can start a new session.
  return loading ? <Loading /> : <AuthForm register={register} />;
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
      <h1>
        {register ? "Tạo tài khoản sinh viên" : "Đăng nhập vào ExamSpace"}
      </h1>
      <p>
        {register
          ? "Không gian học tập, kiểm tra và kết nối."
          : "Quản lý bài thi, làm bài và theo dõi kết quả trên một nền tảng."}
      </p>
      <form
        noValidate
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
              await cache.cancelQueries();
              cache.removeQueries({
                predicate: (query) => query.queryKey[0] !== "me",
              });
              cache.getMutationCache().clear();
              cache.setQueryData(["me"], r.user);
              nav(`/${r.user.role.toLowerCase()}`);
            }
          } catch (e) {
            setError(
              e instanceof ApiFailure
                ? e
                : new Error("Không thể kết nối máy chủ. Vui lòng thử lại."),
            );
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
        <Field label={register ? "Mật khẩu (ít nhất 10 ký tự)" : "Mật khẩu"}>
          <input
            type="password"
            {...form.register("password")}
            autoComplete={register ? "new-password" : "current-password"}
          />
        </Field>
        {Object.values(form.formState.errors).map((e, i) => (
          <p role="alert" className="error" key={i}>
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
