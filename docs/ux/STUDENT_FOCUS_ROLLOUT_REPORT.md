# Student Exam — Focus Desk full rollout

08/10/2026 · Branch `ux/education-saas-redesign-pilot` · HEAD `f22be07eaf6953ae5966366d3ca779df8473c9c3`.

Phát triển tiếp prototype đã được duyệt trên working tree; không reset, checkout, commit, push hoặc deploy. Không đổi schema/API, dependencies, Results/Grading, Teacher hoặc Live Quiz.

## Phạm vi và baseline khôi phục

Prototype trước rollout: lint/typecheck/build PASS; 11 unit/frontend, 4 integration, 7 Chromium PASS. Đã đọc source, diff, prototype report/evidence và visual identity. Khi tiếp tục sau gián đoạn, source/tests còn nguyên nhưng runtime PostgreSQL, screenshots và logs trong `/tmp` đã mất; khôi phục một DB loopback mới, migrate/seed và kiểm chứng lại source hiện tại. Không dùng Supabase production.

| Phần | Khoảng trống đã xác định | Kết quả rollout |
| --- | --- | --- |
| Danh sách bài thi | Card presentation cũ, enum thô; chỉ lấy trang đầu 20 bài | Danh sách theo dòng/rule; trạng thái tiếng Việt; phân trang API hiện có; loading/error/retry/empty |
| Entry | Bắt đầu luôn enabled kể cả chưa mở, đã đóng hoặc hết lượt | Availability theo policy backend; active attempt còn hạn được tiếp tục; dùng server time của detail; backend vẫn quyết định |
| Loading/GET failure | Feedback rời rạc | Focus entry spacing và nút thử tải lại, giữ ErrorBox semantic |
| Main desk | Đã duyệt | Giữ nguyên hierarchy, prompt/option/essay, save feedback, index và submit dialog |
| Pending answer / leave | beforeunload có sẵn, chưa chặn SPA | Dialog Student riêng: tiếp tục hoặc lưu thành công rồi rời trang; lỗi lưu giữ route và nội dung |
| Resume / reconnect | Query snapshot cũ; GET đến chậm ghi đè đáp án mới | Query riêng cho mỗi lần vào workspace; revision từng câu và sequence của GET; queue PUT vẫn tuần tự |
| Long content | Timer gốc rời viewport | Dòng timer 44px chỉ xuất hiện khi session header ra khỏi viewport; không đổi deadline/threshold |
| Mục lục lớn | Câu hiện tại có thể ở ngoài vùng cuộn | Cuộn riêng mục lục tới current question; không scroll toàn trang để đưa index vào giữa |
| Locked / expiry recovery | Pending còn trong RAM; có thể báo saved sai sau terminal rejection + GET failure | Chỉ báo saved khi queue rỗng; khóa controls; retry lấy trạng thái server; thông báo rõ phần chưa kịp lưu |
| Rich content | Prompt đã memoize ở prototype; option và entry có timer render | Memoization riêng Student cho prompt/entry/AnswerControl, không sửa shared Markdown hoặc shared AnswerControl |

## Data safety và regression

- Autosave vẫn debounce 700ms, tối đa ba lần PUT với chờ 500/1000ms. Chỉ một queue; edit mới trong request đang chạy không bị xóa khỏi pending. Terminal rejection không retry PUT vô ích.
- SPA link và browser history Back được chặn khi còn pending; dialog Tab/Shift+Tab, Escape/tiếp tục và lưu-rồi-rời được kiểm tra. Save thất bại giữ câu trả lời trên trang. Sau lưu, navigation không cảnh báo sai.
- Chromium beforeunload: reload và close với `runBeforeUnload` mở cảnh báo, hủy giữ nguyên essay; autosave tiếp tục và reload sau lưu phục hồi server state. Reload bị hủy không có load event, harness không chờ một navigation không xảy ra.
- Back/Forward vào lại attempt tải snapshot mới. Test kiểm tra essay trên UI và GET API, không chỉ state phía client.
- Delayed reconnect GET đã được tái hiện ghi đè radio mới dù PUT thành công. Snapshot chỉ thay các đáp án không bị chỉnh sửa trong thời gian GET; GET cũ hơn cũng không được ghi đè GET mới.
- PUT của câu sau không được gửi trước response của câu trước; test giữ request đầu, chỉnh đáp án và chuyển câu ngay, rồi kiểm tra server state. Prototype regression còn kiểm tra sửa cùng một câu khi PUT đang chạy.
- Single choice, multiple choice check/uncheck, true/false bằng keyboard, essay hơn 10.000 ký tự, xóa essay về rỗng, reload, pending flush trước submit đều được kiểm chứng.
- Manual submit vẫn cho phép câu bỏ trống. Giữ cancel/confirm, double-submit guard, submit failure/retry, chuyển Results và reopen attempt đã khóa.
- Khi hết giờ trong lúc offline: controls bị khóa, không báo phần pending đã lưu; reconnect lấy bài nộp của server và báo rõ phần chưa kịp lưu. Reload bài đã khóa không còn beforeunload cảnh báo sai.

## Timer, navigation, responsive và accessibility

- Timer dùng `expiresAt`, `serverNow`, offset và nhịp 500ms hiện có; reload không reset; warning chỉ dưới 60 giây; backend vẫn quyết định deadline/auto submit.
- Compact timer không tham gia layout nên không tạo layout shift; header gốc phải có bottom < 0 trước khi kiểm tra compact. Dòng lặp được `aria-hidden`; timer gốc vẫn là nhãn đọc duy nhất. Kiểm tra trở lại đầu trang làm compact biến mất, controls được focus nằm dưới dòng 44px.
- Fixtures 4, 30, 60, 100 câu: current/answered, direct/paging, index desktop cao tối đa 410px, tablet/mobile 240px, active nằm trong index viewport. Geometry và thời gian chuyển câu được ghi trong JSON.
- 1440/1024/820/390/320px: entry, single/multiple, essay, index, long prompt/code, submit dialog; không page-level horizontal overflow. Mục lục mobile là disclosure đóng mặc định.
- Markdown/table, inline và block KaTeX, ảnh đúng tỷ lệ; `pre` sở hữu cuộn ngang, Highlight.js code child `overflow: visible`. `scrollLeft=250` và image node giữ nguyên qua timer tick. Trước chụp board, trả code về đầu dòng bằng thao tác riêng để ảnh đọc được; không bỏ assertion giữ scroll.
- Native radio/checkbox/textarea; keyboard Space, Tab/Shift+Tab, focus containment/restoration; reduced motion và touch targets của suite prototype được giữ. Màu chữ, focus và warning giữ palette đã duyệt.

## Phân biệt lỗi

**Product bugs đã tái hiện/sửa:** mất pending khi SPA leave; stale reconnect snapshot; stale cached workspace khi Back; current index không tự cuộn; terminal save rejection + GET lỗi nhưng retry báo “Đã lưu”. Ba regression đầu về leave/reconnect/index đã FAIL trước sửa. Case terminal recovery cũng FAIL ở assertion trạng thái trước sửa.

**Harness:** chờ load sau canceled reload; kiểm tra compact trước khi cuộn đủ; kỳ vọng sai định dạng `00:00` thay vì `00:00:00`; fixture expiry cần đảm bảo `expiresAt > startedAt` cả khi test chạy nhanh. Chỉ sửa lifecycle, trigger và dữ liệu fixture; giữ assertions hành vi và constraints DB.

**Visual/CSS:** inspect ảnh locked phát hiện chữ link-button cùng màu xanh với nền; thêm foreground riêng cho `.focus-shell a.button`, test contrast ≥4.5 và chụp/inspect lại ảnh locked. Main boards không chứa state này nên không stale. Mở rộng Focus Desk cho catalog/loading; compact timer 44px và scroll margin cho focus; dialog fit màn hình nhỏ. Không redesign approved desk. Screenshot code được trả về đầu dòng để tránh chụp vùng trống của các dòng ngắn sau khi test cuộn 250px.

## Giới hạn dữ liệu còn lại

Đáp án pending vẫn ở RAM. Cảnh báo navigation không phải local draft: người dùng ép đóng, chấp nhận browser reload khi còn pending, browser/OS crash hoặc OS đóng app mobile vẫn có thể mất phần chưa gửi. Beforeunload được kiểm chứng trên Chromium; không tuyên bố bảo vệ tuyệt đối trên mọi browser/OS. Nếu offline kéo dài qua deadline, server chỉ chấm đáp án đã nhận trước khi khóa; UI báo rõ, không gia hạn hay gửi lùi thời gian. Không thêm đồng bộ đa tab hoặc local persistence architecture.

## Verification và boards

Kết quả cuối, lệnh, số tests, geometry, hash source/boards được ghi trong `student-focus-rollout-verification.json`. Hai board tổng hợp ở `docs/screenshots/student-focus-rollout/`; captures bổ sung của catalog, unsaved dialog, locked recovery và rich timer desktop/320px được tạo trong thư mục tạm bởi suite, không giữ raw captures trong commit. Approved prototype boards được giữ nguyên SHA-256.

### Kết quả cuối

| Gate | Kết quả |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS; warning chunk size có từ baseline |
| Targeted Vitest unit/frontend, 6 files | **15 PASS / 0 FAIL / 0 skipped** |
| Attempts + Exams integration, 2 files | **4 PASS / 0 FAIL / 0 skipped** |
| Chromium: Student prototype + rollout + Teacher sidebar | **25 PASS / 0 FAIL / 0 skipped**: 7 + 14 + 4 |
| Locked-state recovery + link contrast sau sửa CSS cuối | **1 PASS / 0 FAIL / 0 skipped**; chạy lại targeted case |
| `git diff --check` | PASS |
| Live Quiz | Không chạy thêm: shared AnswerControl byte-for-byte bằng HEAD; Markdown/Live Quiz không đổi |

Full Chromium suite PASS trước điều chỉnh màu chữ link-button cuối; targeted recovery/contrast PASS lại sau chỉnh. Lint/typecheck/build chạy lại sau CSS cuối. Không có thay đổi ảnh hưởng các state trên hai board tổng hợp hoặc Teacher/shared renderer.

Commands đầy đủ trong [verification JSON](student-focus-rollout-verification.json). Browser/API/DB thật dùng test database local. Fault injection chỉ trì hoãn request, trả lỗi, giả lập offline hoặc empty response của state có thật. Không weaken assertions. Warnings khác có từ baseline: pg concurrent-query deprecation, NO_COLOR/FORCE_COLOR.

### Boards đã inspect

- [Desktop 2952×3384](../screenshots/student-focus-rollout/review-board-desktop.png): entry, single, multiple, essay, mục lục 100 câu và submit.
- [Mobile 1680×2987](../screenshots/student-focus-rollout/review-board-mobile.png): entry, single/multiple, mục lục 60 câu, essay, code/KaTeX/compact timer, save error/retry, submit.
- Evidence bổ sung có thể tái tạo: chạy Student Chromium suites với `FOCUS_SCREENSHOT_DIR` và `FOCUS_ROLLOUT_DIR` cùng trỏ tới một thư mục tạm; các file `list-desktop.png`, `unsaved-desktop.png`, `locked-desktop.png`, `rich-timer-1440.png`, `rich-timer-320.png` nằm ở đó.

Agent đã tự mở hai board tổng hợp và inspect ảnh hỗ trợ ở kích thước đọc được. Ảnh app thật, không retouch UI hoặc device frame; caption không bị cắt. Ảnh code được chụp lại sau khi sửa trạng thái cuộn phục vụ review. Prototype boards không overwrite, hashes trùng evidence đã duyệt.

Self-review: prompt vẫn là visual focus; timer/title nhỏ hơn nội dung; index có giới hạn và không dùng màu kiểu game; mobile reflow có chủ đích; essay thoải mái; code không double-scroll; ảnh/KaTeX đọc được; không generic card stack, page overflow hay known regression chưa xử lý trong các checks đã chạy.

### Files và điểm dừng

Source: `App.tsx`, `features/attempts.tsx`, `features/student-exam-state.ts`, `styles/student-focus.css`.
Tests/automation: `features/student-exam-state.test.ts`, `tests/ui/student-focus.spec.ts`, `student-focus-fixtures.ts`, `student-focus-rollout.spec.ts`, `student-focus-boards.py`.
Docs/evidence mới: report này, `student-focus-rollout-verification.json` và thư mục screenshots rollout. Giữ nguyên prototype report/evidence/boards đã duyệt trong working tree.

Đã dừng ở Student Exam full rollout để user review. Branch/HEAD không đổi. Working tree chưa commit. **NO COMMIT · NO PUSH · NO DEPLOY.**


## Đóng phase — 09/10/2026

User đã duyệt full rollout và cho phép một commit tổng hợp Student Exam. Không redesign/polish thêm. Save-error helper vốn mô tả cơ chế autosave nhưng có thể gây hiểu nhầm khi nằm cạnh lỗi; chỉ đổi thành “Thay đổi chưa được lưu.” khi `status === "Lỗi lưu"`. Status/retry/layout và persistence không đổi; regression kiểm tra helper khi lỗi và khi lưu lại thành công.

Giữ nguyên bốn approved boards như snapshot đã duyệt ngày 08/10; panel save-error trong mobile rollout board giữ wording tại thời điểm duyệt, còn wording hiện tại được kiểm chứng bằng regression. Không regenerate/overwrite approved boards. Xóa năm raw captures có thể tái tạo; giữ source, toàn bộ tests/fixtures/automation, reports và evidence tổng hợp. Loại raw log excerpts khỏi JSON evidence.

Verification trước commit và audit cuối được ghi trong `finalCleanup` của [verification JSON](student-focus-rollout-verification.json). Những mục “NO COMMIT” phía trên mô tả mốc review ngày 08/10; policy đóng phase ngày 09/10 là một commit sau khi checks PASS, **NO PUSH · NO DEPLOY · NO PR**.

Final gates ngày 09/10: lint/typecheck/build PASS; **15 unit/frontend + 4 integration + 25 Chromium PASS, 0 FAIL, 0 skipped**. Chromium gồm 21 Student và 4 Teacher compatibility. Regression wording lỗi/lưu lại PASS; ảnh mới 390px đã inspect trong `/tmp`, không đưa raw capture vào commit. Live Quiz/shared renderer không đổi. `git diff --check`, local documentation links và bốn approved-board hashes đều PASS; manifest có đúng 17 file (4 source, 5 tests/automation, 4 reports/evidence, 4 boards), không có `.env`, production credentials, DB files hoặc logs.

Commit đóng phase: `feat(ui): roll out Focus Desk student exam experience`. Bản ghi này lưu baseline trước commit để tránh hash tự tham chiếu; commit thực tế xem trong Git history. Giới hạn RAM/offline đã nêu vẫn giữ nguyên.
