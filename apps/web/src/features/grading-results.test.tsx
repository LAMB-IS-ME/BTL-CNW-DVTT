// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Grading, StudentResults } from "./results";
import { api } from "../lib/api";
vi.mock("../lib/api", () => ({ api: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function mount(kind: "grading" | "student", data: unknown) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(
    kind === "grading" ? ["grading", "exam", 1] : ["student-results", "exam"],
    data,
  );
  client.setQueryData(["result-exam", "exam"], { title: "Bài thi mẫu" });
  vi.mocked(api).mockImplementation(async (path, method) =>
    method === "PUT"
      ? {}
      : path.endsWith("/exam")
        ? { title: "Bài thi mẫu" }
        : data,
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider
        router={createMemoryRouter(
          [
            {
              path: "/:id",
              element: kind === "grading" ? <Grading /> : <StudentResults />,
            },
          ],
          { initialEntries: ["/exam"] },
        )}
      />
    </QueryClientProvider>,
  );
  return client;
}
const attempts = [
  {
    id: "attempt",
    status: "GRADED",
    attemptNo: 1,
    student: { fullName: "An", studentCode: "SV01" },
    questions: [
      {
        id: "q",
        orderIndex: 2,
        points: "3",
        snapshotJson: {
          type: "ESSAY",
          promptMarkdown: "Giải thích",
          options: [],
        },
        answer: {
          id: "answer",
          answerText: "Bài làm",
          manualScore: "1",
          feedback: "",
        },
      },
    ],
  },
];
it("clears a stale saved message on further edits and clears failure after retry", async () => {
  vi.mocked(api).mockImplementation(async (_path, method) =>
    method === "PUT" ? {} : attempts,
  );
  mount("grading", attempts);
  const score = screen.getByRole("spinbutton");
  fireEvent.change(score, { target: { value: "2" } });
  fireEvent.submit(
    screen.getByRole("button", { name: "Lưu điểm" }).closest("form")!,
  );
  await screen.findByText("Đã lưu điểm");
  fireEvent.change(score, { target: { value: "2.5" } });
  expect(screen.queryByText("Đã lưu điểm")).toBeNull();
  expect(screen.getByText("Có thay đổi chưa lưu")).toBeTruthy();
  vi.mocked(api).mockRejectedValueOnce(new Error("Lỗi thử nghiệm"));
  fireEvent.submit(
    screen.getByRole("button", { name: "Lưu điểm" }).closest("form")!,
  );
  await screen.findByRole("alert");
  expect(screen.queryByText("Đã lưu điểm")).toBeNull();
  fireEvent.submit(
    screen.getByRole("button", { name: "Lưu điểm" }).closest("form")!,
  );
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  await screen.findByText("Đã lưu điểm");
});
it("does not render scores, feedback or answers from an invisible result", () => {
  mount("student", {
    title: "Bài thi",
    resultStrategy: "HIGHEST_SCORE",
    finalAttemptId: "a",
    attempts: [
      {
        id: "a",
        attemptNo: 1,
        status: "GRADED",
        visible: false,
        totalScore: 9,
        maxScore: 10,
        questions: [
          {
            id: "secret",
            promptMarkdown: "Nội dung bị ẩn",
            feedback: "Nhận xét bí mật",
          },
        ],
      },
    ],
  });
  expect(screen.getByText("Đã nộp · Kết quả chưa công bố")).toBeTruthy();
  expect(screen.queryByText("Tổng điểm")).toBeNull();
  expect(screen.queryByText("Nội dung bị ẩn")).toBeNull();
  expect(screen.queryByText("Nhận xét bí mật")).toBeNull();
});
it("renders a released zero score without fabricating withheld per-question details", () => {
  mount("student", {
    title: "Bài thi",
    resultStrategy: "LATEST_ATTEMPT",
    finalAttemptId: "a",
    attempts: [
      {
        id: "a",
        attemptNo: 1,
        status: "GRADED",
        visible: true,
        totalScore: 0,
        maxScore: 3,
        percentage: 0,
        questions: [
          {
            id: "q",
            type: "ESSAY",
            promptMarkdown: "Đề bài",
            answerText: "Bài làm",
            feedback: null,
            options: [],
          },
        ],
      },
    ],
  });
  expect(screen.getByText("0", { exact: true })).toBeTruthy();
  expect(screen.getByText("0.0%")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Câu 1" })).toBeTruthy();
  expect(
    within(
      screen.getByRole("heading", { name: "Câu 1" }).closest("section")!,
    ).queryByText(/điểm$/),
  ).toBeNull();
});
it("reverting a draft clears dirty while clearing a persisted score remains dirty", async () => {
  mount("grading", attempts);
  const score = screen.getByRole("spinbutton");
  fireEvent.change(score, { target: { value: "2" } });
  expect(screen.getByText("Có thay đổi chưa lưu")).toBeTruthy();
  fireEvent.change(score, { target: { value: "1.00" } });
  expect(screen.queryByText("Có thay đổi chưa lưu")).toBeNull();
  fireEvent.change(score, { target: { value: "" } });
  expect(screen.getByText("Có thay đổi chưa lưu")).toBeTruthy();
  expect(screen.queryByText("Đã lưu điểm")).toBeNull();
});
it("orders essays by snapshot position while saving the matching answer ID", async () => {
  const question = attempts[0]!.questions[0]!;
  mount("grading", [
    {
      ...attempts[0],
      questions: [
        {
          ...question,
          id: "later",
          orderIndex: 4,
          points: "2",
          answer: { ...question.answer, id: "later-answer" },
        },
        question,
      ],
    },
  ]);
  const headings = screen.getAllByRole("heading", { level: 3 });
  expect(headings.map((h) => h.textContent)).toEqual([
    "Câu 3 Tự luận · 3 điểm",
    "Câu 5 Tự luận · 2 điểm",
  ]);
  const form = headings[0]!.closest("form")!;
  fireEvent.change(within(form).getByRole("spinbutton"), {
    target: { value: "2.5" },
  });
  fireEvent.submit(form);
  await within(form).findByText("Đã lưu điểm");
  expect(api).toHaveBeenCalledWith("/teacher/answers/answer/grade", "PUT", {
    score: 2.5,
    feedback: "",
  });
});
