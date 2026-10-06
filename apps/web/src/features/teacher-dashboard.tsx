import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "./auth";
import { Icon, type IconName } from "../components/Icon";
import { ErrorNotice, Skeleton } from "./question-bank/ui";
import type { Bank } from "./question-bank/banks";

export function TeacherDashboard() {
  const { user } = useAuth();
  const banks = useQuery({
    queryKey: ["qb-banks", "dashboard-recent"],
    queryFn: () =>
      api<{ items: Bank[]; total: number }>(
        "/teacher/question-banks?view=manage&status=active&sort=updated&pageSize=3",
      ),
  });
  return (
    <div className="teacher-dashboard">
      <div className="qb-page-heading">
        <div>
          <p className="qb-kicker">Cùng nhau khơi mở kiến thức</p>
          <h1>Không gian giảng viên</h1>
          <p>
            Chào {user?.fullName}. Bạn muốn chuẩn bị gì cho buổi học tiếp theo?
          </p>
        </div>
      </div>
      <section className="dashboard-welcome" aria-labelledby="welcome-title">
        <div>
          <span className="dashboard-eyebrow">
            <Icon name="book" size={16} /> Từ câu hỏi đến hiểu biết
          </span>
          <h2 id="welcome-title">
            Bài học hay bắt đầu
            <br />
            từ câu hỏi tốt.
          </h2>
          <p>
            Xây dựng thư viện của riêng bạn. Biên soạn một lần, kết nối kiến
            thức qua mỗi bài thi.
          </p>
          <Link className="button" to="/teacher/question-banks">
            Khám phá thư viện <Icon name="arrow" size={18} />
          </Link>
        </div>
        <svg
          className="dashboard-illustration"
          viewBox="0 0 330 230"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="181" cy="111" r="103" fill="#dedcf7" />
          <circle cx="54" cy="59" r="9" fill="#e9c979" />
          <circle cx="301" cy="172" r="5" fill="#9a96d9" />
          <rect
            x="97"
            y="33"
            width="148"
            height="179"
            rx="16"
            fill="#aba6e7"
            transform="rotate(-12 97 33)"
          />
          <rect
            x="132"
            y="13"
            width="148"
            height="179"
            rx="16"
            fill="#fff"
            transform="rotate(8 132 13)"
          />
          <path
            d="m155 48 74 10m-77 6 47 7"
            stroke="#5952a6"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <rect
            x="148"
            y="87"
            width="97"
            height="28"
            rx="8"
            fill="#eeedfc"
            transform="rotate(8 148 87)"
          />
          <path
            d="m158 102 4 5 8-8m12 9 47 6"
            stroke="#6057ba"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="m149 136 70 10m-74 12 53 7"
            stroke="#e2e2ed"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <circle cx="259" cy="176" r="28" fill="#4b47c9" />
          <path
            d="m247 175 8 8 16-18"
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M59 159v18m-9-9h18"
            stroke="#918acb"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </section>
      <div className="dashboard-grid">
        <section
          className="qb-surface dashboard-library"
          aria-labelledby="recent-title"
        >
          <div className="qb-section-title">
            <div>
              <p className="qb-kicker">Thư viện của bạn</p>
              <h2 id="recent-title">Tiếp tục biên soạn</h2>
            </div>
            <Link className="qb-text-link" to="/teacher/question-banks">
              Xem tất cả <Icon name="arrow" size={16} />
            </Link>
          </div>
          {banks.isPending ? (
            <Skeleton label="Đang tải thư viện…" />
          ) : banks.error ? (
            <ErrorNotice
              error={banks.error}
              retry={() => void banks.refetch()}
              fallbackMessage="Không thể tải thư viện. Kiểm tra kết nối và thử lại."
            />
          ) : banks.data?.items.length ? (
            <>
              <p className="dashboard-library-meta">
                {banks.data.total} ngân hàng đang dùng · Cập nhật gần đây
              </p>
              {banks.data.items.map((b) => (
                <Link
                  className="dashboard-bank"
                  to={`/teacher/question-banks/${b.id}`}
                  key={b.id}
                >
                  <span className="qb-book-icon">
                    <Icon name="book" size={23} />
                  </span>
                  <span>
                    <strong>{b.title}</strong>
                    <small>
                      {b.subject || "Chưa phân môn học"} ·{" "}
                      {b._count?.questions ?? 0} câu hỏi
                    </small>
                  </span>
                  <Icon name="arrow" size={18} />
                </Link>
              ))}
            </>
          ) : (
            <div className="qb-empty">
              <span className="qb-empty-symbol">
                <Icon name="book" size={26} />
              </span>
              <h3>Thư viện đang chờ ý tưởng đầu tiên</h3>
              <p>Tập hợp câu hỏi theo môn học để bắt đầu.</p>
              <Link className="button secondary" to="/teacher/question-banks">
                Tạo ngân hàng đầu tiên
              </Link>
            </div>
          )}
        </section>
        <section
          className="dashboard-workflow"
          aria-labelledby="workflow-title"
        >
          <p className="qb-kicker">Mỗi buổi học, một bước tiến</p>
          <h2 id="workflow-title">Không gian giảng dạy</h2>
          {(
            [
              ["classes", "Lớp học", "Kết nối với sinh viên của bạn", "people"],
              ["exams", "Bài thi", "Tổ chức, theo dõi và chấm bài", "exam"],
              ["quizzes", "Live Quiz", "Khơi gợi tương tác trong lớp", "bolt"],
            ] satisfies [string, string, string, IconName][]
          ).map(([path, title, desc, icon]) => (
            <Link
              className="dashboard-workflow-link"
              key={path}
              to={`/teacher/${path}`}
            >
              <span className={`dashboard-workflow-icon ${icon}`}>
                <Icon name={icon} />
              </span>
              <span>
                <strong>{title}</strong>
                <small>{desc}</small>
              </span>
              <Icon name="arrow" size={17} />
            </Link>
          ))}
        </section>
      </div>
      <div className="dashboard-note">
        <Icon name="check" size={20} />
        <p>
          <strong>Soạn hôm nay, sử dụng lâu dài.</strong> Câu hỏi trong thư viện
          có thể dùng lại cho bài thi và Live Quiz.
        </p>
      </div>
    </div>
  );
}
