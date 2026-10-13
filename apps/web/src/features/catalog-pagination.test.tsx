// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { api } from "../lib/api";
import { AuthProvider } from "./auth";
import {
  BankPicker,
  CatalogControls,
  CatalogPager,
  useCatalogPage,
} from "./catalog-pagination";
vi.mock("../lib/api", () => ({ api: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function Harness() {
  const paging = useCatalogPage<{ id: string; name: string }>(
    "classes",
    "/teacher/classes",
  );
  return (
    <>
      <CatalogControls paging={paging} label="Find classes" />
      {paging.items.map((c) => (
        <p key={c.id}>{c.name}</p>
      ))}
      <CatalogPager paging={paging} />
    </>
  );
}
function mount(component = <Harness />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 10000 } },
  });
  client.setQueryData(["me"], { id: "teacher-A", role: "TEACHER" });
  client.setQueryData(
    ["classes"],
    [{ id: "stale", name: "Wrong legacy cache" }],
  );
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>{component}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, client };
}
it.each([0, 1, 20, 22])(
  "uses bounded pages with correct controls for %i classes and ignores the legacy cache",
  async (total) => {
    vi.mocked(api).mockImplementation(async (path) => {
      const page = Number(
        new URL(path, "http://test").searchParams.get("page"),
      );
      return {
        items: Array.from(
          { length: Math.min(20, Math.max(0, total - (page - 1) * 20)) },
          (_, i) => ({
            id: String((page - 1) * 20 + i),
            name: `Class ${(page - 1) * 20 + i}`,
          }),
        ),
        total,
      };
    });
    mount();
    await screen.findByText(
      `Trang 1 / ${total > 20 ? 2 : 1} · ${total} kết quả`,
    );
    expect(screen.queryByText("Wrong legacy cache")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Trang sau" }) as HTMLButtonElement)
        .disabled,
    ).toBe(total <= 20);
    if (total > 20) {
      fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
      await screen.findByText("Class 21");
      expect(screen.queryByText("Class 0")).toBeNull();
      expect(
        (screen.getByRole("button", { name: "Trang sau" }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    }
    expect(
      vi.mocked(api).mock.calls.every(([path]) => path.includes("pageSize=20")),
    ).toBe(true);
  },
);
it("debounces search and refuses late old results", async () => {
  let oldResolve: (value: unknown) => void = () => {};
  vi.mocked(api).mockImplementation((path) =>
    path.includes("search=old")
      ? new Promise((resolve) => {
          oldResolve = resolve;
        })
      : Promise.resolve({
          items: [
            {
              id: path,
              name: path.includes("search=new") ? "New class" : "Initial class",
            },
          ],
          total: 1,
        }),
  );
  mount();
  await screen.findByText("Initial class");
  fireEvent.change(screen.getByLabelText("Find classes"), {
    target: { value: "old" },
  });
  await waitFor(() =>
    expect(
      vi.mocked(api).mock.calls.some(([p]) => p.includes("search=old")),
    ).toBe(true),
  );
  fireEvent.change(screen.getByLabelText("Find classes"), {
    target: { value: "n" },
  });
  fireEvent.change(screen.getByLabelText("Find classes"), {
    target: { value: "ne" },
  });
  fireEvent.change(screen.getByLabelText("Find classes"), {
    target: { value: "new" },
  });
  await screen.findByText("New class");
  oldResolve({ items: [{ id: "old", name: "Late old class" }], total: 1 });
  await waitFor(() => expect(screen.queryByText("Late old class")).toBeNull());
  expect(api).toHaveBeenCalledTimes(3);
});
it("corrects a page invalidated by mutation and isolates a changed user's query", async () => {
  let total = 21;
  vi.mocked(api).mockImplementation(async (path) => ({
    items:
      path.includes("page=2") && total === 20
        ? []
        : [{ id: "one", name: "Row" }],
    total,
  }));
  const { client } = mount();
  await screen.findByText("Trang 1 / 2 · 21 kết quả");
  fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
  await screen.findByText("Trang 2 / 2 · 21 kết quả");
  total = 20;
  await client.invalidateQueries({ queryKey: ["classes"] });
  await screen.findByText("Trang 1 / 1 · 20 kết quả");
  client.setQueryData(["me"], { id: "teacher-B", role: "TEACHER" });
  await waitFor(() =>
    expect(
      client
        .getQueryCache()
        .findAll({ queryKey: ["classes", "page", "teacher-B"] }),
    ).toHaveLength(1),
  );
});
it("shows retry and retains an off-page bank selection by identity", async () => {
  const changed = vi.fn();
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === "/teacher/question-banks/chosen")
      return { id: "chosen", title: "Selected later bank" };
    throw new Error("Temporary provider error");
  });
  mount(<BankPicker value="chosen" onChange={changed} />);
  await screen.findByText("Selected later bank");
  await screen.findByRole("alert");
  expect((screen.getByLabelText("Ngân hàng") as HTMLSelectElement).value).toBe(
    "chosen",
  );
  vi.mocked(api).mockResolvedValue({
    items: [{ id: "other", title: "Other bank" }],
    total: 1,
  });
  fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
  await screen.findByText("Other bank");
  expect(changed).not.toHaveBeenCalled();
});
