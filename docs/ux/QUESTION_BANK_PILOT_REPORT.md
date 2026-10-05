# Question Bank UX pilot — kết quả nghiệm thu local

Ngày 01/10/2026, branch `ux/question-bank-pilot`, baseline source `2cda149` + working tree chưa commit. Tiếp tục từ source/diff/tests đang dở; không làm lại audit các module khác. Source of truth: [EXAMSPACE_UX_REWORK_SPEC.md](../../EXAMSPACE_UX_REWORK_SPEC.md).

## 1–3. Audit cuối cùng, functional gaps và phần đã sửa

| Finding | Trước pilot | Kết quả hiện tại | Bằng chứng |
|---|---|---|---|
| QB-01 | Archive ở cuối editor; thiếu control mở rõ | FIXED_VERIFIED: nút trên row và đầu editor, “Mở ngân hàng”, confirmation | Chromium lifecycle/responsive |
| QB-02 | Không restore/filter archived | FIXED_VERIFIED: bank/question restore và active/archived/all | Integration lifecycle + Chromium reload |
| QB-03 | Archive làm published fixed/pool thiếu nguồn; bank archive chưa xét nhất quán | FIXED_VERIFIED: transaction rollback + lock theo Teacher, recheck nguồn tại publish/start | Integration fixed/pool/concurrent archives/Quiz |
| QB-04 | Không Hủy/dirty guard/pending; lỗi khó hiểu | FIXED_VERIFIED: Hủy, trạng thái lưu, navigation/reload guard, lỗi tiếng Việt/retry | Chromium cancellation, Back, navigation, reload và lỗi API |
| QB-05 | Save → upload → save thủ công | FIXED_VERIFIED local: chọn trước, một lần bấm Lưu điều phối các bước; retry giữ ID/asset | PNG/JPEG/WebP render sau reload; upload/link failure |
| QB-06 | Thiếu bank search/filter/paging/count, request mỗi phím | FIXED_VERIFIED: toolbar, table, server filters, debounce 300 ms | 8 ký tự → 1 request, late response regression |
| QB-07 | Row search cũ còn bấm được trong debounce; dialog có thể biến mất khi đổi query | FIXED_VERIFIED: trạng thái loading xuyên debounce, không cho thao tác trên kết quả cũ | Browser tái hiện rồi lifecycle/search PASS |
| QB-08 | Dialog chưa focus ô tên; Tab đi ra cuối nhóm control | FIXED_VERIFIED: initial focus, Tab/Shift+Tab containment, Escape, trả focus | Chromium ở 1440/820/390 px |
| QB-09 | Editor mới báo “đã lưu”; thông báo partial-save có thể sai khi PATCH nội dung lỗi | FIXED_VERIFIED: nhãn mới/chưa lưu và thông báo theo bước đã thực sự persist | Source review + save/upload error regression |

Audit ngoài pilot được giữ trong [QUESTION_BANK_AUDIT.md](QUESTION_BANK_AUDIT.md). Không diễn giải coverage source-only của audit cũ thành browser PASS mới.

## 4. Archive/restore thực tế

- `DELETE` vẫn là soft archive bằng `isArchived`; không permanent delete, không migration schema, không cascade lịch sử.
- Thêm `POST /teacher/questions/:questionId/restore` và `POST /teacher/question-banks/:id/restore`. Archive/restore idempotent theo trạng thái, backend kiểm tra ownership và role.
- Bank restore không tự restore những câu đã archive riêng. Khi bank archived, không tạo/sửa/restore câu bên trong; phải restore bank trước.
- Question detail mặc định active; bank list mặc định all. Cả hai có active/archived/all, search và paging. API list bank cũ giữ array contract cho Exam/Quiz picker; `view=manage` trả items/total/subjects.
- Confirmation ghi nguồn, tác động, khả năng khôi phục. Lỗi giữ dialog để thử lại; pending khóa nút. Editor có action archive/restore phía trên, khóa khi đang lưu hoặc còn dirty.

## 5. Bảo vệ Published Exam / Live Quiz / lịch sử

Published Exam chưa qua `closeAt`: sau thay đổi archive trong transaction, kiểm tra lại fixed questions và random pools; thiếu nguồn thì rollback và trả `409 SOURCE_IN_USE` bằng tiếng Việt, có tên đề. Pool còn dư cho phép archive. Hai yêu cầu archive đồng thời không thể cùng lấy mất candidate cuối: regression xác nhận một `204`, một `409`, lượt thi mới vẫn start được.

Live Quiz chưa archive (`isArchived=false`, kể cả Quiz chưa có room) giữ nguồn: bỏ câu khỏi Quiz hoặc archive Quiz trước. Đây là quy tắc bảo thủ rõ ràng, không chỉ kiểm tra phòng đang chạy. Publish/start xét cả trạng thái bank; catalog writes và materialization dùng cùng lock Teacher.

Attempt/Room đã bắt đầu giữ snapshot độc lập. Tests mới xác nhận room snapshot nguyên vẹn sau archive nguồn, attempt vẫn trả lời/nộp được, ảnh lời giải lịch sử vẫn truy cập được sau release và archive question. Không xóa object khi gỡ/thay ảnh trong editor.

## 6. Workflow ảnh

Chọn ảnh → xem thumbnail/preview → bấm **Lưu câu hỏi**. Frontend lưu nội dung để có ID, upload qua backend, rồi tự persist tham chiếu `asset:`. Không yêu cầu người dùng tự làm vòng save/upload/save. Có nhãn pending từng bước, không phần trăm giả.

Upload lỗi: giữ nội dung, file và Question ID để thử lại; không tạo câu thứ hai. Upload thành công nhưng lưu liên kết lỗi: giữ asset ID, retry không upload lại. Chỉ báo hoàn tất sau khi lưu liên kết thành công. Khi content save thất bại, không báo nhầm rằng content đã lưu.

PNG/JPEG/WebP đều upload qua API/DB và HTTP Storage double local, kiểm tra `naturalWidth > 0` sau reload. Đã kiểm tra invalid MIME, >5 MB, giả PNG sai signature, provider/API error, thay ảnh qua file chooser thật, gỡ ảnh và persistence. Chọn vị trí prompt/lời giải; private bucket và quyền ký URL giữ nguyên.

## 7. Search

Debounce 300 ms dùng chung list/detail; URL giữ search/filter/page khi reload. Query key gồm bộ lọc; kết quả cũ về muộn không thay dữ liệu query hiện hành. Trong khi debounce, kết quả cũ không nhận thao tác; hiển thị loading ổn định xuyên các phím gõ. Không request query cũ khi reset page trong lúc đang gõ.

Browser xác nhận `question` với delay 60 ms/phím: **8 request trước → 1 request sau**. Các lần gõ chậm hơn debounce vẫn có thể tạo nhiều request theo thiết kế.

## 8. Unsaved changes

Editor có Hủy và trạng thái mới/chưa lưu/đang lưu/đã lưu. Route blocker bảo vệ Cancel, browser Back, breadcrumb/sidebar navigation; dialog cho tiếp tục hoặc bỏ thay đổi. Reload dùng native beforeunload; dismiss giữ nội dung, reload sau save không cảnh báo sai. Busy chặn rời route trong mutation. Không có auto-draft persist qua lần đóng browser; cảnh báo không phải cơ chế backup.

## 9. Hiệu năng before/after

Bằng chứng gốc được giữ tại [question-bank-baseline.json](question-bank-baseline.json); lần đo cuối tại [question-bank-performance.json](question-bank-performance.json). Chromium headless, Vite dev, PostgreSQL 16 loopback:55432, Storage HTTP double local. Không đo Supabase. Đơn vị ms.

| Thao tác | Trước | Sau, median [min–max] | Số mẫu sau |
|---|---|---|---|
| Mở bank list | 43.5 [39–77] | 98.5 [76–120] | 10 |
| Mở bank detail | 123.5 [115–259] | 92 [79–102] | 10 |
| Save | Create 117, n=1 | Update 76.5 [54–106] | 10 |
| Upload hoàn chỉnh | Chỉ STORAGE_NOT_CONFIGURED; không có success baseline | 181 [144–275] | 5 |
| Search DOM hiển thị sau input | Chưa đo latency chuẩn; 8 request | 324.5 [321–349], gồm debounce 300 | 10 |

Các số navigation/save/upload bao gồm Playwright actionability/assertion overhead, Query cache warm. Baseline và sau khác lượng fixture: list hiện nhiều bank test hơn, detail đo câu fixture riêng; create trước và update sau cũng không cùng thao tác. **Không dùng bảng này để tuyên bố phần trăm cải thiện hay mọi màn hình nhanh hơn.** List đo sau chậm hơn baseline. Search test-wall-clock median 832.5 ms do polling assertion; DOM observer riêng cho thấy 324.5 ms. Đây không phải INP/field p95.

API request timing (bao gồm HTTP/session/backend/DB): list median 10.4 ms (n=3), detail 10.2 (n=1), search 13.1 (n=4), PATCH 14.9 (n=20, gồm link ảnh), upload 17.6 (n=5). Cache khiến số request ít hơn số navigation.

[question-bank-db-performance.json](question-bank-db-performance.json): EXPLAIN ANALYZE representative SELECT, n=10 warm; execution median list 0.2705 ms, detail 0.0175, search 0.075. Không gồm planning, connection/pool, Prisma, auth hoặc toàn bộ query của một request; không lấy số này trừ khỏi API latency để suy ra chính xác từng tầng.

Cải tiến được chứng minh là giảm request và thêm feedback lúc chờ. Không đủ bằng chứng để quy toàn bộ cảm giác “đơ” ban đầu cho DB, Supabase hay thiếu pending. Chưa đo runtime production/cloud hoặc long-task/INP đầy đủ.

## 10–12. Design pilot, screenshot và UI UX Pro Max

[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md): Modern Academic SaaS, navy/slate, blue CTA/focus, nền neutral; green chỉ success/status. CSS scoped `.qb-shell`, chỉ hiện trên route Question Bank/editor của Teacher. Table có control mở rõ, metadata/count/status/date; editor + live preview song song, màn nhỏ dùng tabs, sticky save bar. Micro-interaction giới hạn hover/focus/dialog; reduced motion tắt animation/transition.

Đã mở và inspect ảnh render, không chỉ kiểm tra file tồn tại:

- [AFTER list desktop](../screenshots/question-bank/after-list-desktop.png)
- [AFTER bank detail](../screenshots/question-bank/after-detail.png)
- [AFTER editor](../screenshots/question-bank/after-editor.png)
- [AFTER archived](../screenshots/question-bank/after-archived.png)
- [AFTER mobile](../screenshots/question-bank/after-mobile.png)

Giữ 4 ảnh BEFORE trong cùng thư mục. Ảnh dùng demo/fixture local, không cookie/token/key. Full-page editor phản ánh sticky controls ở vị trí viewport lúc chụp; có thể cuộn để thao tác các trường bên dưới. Không overwrite ảnh module khác trong kết quả bàn giao.

UI UX Pro Max: giữ quyết định phiên trước, chỉ tham khảo repository/entrypoint đã ghi trong DESIGN_SYSTEM, commit tham chiếu `09170eec67eefd46a7ae85de61b40c194020f997`. Lượt này không cài skill, không chạy generator/search/config tooling, không thêm dependency; spec ExamSpace là nguồn thiết kế chính.

## 13–18. Verification

| Gate | Kết quả mới |
|---|---|
| `npm run lint` | PASS |
| `npm run typecheck` | PASS, gồm E2E types |
| `npm test` | **27 PASS / 13 files** |
| `npm run build` | PASS shared/API/web |
| `npm run test:integration` | **29 PASS / 11 files** |
| Chromium full suite | **14 PASS: 11 pilot + 3 existing core** |
| Targeted sau chỉnh thông báo save cuối | **4 PASS**, ảnh/upload/error + evidence; không cộng thành 18 distinct tests |
| `git diff --check` | PASS |

Chromium pilot đi bằng controls: Teacher login → dashboard → Câu hỏi → tạo/tìm bank → Mở ngân hàng → tạo bốn loại câu → save/reload/edit → ảnh → archive/filter archived/restore. Có bank edit/archive/restore, validation, error/retry, loading, search race, dirty Back/navigation/reload và ba kích thước màn hình.

Core browser regression: thi/start/autosave/reload/realtime monitor/submit/essay grading/released result; Live Quiz lobby/start/answer/reveal/final/reload; mobile Student role guard. Các core tests có API fixture/direct URL cũ, không nhận là audit discoverability toàn hệ thống mới.

Integration kiểm tra ownership Teacher, cross-Teacher 404, Student 403, bốn loại câu, idempotency, published fixed/pool guard, concurrent archive, Live Quiz source guard, lịch sử Attempt/Room/media. Dùng `TEST_DATABASE_URL=postgresql://exam_test@127.0.0.1:55432/examspace_ux_test`; không migrate/reset/xóa Supabase. Playwright config từ chối DB không phải loopback/test. Storage double không dùng credentials cloud.

Accessibility đã chạy: label/accessibility name qua getByRole/getByLabel, focus ô đầu/modal cancel, Tab containment, trả focus, Escape đóng dialog/menu, Enter mở menu, Arrow/Home chuyển preview tabs, visible focus, reduced-motion computed style 0s. Escape/Cancel cho thoát modal; không có keyboard trap vĩnh viễn. Chưa phải audit WCAG đầy đủ hoặc test screen reader.

Contrast sRGB: text 16.27:1; muted 6.29; white/blue CTA 6.08; sidebar text 12.81; success 6.76; danger 5.98; warning 6.61. Sửa control border thành #8491A6 (3.19:1 với trắng), sidebar focus #A0B8FF (8.73:1 với navy). Native controls phụ thuộc browser/OS; không tuyên bố mọi state đều qua đo tự động.

Responsive: 1440×900, 820×900 và 390×900 thao tác navigation/menu/editor/preview/dialog/forms; không overflow toàn document. Screenshot desktop 1440×1000. Mobile nav cuộn ngang, table reflow; không phải chỉ resize ảnh. Chưa test iOS Safari/Firefox hay zoom 200% trong lượt này.

## 19–20. File sửa và Git status

Working tree giữ thay đổi hợp lệ từ phiên trước, chưa stage/commit/push. `git status --short`: 10 tracked files modified; các source/test/docs/ảnh mới vẫn untracked. Không `.env`, migration, lockfile/package dependency mới.

Tracked modified:

- `apps/api/src/modules/exams/{routes,service}.ts`
- `apps/api/src/modules/live-quiz/{routes,service}.ts`
- `apps/api/src/modules/question-banks/routes.ts`
- `apps/api/src/utils/errors.ts`
- `apps/api/test/storage.integration.test.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/features/catalog.tsx`
- `playwright.config.ts`

New/untracked:

- `EXAMSPACE_UX_REWORK_SPEC.md` (giữ nguyên spec được bàn giao)
- `apps/api/src/modules/question-banks/{lifecycle,lock}.ts`
- `apps/api/test/question-lifecycle.integration.test.ts`
- `apps/web/src/features/question-bank/{banks,editor,shell,ui}.tsx`
- `apps/web/src/styles/question-bank.css`
- `tests/e2e/{question-bank.spec.ts,storage-fixture.mjs}`
- `docs/ux/{QUESTION_BANK_AUDIT,DESIGN_SYSTEM,QUESTION_BANK_PILOT_REPORT}.md`
- `docs/ux/question-bank-{baseline,performance,db-performance}.json`
- `docs/screenshots/question-bank/`: 4 BEFORE + 5 AFTER PNG

## 21–22. Điểm dừng và giới hạn còn lại

**Dừng sau Question Bank pilot.** Không rollout design sang Classes, Exams, Admin, Student dashboard, Student Exam, Results hoặc Live Quiz. Exam/Quiz chỉ nhận guard/lock chức năng liên quan nguồn câu hỏi; shared router dùng data router để hỗ trợ dirty blocker. Core browser regression đã chạy cho thay đổi này.

- Storage thành công được xác minh tại HTTP boundary double + backend/DB thật local; quyền/bucket/signing/Supabase latency thực chưa được xác minh cloud.
- Save nội dung/upload/link là nhiều bước, không transaction phân tán. Retry trong editor được kiểm tra; mất response sau server commit hoặc reload giữa các bước chưa có idempotency key/resume bền vững. Đóng editor sau upload lỗi có thể để lại câu đã lưu một phần; thông báo nói rõ. Không thêm orphan cleanup tự động vì cần chính sách xét tham chiếu lịch sử.
- Gỡ/thay ảnh giữ object để bảo toàn snapshot; storage usage có thể tăng. Không có hard delete mới.
- Dataset/cache và loại thao tác before/after khác nhau; không kết luận tăng tốc tổng thể. Chưa benchmark production hoặc cloud.
- Build cảnh báo Markdown chunk ~592.55 kB minified; integration có cảnh báo pg concurrent-query deprecation hiện có. Không failure, không tắt warning để làm xanh gate.
- Không redesign những module ngoài pilot; các backlog trong audit vẫn giữ để đánh giá sau.
