// @vitest-environment jsdom
import { it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, Guard, AuthForm } from "./auth";
import { StatusBadge } from "./results";
import { AnswerControl } from "./attempts";
import { useState } from "react";
afterEach(cleanup);
it("routes a logged-in student away from teacher UI", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity } },
  });
  client.setQueryData(["me"], { id: "u", role: "STUDENT", fullName: "An" });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>
          <Routes>
            <Route
              path="/"
              element={
                <Guard role="TEACHER">
                  <p>Teacher secret</p>
                </Guard>
              }
            />
            <Route path="/403" element={<p>Forbidden</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Forbidden")).toBeTruthy();
  expect(screen.queryByText("Teacher secret")).toBeNull();
});
it("shows login validation and required accessible fields", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AuthForm />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(screen.getByLabelText("Email")).toBeTruthy();
  fireEvent.submit(
    screen.getByRole("button", { name: "Đăng nhập" }).closest("form")!,
  );
  expect(await screen.findByText(/10 characters/)).toBeTruthy();
});
it("renders every monitoring state with text independent of color", () => {
  render(
    <>
      {(
        ["NOT_STARTED", "IN_PROGRESS", "DISCONNECTED", "SUBMITTED"] as const
      ).map((s) => (
        <StatusBadge status={s} key={s} />
      ))}
    </>,
  );
  for (const text of ["Chưa bắt đầu", "Đang thi", "Mất kết nối", "Đã nộp"])
    expect(screen.getByText(text)).toBeTruthy();
});
it("handles multiple selection without losing other choices", () => {
  function Test() {
    const [value, setValue] = useState({
      selectedOptionIds: [] as string[],
      answerText: "",
    });
    return (
      <>
        <AnswerControl
          question={{
            id: "q",
            type: "MULTIPLE_CHOICE",
            promptMarkdown: "",
            points: 1,
            options: [
              { id: "a", contentMarkdown: "A" },
              { id: "b", contentMarkdown: "B" },
            ],
          }}
          value={value}
          onChange={setValue}
        />
        <output>{value.selectedOptionIds.join(",")}</output>
      </>
    );
  }
  render(<Test />);
  fireEvent.click(screen.getByRole("checkbox", { name: "A" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "B" }));
  expect(screen.getByText("a,b")).toBeTruthy();
});
