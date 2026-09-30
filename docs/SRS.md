# SRS — ExamSpace

## 1. Giới thiệu

ExamSpace là website thi trực tuyến và Live Quiz cho bài tập lớn Công nghệ Web và Dịch vụ trực tuyến. Tài liệu mô tả Core đã triển khai trong `apps/api`, `apps/web`, `packages/shared`; nguồn phạm vi là [MASTER_SPEC](../MASTER_SPEC.md). Đối chiếu nghiệm thu nằm ở [VERIFICATION](VERIFICATION.md).

## 2. Mục đích

Giảng viên tổ chức thi, theo dõi và chấm bài; sinh viên làm bài có lưu tiến độ và nhận kết quả theo thời điểm công bố. Live Quiz cung cấp tương tác theo phòng với điểm do máy chủ tính. Quản trị viên quản lý tài khoản và xem tổng quan hệ thống.

## 3. Phạm vi hệ thống

Core bao gồm tài khoản, lớp, ngân hàng câu hỏi, ảnh riêng tư, tạo đề cố định/ngẫu nhiên, thi có thời hạn, nhiều lượt, chấm khách quan/tự luận, monitoring thời gian thực, công bố kết quả, thống kê, Excel/PDF và Live Quiz. Có seed, kiểm thử và cấu hình triển khai. Không có thanh toán, AI, proctoring, khóa trình duyệt, gửi email, khôi phục mật khẩu hay SSO trong v1.

## 4. Đối tượng sử dụng

Sinh viên dùng trình duyệt desktop/mobile; giảng viên soạn câu hỏi và tổ chức lớp; quản trị viên quản lý người dùng. Người triển khai cần quyền quản lý PostgreSQL, Supabase Storage, Render và GitHub Pages.

## 5. Thuật ngữ

| Thuật ngữ | Nghĩa trong hệ thống                                        |
| --------- | ----------------------------------------------------------- |
| Exam      | Bài thi có lịch, lớp được giao và cấu hình kết quả          |
| Attempt   | Một lượt làm bài, có đề snapshot riêng                      |
| Snapshot  | Bản sao nội dung, đáp án, thứ tự và điểm tại lúc bắt đầu    |
| Pool      | Quy tắc rút câu hỏi theo ngân hàng, độ khó và tags          |
| Release   | Cho phép sinh viên đọc điểm và chi tiết theo policy         |
| Room      | Phiên Live Quiz, độc lập với Class                          |
| Session   | Phiên đăng nhập lưu PostgreSQL; cookie chỉ mang SID được ký |

## 6. Product overview

React gọi REST để quản lý dữ liệu và làm bài; Socket.IO phục vụ monitoring và Live Quiz. Express xác thực Session và kiểm tra quyền; Prisma ghi PostgreSQL. Ảnh đi qua backend tới private Supabase Storage. Frontend không có credential database/Storage và không quyết định điểm hoặc deadline.

## 7. User roles

| Role    | Quyền                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------ |
| ADMIN   | Tìm/tạo người dùng, khóa/mở khóa, đổi role theo ràng buộc dữ liệu; xem lớp và thống kê tổng quan |
| TEACHER | Quản lý lớp, câu hỏi, đề, phòng Quiz của mình; monitoring, chấm tự luận, công bố và xuất kết quả |
| STUDENT | Tự đăng ký, làm Exam được giao, đọc lịch sử/kết quả của mình, tham gia Quiz bằng mã              |

Admin không mặc nhiên có quyền nghiệp vụ Teacher. Backend kiểm tra role và ownership ở từng tài nguyên; che giấu tài nguyên không thuộc quyền bằng 404 khi phù hợp.

## 8. Assumptions và constraints

- PostgreSQL UTF8 là dữ liệu thật; production target Supabase. Session cũng lưu PostgreSQL, không dùng Supabase Auth.
- Mỗi backend chạy một instance. Socket presence và bộ đếm rate limit nằm trong process; chưa hỗ trợ nhiều replica.
- Thời gian DB/API dùng UTC, UI hiển thị theo trình duyệt. Thi cần kết nối mạng để lưu; mất mạng không kéo dài deadline.
- Đề đã có attempt bị khóa chỉnh cấu trúc/cấu hình; vẫn có endpoint công bố kết quả thủ công. Nội dung ngân hàng cập nhật không thay đổi snapshot cũ.
- Chỉ tài khoản ACTIVE được truy cập. Tự đăng ký chỉ tạo STUDENT. Admin không tự khóa/đổi role; role có dữ liệu phụ thuộc bị chặn thay đổi.
- Live Quiz không có ESSAY, không nhận người chơi mới sau Start; người đã tham gia được reconnect.
- Cloud credentials chưa có trong repository. Luồng Storage triển khai bằng Supabase SDK; kiểm thử external roundtrip cần project thật.

## 9. Functional requirements

| ID            | Hành vi có thể nghiệm thu                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| FR-AUTH-001   | Đăng ký STUDENT, đăng nhập bằng email/password Argon2id; không nhận role từ public registration                            |
| FR-AUTH-002   | Login đổi SID/CSRF; `/me` đọc identity server; logout hủy Session và ngắt socket của phiên                                 |
| FR-AUTH-003   | Chặn tài khoản khóa, sai role/ownership; mutation bắt buộc Origin hợp lệ và CSRF token                                     |
| FR-ADMIN-001  | Danh sách phân trang/tìm kiếm/lọc role, tạo người dùng cho ba role                                                         |
| FR-ADMIN-002  | Khóa/mở khóa/đổi role có ràng buộc tự thao tác, dependency và kiểm tra quyền trong transaction                             |
| FR-ADMIN-003  | Xem thống kê hệ thống và danh sách lớp                                                                                     |
| FR-CLASS-001  | Teacher tạo, xem, sửa, archive lớp thuộc mình                                                                              |
| FR-CLASS-002  | Tìm sinh viên bằng tên/email/mã; thêm thành viên ACTIVE STUDENT không trùng; loại khỏi lớp                                 |
| FR-QBANK-001  | Tạo/sửa/archive ngân hàng; CRUD soft-delete câu hỏi, tìm kiếm/lọc/phân trang                                               |
| FR-QBANK-002  | SINGLE_CHOICE, MULTIPLE_CHOICE, TRUE_FALSE, ESSAY; kiểm tra đáp án đúng/phương án theo loại                                |
| FR-QBANK-003  | Soạn/preview Markdown GFM, LaTeX, code highlighting; không render raw HTML                                                 |
| FR-QBANK-004  | Upload PNG/JPEG/WebP tối đa 5 MB qua backend tới bucket private; signed URL theo quyền snapshot/release                    |
| FR-EXAM-001   | Builder năm bước: thông tin/lớp, lịch, câu cố định, pools/settings, preview/publish; archive đề                            |
| FR-EXAM-002   | Kiểm tra ownership, lịch và số câu không trùng có thể rút trước publish/start                                              |
| FR-EXAM-003   | Start kiểm tra assignment, lịch, trạng thái, số lượt; concurrent start chỉ có một lượt active                              |
| FR-EXAM-004   | Materialize snapshot cố định + pools; shuffle câu/phương án được lưu, TRUE_FALSE giữ thứ tự                                |
| FR-EXAM-005   | Deadline bằng min(start + duration, closeAt); response có serverNow; client chỉ hiển thị countdown                         |
| FR-EXAM-006   | Debounce autosave, trạng thái lưu/lỗi, retry, refresh/reconnect phục hồi đáp án từ DB                                      |
| FR-EXAM-007   | Submit idempotent; từ chối sửa sau expiry; server job auto-submit kể cả sinh viên offline                                  |
| FR-EXAM-008   | Teacher nhận NOT_STARTED, IN_PROGRESS, DISCONNECTED, SUBMITTED qua Socket; disconnect có grace period                      |
| FR-GRADE-001  | Tự chấm single/true-false và multiple exact-set; sai/bỏ trống 0, không có partial credit                                   |
| FR-GRADE-002  | Teacher chấm ESSAY trong [0, points], feedback; chỉ hoàn tất totalScore khi toàn bộ essay có điểm                          |
| FR-RESULT-001 | IMMEDIATE, AFTER_CLOSE, MANUAL đều yêu cầu GRADED; server enforce showCorrectAnswers/showExplanations/showDetailedScore    |
| FR-RESULT-002 | Lịch sử các lượt; HIGHEST_SCORE ưu tiên lượt đã chấm cao nhất, hòa chọn lượt mới hơn; LATEST_ATTEMPT chọn lượt mới nhất    |
| FR-RESULT-003 | Teacher xem kết quả phân trang; thống kê theo final attempt: trung bình/cao/thấp/đạt, phân bố và tỷ lệ đúng câu khách quan |
| FR-RESULT-004 | Xuất Excel tổng hợp và PDF kết quả sinh viên có font tiếng Việt, điểm khách quan/tự luận và nhận xét                       |
| FR-QUIZ-001   | Teacher tạo/sửa/archive Quiz, chọn câu khách quan với thời hạn và điểm; tạo Room mã 6 số duy nhất                          |
| FR-QUIZ-002   | Student đăng nhập join mã; lobby realtime vào/rời; host xác thực mới được Start/Next                                       |
| FR-QUIZ-003   | Start snapshot câu; phát question không đáp án, openedAt/closesAt/serverNow; lưu deadline server                           |
| FR-QUIZ-004   | Mỗi participant/question chỉ một câu trả lời hợp lệ; chặn trùng/quá hạn/sai question; server tính điểm                     |
| FR-QUIZ-005   | Hết hạn hoặc mọi người đã trả lời thì reveal + leaderboard; Next sau reveal, câu cuối kết thúc phòng                       |
| FR-QUIZ-006   | Reconnect lấy state, ownAnswer và thứ hạng đúng giai đoạn; UI countdown/transition có reduced-motion                       |

## 10. Non-functional requirements

| Nhóm            | Tiêu chí thực tế                                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security        | HttpOnly, secure cookie production, exact CORS, CSRF, Argon2id, auth/socket rate limit, Zod, snapshot DTO loại answer key, private assets, RLS không policy anonymous |
| Performance     | Phân trang user/question/results tại query; index FK/lịch/expiry; connection pool giới hạn; route lazy loading, autosave debounce, không broadcast tick mỗi giây      |
| Reliability     | Transaction và row lock cho start/save/submit/grade/quiz; unique constraints chống trùng; dữ liệu snapshot và deadline bền vững sau restart                           |
| Usability       | Tiếng Việt, trạng thái loading/empty/error/saving, xác nhận hành động quan trọng, điều hướng theo role, builder theo bước                                             |
| Accessibility   | Label, native input/button/dialog, keyboard focus, status/error text, reduced motion; smoke mobile 390×844 không tràn ngang                                           |
| Maintainability | TypeScript strict gồm tests, shared DTO/schema, module nghiệp vụ, migrations, unit/integration/E2E, CI và tài liệu                                                    |

Chưa đo tải đồng thời lớn, chưa có chứng nhận WCAG hoặc SLA production; các đặc tính trên không phải cam kết throughput.

## 11. External interfaces

REST JSON dưới `/api/v1`, `{data: ...}` hoặc `{error:{code,message,details?}}`; mutation dùng `X-CSRF-Token`, `Origin`, credentials cookie. Upload multipart trường `file`; export XLSX/PDF là binary. Health `/api/health` không cần login. Socket.IO dùng cùng origin API, Session handshake, typed events và acknowledgement. PostgreSQL kết nối phía server; Supabase Storage SDK service key cũng chỉ phía server. Frontend chỉ nhận hai public URLs qua Vite env.

## 12. Data requirements

21 bảng ứng dụng gồm User, Class/ClassMember, QuestionBank/Question/QuestionOption/QuestionAsset, Exam/ExamClass/ExamQuestion/ExamQuestionPool, ExamAttempt/AttemptQuestion/AttemptAnswer, LiveQuiz/LiveQuizQuestion/QuizRoom/QuizParticipant/LiveRoomQuestion/QuizAnswer và session. UUID, timestamptz, Decimal điểm; duy nhất email/studentCode, thành viên lớp, số lượt, answer/câu và mã phòng. Partial unique index ngăn hai IN_PROGRESS cho cùng sinh viên/đề. Snapshot JSON giữ nội dung, phương án, key, thứ tự; không serialize nguyên snapshot cho Student. Archive bảo toàn dữ liệu lịch sử; không xóa asset đã được dùng trong snapshot.

## 13. Major use cases

| Use case     | Luồng chính                                                            | Nhánh lỗi                                                                 |
| ------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Đăng nhập    | CSRF → credentials → SID mới → dashboard theo role                     | Sai mật khẩu, khóa, quá nhiều yêu cầu                                     |
| Soạn đề      | Tạo lớp/roster → ngân hàng → builder → preview → publish               | Không đủ pool, thiếu lớp, lịch sai, tài nguyên khác owner                 |
| Làm bài      | Mở đề → Start → snapshot/timer → autosave → submit → kết quả           | Chưa mở/đã đóng/hết lượt; offline retry; expiry auto-submit               |
| Chấm tự luận | Teacher mở grading → nhập điểm/feedback → recompute                    | Sai owner, điểm ngoài giới hạn, lượt chưa nộp                             |
| Công bố      | Teacher release → Student xem lịch sử/chi tiết được phép               | Chưa chấm xong hoặc chưa tới thời điểm công bố                            |
| Theo dõi     | Teacher join monitor → snapshot → presence/submit events               | Mất mạng có grace period, reconnect snapshot                              |
| Live Quiz    | Teacher tạo room → Student join → Start → answer → reveal → Next/final | Khách chưa login, sai mã, duplicate, late answer, student điều khiển host |

## 14. Acceptance criteria

Các FR đạt khi module thực thi với PostgreSQL thật và test liên quan pass. E2E phải chạy hai browser contexts Teacher/Student cho Exam và Live Quiz, thêm mobile role guard. Excel đọc được bằng ExcelJS; PDF trích xuất giữ đúng “Nguyễn Hoàng Anh”, “Trần Thị Hương”. Lint, strict typecheck, unit/frontend, integration/socket, build và E2E phải pass. Cấu hình cloud phải sẵn sàng nhưng chỉ đánh dấu kiểm chứng external sau khi có credentials và triển khai thật; xem [audit từng DoD](VERIFICATION.md).

## 15. Requirement traceability

Đường dẫn module dưới `apps/api/src/modules` nếu không ghi khác. Integration tests dưới `apps/api/test`; unit nằm cạnh source. Mỗi nhóm ID dưới đây bao phủ toàn bộ các FR ở mục 9.

| Requirement       | Implementation module                                     | Test tương ứng                                                                                                        |
| ----------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| FR-AUTH-001–003   | auth, middleware/auth.ts, middleware/security.ts          | auth.integration.test.ts; auth/password.test.ts; web/lib/api.test.ts; socket.integration.test.ts                      |
| FR-ADMIN-001–003  | admin/routes.ts; web/features/admin.tsx                   | auth.integration.test.ts (create/roles/lock); review route tổng quan                                                  |
| FR-CLASS-001–002  | classes/routes.ts; web/features/catalog.tsx               | catalog.integration.test.ts; E2E Exam fixture                                                                         |
| FR-QBANK-001–002  | question-banks/routes.ts; shared schemas                  | catalog.integration.test.ts; shared/src/question.test.ts                                                              |
| FR-QBANK-003      | web/components/Markdown.tsx; catalog.tsx                  | Markdown.test.tsx; E2E render công thức                                                                               |
| FR-QBANK-004      | storage/routes.ts; Markdown AssetImage                    | storage.integration.test.ts (provider boundary); catalog.integration.test.ts (invalid upload); external smoke pending |
| FR-EXAM-001–002   | exams/routes.ts, service.ts                               | exams.integration.test.ts; exams/selection.test.ts                                                                    |
| FR-EXAM-003–004   | attempts/service.ts, logic.ts; exams/selection.ts         | attempts.integration.test.ts; attempts/logic.test.ts; selection.test.ts                                               |
| FR-EXAM-005–007   | attempts; jobs/expiry.ts; web/features/attempts.tsx       | attempts.integration.test.ts; logic.test.ts; web/lib/timer.test.ts; tests/e2e/core.spec.ts                            |
| FR-EXAM-008       | sockets/server.ts, presence.ts; web/features/results.tsx  | socket.integration.test.ts; web/features/critical.test.tsx; E2E Exam                                                  |
| FR-GRADE-001–002  | attempts/logic.ts; grading/routes.ts                      | logic.test.ts; grading.integration.test.ts; E2E Exam                                                                  |
| FR-RESULT-001–002 | results/logic.ts, service.ts                              | results/logic.test.ts; grading.integration.test.ts; storage.integration.test.ts; E2E Exam                             |
| FR-RESULT-003–004 | analytics; exports/reports.ts; web/features/analytics.tsx | exports.integration.test.ts; source review SQL pagination                                                             |
| FR-QUIZ-001–003   | live-quiz/routes.ts, service.ts; sockets/quiz.ts          | quiz.integration.test.ts; tests/e2e/core.spec.ts                                                                      |
| FR-QUIZ-004–005   | live-quiz/service.ts, logic.ts                            | live-quiz/logic.test.ts; quiz.integration.test.ts; E2E Quiz                                                           |
| FR-QUIZ-006       | sockets/quiz.ts; web/features/quiz.tsx, styles/main.css   | quiz.integration.test.ts; E2E Quiz reconnect; CSS review reduced motion                                               |

Traceability chỉ ghi automated coverage thực có; review route/CSS và external smoke được phân biệt rõ, không tính thành test đã chạy.
