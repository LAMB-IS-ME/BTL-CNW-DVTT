import { useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate } from "react-router-dom";

// Compare only persisted form values. Picker filters and builder steps are not edits.
export function useBuilderGuard(value: string) {
  const saved = useRef(value);
  const latest = useRef(value);
  latest.current = value;
  const pending = useRef(false);
  const [baseline, setBaseline] = useState(value);
  const [saving, setSaving] = useState(false);
  const dirty = value !== baseline;
  const navigate = useNavigate();
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname &&
      (pending.current || latest.current !== saved.current),
  );
  const currentBlocker = useRef(blocker);
  currentBlocker.current = blocker;
  const dialog = useRef<HTMLDialogElement>(null);
  const stay = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!pending.current && latest.current === saved.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => {
    if (blocker.state === "blocked" && !dirty && !saving) blocker.proceed();
  }, [blocker, dirty, saving]);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    const previous = document.activeElement as HTMLElement | null;
    const node = dialog.current!;
    node.showModal();
    stay.current?.focus();
    return () => {
      node.close();
      previous?.focus();
    };
  }, [blocker.state]);
  return {
    dirty,
    saving,
    beginSave() {
      if (pending.current) return false;
      pending.current = true;
      setSaving(true);
      return true;
    },
    markSaved(sent: string) {
      // Acknowledge only the request payload, never a newer edit on the page.
      saved.current = sent;
      setBaseline(sent);
    },
    finishSave(destination?: string) {
      pending.current = false;
      setSaving(false);
      if (
        destination &&
        latest.current === saved.current &&
        currentBlocker.current.state !== "blocked"
      )
        navigate(destination);
    },
    leave: (
      <dialog
        ref={dialog}
        className="confirm-dialog"
        aria-labelledby="builder-leave-title"
        onCancel={(event) => {
          event.preventDefault();
          blocker.reset?.();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const buttons =
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            );
          const first = buttons[0],
            last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <h2 id="builder-leave-title">Nội dung chưa lưu</h2>
        <p>
          {saving
            ? "Đang lưu. Hãy chờ thao tác hoàn tất trước khi rời trang."
            : "Rời trang sẽ bỏ những thay đổi chưa lưu. Bạn có thể ở lại để tiếp tục soạn và thử lưu lại."}
        </p>
        <div className="actions">
          <button ref={stay} type="button" onClick={() => blocker.reset?.()}>
            Tiếp tục soạn
          </button>
          <button
            type="button"
            className="secondary"
            disabled={saving}
            onClick={() => blocker.proceed?.()}
          >
            Rời trang, bỏ thay đổi
          </button>
        </div>
      </dialog>
    ),
  };
}
