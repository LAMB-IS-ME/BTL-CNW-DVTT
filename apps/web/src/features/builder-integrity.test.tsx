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
import {
  createMemoryRouter,
  Link,
  Outlet,
  RouterProvider,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExamBuilder } from "./exams";
import { QuizBuilder } from "./quiz";

const mock = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  api: mock.api,
}));
vi.mock("./auth", () => ({
  useAuth: () => ({ user: { id: "teacher", role: "TEACHER" } }),
}));
vi.mock("../components/Markdown", () => ({
  Markdown: ({ children }: { children: string }) => <div>{children}</div>,
}));
const initialExam = () => ({
  id: "saved",
  title: "Đề đã lưu",
  descriptionMarkdown: "",
  status: "DRAFT",
  openAt: new Date().toISOString(),
  closeAt: new Date(Date.now() + 3600000).toISOString(),
  durationMinutes: 30,
  maxAttempts: 1,
  passScorePercent: 50,
  resultStrategy: "HIGHEST_SCORE",
  resultReleaseMode: "MANUAL",
  shuffleQuestions: false,
  shuffleOptions: false,
  showCorrectAnswers: false,
  showExplanations: false,
  showDetailedScore: true,
  classes: [],
  questions: [],
  pools: [],
});
let exam: ReturnType<typeof initialExam>;
let quiz: {
  id: string;
  title: string;
  descriptionMarkdown: string;
  isArchived: boolean;
  questions: never[];
  rooms: never[];
};
const cases = [
  {
    module: "Exam",
    path: "/teacher/exams/saved/edit",
    newPath: "/teacher/exams/new",
    field: "Tên bài thi",
    save: "Lưu bài thi",
    endpoint: "/teacher/exams/saved/configuration",
  },
  {
    module: "Quiz",
    path: "/teacher/quizzes/saved/edit",
    newPath: "/teacher/quizzes/new",
    field: "Tên Quiz",
    save: "Lưu Quiz",
    endpoint: "/teacher/quizzes/saved/configuration",
  },
];
function mount(path: string) {
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <Link to="/outside">Đi nơi khác</Link>
            <Outlet />
          </>
        ),
        children: [
          { path: "/teacher/exams/new", element: <ExamBuilder /> },
          { path: "/teacher/exams/:id/edit", element: <ExamBuilder /> },
          { path: "/teacher/quizzes/new", element: <QuizBuilder /> },
          { path: "/teacher/quizzes/:id/edit", element: <QuizBuilder /> },
          { path: "*", element: <h1>Ngoài builder</h1> },
        ],
      },
    ],
    { initialEntries: ["/outside", path, "/forward"], initialIndex: 1 },
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}
function unload() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}
beforeEach(() => {
  exam = initialExam();
  quiz = {
    id: "saved",
    title: "Quiz đã lưu",
    descriptionMarkdown: "",
    isArchived: false,
    questions: [],
    rooms: [],
  };
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  mock.api
    .mockReset()
    .mockImplementation(
      async (
        path: string,
        method = "GET",
        data?: { exam?: Partial<typeof exam>; quiz?: Partial<typeof quiz> },
      ) => {
        if (method !== "GET") {
          if (path.includes("/exams") && path.endsWith("configuration")) {
            exam = { ...exam, ...data?.exam };
            return exam;
          }
          if (path.includes("/quizzes") && path.endsWith("configuration")) {
            quiz = { ...quiz, ...data?.quiz };
            return quiz;
          }
          return {};
        }
        if (path.startsWith("/teacher/question-banks?"))
          return { items: [{ id: "bank", title: "Bank" }], total: 1 };
        if (path.startsWith("/teacher/question-banks/bank/questions"))
          return {
            items: [
              {
                id: "question",
                type: "SINGLE_CHOICE",
                promptMarkdown: "Câu Quiz",
                options: [],
              },
            ],
            total: 1,
          };
        if (path === "/teacher/exams/saved") return exam;
        if (path === "/teacher/quizzes/saved") return quiz;
        return { items: [], total: 0 };
      },
    );
});
afterEach(cleanup);

it.each(cases)(
  "$module guards route links, Back, Forward and reload while preserving the form",
  async (c) => {
    const router = mount(c.path);
    const field = await screen.findByLabelText(c.field, {});
    expect(unload()).toBe(false);
    fireEvent.change(field, { target: { value: "Nội dung chưa lưu" } });
    expect(unload()).toBe(true);
    for (const action of [
      () => fireEvent.click(screen.getByText("Đi nơi khác")),
      () => router.navigate(-1),
      () => router.navigate(1),
    ]) {
      await act(async () => {
        await action();
      });
      await screen.findByRole("dialog", { name: "Nội dung chưa lưu" });
      expect(router.state.location.pathname).toBe(c.path);
      fireEvent.click(screen.getByRole("button", { name: "Tiếp tục soạn" }));
      expect(
        (screen.getByLabelText(c.field, {}) as HTMLInputElement).value,
      ).toBe("Nội dung chưa lưu");
    }
    fireEvent.click(screen.getByText("Đi nơi khác"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Rời trang, bỏ thay đổi" }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/outside"),
    );
    expect(unload()).toBe(false);
  },
);

it.each(cases)(
  "$module blocks pending/failed saves, keeps input and becomes clean only after success",
  async (c) => {
    const router = mount(c.path);
    const field = await screen.findByLabelText(c.field, {});
    fireEvent.change(field, { target: { value: "Giữ lại khi lỗi" } });
    let reject!: (e: Error) => void;
    mock.api.mockImplementationOnce(
      () =>
        new Promise((_, r) => {
          reject = r;
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: c.save }));
    expect(
      (
        screen.getByRole("button", {
          name: c.save,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByText("Đi nơi khác"));
    const leave = await screen.findByRole("button", {
      name: "Rời trang, bỏ thay đổi",
    });
    expect((leave as HTMLButtonElement).disabled).toBe(true);
    await act(async () => reject(new Error("Lưu thất bại")));
    expect(unload()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục soạn" }));
    expect((screen.getByLabelText(c.field, {}) as HTMLInputElement).value).toBe(
      "Giữ lại khi lỗi",
    );
    fireEvent.click(screen.getByRole("button", { name: c.save }));
    await waitFor(() => expect(unload()).toBe(false));
    fireEvent.click(screen.getByText("Đi nơi khác"));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/outside"),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  },
);

it.each(cases)(
  "$module respects a blocked history destination after a successful pending save",
  async (c) => {
    const router = mount(c.path);
    fireEvent.change(await screen.findByLabelText(c.field, {}), {
      target: { value: "Lưu xong rồi quay lại" },
    });
    let resolve!: (value: unknown) => void;
    mock.api.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: c.save }));
    await act(async () => {
      await router.navigate(-1);
    });
    await screen.findByRole("dialog", { name: "Nội dung chưa lưu" });
    await act(async () => resolve(c.module === "Exam" ? exam : quiz));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/outside"),
    );
  },
);

it.each(cases)(
  "$module navigates after first save without a false dirty warning",
  async (c) => {
    const router = mount(c.newPath);
    fireEvent.change(await screen.findByLabelText(c.field, {}), {
      target: { value: "Đã lưu lần đầu" },
    });
    fireEvent.click(screen.getByRole("button", { name: c.save }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        c.module === "Exam" ? "/teacher/exams" : c.path,
      ),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(unload()).toBe(false);
  },
);

it("Exam step changes preserve values and picker searches do not mark the form dirty", async () => {
  mount(cases[0]!.path);
  await screen.findByLabelText("Tên bài thi", {});
  fireEvent.click(screen.getByRole("button", { name: "Tiếp" }));
  fireEvent.change(screen.getByLabelText("Tìm lớp"), {
    target: { value: "Từ khóa" },
  });
  expect(unload()).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Trước" }));
  fireEvent.change(screen.getByLabelText("Tên bài thi", {}), {
    target: { value: "Qua bước vẫn còn" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Tiếp" }));
  fireEvent.click(screen.getByRole("button", { name: "Trước" }));
  expect(
    (screen.getByLabelText("Tên bài thi", {}) as HTMLInputElement).value,
  ).toBe("Qua bước vẫn còn");
  expect(unload()).toBe(true);
});

it("Quiz retries failed atomic creates without acknowledging unsaved values", async () => {
  mount(cases[1]!.newPath);
  fireEvent.change(await screen.findByLabelText("Tên Quiz", {}), {
    target: { value: "Quiz đã lưu" },
  });
  mock.api.mockImplementationOnce(async () => {
    throw new Error("Mạng lỗi");
  });
  fireEvent.click(screen.getByRole("button", { name: "Lưu Quiz" }));
  await screen.findByText("Mạng lỗi");
  expect(unload()).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Lưu Quiz" }));
  await waitFor(() => expect(unload()).toBe(false));
  const writes = mock.api.mock.calls.filter(
    ([, method]) => method === "POST" || method === "PUT",
  );
  expect(writes).toHaveLength(2);
  expect(
    writes.every(([path]) => path === "/teacher/quizzes/configuration"),
  ).toBe(true);
});

it("Quiz keeps its created ID when a later room request fails; retry updates that ID", async () => {
  const router = mount(cases[1]!.newPath);
  fireEvent.change(await screen.findByLabelText("Tên Quiz", {}), {
    target: { value: "Quiz phòng lỗi" },
  });
  await screen.findByRole("option", { name: "Bank" });
  fireEvent.change(screen.getByLabelText("Ngân hàng", {}), {
    target: { value: "bank" },
  });
  fireEvent.click(await screen.findByRole("checkbox", { name: "Câu Quiz" }));
  const base = mock.api.getMockImplementation()!;
  let roomRequests = 0;
  mock.api.mockImplementation(async (...args: unknown[]) => {
    if (args[0] === "/teacher/quizzes/saved/rooms") {
      if (++roomRequests === 1) throw new Error("Không tạo được phòng");
      return { id: "room" };
    }
    return base(...args);
  });
  fireEvent.click(screen.getByRole("button", { name: "Lưu & tạo phòng" }));
  await screen.findByText("Không tạo được phòng");
  expect(unload()).toBe(false);
  expect(router.state.location.pathname).toBe(cases[1]!.newPath);
  fireEvent.click(screen.getByRole("button", { name: "Lưu & tạo phòng" }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe(
      "/teacher/quiz-rooms/room/host",
    ),
  );
  const configurations = mock.api.mock.calls.filter(([path]) =>
    String(path).endsWith("configuration"),
  );
  expect(configurations.map(([path, method]) => [path, method])).toEqual([
    ["/teacher/quizzes/configuration", "POST"],
    ["/teacher/quizzes/saved/configuration", "PUT"],
  ]);
});

it.each(cases)(
  "$module archive never treats unsaved input as a successful save",
  async (c) => {
    mount(c.path);
    const field = await screen.findByLabelText(c.field);
    fireEvent.change(field, { target: { value: "Chưa lưu, không được bỏ" } });
    fireEvent.click(
      screen.getByRole("button", {
        name: c.module === "Exam" ? "Lưu trữ bài thi" : "Lưu trữ Quiz",
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Xác nhận" }));
    await screen.findByText("Hãy lưu hoặc bỏ thay đổi trước khi lưu trữ.");
    expect(
      mock.api.mock.calls.some(
        ([path, method]) =>
          method === "DELETE" || String(path).endsWith("/archive"),
      ),
    ).toBe(false);
    expect((field as HTMLInputElement).value).toBe("Chưa lưu, không được bỏ");
    expect(unload()).toBe(true);
  },
);
