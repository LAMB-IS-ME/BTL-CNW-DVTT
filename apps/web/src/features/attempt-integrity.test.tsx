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
import { AuthProvider } from "./auth";
import { ApiFailure } from "../lib/api";
import {
  AttemptDraftStore,
  DRAFT_PREFIX,
  draftKey,
  DRAFT_TTL,
} from "./attempt-drafts";
import { beginSession, endSession } from "../lib/session";
const api = vi.hoisted(() => vi.fn());
const identity = vi.hoisted(() => ({
  user: { id: "student", role: "STUDENT" },
}));
vi.mock("./auth", async (original) => ({
  ...(await original<typeof import("./auth")>()),
  useAuth: () => ({ user: identity.user }),
}));
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
  localStorage.clear();
  beginSession();
  identity.user = { id: "student", role: "STUDENT" };
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

function seedDraft(
  selectedOptionIds = ["a"],
  baseSavedAt: string | null = null,
) {
  const s = new AttemptDraftStore(
    { userId: "student", examId: state.examId, attemptId: state.id },
    () => localStorage,
    () => Date.parse(state.serverNow),
  );
  s.put("question", { selectedOptionIds, answerText: "" }, baseSavedAt);
  return s;
}
function storedDrafts() {
  return Object.keys(localStorage)
    .filter((k) => k.startsWith(DRAFT_PREFIX))
    .map((k) => JSON.parse(localStorage.getItem(k)!));
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const savedAt = "2026-10-22T00:00:02.000Z";

it("offers recovery after a remount, blocks editing/submit and sends the original base only after confirmation", async () => {
  seedDraft();
  api.mockImplementation(async (_path: string, method = "GET") =>
    method === "PUT" ? { savedAt } : state,
  );
  mount();
  await screen.findByRole("heading", {
    name: "Kiểm tra bản nháp trên thiết bị",
  });
  expect(
    (screen.getByRole("radio", { name: "Alpha" }) as HTMLInputElement).disabled,
  ).toBe(true);
  expect(
    (screen.getByRole("button", { name: "Nộp bài" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    api.mock.calls.every(([, method]) => !method || method === "GET"),
  ).toBe(true);
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Kiểm tra bản nháp trên thiết bị" }),
    ),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Phục hồi bản nháp 1 của câu 1" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe("Đã lưu"),
  );
  expect(api).toHaveBeenCalledWith(
    "/student/attempts/attempt/answers/question",
    "PUT",
    {
      selectedOptionIds: ["a"],
      answerText: "",
      expectedSavedAt: null,
    },
  );
  expect(storedDrafts()).toHaveLength(0);
});

it("stale revision offers comparison/copy and server adoption without a PUT", async () => {
  seedDraft();
  api.mockResolvedValue(remote);
  mount();
  const restore = await screen.findByRole("button", {
    name: "Phục hồi bản nháp 1 của câu 1",
  });
  expect((restore as HTMLButtonElement).disabled).toBe(true);
  expect(
    (
      screen.getByLabelText(
        /Đáp án trên máy chủ — Câu 1/,
      ) as HTMLTextAreaElement
    ).value,
  ).toBe("Beta");
  expect(
    (screen.getByLabelText(/Bản nháp 1 — Câu 1/) as HTMLTextAreaElement).value,
  ).toBe("Alpha");
  fireEvent.click(
    screen.getByRole("button", { name: "Dùng đáp án máy chủ cho câu 1" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", {
        name: "Kiểm tra bản nháp trên thiết bị",
      }),
    ).toBeNull(),
  );
  expect(api.mock.calls.some(([, method]) => method === "PUT")).toBe(false);
  expect(storedDrafts()).toHaveLength(0);
});

it("multiple writers require an explicit choice and never select by timestamp", async () => {
  seedDraft(["a"]);
  seedDraft(["b"]);
  api.mockImplementation(async (_path: string, method = "GET") =>
    method === "PUT" ? { savedAt } : state,
  );
  mount();
  await screen.findByRole("button", { name: "Phục hồi bản nháp 2 của câu 1" });
  expect(api.mock.calls.some(([, method]) => method === "PUT")).toBe(false);
  fireEvent.click(
    screen.getByRole("button", { name: "Phục hồi bản nháp 2 của câu 1" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe("Đã lưu"),
  );
  const writes = api.mock.calls.filter(([, method]) => method === "PUT");
  expect(writes).toHaveLength(1);
  expect(writes[0]![2]).toMatchObject({
    selectedOptionIds: ["b"],
    expectedSavedAt: null,
  });
});

it("a server revision changed during the recovery confirmation is never silently rebased", async () => {
  seedDraft();
  api.mockResolvedValueOnce(state).mockResolvedValue(remote);
  mount();
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Phục hồi bản nháp 1 của câu 1",
    }),
  );
  await screen.findByText(/Bản nháp đã hết hạn hoặc phiên bản máy chủ đã khác/);
  expect(api.mock.calls.some(([, method]) => method === "PUT")).toBe(false);
  expect(
    (
      screen.getByRole("button", {
        name: "Phục hồi bản nháp 1 của câu 1",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(storedDrafts()[0].answer.selectedOptionIds).toEqual(["a"]);
});

it("a terminal server response during recovery preserves copyable content but cannot submit or restore", async () => {
  seedDraft();
  api
    .mockResolvedValueOnce(state)
    .mockResolvedValue({ ...remote, status: "GRADED" });
  mount();
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Phục hồi bản nháp 1 của câu 1",
    }),
  );
  await screen.findByRole("heading", { name: "Bản nháp của lượt thi đã khóa" });
  expect(
    (screen.getByLabelText(/Bản nháp 1 — Câu 1/) as HTMLTextAreaElement)
      .readOnly,
  ).toBe(true);
  expect(screen.queryByRole("button", { name: "Nộp bài" })).toBeNull();
  expect(
    api.mock.calls.some(([, method]) => method === "PUT" || method === "POST"),
  ).toBe(false);
  fireEvent.click(
    screen.getByRole("button", { name: "Đã xem, xóa bản nháp trên thiết bị" }),
  );
  expect(storedDrafts()).toHaveLength(0);
});

it("a committed answer with missing ACK is recognized as synchronized without a duplicate write", async () => {
  seedDraft(["b"]);
  api.mockResolvedValue(remote);
  mount();
  await screen.findByRole("radio", { name: "Beta" });
  expect(
    screen.queryByRole("heading", { name: "Kiểm tra bản nháp trên thiết bị" }),
  ).toBeNull();
  expect(api.mock.calls).toHaveLength(1);
  expect(storedDrafts()).toHaveLength(0);
});

it("persists before debounce and survives remount while an older request's ACK arrives", async () => {
  const first = deferred<{ savedAt: string }>();
  api.mockImplementation((_path: string, method = "GET") =>
    method === "PUT" ? first.promise : Promise.resolve(state),
  );
  mount();
  fireEvent.click(await screen.findByRole("radio", { name: "Alpha" }));
  expect(storedDrafts()[0].answer.selectedOptionIds).toEqual(["a"]);
  await waitFor(
    () =>
      expect(api.mock.calls.some(([, method]) => method === "PUT")).toBe(true),
    { timeout: 2000 },
  );
  fireEvent.click(screen.getByRole("radio", { name: "Beta" }));
  expect(storedDrafts()[0].answer.selectedOptionIds).toEqual(["b"]);
  cleanup();
  const before = storedDrafts();
  // A real GET after reload has a newer server clock than the previous local edit.
  api.mockImplementation((_path: string, method = "GET") =>
    method === "PUT"
      ? first.promise
      : Promise.resolve({ ...state, serverNow: "2026-10-22T00:00:10.000Z" }),
  );
  mount();
  await screen.findByRole("heading", {
    name: "Kiểm tra bản nháp trên thiết bị",
  });
  await act(async () => first.resolve({ savedAt }));
  expect(storedDrafts()).toEqual(before);
  expect(
    (screen.getByLabelText(/Bản nháp 1 — Câu 1/) as HTMLTextAreaElement).value,
  ).toBe("Beta");
});

it("old ACK retains the newer draft and its rebased revision while the next PUT is pending", async () => {
  const first = deferred<{ savedAt: string }>(),
    second = deferred<{ savedAt: string }>();
  let writes = 0;
  api.mockImplementation((_path: string, method = "GET") =>
    method === "PUT"
      ? ++writes === 1
        ? first.promise
        : second.promise
      : Promise.resolve(state),
  );
  mount();
  fireEvent.click(await screen.findByRole("radio", { name: "Alpha" }));
  await waitFor(() => expect(writes).toBe(1), { timeout: 2000 });
  fireEvent.click(screen.getByRole("radio", { name: "Beta" }));
  await act(async () => first.resolve({ savedAt }));
  await waitFor(() => expect(writes).toBe(2));
  expect(storedDrafts()).toHaveLength(1);
  expect(storedDrafts()[0]).toMatchObject({
    answer: { selectedOptionIds: ["b"] },
    baseSavedAt: savedAt,
  });
  expect(
    api.mock.calls.filter(([, method]) => method === "PUT")[1]![2],
  ).toMatchObject({ expectedSavedAt: savedAt });
  await act(async () =>
    second.resolve({ savedAt: "2026-10-22T00:00:03.000Z" }),
  );
  await waitFor(() => expect(storedDrafts()).toHaveLength(0));
});

it("storage failure keeps P1 autosave and explicitly reports the reload limitation", async () => {
  api.mockImplementation(async (_path: string, method = "GET") =>
    method === "PUT" ? { savedAt } : state,
  );
  mount();
  await screen.findByRole("radio", { name: "Alpha" });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Full", "QuotaExceededError");
  });
  fireEvent.click(screen.getByRole("radio", { name: "Alpha" }));
  await screen.findByText(/Không thể bảo đảm lưu hoặc dọn bản nháp/);
  await waitFor(
    () => expect(screen.getByRole("status").textContent).toBe("Đã lưu"),
    { timeout: 2000 },
  );
  expect(api.mock.calls.filter(([, method]) => method === "PUT")).toHaveLength(
    1,
  );
});

it("session expiry preserves the draft, fences a late ACK and requires confirmation after reauthentication", async () => {
  const first = deferred<{ savedAt: string }>();
  api.mockImplementation((_path: string, method = "GET") =>
    method === "PUT" ? first.promise : Promise.resolve(state),
  );
  mount();
  fireEvent.click(await screen.findByRole("radio", { name: "Alpha" }));
  await waitFor(
    () =>
      expect(api.mock.calls.some(([, method]) => method === "PUT")).toBe(true),
    { timeout: 2000 },
  );
  await act(async () => endSession());
  const before = storedDrafts();
  cleanup();
  beginSession();
  api.mockImplementation((_path: string, method = "GET") =>
    method === "PUT"
      ? first.promise
      : Promise.resolve({ ...state, serverNow: "2026-10-22T00:00:10.000Z" }),
  );
  mount();
  await screen.findByRole("heading", {
    name: "Kiểm tra bản nháp trên thiết bị",
  });
  await act(async () => first.resolve({ savedAt }));
  expect(storedDrafts()).toEqual(before);
  expect(api.mock.calls.filter(([, method]) => method === "PUT")).toHaveLength(
    1,
  );
});

it("a different authenticated account never sees or restores the previous account's draft", async () => {
  const original = seedDraft().latest.get("question")!;
  identity.user = { id: "other-student", role: "STUDENT" };
  api.mockResolvedValue(state);
  mount();
  await screen.findByRole("radio", { name: "Alpha" });
  expect(
    screen.queryByRole("heading", { name: "Kiểm tra bản nháp trên thiết bị" }),
  ).toBeNull();
  expect(JSON.parse(localStorage.getItem(draftKey(original))!)).toEqual(
    original,
  );
});

it("an expired draft is discarded without a recovery PUT", async () => {
  const s = seedDraft(),
    original = s.latest.get("question")!;
  localStorage.setItem(
    draftKey(original),
    JSON.stringify({
      ...original,
      editedAt: Date.parse(state.serverNow) - DRAFT_TTL,
    }),
  );
  api.mockResolvedValue(state);
  mount();
  await screen.findByText(/không hợp lệ hoặc quá 24 giờ/);
  expect(storedDrafts()).toHaveLength(0);
  expect(api.mock.calls.some(([, method]) => method === "PUT")).toBe(false);
});

it.each(["logout", "expired"] as const)(
  "AuthProvider %s applies the approved draft retention policy",
  async (reason) => {
    const a = seedDraft();
    new AttemptDraftStore(
      { userId: "other", examId: "exam", attemptId: "attempt" },
      () => localStorage,
      () => Date.parse(state.serverNow),
    ).put("question", { selectedOptionIds: ["a"], answerText: "" }, null);
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    cache.setQueryData(["me"], identity.user);
    api.mockResolvedValue(identity.user);
    render(
      <QueryClientProvider client={cache}>
        <AuthProvider>
          <p>Authenticated child</p>
        </AuthProvider>
      </QueryClientProvider>,
    );
    await act(async () => endSession(reason));
    const records = storedDrafts();
    expect(records.some((r) => r.userId === "other")).toBe(true);
    expect(records.some((r) => r.userId === "student")).toBe(
      reason === "expired",
    );
    if (reason === "expired") {
      await screen.findByRole("heading", {
        name: "Phiên đăng nhập đã kết thúc",
      });
      expect(records.some((r) => r.writerId === a.writerId)).toBe(true);
    }
  },
);

it.each(["", "x".repeat(50000)])(
  "essay recovery preserves empty/long content in the actual queue (%#. case)",
  async (answerText) => {
    const essay: AttemptDto = {
      ...state,
      questions: [
        {
          ...state.questions[0]!,
          type: "ESSAY",
          options: [],
          answer: { selectedOptionIds: [], answerText: "Server text", savedAt },
        },
      ],
    };
    const s = new AttemptDraftStore(
      { userId: "student", examId: state.examId, attemptId: state.id },
      () => localStorage,
      () => Date.parse(state.serverNow),
    );
    s.put("question", { selectedOptionIds: [], answerText }, savedAt);
    api.mockImplementation(async (_path: string, method = "GET") =>
      method === "PUT" ? { savedAt: "2026-10-22T00:00:03.000Z" } : essay,
    );
    mount();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Phục hồi bản nháp 1 của câu 1",
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Đã lưu"),
    );
    expect(api).toHaveBeenCalledWith(
      "/student/attempts/attempt/answers/question",
      "PUT",
      { selectedOptionIds: [], answerText, expectedSavedAt: savedAt },
    );
    expect(
      (screen.getByLabelText("Bài làm tự luận") as HTMLTextAreaElement).value,
    ).toBe(answerText);
    expect(storedDrafts()).toHaveLength(0);
  },
);

it("security-denied local storage leaves P1 editing, autosave and the unsaved guard usable", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("Denied", "SecurityError");
  });
  const saving = deferred<{ savedAt: string }>();
  api.mockImplementation((_path: string, method = "GET") =>
    method === "PUT" ? saving.promise : Promise.resolve(state),
  );
  mount();
  fireEvent.click(await screen.findByRole("radio", { name: "Alpha" }));
  await screen.findByText(/Không thể bảo đảm lưu hoặc dọn bản nháp/);
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  await waitFor(
    () =>
      expect(api.mock.calls.some(([, method]) => method === "PUT")).toBe(true),
    { timeout: 2000 },
  );
  await act(async () => saving.resolve({ savedAt }));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe("Đã lưu"),
  );
});
