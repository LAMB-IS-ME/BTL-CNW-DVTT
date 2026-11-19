// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthEntry, AuthProvider } from "./auth";
import { beginSession } from "../lib/session";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  beginSession();
});

it.each([
  { register: false, outcome: "anonymous" },
  { register: true, outcome: "anonymous" },
  { register: false, outcome: "authenticated" },
  { register: false, outcome: "network-error" },
])(
  "settles the initial probe before auth (register=$register, outcome=$outcome)",
  async ({ register, outcome }) => {
    beginSession();
    let resolveMe!: (response: Response) => void;
    let rejectMe!: (reason: Error) => void;
    const calls: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      calls.push(url);
      if (url.endsWith("/auth/me"))
        return new Promise<Response>((resolve, reject) => {
          resolveMe = resolve;
          rejectMe = reject;
        });
      if (url.endsWith("/auth/csrf"))
        return Promise.resolve(
          new Response(JSON.stringify({ data: { token: "test-csrf" } })),
        );
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              user: { id: "fixture", role: "ADMIN" },
              csrf: "test-authenticated-csrf",
            },
          }),
        ),
      );
    });
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={cache}>
        <MemoryRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<AuthEntry register={register} />} />
              <Route path="/admin" element={<p>Đăng nhập thành công</p>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(resolveMe).toBeDefined());
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Đang tải");
    expect(calls).toHaveLength(1);
    if (outcome === "network-error") {
      rejectMe(new TypeError("Failed to fetch"));
    } else {
      resolveMe(
        outcome === "authenticated"
          ? new Response(
              JSON.stringify({ data: { id: "prior", role: "STUDENT" } }),
            )
          : new Response(
              JSON.stringify({ error: { code: "UNAUTHENTICATED" } }),
              { status: 401 },
            ),
      );
    }
    expect(await screen.findByLabelText("Email")).toBeTruthy();
    if (!register) {
      fireEvent.change(screen.getByLabelText("Email"), {
        target: { value: "fixture@example.test" },
      });
      fireEvent.change(screen.getByLabelText("Mật khẩu"), {
        target: { value: "test-password" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
      expect(await screen.findByText("Đăng nhập thành công")).toBeTruthy();
      expect(calls.filter((url) => url.endsWith("/auth/login"))).toHaveLength(
        1,
      );
      expect(screen.queryByRole("alert")).toBeNull();
    }
    cleanup();
    cache.clear();
  },
);
