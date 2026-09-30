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
