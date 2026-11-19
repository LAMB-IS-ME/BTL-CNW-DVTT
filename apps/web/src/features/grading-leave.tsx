import { useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";

export function GradingLeave({
  dirty,
  saving,
}: {
  dirty: boolean;
  saving: boolean;
}) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (dirty || saving) && currentLocation.pathname !== nextLocation.pathname,
  );
  const dialog = useRef<HTMLDialogElement>(null);
  const stay = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (blocker.state === "blocked" && !dirty && !saving) blocker.proceed();
  }, [blocker, dirty, saving]);
  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);
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
  return (
    <dialog
      ref={dialog}
      className="grading-leave"
      aria-labelledby="grading-leave-title"
      aria-describedby="grading-leave-description"
      onCancel={(event) => {
        event.preventDefault();
        blocker.reset?.();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>(
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
      <h2 id="grading-leave-title">Điểm và nhận xét chưa lưu</h2>
      <p id="grading-leave-description">
        {saving
          ? "Đang lưu điểm. Hãy đợi yêu cầu hoàn tất trước khi rời trang."
          : "Rời trang sẽ bỏ những thay đổi chưa lưu. Chọn ở lại để kiểm tra và dùng Lưu điểm."}
      </p>
      <div className="record-tools">
        <button ref={stay} onClick={() => blocker.reset?.()}>
          Ở lại chấm bài
        </button>
        <button
          className="secondary"
          disabled={saving}
          onClick={() => blocker.proceed?.()}
        >
          Rời trang, bỏ thay đổi
        </button>
      </div>
    </dialog>
  );
}
