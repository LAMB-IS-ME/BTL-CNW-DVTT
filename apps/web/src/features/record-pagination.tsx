import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { ErrorBox } from "../components/ui";

export function RecordRetry({
  error,
  busy,
  retry,
}: {
  error: unknown;
  busy: boolean;
  retry: () => unknown;
}) {
  if (!error) return null;
  return (
    <div className="record-retry">
      <ErrorBox error={error} />
      <button
        className="secondary"
        disabled={busy}
        onClick={() => void retry()}
      >
        Thử lại
      </button>
    </div>
  );
}

// These existing endpoints return arrays, without a total. Look ahead using
// the same page size so an exact multiple does not advertise an empty page.
export function useRecordPage<T>(key: string[], path: string, enabled = true) {
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get("page") || 1);
  const page = Number.isSafeInteger(raw) && raw > 0 ? raw : 1;
  const options = (n: number) => ({
    queryKey: [...key, n],
    queryFn: () => api<T[]>(`${path}?page=${n}&pageSize=20`),
    staleTime: 0,
  });
  const query = useQuery({ ...options(page), enabled });
  const next = useQuery({
    ...options(page + 1),
    enabled: enabled && query.data?.length === 20,
  });
  const setPage = (n: number) =>
    setParams((old) => {
      const updated = new URLSearchParams(old);
      updated.set("page", String(n));
      return updated;
    });
  return {
    query,
    page,
    setPage,
    next,
    hasNext: query.data?.length === 20 && !!next.data?.length,
  };
}

export function RecordPager({
  page,
  setPage,
  hasNext,
  nextError,
  checking,
  retry,
}: {
  page: number;
  setPage: (n: number) => void;
  hasNext: boolean;
  nextError: unknown;
  checking: boolean;
  retry: () => unknown;
}) {
  return (
    <>
      <nav className="record-pager" aria-label="Phân trang">
        <button
          className="secondary"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          Trang trước
        </button>
        <span role="status">
          Trang {page}
          {checking ? " · Đang kiểm tra trang sau…" : ""}
        </span>
        <button
          className="secondary"
          disabled={!hasNext || checking}
          onClick={() => setPage(page + 1)}
        >
          Trang sau
        </button>
      </nav>
      <RecordRetry error={nextError} busy={checking} retry={retry} />
    </>
  );
}
