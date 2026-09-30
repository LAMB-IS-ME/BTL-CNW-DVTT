import { useState, useEffect, useRef, type ReactNode } from "react";
export function ErrorBox({ error }: { error: unknown }) {
  return error ? (
    <p role="alert" className="error">
      {error instanceof Error ? error.message : String(error)}
    </p>
  ) : null;
}
export function Loading() {
  return <p role="status">Đang tải…</p>;
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function ConfirmButton({
  children,
  onConfirm,
}: {
  children: ReactNode;
  onConfirm: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <>
      <button
        type="button"
        className="danger"
        onClick={() => {
          setError(undefined);
          setOpen(true);
        }}
      >
        {children}
      </button>
      <dialog
        ref={dialog}
        className="confirm-dialog"
        aria-label="Xác nhận thao tác"
        onCancel={() => setOpen(false)}
      >
        <h2>Xác nhận thao tác</h2>
        <p>Bạn có chắc muốn {children}?</p>
        <ErrorBox error={error} />
        <div className="actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              onConfirm()
                .then(() => setOpen(false))
                .catch(setError)
                .finally(() => setBusy(false));
            }}
          >
            Xác nhận
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            Hủy
          </button>
        </div>
      </dialog>
    </>
  );
}
export function Pager({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="actions">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Trước
      </button>
      <span>
        Trang {page} · {total} kết quả
      </span>
      <button
        type="button"
        disabled={page * 20 >= total}
        onClick={() => onChange(page + 1)}
      >
        Sau
      </button>
    </div>
  );
}
