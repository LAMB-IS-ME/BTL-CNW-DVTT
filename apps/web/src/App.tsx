import { lazy, Suspense, useState } from "react";
import { Loading, ErrorBox } from "./components/ui";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useNavigate,
} from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { AuthProvider, AuthForm, Guard, useAuth } from "./features/auth";
import { api } from "./lib/api";
const QuizList = lazy(() =>
  import("./features/quiz").then((m) => ({ default: m.QuizList })),
);
const QuizBuilder = lazy(() =>
  import("./features/quiz").then((m) => ({ default: m.QuizBuilder })),
);
const QuizJoin = lazy(() =>
  import("./features/quiz").then((m) => ({ default: m.QuizJoin })),
);
const QuizRoom = lazy(() =>
  import("./features/quiz").then((m) => ({ default: m.QuizRoom })),
);
const TeacherResults = lazy(() =>
  import("./features/analytics").then((m) => ({ default: m.TeacherResults })),
);
const ExamMonitor = lazy(() =>
  import("./features/results").then((m) => ({ default: m.ExamMonitor })),
);
const Grading = lazy(() =>
  import("./features/results").then((m) => ({ default: m.Grading })),
);
const StudentResults = lazy(() =>
  import("./features/results").then((m) => ({ default: m.StudentResults })),
);
const StudentExams = lazy(() =>
  import("./features/attempts").then((m) => ({ default: m.StudentExams })),
);
const StudentExam = lazy(() =>
  import("./features/attempts").then((m) => ({ default: m.StudentExam })),
);
const AttemptPage = lazy(() =>
  import("./features/attempts").then((m) => ({ default: m.AttemptPage })),
);
const TeacherExams = lazy(() =>
  import("./features/exams").then((m) => ({ default: m.TeacherExams })),
);
const ExamBuilder = lazy(() =>
  import("./features/exams").then((m) => ({ default: m.ExamBuilder })),
);
const CatalogList = lazy(() =>
  import("./features/catalog").then((m) => ({ default: m.CatalogList })),
);
const CatalogDetail = lazy(() =>
  import("./features/catalog").then((m) => ({ default: m.CatalogDetail })),
);
const QuestionEditor = lazy(() =>
  import("./features/catalog").then((m) => ({ default: m.QuestionEditor })),
);
const AdminUsers = lazy(() =>
  import("./features/admin").then((m) => ({ default: m.AdminUsers })),
);
const AdminOverview = lazy(() =>
  import("./features/admin").then((m) => ({ default: m.AdminOverview })),
);
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10000 } },
});
function Shell() {
  const { user } = useAuth();
  const [error, setError] = useState<unknown>();
  const nav = useNavigate(),
    cache = useQueryClient();
  return (
    <>
      <header>
        <Link className="brand" to="/">
          ▦ ExamSpace
        </Link>
        <nav>
          {user ? (
            <>
              <Link to={`/${user.role.toLowerCase()}`}>Tổng quan</Link>
              {user.role === "ADMIN" && (
                <>
                  <Link to="/admin/users">Tài khoản</Link>
                  <Link to="/admin/classes">Lớp học</Link>
                </>
              )}
              {user.role === "TEACHER" && (
                <>
                  <Link to="/teacher/classes">Lớp học</Link>
                  <Link to="/teacher/question-banks">Câu hỏi</Link>
                  <Link to="/teacher/exams">Bài thi</Link>
                  <Link to="/teacher/quizzes">Live Quiz</Link>
                </>
              )}
              {user.role === "STUDENT" && (
                <>
                  <Link to="/student/exams">Bài thi</Link>
                  <Link to="/student/results">Kết quả</Link>
                  <Link to="/student/quiz/join">Live Quiz</Link>
                </>
              )}
              <span>{user.fullName}</span>
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await api("/auth/logout", "POST");
                    cache.clear();
                    nav("/login");
                  } catch (e) {
                    setError(e);
                  }
                }}
              >
                Đăng xuất
              </button>
            </>
          ) : (
            <Link to="/login">Đăng nhập</Link>
          )}
        </nav>
      </header>
      <main>
        <ErrorBox error={error} />
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route
              path="/"
              element={
                <section className="hero">
                  <p className="eyebrow">HỌC TẬP CÓ ĐỊNH HƯỚNG</p>
                  <h1>
                    Kiểm tra kiến thức.
                    <br />
                    Khơi mở tiềm năng.
                  </h1>
                  <p>
                    Thi trực tuyến và Live Quiz trong một không gian học thuật.
                  </p>
                  <Link
                    className="button"
                    to={user ? `/${user.role.toLowerCase()}` : "/login"}
                  >
                    Vào không gian học tập →
                  </Link>
                </section>
              }
            />
            <Route path="/login" element={<AuthForm />} />
            <Route path="/register" element={<AuthForm register />} />
            <Route
              path="/admin"
              element={
                <Guard role="ADMIN">
                  <AdminOverview />
                </Guard>
              }
            />
            <Route
              path="/admin/users"
              element={
                <Guard role="ADMIN">
                  <AdminUsers />
                </Guard>
              }
            />
            <Route
              path="/admin/classes"
              element={
                <Guard role="ADMIN">
                  <AdminOverview classes />
                </Guard>
              }
            />
            <Route
              path="/teacher"
              element={
                <Guard role="TEACHER">
                  <>
                    <h1>Không gian giảng viên</h1>
                    <div className="grid">
                      {[
                        ["classes", "Lớp học", "Quản lý danh sách sinh viên"],
                        [
                          "question-banks",
                          "Ngân hàng câu hỏi",
                          "Soạn câu hỏi và tài nguyên",
                        ],
                        ["exams", "Bài thi", "Cấu hình, giám sát và chấm bài"],
                        [
                          "quizzes",
                          "Live Quiz",
                          "Hoạt động tương tác trên lớp",
                        ],
                      ].map(([path, title, desc]) => (
                        <Link
                          className="card"
                          key={path}
                          to={`/teacher/${path}`}
                        >
                          <h2>{title}</h2>
                          <p>{desc} →</p>
                        </Link>
                      ))}
                    </div>
                  </>
                </Guard>
              }
            />
            <Route
              path="/student"
              element={
                <Guard role="STUDENT">
                  <StudentExams />
                </Guard>
              }
            />
            <Route
              path="/teacher/classes"
              element={
                <Guard role="TEACHER">
                  <CatalogList />
                </Guard>
              }
            />
            <Route
              path="/teacher/classes/:id"
              element={
                <Guard role="TEACHER">
                  <CatalogDetail />
                </Guard>
              }
            />
            <Route
              path="/teacher/question-banks"
              element={
                <Guard role="TEACHER">
                  <CatalogList bank />
                </Guard>
              }
            />
            <Route
              path="/teacher/question-banks/:id"
              element={
                <Guard role="TEACHER">
                  <CatalogDetail bank />
                </Guard>
              }
            />
            <Route
              path="/teacher/question-banks/:id/new"
              element={
                <Guard role="TEACHER">
                  <QuestionEditor />
                </Guard>
              }
            />
            <Route
              path="/teacher/questions/:questionId/edit"
              element={
                <Guard role="TEACHER">
                  <QuestionEditor />
                </Guard>
              }
            />
            <Route
              path="/teacher/exams"
              element={
                <Guard role="TEACHER">
                  <TeacherExams />
                </Guard>
              }
            />
            <Route
              path="/teacher/exams/new"
              element={
                <Guard role="TEACHER">
                  <ExamBuilder />
                </Guard>
              }
            />
            <Route
              path="/teacher/exams/:id/edit"
              element={
                <Guard role="TEACHER">
                  <ExamBuilder />
                </Guard>
              }
            />
            <Route
              path="/teacher/exams/:id/preview"
              element={
                <Guard role="TEACHER">
                  <ExamBuilder preview />
                </Guard>
              }
            />
            <Route
              path="/student/exams"
              element={
                <Guard role="STUDENT">
                  <StudentExams />
                </Guard>
              }
            />
            <Route
              path="/student/exams/:id"
              element={
                <Guard role="STUDENT">
                  <StudentExam />
                </Guard>
              }
            />
            <Route
              path="/student/attempts/:id"
              element={
                <Guard role="STUDENT">
                  <AttemptPage />
                </Guard>
              }
            />
            <Route
              path="/teacher/exams/:id/monitor"
              element={
                <Guard role="TEACHER">
                  <ExamMonitor />
                </Guard>
              }
            />
            <Route
              path="/teacher/exams/:id/grading"
              element={
                <Guard role="TEACHER">
                  <Grading />
                </Guard>
              }
            />
            <Route
              path="/student/results"
              element={
                <Guard role="STUDENT">
                  <StudentResults />
                </Guard>
              }
            />
            <Route
              path="/student/results/:id"
              element={
                <Guard role="STUDENT">
                  <StudentResults />
                </Guard>
              }
            />
            <Route
              path="/teacher/exams/:id/results"
              element={
                <Guard role="TEACHER">
                  <TeacherResults />
                </Guard>
              }
            />
            <Route
              path="/teacher/quizzes"
              element={
                <Guard role="TEACHER">
                  <QuizList />
                </Guard>
              }
            />
            <Route
              path="/teacher/quizzes/new"
              element={
                <Guard role="TEACHER">
                  <QuizBuilder />
                </Guard>
              }
            />
            <Route
              path="/teacher/quizzes/:id/edit"
              element={
                <Guard role="TEACHER">
                  <QuizBuilder />
                </Guard>
              }
            />
            <Route
              path="/teacher/quiz-rooms/:id/host"
              element={
                <Guard role="TEACHER">
                  <QuizRoom host />
                </Guard>
              }
            />
            <Route
              path="/student/quiz/join"
              element={
                <Guard role="STUDENT">
                  <QuizJoin />
                </Guard>
              }
            />
            <Route
              path="/student/quiz/:id/:screen"
              element={
                <Guard role="STUDENT">
                  <QuizRoom />
                </Guard>
              }
            />
            <Route
              path="/403"
              element={<h1>Bạn không có quyền truy cập.</h1>}
            />
            <Route path="*" element={<h1>Không tìm thấy trang.</h1>} />
          </Routes>
        </Suspense>
      </main>
      <footer>ExamSpace · Online Examination & Live Quiz</footer>
    </>
  );
}
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
