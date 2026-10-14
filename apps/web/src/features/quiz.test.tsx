// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { QuizState, SocketAck } from "@exam/shared";
import { QuizRoom } from "./quiz";

const mock = vi.hoisted(() => ({
  listeners: new Map<string, (value?: unknown) => void>(),
  join: undefined as SocketAck<QuizState> | undefined,
  emitWithAck: vi.fn(),
}));
vi.mock("../lib/socket", () => ({
  connectSocket: () => ({
    on: (event: string, fn: (value?: unknown) => void) =>
      mock.listeners.set(event, fn),
    emit: (event: string, _: unknown, ack: SocketAck<QuizState>) => {
      if (event === "quiz:room:join") mock.join = ack;
    },
    connect: () => {},
    disconnect: () => {},
    removeAllListeners: () => mock.listeners.clear(),
    timeout: () => ({ emitWithAck: mock.emitWithAck }),
  }),
}));
const state = (): QuizState => ({
  roomId: "room",
  code: "123456",
  title: "Session & HTTP",
  status: "LIVE",
  currentIndex: 0,
  total: 2,
  serverNow: new Date().toISOString(),
  closesAt: new Date(Date.now() + 60000).toISOString(),
  participants: [],
  question: {
    id: "q1",
    type: "SINGLE_CHOICE",
    promptMarkdown: "Chọn phương thức",
    points: 1000,
    options: [
      { id: "a", contentMarkdown: "GET" },
      { id: "b", contentMarkdown: "POST" },
    ],
  },
  reveal: null,
  leaderboard: [],
  ownAnswer: null,
});
function mount(host = false) {
  render(
    <MemoryRouter initialEntries={["/student/quiz/room/lobby"]}>
      <Routes>
        <Route
          path="/student/quiz/:id/lobby"
          element={<QuizRoom host={host} />}
        />
      </Routes>
    </MemoryRouter>,
  );
  act(() => mock.listeners.get("connect")?.());
}
beforeEach(() => {
  mock.join = undefined;
  mock.emitWithAck.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("uses the snapshot receipt time immediately instead of briefly adding a second before the next UI tick", () => {
  vi.useFakeTimers();
  mount();
  act(() => vi.advanceTimersByTime(100));
  act(() => mock.join?.({ data: state() }));
  expect(screen.queryByText("00:01:01")).toBeNull();
  expect(screen.getByText("00:01:00")).toBeTruthy();
});

it("does not claim online room membership while the join acknowledgement is pending or rejected", () => {
  mount();
  expect(screen.queryByText(/Trực tuyến/)).toBeNull();
  act(() =>
    mock.join?.({
      error: {
        code: "QUIZ_ROOM_NOT_JOINABLE",
        message: "Phòng không cho phép tham gia.",
      },
    }),
  );
  expect(screen.queryByText(/Trực tuyến/)).toBeNull();
  expect(screen.getByRole("alert").textContent).toContain(
    "Phòng không cho phép tham gia.",
  );
});

it("preserves unsubmitted selection across duplicate and participant snapshots and restores server answers", () => {
  mount();
  const s = state();
  act(() => mock.join?.({ data: s }));
  fireEvent.click(screen.getByRole("radio", { name: "POST" }));
  act(() =>
    mock.listeners.get("quiz:state")?.({
      ...s,
      participants: [{ id: "p", fullName: "An", isConnected: true }],
    }),
  );
  act(() => mock.listeners.get("quiz:state")?.({ ...s }));
  expect(
    (screen.getByRole("radio", { name: "POST" }) as HTMLInputElement).checked,
  ).toBe(true);
  act(() => mock.listeners.get("quiz:state")?.({ ...s, ownAnswer: ["a"] }));
  expect(
    (screen.getByRole("radio", { name: "GET" }) as HTMLInputElement).checked,
  ).toBe(true);
  expect(
    (screen.getByRole("radio", { name: "GET" }) as HTMLInputElement).disabled,
  ).toBe(true);
  act(() =>
    mock.listeners.get("quiz:state")?.({
      ...s,
      currentIndex: 1,
      question: { ...s.question!, id: "q2" },
    }),
  );
  expect(
    (screen.getByRole("radio", { name: "GET" }) as HTMLInputElement).checked,
  ).toBe(false);
});

it("does not accept a delayed join acknowledgement after transport disconnect", () => {
  mount();
  const acknowledgeOldConnection = mock.join;
  act(() => mock.listeners.get("disconnect")?.());
  act(() => acknowledgeOldConnection?.({ data: state() }));
  expect(screen.queryByText(/Trực tuyến/)).toBeNull();
});

it.each(["accepted", "rejected"])(
  "ignores a delayed %s answer acknowledgement after the server advances the question",
  async (result) => {
    let finish!: (value: unknown) => void;
    mock.emitWithAck.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mount();
    const s = state();
    act(() => mock.join?.({ data: s }));
    fireEvent.click(screen.getByRole("radio", { name: "GET" }));
    fireEvent.click(screen.getByRole("button", { name: "Gửi câu trả lời" }));
    act(() =>
      mock.listeners.get("quiz:state")?.({
        ...s,
        currentIndex: 1,
        question: { ...s.question!, id: "q2" },
      }),
    );
    await act(async () =>
      finish(
        result === "accepted"
          ? { data: {} }
          : {
              error: { code: "QUIZ_CLOSED", message: "Câu trước đã đóng." },
            },
      ),
    );
    expect(screen.queryByText(/Đã nhận câu trả lời/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      (screen.getByRole("radio", { name: "GET" }) as HTMLInputElement).disabled,
    ).toBe(false);
    fireEvent.click(screen.getByRole("radio", { name: "POST" }));
    expect(
      (
        screen.getByRole("button", {
          name: "Gửi câu trả lời",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  },
);

it("keeps a recoverable answer error on the current question and allows a retry", async () => {
  mock.emitWithAck.mockResolvedValueOnce({
    error: { code: "TEMPORARY", message: "Chưa nhận được câu trả lời." },
  });
  mount();
  act(() => mock.join?.({ data: state() }));
  fireEvent.click(screen.getByRole("radio", { name: "GET" }));
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Gửi câu trả lời" })),
  );
  expect(screen.getByRole("alert").textContent).toContain(
    "Chưa nhận được câu trả lời.",
  );
  mock.emitWithAck.mockResolvedValueOnce({ data: {} });
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Gửi câu trả lời" })),
  );
  expect(screen.queryByRole("alert")).toBeNull();
  expect(
    screen.getByText("Đã nhận câu trả lời. Chờ công bố đáp án."),
  ).toBeTruthy();
});

it("times out a missing join acknowledgement and accepts only the retried connection", () => {
  vi.useFakeTimers();
  mount();
  const oldAck = mock.join;
  act(() => vi.advanceTimersByTime(8001));
  expect(screen.getByRole("alert").textContent).toContain(
    "Chưa nhận được xác nhận vào phòng",
  );
  act(() => oldAck?.({ data: state() }));
  expect(screen.queryByText(/Trực tuyến/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Kết nối lại" }));
  act(() => mock.listeners.get("connect")?.());
  act(() => mock.join?.({ data: state() }));
  expect(screen.getByText(/Trực tuyến/)).toBeTruthy();
  act(() => vi.advanceTimersByTime(8001));
  expect(screen.queryByRole("alert")).toBeNull();
});

it.each(["timeout", "rejected"])(
  "does not present a pending lobby after join %s with a received snapshot",
  (failure) => {
    vi.useFakeTimers();
    mount();
    const lobby = { ...state(), status: "LOBBY" as const, question: null };
    const oldAck = mock.join;
    act(() => mock.listeners.get("quiz:state")?.(lobby));
    expect(
      screen.getByRole("heading", { name: "Chờ xác nhận vào phòng…" }),
    ).toBeTruthy();
    if (failure === "timeout") act(() => vi.advanceTimersByTime(8001));
    else
      act(() =>
        mock.join?.({
          error: { code: "DENIED", message: "Phòng không cho phép tham gia." },
        }),
      );
    expect(
      screen.getByRole("heading", { name: "Chưa thể vào phòng" }),
    ).toBeTruthy();
    expect(screen.queryByText("Đang xác nhận tham gia")).toBeNull();
    expect(screen.queryByText("Chờ xác nhận vào phòng…")).toBeNull();
    expect(screen.queryByText("Bạn đã vào phòng")).toBeNull();
    if (failure === "timeout") {
      act(() => oldAck?.({ data: lobby }));
      expect(screen.queryByText("Bạn đã vào phòng")).toBeNull();
    }
    fireEvent.click(screen.getByRole("button", { name: "Kết nối lại" }));
    act(() => mock.listeners.get("connect")?.());
    expect(
      screen.getByRole("heading", { name: "Chờ xác nhận vào phòng…" }),
    ).toBeTruthy();
    expect(screen.queryByText("Chưa thể vào phòng")).toBeNull();
    act(() => mock.join?.({ data: lobby }));
    expect(screen.getByText("Bạn đã vào phòng")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  },
);

it("presents reconnecting separately from pending membership after a joined lobby disconnects", () => {
  mount();
  act(() =>
    mock.join?.({ data: { ...state(), status: "LOBBY", question: null } }),
  );
  act(() => mock.listeners.get("disconnect")?.());
  expect(
    screen.getByRole("heading", { name: "Đang kết nối lại…" }),
  ).toBeTruthy();
  expect(screen.queryByText("Bạn đã vào phòng")).toBeNull();
  expect(screen.queryByText("Đang xác nhận tham gia")).toBeNull();
});

it("does not show an acknowledgement timeout as failure after the server restores a persisted answer", async () => {
  let reject!: (error: Error) => void;
  mock.emitWithAck.mockImplementation(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  mount();
  const s = state();
  act(() => mock.join?.({ data: s }));
  fireEvent.click(screen.getByRole("radio", { name: "GET" }));
  fireEvent.click(screen.getByRole("button", { name: "Gửi câu trả lời" }));
  act(() => mock.listeners.get("quiz:state")?.({ ...s, ownAnswer: ["a"] }));
  await act(async () => reject(new Error("operation timed out")));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(
    screen.getByText("Đã nhận câu trả lời. Chờ công bố đáp án."),
  ).toBeTruthy();
});

it("clears a host command error on successful retry", async () => {
  mock.emitWithAck.mockResolvedValueOnce({
    error: { code: "TEMPORARY", message: "Chưa bắt đầu được." },
  });
  mount(true);
  act(() =>
    mock.join?.({
      data: {
        ...state(),
        status: "LOBBY",
        question: null,
        participants: [{ id: "p", fullName: "An", isConnected: true }],
      },
    }),
  );
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu Quiz" })),
  );
  expect(screen.getByRole("alert").textContent).toContain("Chưa bắt đầu được.");
  mock.emitWithAck.mockResolvedValueOnce({ data: state() });
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu Quiz" })),
  );
  expect(screen.queryByRole("alert")).toBeNull();
  expect(
    screen.getByRole("heading", { name: "Chọn phương thức" }),
  ).toBeTruthy();
});

it("does not regress to an older server question or remove a published reveal", () => {
  mount();
  const first = state();
  act(() => mock.join?.({ data: first }));
  const next = {
    ...first,
    currentIndex: 1,
    question: { ...first.question!, id: "q2", promptMarkdown: "Câu tiếp theo" },
  };
  act(() => mock.listeners.get("quiz:state")?.(next));
  fireEvent.click(screen.getByRole("radio", { name: "POST" }));
  act(() => mock.listeners.get("quiz:state")?.(first));
  expect(screen.getByRole("heading", { name: "Câu tiếp theo" })).toBeTruthy();
  expect(
    (screen.getByRole("radio", { name: "POST" }) as HTMLInputElement).checked,
  ).toBe(true);
  const closed = {
    ...next,
    reveal: {
      correctOptionIds: ["a"],
      explanationMarkdown: "Giải thích",
      answerCount: 1,
    },
    ownAnswer: ["b"],
  };
  act(() => mock.listeners.get("quiz:state")?.(closed));
  act(() => mock.listeners.get("quiz:state")?.(next));
  expect(screen.getByRole("heading", { name: "Đáp án đúng" })).toBeTruthy();
  expect(
    (screen.getByRole("radio", { name: "POST" }) as HTMLInputElement).disabled,
  ).toBe(true);
});

it("retains an immutable server-recorded answer when an older participant snapshot has ownAnswer null", () => {
  mount();
  const s = state();
  act(() => mock.join?.({ data: { ...s, ownAnswer: ["b"] } }));
  act(() =>
    mock.listeners.get("quiz:state")?.({
      ...s,
      participants: [{ id: "p", fullName: "An", isConnected: true }],
    }),
  );
  expect(
    (screen.getByRole("radio", { name: "POST" }) as HTMLInputElement).checked,
  ).toBe(true);
  expect(
    (screen.getByRole("radio", { name: "POST" }) as HTMLInputElement).disabled,
  ).toBe(true);
});

it("ignores an older same-question presence snapshot after the reconnect snapshot", () => {
  mount(true);
  const newer = {
    ...state(),
    serverNow: "2026-10-13T12:00:02.000Z",
    participants: [
      { id: "offline", fullName: "Offline Student", isConnected: false },
    ],
  };
  act(() => mock.join?.({ data: newer }));
  const older = {
    ...newer,
    serverNow: "2026-10-13T12:00:01.000Z",
    participants: [{ ...newer.participants[0]!, isConnected: true }],
  };
  act(() => mock.listeners.get("quiz:state")?.(older));
  expect(screen.getByText("Mất kết nối", { exact: true })).toBeTruthy();
  expect(screen.queryByText("Trực tuyến", { exact: true })).toBeNull();
});
