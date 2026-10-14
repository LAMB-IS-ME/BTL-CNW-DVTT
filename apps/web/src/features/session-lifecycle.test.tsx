// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, Guard } from "./auth";
import { beginSession, endSession } from "../lib/session";
const user = { id: "teacher", role: "TEACHER", fullName: "Test Teacher" };
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  beginSession();
});
function mount(cached = true) {
  beginSession();
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (cached) cache.setQueryData(["me"], user);
  cache.setQueryData(["protected-grade"], "private result");
  render(
    <QueryClientProvider client={cache}>
      <MemoryRouter>
        <AuthProvider>
          <Routes>
            <Route
              path="/"
              element={
                <Guard role="TEACHER">
                  <p>Protected teacher workspace</p>
                </Guard>
              }
            />
            <Route path="/login" element={<p>Login route</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return cache;
}
it("removes protected UI/cache, focuses recovery and distinguishes explicit logout", async () => {
  const cache = mount();
  expect(screen.getByText("Protected teacher workspace")).toBeTruthy();
  act(() => endSession());
  expect(
    screen.getByRole("heading", { name: "Phiên đăng nhập đã kết thúc" }),
  ).toBe(document.activeElement);
  expect(screen.queryByText("Protected teacher workspace")).toBeNull();
  expect(cache.getQueryData(["protected-grade"])).toBeUndefined();
  expect(cache.getQueryData(["me"])).toBeNull();
  cleanup();
  mount();
  act(() => endSession("logout"));
  expect(await screen.findByText("Login route")).toBeTruthy();
  expect(
    screen.queryByRole("heading", { name: "Phiên đăng nhập đã kết thúc" }),
  ).toBeNull();
});
it("shows a recoverable initial network error instead of an expiry/login redirect", async () => {
  vi.stubGlobal("fetch", async () => {
    throw new TypeError("Network unavailable");
  });
  mount(false);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeTruthy(),
  );
  expect(screen.queryByText("Login route")).toBeNull();
  expect(
    screen.queryByRole("heading", { name: "Phiên đăng nhập đã kết thúc" }),
  ).toBeNull();
});
