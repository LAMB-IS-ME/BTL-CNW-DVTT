// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthForm } from "./auth";
import { api, ApiFailure } from "../lib/api";
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, api: vi.fn() };
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function form(register = false) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<AuthForm register={register} />} />
          <Route path="/admin" element={<p>Đăng nhập thành công</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
function fill() {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "admin@exam.local" },
  });
  fireEvent.change(screen.getByLabelText(/^Mật khẩu/), {
    target: { value: "iamadev" },
  });
}
it("submits the seven-character password through the Login RHF resolver", async () => {
  vi.mocked(api).mockResolvedValue({ user: { id: "admin", role: "ADMIN" } });
  form();
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
  expect(await screen.findByText("Đăng nhập thành công")).toBeTruthy();
  expect(api).toHaveBeenCalledWith(
    "/auth/login",
    "POST",
    expect.objectContaining({ email: "admin@exam.local", password: "iamadev" }),
  );
});
it("keeps registration minLength 10 with a Vietnamese validation message", async () => {
  form(true);
  fill();
  fireEvent.change(screen.getByLabelText("Họ và tên"), {
    target: { value: "Người dùng" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Đăng ký" }));
  expect(
    await screen.findByText("Mật khẩu phải có ít nhất 10 ký tự."),
  ).toBeTruthy();
  expect(api).not.toHaveBeenCalled();
});
it("shows the generic credentials error and hides unexpected internal errors", async () => {
  vi.mocked(api).mockRejectedValueOnce(
    new ApiFailure(
      "AUTH_INVALID_CREDENTIALS",
      "Email hoặc mật khẩu không đúng.",
      401,
    ),
  );
  form();
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
  expect(
    await screen.findByText("Email hoặc mật khẩu không đúng."),
  ).toBeTruthy();
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Đăng nhập",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  vi.mocked(api).mockRejectedValueOnce(new Error("Internal parser detail"));
  fireEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
  expect(
    await screen.findByText("Không thể kết nối máy chủ. Vui lòng thử lại."),
  ).toBeTruthy();
  expect(screen.queryByText("Internal parser detail")).toBeNull();
});
