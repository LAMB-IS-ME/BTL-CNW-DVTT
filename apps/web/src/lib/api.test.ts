import { it, expect, vi, afterEach } from "vitest";
import { api } from "./api";
afterEach(() => vi.unstubAllGlobals());
it("obtains a fresh CSRF token after logout before logging in again", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith("/auth/csrf"))
      return new Response(JSON.stringify({ data: { token: "new-csrf" } }));
    if (url.endsWith("/auth/logout"))
      return new Response(null, { status: 204 });
    return new Response(
      JSON.stringify({
        data: { user: { id: "u" }, csrf: "authenticated-csrf" },
      }),
    );
  });
  await api("/auth/login", "POST", {
    email: "a@b.test",
    password: "example-pass",
  });
  await api("/auth/logout", "POST");
  await api("/auth/login", "POST", {
    email: "a@b.test",
    password: "example-pass",
  });
  expect(calls.filter((c) => c.url.endsWith("/auth/csrf"))).toHaveLength(2);
  expect(
    (calls.at(-1)?.init?.headers as Record<string, string>)["X-CSRF-Token"],
  ).toBe("new-csrf");
});

it("ends a session once, blocks repeated protected requests, and fences late data", async () => {
  const { beginSession, onSessionEnded, sessionEnded } =
    await import("./session");
  beginSession();
  const listener = vi.fn();
  const off = onSessionEnded(listener);
  let resolve!: (r: Response) => void;
  const fetcher = vi.fn((url: string) =>
    url.endsWith("/slow")
      ? new Promise<Response>((r) => {
          resolve = r;
        })
      : Promise.resolve(
          new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }), {
            status: 401,
          }),
        ),
  );
  vi.stubGlobal("fetch", fetcher);
  const slow = api("/slow");
  await expect(api("/teacher/exams")).rejects.toMatchObject({ status: 401 });
  expect(sessionEnded()).toBe(true);
  await expect(api("/teacher/exams")).rejects.toMatchObject({ status: 401 });
  resolve(new Response(JSON.stringify({ data: { private: true } })));
  await expect(slow).rejects.toMatchObject({ status: 401 });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(listener).toHaveBeenCalledTimes(1);
  off();
  beginSession();
});

it.each([
  "FORBIDDEN",
  "ORIGIN_REJECTED",
  "CSRF_INVALID",
  "AUTH_INVALID_CREDENTIALS",
  "network",
])(
  "does not report session expiry for %s with a valid session",
  async (code) => {
    const { beginSession, sessionEnded } = await import("./session");
    beginSession();
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      if (url.endsWith("/auth/me"))
        return new Response(JSON.stringify({ data: { id: "valid" } }));
      if (code === "network") throw new TypeError("Failed to fetch");
      return new Response(JSON.stringify({ error: { code } }), {
        status: code === "AUTH_INVALID_CREDENTIALS" ? 401 : 403,
      });
    });
    await expect(api("/teacher/exams")).rejects.toThrow();
    expect(sessionEnded()).toBe(false);
    expect(calls.filter((c) => c.endsWith("/auth/me"))).toHaveLength(
      code === "CSRF_INVALID" ? 1 : 0,
    );
  },
);

it("confirms CSRF rejection with one me probe and never replays a mutation", async () => {
  const { beginSession, sessionEnded } = await import("./session");
  beginSession();
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    if (url.endsWith("/auth/csrf"))
      return new Response(JSON.stringify({ data: { token: "test" } }));
    return new Response(
      JSON.stringify({
        error: {
          code: url.endsWith("/auth/me") ? "UNAUTHENTICATED" : "CSRF_INVALID",
        },
      }),
      { status: url.endsWith("/auth/me") ? 401 : 403 },
    );
  });
  await expect(
    api("/teacher/exams", "POST", { title: "unsaved" }),
  ).rejects.toMatchObject({ code: "CSRF_INVALID" });
  expect(sessionEnded()).toBe(true);
  expect(calls.filter((c) => c.endsWith("/teacher/exams"))).toHaveLength(1);
  expect(calls.filter((c) => c.endsWith("/auth/me"))).toHaveLength(1);
  beginSession();
});

it("does not invalidate a new identity when an old error body resolves late", async () => {
  const { beginSession, sessionEnded } = await import("./session");
  beginSession();
  let resolve!: (body: unknown) => void;
  vi.stubGlobal("fetch", async () => ({
    status: 401,
    ok: false,
    json: () =>
      new Promise((r) => {
        resolve = r;
      }),
  }));
  const pending = api("/teacher/exams");
  await vi.waitFor(() => expect(resolve).toBeDefined());
  beginSession();
  resolve({ error: { code: "UNAUTHENTICATED" } });
  await expect(pending).rejects.toMatchObject({ status: 401 });
  expect(sessionEnded()).toBe(false);
});

it("routes protected downloads through session expiry handling", async () => {
  const { beginSession, sessionEnded } = await import("./session");
  const { download } = await import("./api");
  beginSession();
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }), {
        status: 401,
      }),
  );
  await expect(download("/teacher/export", "test.pdf")).rejects.toMatchObject({
    status: 401,
  });
  expect(sessionEnded()).toBe(true);
  beginSession();
});

it("retains the established export error for non-auth failures without ending a valid session", async () => {
  const { beginSession, sessionEnded } = await import("./session");
  const { download } = await import("./api");
  beginSession();
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "UNAVAILABLE",
            message: "Tạm thời không tải được dữ liệu.",
          },
        }),
        { status: 503 },
      ),
  );
  await expect(download("/teacher/export", "test.pdf")).rejects.toMatchObject({
    message: "Không thể xuất báo cáo.",
    status: 503,
  });
  expect(sessionEnded()).toBe(false);
});
