import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { UserDto } from "@exam/shared";

const menus = {
  ADMIN: [
    ["/admin", "Tổng quan"],
    ["/admin/users", "Tài khoản"],
    ["/admin/classes", "Lớp học"],
  ],
  TEACHER: [
    ["/teacher", "Tổng quan"],
    ["/teacher/classes", "Lớp học"],
    ["/teacher/question-banks", "Câu hỏi"],
    ["/teacher/exams", "Bài thi"],
    ["/teacher/quizzes", "Live Quiz"],
  ],
  STUDENT: [
    ["/student", "Tổng quan"],
    ["/student/exams", "Bài thi"],
    ["/student/results", "Kết quả"],
    ["/student/quiz/join", "Live Quiz"],
  ],
} as const;
const roles = {
  ADMIN: "Quản trị viên",
  TEACHER: "Giảng viên",
  STUDENT: "Sinh viên",
};
const labels = {
  ADMIN: "Điều hướng quản trị",
  TEACHER: "Điều hướng giảng viên",
  STUDENT: "Điều hướng sinh viên",
};

export function MobileNavigation({
  user,
  collapseAt,
  onLogout,
}: {
  user: Pick<UserDto, "role" | "fullName">;
  collapseAt: number;
  onLogout: () => Promise<void>;
}) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // CSS can hide the focused control before the media-query event fires.
  const focusedWithin = useRef(false);

  // Close only after the router changes location: existing dirty-state guards
  // can cancel a link without losing their visible focus-return target.
  useLayoutEffect(() => {
    if (panel.current?.contains(document.activeElement))
      document.getElementById("main-content")?.focus({ preventScroll: true });
    setOpen(false);
  }, [location.key]);

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${collapseAt}px)`);
    const resize = () => {
      const inside =
        focusedWithin.current || root.current?.contains(document.activeElement);
      setOpen(false);
      if (inside) {
        if (media.matches) toggle.current?.focus({ preventScroll: true });
        else
          document
            .getElementById("main-content")
            ?.focus({ preventScroll: true });
      }
    };
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, [collapseAt]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        root.current?.contains(target) ||
        target.closest('dialog, [role="dialog"]')
      )
        return;
      if (panel.current?.contains(document.activeElement))
        toggle.current?.focus({ preventScroll: true });
      setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const active = (path: string) => {
    const current = location.pathname.replace(/\/+$/, "") || "/";
    return (
      current === path ||
      (path.split("/").length > 2 && current.startsWith(`${path}/`)) ||
      (path === "/teacher/question-banks" &&
        current.startsWith("/teacher/questions/")) ||
      (path === "/teacher/quizzes" &&
        current.startsWith("/teacher/quiz-rooms/")) ||
      (path === "/student/exams" && current.startsWith("/student/attempts/")) ||
      (path === "/student/quiz/join" && current.startsWith("/student/quiz/"))
    );
  };

  return (
    <div
      ref={root}
      className="app-mobile-navigation"
      onFocusCapture={() => {
        focusedWithin.current = true;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          toggle.current?.focus({ preventScroll: true });
        }
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Element && !event.currentTarget.contains(next))
          focusedWithin.current = false;
        if (
          next instanceof Element &&
          !event.currentTarget.contains(next) &&
          !next.closest('dialog, [role="dialog"]')
        )
          setOpen(false);
      }}
    >
      <header className="app-mobile-bar">
        <Link className="app-mobile-brand" to={`/${user.role.toLowerCase()}`}>
          <span aria-hidden="true">▦</span> ExamSpace
        </Link>
        <button
          type="button"
          ref={toggle}
          className="secondary app-mobile-toggle"
          aria-expanded={open}
          aria-controls="mobile-navigation-panel"
          onClick={() => setOpen(!open)}
        >
          {open ? "Đóng" : "Menu"}
        </button>
      </header>
      <div
        id="mobile-navigation-panel"
        className="app-mobile-panel"
        ref={panel}
        hidden={!open}
      >
        <nav aria-label={labels[user.role]}>
          {menus[user.role].map(([path, label]) => (
            <Link
              key={path}
              to={path}
              aria-current={active(path) ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="app-mobile-account">
          <span>
            <strong>{user.fullName}</strong>
            {!(
              user.role === "ADMIN" && user.fullName.trim() === roles.ADMIN
            ) && <small>{roles[user.role]}</small>}
          </span>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setOpen(false);
              toggle.current?.focus({ preventScroll: true });
              void onLogout();
            }}
          >
            Đăng xuất
          </button>
        </div>
      </div>
    </div>
  );
}
