import {
  cloneElement,
  useId,
  type ReactElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useBlocker } from "react-router-dom";
import { ApiFailure } from "../../lib/api";
export const typeLabels = {
  SINGLE_CHOICE: "Một đáp án",
  MULTIPLE_CHOICE: "Nhiều đáp án",
  TRUE_FALSE: "Đúng / Sai",
  ESSAY: "Tự luận",
};
export const difficultyLabels = {
  EASY: "Dễ",
  MEDIUM: "Trung bình",
  HARD: "Khó",
};
export function useDebounced(value: string, delay = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
export function ErrorNotice({
  error,
  retry,
  fallbackMessage = "Không thể hoàn tất yêu cầu. Kiểm tra kết nối và thử lại; nội dung đang soạn được giữ nguyên.",
}: {
  error: unknown;
  retry?: () => void;
  fallbackMessage?: string;
}) {
  if (!error) return null;
  const message =
    error instanceof ApiFailure &&
    error.status < 500 &&
    !/^[A-Z_]+$/.test(error.message)
      ? error.message
      : fallbackMessage;
  return (
    <div className="qb-error" role="alert">
      <p>{message}</p>
      {retry && (
        <button type="button" className="secondary" onClick={retry}>
          Thử lại
        </button>
      )}
    </div>
  );
}
export function Skeleton({ label = "Đang tải dữ liệu…" }: { label?: string }) {
  return (
    <div className="qb-loading" role="status">
      <span>{label}</span>
      <div aria-hidden="true" className="qb-skeleton" />
      <div aria-hidden="true" className="qb-skeleton" />
      <div aria-hidden="true" className="qb-skeleton" />
    </div>
  );
}
export function Status({ archived }: { archived: boolean }) {
  return (
    <span className={`qb-badge ${archived ? "archived" : "active"}`}>
      {archived ? "Đã lưu trữ" : "Đang dùng"}
    </span>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    node.showModal();
    node.querySelector<HTMLElement>("[data-dialog-focus]")?.focus();
    return () => {
      node.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="qb-dialog"
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const items = Array.from(
          e.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
          ),
        ).filter((node) => node.getClientRects().length > 0);
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="qb-dialog-heading">
        <h2>{title}</h2>
        <button
          type="button"
          className="qb-icon-button secondary"
          aria-label="Đóng hộp thoại"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function ConfirmAction({
  label,
  title,
  children,
  onConfirm,
  disabled = false,
  danger = true,
}: {
  label: string;
  title: string;
  children: ReactNode;
  onConfirm: () => Promise<void>;
  disabled?: boolean;
  danger?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        className={danger ? "qb-text-danger" : "secondary"}
        onClick={() => {
          setError(undefined);
          setOpen(true);
        }}
      >
        {label}
      </button>
      {open && (
        <Dialog title={title} busy={busy} onClose={() => setOpen(false)}>
          <div className="qb-dialog-body">
            {children}
            <ErrorNotice error={error} />
          </div>
          <div className="qb-dialog-actions">
            <button
              type="button"
              className="secondary"
              data-dialog-focus
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Hủy
            </button>
            <button
              type="button"
              className={danger ? "danger" : ""}
              disabled={busy}
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                try {
                  await onConfirm();
                  setOpen(false);
                } catch (e) {
                  setError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Đang xử lý…" : "Xác nhận"}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
export function DirtyGuard({
  dirty,
  busy = false,
}: {
  dirty: boolean;
  busy?: boolean;
}) {
  const blocker = useBlocker(dirty || busy);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty || busy) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, busy]);
  if (blocker.state !== "blocked") return null;
  return (
    <Dialog
      title="Rời trang soạn thảo?"
      busy={busy}
      onClose={() => blocker.reset()}
    >
      <p>
        {busy
          ? "Đang lưu, vui lòng chờ thao tác hoàn tất."
          : "Bạn có thay đổi chưa lưu. Rời trang sẽ bỏ các thay đổi này."}
      </p>
      <div className="qb-dialog-actions">
        <button
          type="button"
          className="secondary"
          data-dialog-focus
          onClick={() => blocker.reset()}
        >
          Tiếp tục soạn
        </button>
        <button
          type="button"
          className="danger"
          disabled={busy}
          onClick={() => blocker.proceed()}
        >
          Bỏ thay đổi
        </button>
      </div>
    </Dialog>
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
    <div className="qb-pagination">
      <span>
        {total
          ? `${(page - 1) * 20 + 1}–${Math.min(page * 20, total)} trong ${total}`
          : "0 kết quả"}
      </span>
      <div>
        <button
          type="button"
          className="secondary"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Trước
        </button>
        <span>Trang {page}</span>
        <button
          type="button"
          className="secondary"
          disabled={page * 20 >= total}
          onClick={() => onChange(page + 1)}
        >
          Sau
        </button>
      </div>
    </div>
  );
}
export function Menu({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  return (
    <details
      className="qb-menu"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.currentTarget.open = false;
          e.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label={`Thao tác ${name}`}>•••</summary>
      <div className="qb-menu-items">{children}</div>
    </details>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  );
}
