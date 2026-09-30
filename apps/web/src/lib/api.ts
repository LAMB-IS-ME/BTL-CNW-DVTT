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
export async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  if (method !== "GET" && !csrf) {
    const r = await fetch(`${base}/auth/csrf`, { credentials: "include" });
    const body = await r.json();
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
  if (r.status === 204) {
    if (path === "/auth/logout") csrf = "";
    return undefined as T;
  }
  const body = await r.json();
  if (!r.ok) {
    if (body.error?.code === "CSRF_INVALID") csrf = "";
    throw new ApiFailure(
      body.error?.code || "ERROR",
      body.error?.message || "Không thể kết nối máy chủ.",
      r.status,
    );
  }
  if (path === "/auth/login") csrf = body.data.csrf;
  return body.data as T;
}
export async function download(path: string, name: string) {
  const r = await fetch(`${base}${path}`, { credentials: "include" });
  if (!r.ok) throw new Error("Không thể xuất báo cáo.");
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
