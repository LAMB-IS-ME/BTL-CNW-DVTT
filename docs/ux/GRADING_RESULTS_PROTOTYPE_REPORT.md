# Grading & Results — UX audit và thin-slice prototype

> Báo cáo lịch sử tại điểm dừng prototype. Trạng thái phê duyệt, verification và đóng phase hiện tại nằm trong [báo cáo rollout](GRADING_RESULTS_ROLLOUT_REPORT.md). Sáu board đã duyệt được giữ nguyên; không tái tạo khi đóng phase.

Ngày 09–10/10/2026. **Dừng để review visual direction; chưa full rollout.**
Branch `ux/education-saas-redesign-pilot`, HEAD `2444199f7ca3a0113d5ea3aad7567e70d0677df0`. Trước phase working tree sạch; hiện là thay đổi local chưa commit. Không push, deploy, merge hoặc PR.

## 1. Recovery và evidence

Tiếp tục đúng prototype Marking Desk / Results Register / Result Record đã triển khai ngày 09/10, không audit lại hoặc redesign. Lệnh Chromium cuối của lượt trước **chưa thực thi**: automatic approval review báo workspace hết credits; không phải test FAIL hoặc kết luận thao tác không an toàn. Ngày 10/10, workflow approval hoạt động lại và kiểm thử chạy hợp lệ.

Môi trường đã khởi động lại, `/tmp` cũ mất cả PostgreSQL, logs và raw captures. Dựng lại PostgreSQL 16 portable trong `/tmp`, chỉ listen loopback cổng 55432; migrate/seed `examspace_focus_test` với `DOTENV_CONFIG_PATH=/dev/null`. Không đọc/ghi dữ liệu Supabase production. Các kết quả BEFORE dưới đây là evidence đã quan sát trong lượt trước và được lưu lại từ context; không tuyên bố vừa chạy lại baseline trên source mới. AFTER screenshots và final checks được tái tạo ngày 10/10.

## 2. Source / routes audit

| Luồng | UI hiện có và source | Backend / dữ liệu / phạm vi |
| --- | --- | --- |
| Chọn bài thi | `/teacher/exams` → Chấm bài / Kết quả; `features/exams.tsx` | Exam Folio đã duyệt, giữ nguyên. Không có grading/results overview độc lập giữa nhiều exam. |
| Teacher Grading | `/teacher/exams/:id/grading`; `features/results.tsx`, `Grading` / `EssayGrade` | GET `/teacher/exams/:id/grading?pageSize=100`: owner-only, submitted attempts `PENDING_MANUAL_GRADING` hoặc `GRADED`, mới nộp trước. Có student name/code, attemptNo, submittedAt, question snapshot/orderIndex/points, answer ID/text/manualScore/feedback. |
| Lưu điểm | Form từng câu tự luận | PUT `/teacher/answers/:answerId/grade`, body score/feedback; cùng contract trước prototype. GET `/teacher/attempts/:attemptId` có trong API nhưng chưa có UI detail route riêng. |
| Teacher Results | `/teacher/exams/:id/results`; `features/analytics.tsx` | GET results phân trang student 20/trang; sort tên do server. Student gồm name/code/email, attemptCount, finalAttempt và attempts. UI dùng điểm tối đa/tổng điểm/status/lượt; không tự thêm breakdown hoặc màn chi tiết sinh viên. |
| Analytics | Cùng trang Teacher Results | GET `/teacher/exams/:id/analytics`: totalAssigned, notStarted, inProgress, submitted, graded, average/highest/lowest/passRate, 5 khoảng phân bố 20%, tỷ lệ đúng câu khách quan. Không có median hoặc class comparison. |
| Export | Excel ở đầu trang; PDF từng sinh viên | `modules/analytics/routes.ts` + `modules/exports/reports.ts`; owner-only. Không phụ thuộc student release hoặc trạng thái published/archived. |
| Student Results | `/student/results`, `/student/results/:id`; `StudentResults` | Entry GET `/student/exams`: các bài không phải DRAFT được giao qua lớp, mặc định 20; detail GET `/student/exams/:id/results` chỉ lấy attempts của session student. Student đã có attempt vẫn có thể truy cập detail sau thay đổi membership. |
| Context bổ sung | `result-presentation.tsx` | Dùng GET `/teacher/exams/:id` sẵn có, owner-only, để trình bày tên bài và chính sách. Không thay API. Response exam chỉ có class IDs ở relation; không giả tên lớp. PDF hiện hữu có tên lớp. |

Source đối chiếu: [grading routes](../../apps/api/src/modules/grading/routes.ts), [result service](../../apps/api/src/modules/results/service.ts), [release/final-attempt logic](../../apps/api/src/modules/results/logic.ts), [analytics](../../apps/api/src/modules/analytics/service.ts), [export](../../apps/api/src/modules/exports/reports.ts). Đã đối chiếu MASTER_SPEC §§11–12, 26–27, SDD §§18–21 và các tài liệu visual identity / Student Focus trước phase.

## 3. Business behavior giữ nguyên

- **Objective:** SINGLE_CHOICE / MULTIPLE_CHOICE / TRUE_FALSE dùng exact set match; đúng cả tập nhận full points, còn lại 0. Không partial credit khách quan.
- **Essay:** teacher owner chấm thủ công; score backend trong `[0, min(question.points, 10000)]`; UI giữ min/max và bước 0,01. Feedback tối đa 10.000 ký tự. Cho sửa lại điểm đã lưu; không tạo rubric hoặc override policy mới.
- **Completion:** transaction khóa attempt, ghi manualScore/feedback/gradedBy/gradedAt, cộng lại manual score. Chỉ khi mọi essay có manualScore mới chuyển GRADED và có totalScore; đang chấm từng phần vẫn PENDING_MANUAL_GRADING, totalScore null. Không thêm PARTIALLY_GRADED enum.
- **Constraints:** không chấm khi IN_PROGRESS, không chấm câu khách quan bằng endpoint manual. Grading/release không có chặn riêng cho archived/published exam; giữ đúng source.
- **Final attempt:** HIGHEST_SCORE chọn lượt GRADED có điểm cao nhất, hòa lấy lượt mới hơn; chưa có lượt GRADED thì fallback lượt mới nhất. LATEST_ATTEMPT lấy lượt mới nhất kể cả pending. Không biến null thành 0.
- **Visibility:** luôn cần GRADED. IMMEDIATE cho xem ngay; AFTER_CLOSE cần `now >= closeAt`; MANUAL cần `manualResultsReleasedAt != null`.
- **Manual release:** POST có thể công bố khi còn bài chờ chấm; các bài chưa GRADED vẫn ẩn. Không có unrelease. Prototype chỉ đặt nút hiện hữu trong ngữ cảnh MANUAL, không đổi điều kiện backend.
- **Student disclosure:** trước release chỉ có metadata/status, không trả totalScore/maxScore/percentage/questions. Sau release mới có đáp án đã làm và feedback; key, explanation và điểm từng câu phụ thuộc ba toggle riêng. Student không có export. Không suy diễn quyền từ status ở frontend: vẫn dùng `visible` và optional fields của response.
- **Export:** Excel toàn exam, không chỉ trang đang xem; sheets Results/Summary/Attempts. PDF từng sinh viên chứa danh tính/lớp, lượt được tính, điểm/trạng thái và feedback. `download()` vẫn fetch blob và tạo browser download, giữ tên file, format, data và templates. Chỉ bổ sung busy/error presentation.

Unsupported, không implement: bulk grading, annotations, moderation, multi-marker, appeals, AI scoring, rubric mới, unpublish/reopen, sorting/filtering UI mới, student export, analytics mới hoặc teacher student-detail route mới. Admin không nằm trong rollout; routes hiện hữu có Teacher/Student guards.

## 4. BEFORE UX findings

Application thật, Chromium 1440/820/390, seed accounts và fixtures PostgreSQL test riêng; đã mở/inspect BEFORE screenshots ở lượt trước.

| Vấn đề | Evidence trước sửa |
| --- | --- |
| Grading dồn mọi submission và form thành card lồng | 21 bài: chiều cao trang 19.552px desktop, 20.655px tablet, 25.087px mobile; cần cuộn nhiều và khó giữ ngữ cảnh. |
| Results ưu tiên dashboard hơn tra điểm | Bảng bắt đầu y≈1.729px / 2.116px / 2.975px tương ứng desktop/tablet/mobile, sau 9 KPI cards, distribution và question analytics. |
| Context/status | Teacher thiếu tên exam ở đầu trang; status enum thô; Student hiện `HIGHEST_SCORE` và nested cards từng câu. |
| Save feedback sai | Sau PUT thành công, sửa điểm vẫn thấy “Đã lưu điểm”. Tái hiện bằng browser trước sửa; reload xác nhận server vẫn giữ giá trị cũ. |
| Responsive | Không quan sát page-level overflow trong baseline; vấn đề chính là hierarchy, chiều dài và vùng đọc bị card padding bóp hẹp. |

## 5. Direction và phạm vi prototype

**Marking Desk:** danh sách lượt nộp bằng native disclosure. Mở một bài để đọc, giữ sinh viên/lượt/status ở summary; không unmount form khi đóng nên draft không bị mất chỉ vì mở/đóng. Question theo orderIndex snapshot; bài làm plain text giữ xuống dòng (không tự diễn giải essay thành Markdown). Prompt vẫn dùng Markdown/code/math/image renderer hiện có. Desktop chia cột đọc và vùng điểm 248px; ≤1000px reflow dọc, nhắc lại sinh viên/lượt/câu cạnh input. Không thêm nút next/previous submission hoặc route mới.

**Results Register:** exam context, công bố, danh sách kết quả và export ở trước; native semantic table ở desktop, vùng cuộn có nhãn/focus trên tablet, danh sách bản ghi riêng trên mobile ≤600px. Cả hai presentation dùng cùng response và pager. Analytics hiện hữu đặt sau danh sách trong disclosure, giữ tất cả metrics/charts, thêm diễn đạt phân bố bằng chữ. Không ép thành KPI dashboard.

**Result Record:** entry là danh mục có chỉ mục, detail theo từng lượt; điểm vừa phải, status và thời điểm nộp rõ; câu hỏi/feedback dùng rule và khoảng cách. Phân biệt đang thi, chờ chấm, chưa công bố và đã xem được kết quả; không gamification.

Kế thừa hệ mực `#252c2a`, giấy `#fffefa`, xanh `#24574e`, type system và linear rules của ExamSpace. Ba workflow có composition riêng, không sao chép Exam Folio stepper hoặc Focus Desk navigation. CSS chỉ kích hoạt ở `.record-page` và các class riêng; shared application shell, sidebar, Teacher Dashboard/Question Bank/Exam, Student Exam và Live Quiz giữ nguyên.

Lát cắt bao phủ entry/list, workspace essay, save/status, results list/detail theo exam, export/release presentation, student entry/released/pending/unreleased và loading/error/empty. Không rollout toàn bộ permutations, quy mô >100 lượt chấm, Admin, report templates hoặc module đã duyệt.

## 6. Functional verification và regression

- Native disclosure bằng Enter; mở bài thứ hai không trộn điểm với bài thứ nhất. Prompt/answer/maximum score đúng record.
- Input từ chối rỗng, âm, quá maximum và sai step; backend integration kiểm tra range độc lập. PUT pending khóa form, thành công báo saved; sửa sau lưu chuyển dirty. Failure có alert, giữ draft; retry xóa lỗi và báo saved. Reload kiểm tra cả điểm và feedback từ DB.
- Frontend regression cho stale success và hidden-result defense; released zero vẫn là 0, không tạo điểm từng câu khi response không có.
- Real API integration: chấm từng phần chưa có tổng, chấm hết chuyển GRADED, sửa lại điểm cộng lại tổng; ownership, role, student cùng lớp không nhìn thấy attempts của người khác; IMMEDIATE / AFTER_CLOSE / MANUAL; hide key/explanation/detail-score độc lập.
- Browser: pager 20→4→20 với 24 sinh viên, trạng thái graded/pending/not-started; PDF/Excel download có signature `%PDF`/`PK`, download không lỗi. Integration đọc workbook và trích PDF tiếng Việt. Fault injection export 500 hiển thị lỗi; templates không đổi.
- Loading/delay/error/empty dùng response interception ở test, không fake state trong production source. Pending/released fixtures nằm trong DB test; response hidden được kiểm tra không có questions/totalScore.
- 1440/820/390: không document overflow, layout mobile riêng; tên dài, title dài, bài viết dài, Markdown/code/table/KaTeX; code sở hữu scroll ngang. Keyboard Tab/Enter/Escape, focus ring 3px; dialog release Escape trả focus; form controls ≥44px; nút lưu contrast ≥4,5; reduced motion. Đây là targeted accessibility checks, không phải audit WCAG/screen-reader toàn hệ thống.

## 7. Test results và commands

Chi tiết commands/counts, geometry, hashes và manifest ở [verification JSON](grading-results-verification.json).

| Gate | Baseline 09/10 | Final 10/10 |
| --- | --- | --- |
| `npm run lint` | PASS | PASS |
| `npm run typecheck` | PASS | PASS |
| `npm run build` | PASS | PASS |
| `npx vitest run` | 31 PASS | 34 PASS, 0 FAIL, 0 skipped |
| Targeted integration | 5 PASS / 3 files | 8 PASS / 4 files, 0 FAIL, 0 skipped |
| Grading/Results Chromium | 1 BEFORE flow PASS | 5 PASS, 0 FAIL, 0 skipped |
| Teacher compatibility | Đã có coverage từ phase trước | 4 sidebar/Exam checks PASS |
| Student compatibility | Đã có coverage từ phase trước | 3 Focus Desk → Results flows PASS |
| `git diff --check` | Clean baseline | PASS |

Baseline unit lần đầu có 1 health test lỗi vì sandbox chặn localhost; chạy lại với approval đã PASS 31. Intermediate harness issues đã sửa: studentCode trùng giữa fixture runs; assertion điểm từng câu vô tình match “Tổng điểm”; TS tuple download khiến signature optional. Không sửa/giảm assertion nghiệp vụ. Khôi phục DB gặp thiếu libpq portable, đã bổ sung tại `/tmp`; không phải product failure. Warning chunk >500kB, pg concurrent-query deprecation và NO_COLOR/FORCE_COLOR giữ từ baseline. Lệnh bị auto-review chặn vì credits không được tính là test chạy hoặc test thất bại.

## 8. Boards và self-review

- [Desktop](../screenshots/grading-results-prototype/review-board-desktop.png): danh sách chấm, toàn bộ essay workspace, Teacher Results và Student released result.
- [Mobile](../screenshots/grading-results-prototype/review-board-mobile.png): essay một cột, ngữ cảnh + điểm đã lưu, mobile result records, released và unreleased.
- [State evidence](../screenshots/grading-results-prototype/evidence-states.png): pending/unreleased, student entry, analytics hiện hữu và teacher feedback đã công bố.

Tạo bằng [board script](../../tests/ui/grading-results-boards.py) từ screenshots Playwright thật, 1:1 pixels, không device frame hoặc retouch UI; một số crop bỏ khoảng trống xung quanh. Agent đã mở cả ba boards và inspect ảnh workspace ở kích thước gốc. Raw captures/logs ở `/tmp` có thể tái tạo; ba boards và evidence tổng hợp được giữ trong repo. Không overwrite approved boards cũ.

Self-review: không nested cards, hero/gradient, icon pastel hoặc KPI tiles; hierarchy dựa vào type/grid/rules. Grading ưu tiên nội dung và score, results dễ scan, analytics không đẩy list xuống cuối, student không dùng giant score hoặc enum kỹ thuật. Mobile có layout riêng và nhắc context; không sticky controls che bài. Desktop table hiện bắt đầu khoảng **490px**, thay cho 1.729px baseline. Shared shell legacy vẫn giữ nguyên theo scope, không mở thêm vòng redesign.

## 9. Giới hạn và future improvements

- Grade drafts vẫn chỉ ở form đang mount; mở/đóng disclosure giữ draft, nhưng rời route/reload trước khi lưu có thể mất. Prototype chưa thêm navigation guard/local draft. Đây là giới hạn đã có, không tuyên bố autosave.
- Grading vẫn tối đa 100 lượt gần nhất; chưa có pager/grading filter. Student entry vẫn mặc định 20 exam từ endpoint và chưa có UI pagination. Là future work, không tự mở rộng contract.
- Teacher Results chưa có UI xem chi tiết mọi attempt của sinh viên, search/sort tùy chọn hoặc class comparison; PDF và grading giữ đường đi hiện hữu. Không tạo màn giả để lấp khoảng trống.
- Không test nhiều tab chấm đồng thời hoặc tải dữ liệu rất lớn. Không full-system Chromium, screen reader, Firefox/WebKit hoặc Admin rollout. Release/security backend không có thay đổi.
- BEFORE raw files mất cùng `/tmp` sau lần ngắt; số đo và kết quả đã được phục hồi từ context. AFTER boards là evidence mới từ source hiện tại.

## 10. Changed files / điểm dừng

Source: `apps/web/src/features/{results,analytics,result-presentation}.tsx`, `apps/web/src/styles/grading-results.css`.
Tests: `apps/web/src/features/grading-results.test.tsx`, `apps/api/test/grading-results.integration.test.ts`.
Automation: `tests/ui/grading-results{,-before}.spec.ts`, `grading-results-fixtures.ts`, `grading-results-boards.py`.
Docs: report này, `grading-results-verification.json`; artifacts: ba PNG trong `docs/screenshots/grading-results-prototype/`.

Diff tracked ngoài phạm vi là rỗng; approved source/docs/boards được đối chiếu với HEAD. Working tree giữ toàn bộ prototype chưa commit. **NO COMMIT · NO PUSH · NO DEPLOY · NO PR · NO FULL ROLLOUT.** Chờ user review visual direction.
