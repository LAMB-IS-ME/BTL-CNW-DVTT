// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Markdown, QuestionImage } from "./Markdown";
import { AnswerControl } from "../features/attempts";

const mock = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  api: mock.api,
}));
const id = "00000000-0000-4000-8000-000000000101";
const content = `![Sơ đồ](asset:${id})`;
function mount(children: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    ...render(
      <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    ),
    client,
  };
}
beforeEach(() => {
  mock.api.mockReset();
});
afterEach(cleanup);

it("reports failed signing and retries only that asset; repeated failures remain recoverable", async () => {
  mock.api
    .mockRejectedValueOnce(new Error("503"))
    .mockRejectedValueOnce(new Error("503"))
    .mockResolvedValue({ url: "https://image.invalid/fresh-signature" });
  mount(<Markdown>{content}</Markdown>);
  await screen.findByRole("alert");
  for (let attempt = 0; attempt < 2; attempt++) {
    fireEvent.click(
      screen.getByRole("button", { name: "Thử tải lại ảnh: Sơ đồ" }),
    );
    if (attempt === 0)
      await waitFor(() => expect(mock.api).toHaveBeenCalledTimes(2));
    else await screen.findByRole("img", { name: "Sơ đồ" });
  }
  expect(mock.api.mock.calls.map(([path]) => path)).toEqual(
    Array(3).fill(`/assets/${id}`),
  );
  fireEvent.load(screen.getByRole("img"));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
});

it("renews a signed URL after image download/decode failure and shows loading until load", async () => {
  mock.api
    .mockResolvedValueOnce({ url: "https://image.invalid/expired?token=old" })
    .mockResolvedValueOnce({ url: "https://image.invalid/fresh?token=new" });
  mount(<Markdown>{content}</Markdown>);
  const old = await screen.findByRole("img");
  fireEvent.error(old);
  expect(screen.getByRole("alert").textContent).toContain(
    "Không thể tải ảnh: Sơ đồ",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Thử tải lại ảnh: Sơ đồ" }),
  );
  const fresh = await screen.findByRole("img");
  expect(fresh.getAttribute("src")).toBe(
    "https://image.invalid/fresh?token=new",
  );
  expect(screen.getByRole("status").textContent).toContain("Đang tải ảnh");
  fireEvent.load(fresh);
  expect(screen.queryByRole("status")).toBeNull();
});

it("reports a renewal API failure after an image error instead of silently reusing the old URL", async () => {
  mock.api
    .mockResolvedValueOnce({ url: "https://image.invalid/old" })
    .mockRejectedValue(new Error("503"));
  mount(<Markdown>{content}</Markdown>);
  fireEvent.error(await screen.findByRole("img"));
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(mock.api).toHaveBeenCalledTimes(2));
  await screen.findByRole("alert");
  expect(screen.queryByRole("img")).toBeNull();
});

it("retries a direct/blob image without altering its URL or submitting its parent form", () => {
  const submit = vi.fn((event) => event.preventDefault());
  mount(
    <form onSubmit={submit}>
      <QuestionImage src="blob:local-preview" alt="Ảnh đã chọn" />
    </form>,
  );
  const first = screen.getByRole("img");
  fireEvent.error(first);
  fireEvent.keyDown(screen.getByRole("button"), { key: " " });
  const retried = screen.getByRole("img");
  expect(retried).not.toBe(first);
  expect(retried.getAttribute("src")).toBe("blob:local-preview");
  expect(submit).not.toHaveBeenCalled();
  expect(mock.api).not.toHaveBeenCalled();
  fireEvent.load(retried);
  expect(screen.queryByRole("status")).toBeNull();
});

it("does not carry an image failure into a different question source", async () => {
  mock.api.mockResolvedValue({ url: "https://image.invalid/first" });
  const view = mount(<Markdown>{content}</Markdown>);
  fireEvent.error(await screen.findByRole("img"));
  view.rerender(
    <QueryClientProvider client={view.client}>
      <Markdown>{"![Khác](https://image.invalid/second)"}</Markdown>
    </QueryClientProvider>,
  );
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("img", { name: "Khác" }).getAttribute("src")).toBe(
    "https://image.invalid/second",
  );
});

it("retains the retry state when its parent rerenders unchanged Markdown", async () => {
  mock.api.mockResolvedValue({ url: "https://image.invalid/figure" });
  const view = mount(<Markdown>{content}</Markdown>);
  fireEvent.error(await screen.findByRole("img"));
  view.rerender(
    <QueryClientProvider client={view.client}>
      <Markdown>{content}</Markdown>
    </QueryClientProvider>,
  );
  expect(
    screen.getByRole("button", { name: "Thử tải lại ảnh: Sơ đồ" }),
  ).toBeTruthy();
  expect(mock.api).toHaveBeenCalledTimes(1);
});

it("keeps retry available in a disabled fieldset and never changes the selected answer", async () => {
  mock.api.mockResolvedValue({ url: "https://image.invalid/figure" });
  const change = vi.fn();
  mount(
    <fieldset disabled>
      <AnswerControl
        question={{
          id: "q",
          type: "SINGLE_CHOICE",
          promptMarkdown: "Question",
          points: 1,
          options: [
            { id: "a", contentMarkdown: content },
            { id: "b", contentMarkdown: "Đáp án đã chọn" },
          ],
        }}
        value={{ selectedOptionIds: ["b"], answerText: "" }}
        onChange={change}
      />
    </fieldset>,
  );
  fireEvent.error(await screen.findByRole("img"));
  fireEvent.click(
    screen.getByRole("button", { name: "Thử tải lại ảnh: Sơ đồ" }),
  );
  fireEvent.load(await screen.findByRole("img"));
  expect(
    (screen.getByRole("radio", { name: "Đáp án đã chọn" }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  expect(change).not.toHaveBeenCalled();
});
