import { Link, useLocation } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
const paths = [
  ["/teacher", "Tổng quan", "overview"],
  ["/teacher/classes", "Lớp học", "people"],
  ["/teacher/question-banks", "Câu hỏi", "book"],
  ["/teacher/exams", "Bài thi", "exam"],
  ["/teacher/quizzes", "Live Quiz", "bolt"],
] satisfies [string, string, IconName][];
export function ApplicationSidebar() {
  const { pathname } = useLocation();
  return (
    <aside className="qb-sidebar">
      <Link className="qb-brand" to="/teacher">
        <span className="qb-brand-mark" aria-hidden="true">
          <Icon name="book" size={21} />
        </span>
        ExamSpace<span className="qb-brand-dot">.</span>
      </Link>
      <p className="qb-sidebar-label">KHÔNG GIAN GIẢNG VIÊN</p>
      <nav aria-label="Điều hướng giảng viên">
        {paths.map(([path, label, shape]) => {
          const active =
            pathname === path ||
            (path !== "/teacher" && pathname.startsWith(`${path}/`)) ||
            (shape === "book" && pathname.startsWith("/teacher/questions/"));
          return (
            <Link
              key={path}
              to={path}
              aria-current={active ? "page" : undefined}
              className={active ? "qb-nav-active" : ""}
            >
              <Icon name={shape} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="qb-sidebar-bottom">
        <span className="qb-sidebar-rule" />
        <strong>Kiến thức được kết nối.</strong>
        <p>Mỗi câu hỏi là một bước tiến trong học tập.</p>
        <span>EXAMSPACE · DẠY & HỌC</span>
      </div>
    </aside>
  );
}
