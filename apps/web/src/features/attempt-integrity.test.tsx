// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import type { AttemptDto } from "@exam/shared";
import { AttemptPage } from "./attempts";
import { ApiFailure } from "../lib/api";
const api = vi.hoisted(() => vi.fn());
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  api,
}));
vi.mock("../lib/socket", () => ({ useAttemptPresence: () => {} }));
const state: AttemptDto = {
  id: "attempt",
  examId: "exam",
  title: "Integrity fixture",
  attemptNo: 1,
  status: "IN_PROGRESS",
  startedAt: "2026-10-22T00:00:00.000Z",
  serverNow: "2026-10-22T00:00:00.000Z",
  expiresAt: "2026-10-22T00:01:00.000Z",
  submittedAt: null,
  questions: [
    {
      id: "question",
      points: 1,
      type: "SINGLE_CHOICE",
      promptMarkdown: "Choose",
      options: [
        { id: "a", contentMarkdown: "Alpha" },
        { id: "b", contentMarkdown: "Beta" },
      ],
      answer: { selectedOptionIds: [], answerText: "", savedAt: null },
    },
  ],
};
const remote: AttemptDto = {
  ...state,
  questions: [
    {
      ...state.questions[0]!,
      answer: {
        selectedOptionIds: ["b"],
        answerText: "",
        savedAt: "2026-10-22T00:00:01.000Z",
      },
    },
  ],
};
beforeEach(() => {
  api.mockReset();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider
        router={createMemoryRouter(
          [{ path: "/student/attempts/:id", element: <AttemptPage /> }],
          { initialEntries: ["/student/attempts/attempt"] },
        )}
      />
    </QueryClientProvider>,
  );
}
it("keeps local selection and blocks submit even when the conflict refresh fails, then explicitly adopts server data", async () => {
  let reads = 0;
  api.mockImplementation(async (_path: string, method = "GET") => {
    if (method === "PUT")
      throw new ApiFailure("ANSWER_CONFLICT", "Conflict", 409);
    reads++;
    if (reads === 1) return state;
    if (reads === 2) throw new Error("Read unavailable");
    return remote;
  });
  mount();
  fireEvent.click(await screen.findByRole("radio", { name: "Alpha" }));
  await waitFor(
    () =>
      expect(screen.getByRole("status").textContent).toBe(
        "Cần kiểm tra đáp án",
      ),
    { timeout: 2000 },
  );
  expect(
    (
      screen.getByRole("radio", {
        name: "Alpha",
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  expect(
    (
      screen.getByRole("button", {
        name: "Nộp bài",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(api.mock.calls.filter(([, method]) => method === "PUT")).toHaveLength(
    1,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Dùng đáp án trên máy chủ" }),
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole("radio", {
          name: "Beta",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true),
  );
  expect(screen.getByRole("status").textContent).toBe("Đã lưu");
  expect(api.mock.calls.filter(([, method]) => method === "PUT")).toHaveLength(
    1,
  );
});
it("a remote update discovered on focus never silently changes the displayed answer", async () => {
  api.mockResolvedValueOnce(state).mockResolvedValue(remote);
  mount();
  await screen.findByRole("radio", { name: "Alpha" });
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
  });
  await screen.findByText(/Đáp án đã thay đổi ở tab khác/);
  expect(
    (
      screen.getByRole("radio", {
        name: "Beta",
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
  expect(screen.getByRole("status").textContent).not.toBe("Đã lưu");
  fireEvent.click(
    screen.getByRole("button", { name: "Dùng đáp án trên máy chủ" }),
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole("radio", {
          name: "Beta",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true),
  );
});
it("checks a zero countdown with GET and resumes when the server says the attempt is still open", async () => {
  api
    .mockResolvedValueOnce({ ...state, expiresAt: state.serverNow })
    .mockResolvedValue(state);
  mount();
  await waitFor(() =>
    expect(screen.getByLabelText("Thời gian còn lại").textContent).toMatch(
      /00:(01:00|00:59)/,
    ),
  );
  expect(api.mock.calls).toHaveLength(2);
  expect(
    api.mock.calls.every(([, method]) => !method || method === "GET"),
  ).toBe(true);
  expect(
    (
      screen.getByRole("radio", {
        name: "Alpha",
      }) as HTMLInputElement
    ).disabled,
  ).toBe(false);
});
