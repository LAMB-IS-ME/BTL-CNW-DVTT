import {
  beginSession,
  endSession,
  sessionEnded,
  sessionGeneration,
} from "./session";
const base =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? "http://localhost:3000/api/v1" : "/api/v1");
let csrf = "";
export class ApiFailure extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
function expiredFailure() {
  return new ApiFailure(
    "UNAUTHENTICATED",
    "Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.",
    401,
  );
}
export function isSessionFailure(error: unknown) {
  return (
    error instanceof ApiFailure &&
    error.status === 401 &&
    ["UNAUTHENTICATED", "ACCOUNT_LOCKED"].includes(error.code)
  );
}
let checking: Promise<void> | undefined;
// CSRF and forced socket disconnects are ambiguous. Confirm via a read only probe.
export function verifySession() {
  checking ??= api("/auth/me")
    .then(
      () => {},
      () => {},
    )
    .finally(() => {
      checking = undefined;
    });
  return checking;
}
async function failure(response: Response, path: string, generation: number) {
  const body = await response.json().catch(() => ({}));
  if (generation !== sessionGeneration()) return expiredFailure();
  const error = new ApiFailure(
    body.error?.code || "ERROR",
    body.error?.message || "Không thể kết nối máy chủ.",
    response.status,
  );
  if (isSessionFailure(error)) {
    csrf = "";
    endSession();
  } else if (error.code === "CSRF_INVALID") {
    csrf = "";
    if (!path.startsWith("/auth/") || path === "/auth/logout")
      await verifySession();
  }
  return error;
}
export async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const generation = sessionGeneration();
  const authPath = path.startsWith("/auth/");
  if (!authPath && sessionEnded()) throw expiredFailure();
  if (method !== "GET" && !csrf) {
    const r = await fetch(`${base}/auth/csrf`, { credentials: "include" });
    if (!r.ok) throw await failure(r, "/auth/csrf", generation);
    const body = await r.json();
    if (generation !== sessionGeneration()) throw expiredFailure();
    csrf = body.data.token;
  }
  const isForm = data instanceof FormData;
  const r = await fetch(`${base}${path}`, {
    method,
    credentials: "include",
    headers: {
      ...(data && !isForm ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" ? { "X-CSRF-Token": csrf } : {}),
    },
    body: data ? (isForm ? data : JSON.stringify(data)) : undefined,
  });
  if (generation !== sessionGeneration()) throw expiredFailure();
  if (r.status === 204) {
    if (path === "/auth/logout") {
      csrf = "";
      endSession("logout");
    }
    return undefined as T;
  }
  if (!r.ok) throw await failure(r, path, generation);
  const body = await r.json();
  if (generation !== sessionGeneration()) throw expiredFailure();
  if (path === "/auth/login") {
    csrf = body.data.csrf;
    beginSession();
  }
  return body.data as T;
}
export async function download(path: string, name: string) {
  if (sessionEnded()) throw expiredFailure();
  const generation = sessionGeneration();
  const r = await fetch(`${base}${path}`, { credentials: "include" });
  if (generation !== sessionGeneration()) throw expiredFailure();
  if (!r.ok) {
    const error = await failure(r, path, generation);
    if (isSessionFailure(error)) throw error;
    // Retain the established export error while sharing auth invalidation.
    throw new ApiFailure(error.code, "Không thể xuất báo cáo.", error.status);
  }
  const blob = await r.blob();
  if (generation !== sessionGeneration()) throw expiredFailure();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
