import { NavLink, Link } from "react-router-dom";
const paths = [
  [
    "/teacher",
    "Tổng quan",
    "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  ],
  [
    "/teacher/classes",
    "Lớp học",
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  ],
  [
    "/teacher/question-banks",
    "Câu hỏi",
    "M4 3h12l4 4v14H4zM8 11h8M8 15h8M8 7h4",
  ],
  ["/teacher/exams", "Bài thi", "M8 3h8v4H8zM8 5H4v16h16V5h-4M8 12h8M8 16h5"],
  ["/teacher/quizzes", "Live Quiz", "m13 2-9 12h7l-1 8 10-13h-7z"],
];
export function BankSidebar() {
  return (
    <aside className="qb-sidebar">
      <Link className="qb-brand" to="/teacher">
        <span className="qb-brand-mark" aria-hidden="true">
          E
        </span>
        ExamSpace<span className="qb-brand-dot">.</span>
      </Link>
      <p className="qb-sidebar-label">KHÔNG GIAN GIẢNG VIÊN</p>
      <nav aria-label="Điều hướng giảng viên">
        {paths.map(([path, label, shape]) => (
          <NavLink
            key={path}
            to={path!}
            end={path === "/teacher"}
            className={({ isActive }) =>
              isActive || label === "Câu hỏi" ? "qb-nav-active" : ""
            }
          >
            <svg
              viewBox="0 0 24 24"
              width="19"
              height="19"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={shape} />
            </svg>
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="qb-sidebar-bottom">
        <span className="qb-sidebar-rule" />
        <strong>Kiến thức được kết nối.</strong>
        <p>Mỗi câu hỏi là một bước tiến trong học tập.</p>
        <span>QUESTION BANK · PILOT</span>
      </div>
    </aside>
  );
}
