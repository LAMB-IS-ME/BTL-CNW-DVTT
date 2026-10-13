import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "./auth";
import { ErrorBox, Loading } from "../components/ui";
import "../styles/catalog-pagination.css";
export type PageData<T> = { items: T[]; total: number };
export function useCatalogPage<T>(
  prefix: string,
  path: string,
  syncUrl = false,
  status = "",
  enabled = true,
) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [local, setLocal] = useState({ search: "", page: 1 });
  const rawPage = Number(params.get("page") || 1);
  const state = syncUrl
    ? {
        search: params.get("search") || "",
        page: Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1,
      }
    : local;
  const [debounced, setDebounced] = useState(state.search);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(state.search), 250);
    return () => clearTimeout(timer);
  }, [state.search]);
  const setState = (next: typeof state) => {
    if (!syncUrl) {
      setLocal(next);
      return;
    }
    setParams(
      (old) => {
        const updated = new URLSearchParams(old);
        updated.set("page", String(next.page));
        if (next.search) updated.set("search", next.search);
        else updated.delete("search");
        return updated;
      },
      { replace: true },
    );
  };
  const waiting = state.search !== debounced;
  const query = useQuery({
    queryKey: [
      prefix,
      "page",
      user?.id,
      user?.role,
      path,
      status,
      debounced,
      state.page,
      20,
    ],
    queryFn: () =>
      api<PageData<T>>(
        `${path}?view=manage&page=${state.page}&pageSize=20&search=${encodeURIComponent(debounced)}${status ? `&status=${status}` : ""}`,
      ),
    enabled: enabled && !waiting,
    staleTime: 0,
  });
  const last = Math.max(1, Math.ceil((query.data?.total || 0) / 20));
  useEffect(() => {
    if (!waiting && query.data && state.page > last)
      setState({ ...state, page: last });
    // Page correction follows successful responses only, never loading/errors.
  }, [query.data, state.page, last, waiting]);
  return {
    query,
    page: state.page,
    search: state.search,
    waiting,
    last,
    setPage: (page: number) => setState({ ...state, page }),
    setSearch: (search: string) => setState({ search, page: 1 }),
    items: waiting ? [] : query.data?.items || [],
  };
}
export function CatalogControls<T>({
  paging,
  label,
}: {
  paging: ReturnType<typeof useCatalogPage<T>>;
  label: string;
}) {
  return (
    <div className="catalog-controls">
      <label className="field">
        <span>{label}</span>
        <input
          value={paging.search}
          maxLength={200}
          onChange={(e) => paging.setSearch(e.target.value)}
        />
      </label>
      <ErrorBox error={paging.query.error} />
      {paging.query.error && (
        <button
          type="button"
          className="secondary"
          disabled={paging.query.isFetching}
          onClick={() => void paging.query.refetch()}
        >
          Thử lại
        </button>
      )}
      {(paging.query.isPending || paging.waiting) && <Loading />}
    </div>
  );
}
export function CatalogPager<T>({
  paging,
}: {
  paging: ReturnType<typeof useCatalogPage<T>>;
}) {
  const busy = paging.query.isFetching || paging.waiting;
  return (
    <nav className="catalog-pager" aria-label="Phân trang">
      <button
        type="button"
        className="secondary"
        disabled={paging.page <= 1 || busy}
        onClick={() => paging.setPage(paging.page - 1)}
      >
        Trang trước
      </button>
      <span role="status">
        Trang {paging.page} / {paging.last} · {paging.query.data?.total ?? "…"}{" "}
        kết quả
      </span>
      <button
        type="button"
        className="secondary"
        disabled={paging.page >= paging.last || busy || !!paging.query.error}
        onClick={() => paging.setPage(paging.page + 1)}
      >
        Trang sau
      </button>
    </nav>
  );
}
export function BankPicker({
  value,
  onChange,
  label = "Ngân hàng",
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  const paging = useCatalogPage<{ id: string; title: string }>(
    "qb-banks",
    "/teacher/question-banks",
    false,
    "active",
  );
  const { user } = useAuth();
  const selected = useQuery({
    queryKey: ["qb-banks", "selected", user?.id, value],
    queryFn: () =>
      api<{ id: string; title: string; isArchived: boolean }>(
        `/teacher/question-banks/${value}`,
      ),
    enabled: !!value && !paging.items.some((b) => b.id === value),
    staleTime: 0,
  });
  return (
    <div className="catalog-selector">
      <CatalogControls paging={paging} label={`Tìm ${label.toLowerCase()}`} />
      <label className="field">
        <span>{label}</span>
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Chọn ngân hàng</option>
          {value && !paging.items.some((b) => b.id === value) && (
            <option value={value}>
              {selected.data?.title || `Ngân hàng đã chọn (${value})`}
              {selected.data?.isArchived ? " · Đã lưu trữ" : ""}
            </option>
          )}
          {paging.items.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
      </label>
      <ErrorBox error={selected.error} />
      <CatalogPager paging={paging} />
    </div>
  );
}
