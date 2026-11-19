# ExamSpace — audit trước pilot Question Bank

Ngày 2026-10-01. Baseline source `2cda149`; branch `ux/question-bank-pilot`. Nguồn: source hiện tại, Prisma schema, tests hiện tại và `EXAMSPACE_UX_REWORK_SPEC.md`. Các báo cáo cũ chỉ là tài liệu tham khảo.

## Môi trường và bằng chứng

Chromium headless thật, Vite dev, Express/Session/PostgreSQL 16 local riêng tại loopback:55432, DB `examspace_ux_test`; 15 tài khoản/24 câu từ seed. Không dùng/reset/migrate Supabase; không đổi `.env`. PostgreSQL binaries được giải nén vào `/tmp`, không cài package hệ thống. Fixtures mang prefix TEST_/E2E hoặc account UUID, chỉ trong DB disposable. Cloud Storage tắt ở runtime audit. Baseline: 27 unit/frontend, 24 integration PASS chạy mới. Browser đi từ login/dashboard qua controls (không nhập URL editor).

`B` dưới đây: đã đi qua control trong Chromium; `I`: integration thực chạy; `S`: source review. OK không có nghĩa đã test mọi biến thể bằng browser. Những khoảng trống ngoài pilot giữ nguyên để review sau.

## Audit matrix (trước sửa)

| Module | Business feature | Backend service | API | Frontend | User có tìm thấy action hay không | Test coverage | Status | Problem | Proposed fix |
|---|---|---|---|---|---|---|---|---|---|
| Question Bank | List/open bank | bankRoutes/findMany, own | GET question-banks, /:id | CatalogList/Detail | B: cả card là link, thiếu nhãn Mở | I catalog; B baseline | NEEDS_UX_IMPROVEMENT | Form lớn; bỏ subject/count/date; list giới hạn 20 không pager | Toolbar, table, Mở ngân hàng, paging |
| Question Bank | Create/edit bank | bankRoutes | POST/PATCH | Catalog forms | B: có; sửa subject không có trên detail | I create/owner; B | NEEDS_UX_IMPROVEMENT | Không pending/success; không cancel | Dialog, busy/error, subject edit |
| Question Bank | Archive bank | soft isArchived | DELETE /question-banks/:id | Detail confirm | B: nằm trong form chỉnh sửa | S/B | NEEDS_UX_IMPROVEMENT | Bank archive không được xét cho fixed exam/quiz start | Guard references, action trên list |
| Question Bank | Restore bank | Không có | Không có | Không có | Không | S | MISSING | Không thể quay lại trạng thái active | POST restore, filter |
| Question Bank | Search/filter/sort banks | Pagination only | GET ignores search | Không toolbar | Không | S/B | MISSING | Không tìm bank ngoài 20 mục đầu | Server filter + pagination giữ tương thích picker |
| Question Bank | List/search questions | findMany+count | GET /:id/questions | Cards + search/pager | B: có search; thiếu loại/status | I schema; B | NEEDS_UX_IMPROVEMENT | Gõ từng ký tự gọi request; render Markdown mọi row | Debounce, compact list, filter |
| Question Bank | Create 4 types/edit/save | questionSchema, nested options | POST questions, PATCH /questions/:id | QuestionForm | B: có, nhãn enum tiếng Anh | I validation; B single choice | NEEDS_UX_IMPROVEMENT | Không pending, validation tại trường, stale cache sau save | Editor tiếng Việt, feedback, invalidation |
| Question Bank | Cancel/dirty navigation | Client-only | — | Không có | Không | S/B | MISSING | Mất nội dung khi rời trang | Hủy + dirty warning |
| Question Bank | Archive question | update isArchived=true | DELETE /questions/:id | Cuối editor | B: phải vào editor/cuộn | I soft archive; B | HIDDEN | Action khó thấy, biến mất sau archive | Row action + named confirmation |
| Question Bank | Restore/list archived | Không có; GET ép isArchived=false | Không có restore/filter | Không có | Không | S/B | MISSING | Không tìm lại câu archived | Additive restore API + status filter |
| Question Bank | Published exam dependency | materializeSources | Archive/start/publish | Lỗi mã nội bộ | Không có cảnh báo tác động | I snapshot; S gap | BROKEN | Archive có thể khiến published exam không start được | Transaction validate published sources; reject với lý do |
| Question Bank | Historical attempt | makeSnapshot/finalize | start/save/submit | Existing attempt | B start/refresh; I snapshot | I 24 baseline | OK | Snapshot độc lập source; soft delete giữ bản ghi | Add API archive/restore regression |
| Question Bank | Image upload | storageRoutes, MIME/signature/5MB | POST assets | Chỉ xuất hiện sau save | B: lưu → upload → lưu lại | I MIME/size/provider; B failure | NEEDS_UX_IMPROVEMENT | Không busy, retry workflow không rõ; cloud chưa đo | Stage file trước Save, resume upload/link |
| Question Bank | Remove/replace image | DELETE asset có guard snapshot | DELETE assets/:id | Chỉ sửa Markdown thủ công | Không có control | I history guard; S/B | HIDDEN | Xóa object khác gỡ ảnh khỏi câu; dễ mất lịch sử nếu hiểu sai | Gỡ/thay tham chiếu, giữ asset lịch sử |
| Question Bank | Markdown/LaTeX/code | string schemas + snapshots | question content | ReactMarkdown/KaTeX/highlight | B live preview hoạt động | Unit Markdown; B preview | OK | Preview render mỗi keystroke, cần đo trước tối ưu | Giữ renderer, giới hạn list rendering |
| Question Bank | Ownership/authorization | allow TEACHER, ownQuestion/own | 404 foreign owner,403 student | role guards | B/S: role routes | I ownership, media | OK | Question mutation coverage chưa đủ | Add cross-role archive/restore cases |
| Class | Create/edit/archive | classRoutes | POST/PATCH/DELETE classes | Catalog forms | B list/detail controls | I create/archive source | NEEDS_UX_IMPROVEMENT | Thiếu save pending/success và empty list; archive mềm | Backlog ngoài pilot |
| Class | Add/remove/roster/owner | classMember/upsert/deleteMany | students endpoints | Search, roster, confirm | B roster; I add/owner | I catalog | OK | Search users/list classes thiếu pagination UI | Backlog ngoài pilot |
| Exam | Create/edit/assign/fixed/pool | examRoutes, materializeSources | POST/PATCH/PUT | Builder 5 bước | B list/preview; S builder | I exam builder/ownership/pools | OK | Save gồm nhiều request; labels enum; audit usability sâu còn thiếu | Chưa rollout |
| Exam | Publish/archive/shuffle/attempt limits | edit/eligibility | publish/archive | Builder settings/confirm | S controls có | I exam/attempt | OK | Source archive guard chưa có (row QB dependency) | Fix guard nguồn trong pilot |
| Exam | Result strategy/release | results logic/grading routes | results/release-results | Builder/Results | S có | Unit/I grading | OK | Manual release label chưa phản ánh từng mode | Backlog |
| Exam | Preview | ownExam | GET exam | BuilderForm preview | B có link | B/S | NEEDS_UX_IMPROVEMENT | Preview pool là cấu hình, không mô phỏng random selection | Chưa mở rộng nghiệp vụ |
| Exam | Start/resume/autosave/submit/expiry | attempt service + locks/job | student attempts/answers/submit | AttemptWorkspace | B start/refresh; I lifecycle | I + existing E2E | OK | Old E2E direct URLs bỏ qua discoverability | Run regression và đổi entry flow tests |
| Exam | Monitor/essay/results/analytics | presence, grading, analytics | monitor/grade/results | Results/Analytics | S links từ Exam list | I socket/grading/export | OK | Cần runtime controls regression sau sửa | Giữ UI |
| Exam | Excel/PDF | exports/reports | export.xlsx/pdf | Export buttons | S có | I workbook + pdftotext | OK | Browser downloads chưa baseline walkthrough | Regression browser |
| Live Quiz | Create/edit/room | quizRoutes/createRoom | quizzes/questions/rooms | QuizBuilder | B builder; S controls | I quiz | NEEDS_UX_IMPROVEMENT | Save chưa busy; list card link; source archive có thể chặn Start | Guard source; UI ngoài pilot |
| Live Quiz | Join/duplicate join/lobby/start | joinRoom/startRoom | socket events | Join/Room | S rõ controls | I duplicate join/RBAC | OK | Bank archive chưa được xét ở Start | Fix source guard |
| Live Quiz | Answer/duplicate/deadline/reveal/next/final | locked room transitions | socket events | QuizRoom | S có | I real socket lifecycle | OK | Repeated Next/host refresh cần test rõ | Add regression |
| Live Quiz | Reconnect/host refresh | roomState persistence | socket join | effect on connect | S có state recovery | I student reconnect | NEEDS_UX_IMPROVEMENT | Host refresh chưa có explicit test | Add regression |
| Admin | Users/search/create/role/lock | adminRoutes + advisory lock | users/status/role | AdminUsers | B nav/table; I mutations | I auth/admin | OK | Form pending/empty và enum labels còn raw | Không redesign |
| Admin | Classes/stats | adminRoutes counts | classes/stats | AdminOverview | B nav | S/I auth | NEEDS_UX_IMPROVEMENT | Stats dùng internal keys; classes thiếu paging | Backlog |
| Student | Dashboard/list/detail/start/resume | attempt routes | student exams | StudentExams/Exam | B dashboard → exam → start | B/I | OK | Deadline errors có mã chưa được dịch | Shared error mapping nhỏ |
| Student | Navigation/timer/autosave/refresh/submit | save queue + service | attempts | AttemptWorkspace | B timer/refresh; S nav | Unit timer/I/E2E | OK | Timer rerenders cả workspace; chưa đo bottleneck | Không tối ưu suy đoán |
| Student | Results/Live Quiz join | result/quiz routes | results/by-code | Results/QuizJoin | S nav links | I release/socket | OK | Không thay layout trong pilot |

## Findings và quyết định cho Phase B

- QB-01 HIDDEN: Lưu trữ câu hỏi chỉ ở cuối editor; không có hard delete question/bank. Không thêm permanent delete.
- QB-02 MISSING: restore cả bank/question; status filter. Dùng boolean `isArchived` hiện tại, không cần migration enum.
- QB-03 BROKEN: archive nguồn đang dùng có thể làm đề published/pool thiếu câu; fixed bank/Quiz start xét archive chưa nhất quán. Thêm kiểm tra transaction, dùng chung lock catalog khi materialize và archive để tránh race.
- QB-04 MISSING: Hủy, dirty warning, saving feedback, field validation; raw errors ở storage/archive.
- QB-05 NEEDS_UX_IMPROVEMENT: media hai lần lưu, không có gỡ/thay. Chọn ảnh trước save; giữ editor khi upload lỗi; retry không tạo thêm câu; gỡ tham chiếu không xóa object lịch sử.
- QB-06 NEEDS_UX_IMPROVEMENT: list bank không lọc/pager/count; detail render toàn Markdown khiến hierarchy kém và tăng công việc main thread.

## Performance baseline

Chromium/Vite dev/local PG; warm in-session (Query cache 10s), n=10; không phải production/field p95. List 39–77 ms (median 43.5); detail 115–259 ms (median 123.5). Editor open n=1 182 ms; create/save 117 ms; question full reload 872 ms; Exam list 128 ms; Student start 189 ms. Các số gồm Playwright actionability/assertion overhead, không phải chỉ render time. Student reload không ghi nhận long task >50 ms trong lần này.

Upload baseline chỉ đo luồng lỗi `STORAGE_NOT_CONFIGURED`: không tuyên bố latency Supabase. API/DB/main-thread/request frequency được bổ sung trong báo cáo cuối. Không kết luận Supabase Free chậm. Không có HAR/cookie/token trong artifacts commit.

## Checkpoint

A: source và runtime ban đầu xong, before screenshots ở `docs/screenshots/question-bank/`. Tests hiện tại được chạy lại, không dùng số từ README. Tiếp theo: functional API fixes/test → design proposal → pilot UI → regression/report. Không push/deploy.

## Checkpoint hoàn tất pilot — 01/10/2026

Tiếp tục từ working tree ban đầu, không audit lại các module ngoài phạm vi. QB-01 đến QB-06 đã FIXED_VERIFIED trong môi trường local; thêm regression search stale-row, dialog focus, truthful save state và concurrent pool archive. Kết quả mới: 27 unit/frontend, 29 integration, 14 Chromium (11 pilot + 3 core) PASS; targeted 4 ca sau chỉnh cuối PASS; lint/typecheck/build PASS. Báo cáo chi tiết, số đo có giới hạn và ảnh AFTER: [QUESTION_BANK_PILOT_REPORT.md](QUESTION_BANK_PILOT_REPORT.md). Dừng tại pilot, chưa rollout/commit/push.
