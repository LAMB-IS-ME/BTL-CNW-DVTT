# Grading & Results — Full rollout và hardening

Ngày 10/10/2026. Tiếp tục prototype đã duyệt; giữ Marking Desk, Results Register và Result Record. Branch `ux/education-saas-redesign-pilot`, HEAD `2444199f7ca3a0113d5ea3aad7567e70d0677df0`. Baseline trước rollout; phần audit dưới đây ghi nhận vòng triển khai. User đã duyệt toàn bộ visual direction và cho phép một local commit; xem phần đóng phase ở cuối báo cáo.

## Phạm vi và trạng thái thực tế

| Workflow | Prototype / rủi ro trước rollout | Hoàn thiện vòng này |
| --- | --- | --- |
| Chọn bài thi | Exam Folio đã duyệt; không có overview grading độc lập | Giữ entry và liên kết hiện hữu |
| Grading list/disclosure/workspace | Composition đã duyệt; chỉ lấy 100 lượt đầu | Phân trang 20, kiểm tra trang kế; giữ draft theo answer qua đóng/mở và đổi trang |
| Chấm từng phần, chấm hết, sửa lại | Backend đã hỗ trợ; prototype chỉ có ca đại diện | Kiểm chứng nhiều essay, tổng/status server, zero/decimal/range và persistence |
| Save lifecycle | Đã có explicit save, pending/error/retry; dirty chưa so persisted | Snapshot persisted/draft riêng, so sánh số chính xác, clear feedback, guard pending, acknowledgment theo payload đã gửi |
| Rời Grading | Mất draft âm thầm, không warning | Route/Back/Forward confirmation, beforeunload cho reload/tab close; cancel giữ draft; không autosave |
| Results table/mobile/analytics | Đã duyệt; cache có thể giữ “Chờ chấm” sau save | Invalidate grading/results/analytics/student detail; refetch khi quay lại; retry từng vùng |
| Student entry/detail | Chỉ lấy 20 bài đầu; nhãn “Kết quả được tính” dễ hiểu nhầm | Phân trang, giữ trang khi quay lại; “Lượt được chọn tính kết quả”; retry detail, ẩn body khi fetch lỗi |
| Release/export | Backend và presentation đã có | Kiểm chứng policy/ownership trực tiếp, export failure/retry/MIME/filename/content/scope |
| Không tồn tại / ngoài scope | Rubric, bulk/AI grading, filter/sort UI mới, analytics mới | Không thêm; giữ server ordering, policies và export templates |

Không sửa backend production source, schema, API contract, cách cộng điểm, result strategy, permissions hoặc shared shell/components. Các module Dashboard, Question Bank, Teacher Exam, sidebar và Student Exam giữ nguyên source.

## Draft safety

`GradeDraft` giữ `values` và `persisted` theo answer ID trong workspace của một exam. Score `2` và `2.00` tương đương; rỗng khác 0; feedback so sánh đúng chuỗi, kể cả xóa rỗng. Nhập số không hợp lệ vẫn có dirty guard. Revert về persisted bỏ dirty. Sửa sau save không tiếp tục báo “Đã lưu điểm”. Presentation câu tự luận được sort theo `orderIndex`: test nhiều essay tái hiện Câu 5 đứng trước Câu 3 do response không có ordering; đã sửa ở frontend và kiểm tra đúng answer ID khi lưu.

Chỉ nút **Lưu điểm** gửi PUT. Cùng đáp án bị khóa trong lúc lưu để tránh hai request và chỉnh sửa đồng thời; các đáp án khác vẫn độc lập. Response thành công chỉ xác nhận payload đã gửi, không ghi đè draft mới; helper có regression test cho late response. Failure giữ values/error qua đổi trang; retry dùng đúng draft. Background GET không thay thế draft đã chỉnh. Save invalidate cache liên quan; dữ liệu chính thức từ server, không dùng draft làm tổng điểm.

Route khác (kể cả exam khác), Back/Forward có native dialog với focus vào “Ở lại”, Tab/Shift+Tab vòng trong dialog, Escape/cancel trả focus. Khi request đang chạy, không cho xác nhận bỏ trang; nếu request hoàn tất và không còn dirty thì thực hiện điều hướng đang chờ. Đổi query page trong cùng Grading giữ map draft. Reload/tab close dùng `beforeunload` của browser, không giả lập dialog HTML.

## Audit giới hạn và phân trang

- Backend `utils/pagination.ts`: `page` mặc định 1, `pageSize` mặc định 20, maximum **100 mỗi request**. Không phải business cap tổng số lượt.
- Grading prototype cố định `pageSize=100`, không gửi page sau. Student Results entry dùng GET `/student/exams` mặc định page 1/20. Cả hai trả array, không có total.
- Rollout dùng page/pageSize=20 thật, lookahead cùng pageSize để xác định Next. Mốc đúng 20/100 không tạo Next tới trang rỗng. Lỗi lookahead có retry, không âm thầm coi là hết dữ liệu. Page ở URL hỗ trợ Back/Forward; không hardcode số trang.
- Teacher Results vẫn dùng `{items,total}` và pager 20 hiện hữu. Analytics/export lấy toàn bộ final attempts theo backend, không bị giới hạn theo page đang mở.

## Security, điểm và export

Targeted integration giữ IMMEDIATE, AFTER_CLOSE trước/sau đóng, MANUAL trước/sau release; pending/partial không trả total/questions; score/key/explanation giữ độc lập theo settings. Teacher không sở hữu và student gọi teacher endpoint bị từ chối, gồm page 2; student khác không có quyền bị 404, student cùng lớp chỉ nhận attempts của chính mình. Frontend hidden-payload defense giữ nguyên.

Validation UI giữ required/min/max/step 0.01, backend kiểm tra range độc lập. Test chấm nhiều essay xác nhận pending cho tới đủ điểm; zero hợp lệ; sửa điểm cộng lại tổng; feedback persistence qua reload. Không đổi phép tính.

Export dùng download/templates hiện hữu. Browser kiểm tra lỗi rồi retry cả PDF và Excel, filename, MIME, bytes; workbook trên trang 2 vẫn có toàn bộ 24 sinh viên và 22 lượt, PDF có đúng tên sinh viên/bài thi. Integration mở workbook và trích PDF tiếng Việt, kiểm tra điểm và final-attempt analytics.

## Responsive và accessibility

Kiểm tra 1440/1024/820/390/320: không overflow toàn trang; code/table có cuộn riêng; controls ít nhất 44px; tên/title/essay dài; input/textarea có label; keyboard disclosure, Tab/Shift+Tab/Enter/Escape; focus ring và restoration; dialog ở cả 5 widths. Save button contrast ≥4.5 và reduced motion. Đây là kiểm tra accessibility có mục tiêu, không tuyên bố audit WCAG/screen-reader toàn bộ ứng dụng.

## Verification

Baseline trước sửa rollout: 34 unit/frontend, 8 integration, 12 Chromium PASS. Hai regression route draft và stale Results được chạy đỏ trước sửa, xanh sau sửa.

Final lint/typecheck/build PASS; 38 unit/frontend tests (16 files) và 8 integration tests (4 files) PASS. **39 Chromium cases riêng biệt PASS: 32 Grading & Results + 7 compatibility; không còn FAIL hoặc skipped trong tập kiểm tra cuối đã hoàn tất.** Không cộng các lần chạy lại vào coverage count. Mọi browser/API fixture chạy trên PostgreSQL loopback `examspace_focus_test`; không truy cập production. Fault injection chỉ ở Playwright để kiểm chứng pending/error/retry.

Visual inspection phát hiện dialog mới bị CSS reset đẩy lên góc màn hình; đã thêm margin auto, max-height và kiểm tra bounds 16px ở 5 widths.

Lượt gộp đầu kết thúc 30 PASS / 9 FAIL: 7 timeout đăng nhập sau HTTP 429 (backend giữ nguyên limit 30/15 phút), 2 sidebar tests không tìm thấy bank seed vì grading fixtures tích lũy đẩy nó ra ngoài 100 lựa chọn đầu của Teacher Exam. Chạy lại phần phase còn lại trên test server mới cho 5/5 PASS; compatibility trên DB riêng mới migrate/seed cho 7/7 PASS (54,2s). Không tăng rate limit, không xóa dữ liệu cũ, không sửa assertions/module đã duyệt. Có một lượt compatibility đang chạy được dừng để chuyển DB; toàn bộ 7 ca sau đó đã chạy xong.

Các lỗi harness đã sửa: expiresAt phải sau startedAt; essay thứ hai phải có question ID riêng; đợi URL/chỉ mục trang mới sau Previous/Next trước khi đọc danh sách; không chờ navigation load sau khi hủy reload; chờ focus restoration trước khi sửa tiếp; dùng textbox accessible role để không bắt nhầm dialog hoặc text của controlled textarea. Không bỏ tests hoặc giảm assertion dữ liệu.

## Giới hạn còn lại

- Draft chỉ ở memory workspace; browser crash, force close, OS termination hoặc browser bỏ qua beforeunload không thể được bảo vệ tuyệt đối. Không tạo hệ đồng bộ local draft/autosave.
- Khóa request chỉ trong workspace hiện tại. API chưa có version/conflict token cho hai tab cùng sửa một đáp án; không thêm optimistic locking trong phase này.
- Offset pagination theo submittedAt/openAt là contract hiện hữu; dữ liệu đang thay đổi giữa các request có thể dịch trang. Test không duplicate/missing chạy trên fixture ổn định.
- Teacher Exam hiện hữu chỉ tải 100 ngân hàng vào selector; bộ compatibility giả định bank seed nằm trong danh sách đó. Fixture tích lũy đã làm lộ giới hạn này; source module giữ nguyên, ngoài scope Grading & Results.
- Student entry dùng danh sách exam được backend cho phép theo membership hiện tại; API không cung cấp history index của mọi lớp cũ. Direct result endpoint vẫn áp dụng quyền hiện hữu. Không tạo endpoint khác để bypass.

## Artifacts

- `docs/screenshots/grading-results-rollout/review-board-desktop.png`
- `docs/screenshots/grading-results-rollout/review-board-mobile.png`
- `docs/screenshots/grading-results-rollout/evidence-states.png`
- `docs/ux/grading-results-rollout-verification.json`

Prototype boards giữ nguyên. Report/evidence prototype được chú thích là checkpoint lịch sử khi đóng phase; chuỗi kết nối DB local được ẩn. Raw captures/logs nằm `/tmp/grading-rollout`; compositor riêng `tests/ui/grading-results-rollout-boards.py`, không ghi vào thư mục prototype. Đã tự mở và inspect cả ba board, kiểm tra text/crop/state và sửa crop vùng đọc mobile/khoảng trắng trước khi chốt. Manifest, final counts, tên từng test PASS và hash board được lưu trong verification JSON.

## Reproduction và files

Đối với các test Grading & Results hiện tại, đặt `DEMO_PASSWORD` từ môi trường local, dùng cùng giá trị khi chạy seed và Chromium; không lưu giá trị vào repository. Compatibility sử dụng fixture seed hiện hữu trên DB riêng. Dùng test DB loopback đã migrate/seed, `TEST_DATABASE_URL` có tên database chứa `test`. Chạy `npm run lint`, `npm run typecheck`, `npm run build`, `npx vitest run`; integration chọn grading, grading-results, exports và attempts bằng `vitest.integration.config.ts`.

Browser chia thành các batch với test server mới để không vượt rate limit đăng nhập. Dùng `playwright.ui.config.ts`, ba file `grading-results.spec.ts`, `grading-results-rollout.spec.ts`, `grading-results-recovery.spec.ts`; compatibility chọn 3 ca “real attempt, persistence” trong `student-focus.spec.ts` và 4 ca `teacher-sidebar.spec.ts`. `GRADING_SCREENSHOT_DIR=/tmp/grading-rollout/after`; compositor `python3 tests/ui/grading-results-rollout-boards.py` chỉ dùng khi chủ động tạo phiên bản board mới. **Không chạy compositor trong phase đóng này: sáu board đã duyệt phải giữ nguyên.** Không chạy compositor prototype để tạo board rollout.

Source: `features/results.tsx`, `analytics.tsx`, `result-presentation.tsx`, `grading-draft.ts`, `grading-leave.tsx`, `record-pagination.tsx`, `styles/grading-results.css`. Tests/automation và toàn bộ docs/boards được liệt kê kèm hash trong verification JSON; `git diff --stat` chỉ liệt kê 2 tracked files, không bao gồm các untracked files của prototype/rollout.

Git tại điểm dừng review trước khi được duyệt: 2 tracked modified + 26 untracked files (28 tổng cộng, gồm 7 source, 11 tests/automation, 10 docs/screenshots). Branch/HEAD giữ nguyên. `git diff --check` PASS; prototype boards/report/evidence giống snapshot đầu phase theo SHA-256. Không commit, push, deploy, merge hoặc tạo PR. Dừng để review.


## Đóng phase — cleanup, verification và local commit

User đã duyệt full rollout, không cần redesign/polish. Sau cleanup, 7 file source/runtime và 6 approved boards giống byte-for-byte đầu phase đóng theo SHA-256. Giữ 28 file: 7 source, 11 tests/automation, 4 report/evidence và 6 PNG. Không sửa shared components, API, schema, dependency hoặc module khác.

Cleanup: xóa output cũ `test-results/.last-run.json` trước verification; không có raw captures/dumps/logs dư thừa trong phạm vi commit. Ba file test mới chuyển mật khẩu hardcode sang `DEMO_PASSWORD`; dùng cùng giá trị môi trường khi seed DB riêng và chạy test. Evidence prototype ẩn chuỗi kết nối local và được đánh dấu lịch sử. Không lưu credential value, file môi trường, DB dump, raw log hoặc PostgreSQL runtime vào commit. Các fixture chỉ dùng dữ liệu tổng hợp.

Verification sau cleanup: lint, typecheck, build PASS; 38/38 unit/frontend (16 files); 8/8 integration (4 files); Chromium 32/32 phase theo batch 25 + 7, và 7/7 compatibility trên DB riêng mới seed. Không có browser failure, retry, flaky hoặc skipped trong các batch cuối. Bộ `grading-results-before.spec.ts` chỉ phục vụ checkpoint lịch sử trước thay đổi, không thuộc suite final. Lần unit đầu trong sandbox có 37 PASS / 1 FAIL vì Supertest không mở được listener localhost; chạy lại nguyên bộ với quyền loopback được 38 PASS. Không sửa test assertion hoặc product để xử lý môi trường. Build vẫn có cảnh báo bundle >500 kB hiện hữu.

Dùng `playwright.ui.config.ts` hiện hữu và PostgreSQL loopback test mới; không dùng production Supabase. Batch compatibility tách DB để bank seed còn trong selector hiện hữu; mỗi batch khởi động server mới, giữ nguyên auth rate limit. Capture mới chỉ nằm ngoài repository. Không chạy compositor hoặc ghi đè board. Coverage 1440/1024/820/390/320, keyboard/focus/dialog, touch targets, contrast, reduced motion và overflow tiếp tục PASS.

Các lệnh batch final và kết quả được lưu trong [verification manifest](grading-results-rollout-verification.json); hash của mọi file trừ chính manifest được cập nhật. Link report/board và automation paths đã kiểm tra. Các đường dẫn `/tmp` trong evidence là provenance của lượt chạy local, không phải artifact cần checkout; số liệu và sáu board là evidence được lưu bền trong repository. Những ghi nhận “chưa commit/chờ review” ở phần lịch sử mô tả checkpoint trước quyết định duyệt.

Phạm vi chuẩn bị cho một local commit: `feat(ui): roll out grading and results experience`. Baseline parent `2444199f7ca3a0113d5ea3aad7567e70d0677df0`; hash commit thực tế được báo sau khi commit, không tự ghi vào nội dung commit. Không push, deploy, merge, PR hoặc đổi branch.
