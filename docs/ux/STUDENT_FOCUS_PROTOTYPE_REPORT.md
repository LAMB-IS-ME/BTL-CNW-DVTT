# Student Exam — Focus Desk prototype

08/10/2026 · Branch `ux/education-saas-redesign-pilot` · Baseline `f22be07`.

**Thin slice để review visual direction. Chưa rollout toàn bộ Student, chưa commit/push.**

## A. Audit source và behavior

Đã đọc [visual audit](VISUAL_IDENTITY_AUDIT.md), [ExamSpace identity](EXAMSPACE_VISUAL_IDENTITY.md), [Teacher report](EXAM_FOLIO_FINAL_REPORT.md), Teacher Exam JSX/CSS, shell/sidebar, tokens, shared controls, Markdown, Student attempts, socket/timer/API, backend attempts và targeted tests.

| Phần | Source / behavior thật |
| --- | --- |
| Entry | `/student` và `/student/exams` → danh sách; `/student/exams/:id` → mô tả, thời lượng, đóng bài, lượt đã dùng/lịch sử; POST `/student/exams/:id/attempts` tạo hoặc tiếp tục lượt đang làm |
| Taking | `/student/attempts/:id` → `AttemptPage` / `AttemptWorkspace`; GET attempt trả snapshot câu hỏi/đáp án, `expiresAt`, `serverNow`, trạng thái |
| Submitted / results | Manual submit chuyển `/student/results/:examId`; auto submit hoặc mở lại attempt đã nộp hiển thị xác nhận trên attempt route. Không có submitted route riêng. Result release phụ thuộc IMMEDIATE / AFTER_CLOSE / MANUAL và trạng thái chấm; chưa redesign results |
| Guards | React `Guard role="STUDENT"`; API `allow("STUDENT")`, membership của lớp, ownership attempt; start kiểm tra lịch/trạng thái/số lượt. Student không được đọc đáp án đúng trong snapshot công khai |
| Question types | `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `TRUE_FALSE`, `ESSAY`. True/false dùng radio; không tạo type mới |
| Renderer | `AnswerControl` native radio/checkbox/textarea; `Markdown` hỗ trợ heading/list/table/code/KaTeX/image/asset URL. Renderer này còn được Live Quiz sử dụng: implementation của nó giữ nguyên |
| State | React state cho attempt, clock offset, current index, answers, save status, error, submitting. Ref cho pending Map, save queue, debounce, active và autoRequested. Query load tắt refetchOnWindowFocus/reconnect; kết nối được xử lý riêng |
| Autosave | Debounce 700ms; PUT `/student/attempts/:id/answers/:questionId`; tuần tự qua pending Map; tối đa 3 lần, chờ 500/1000ms. Thay đáp án trong request đang chạy không được xóa phiên bản mới khỏi queue |
| Save feedback | `Đang lưu…`, `Đã lưu`, `Lỗi lưu`, ErrorBox và `Thử lưu lại`. Không toast, không local offline success |
| Restore | Đáp án đọc lại từ server khi reload; current question trở lại câu 1 theo behavior cũ. Không localStorage/sessionStorage cho bài làm; pending chỉ nằm trong RAM; beforeunload cảnh báo khi còn pending |
| Timer | Server tạo `expiresAt = min(start + duration, closeAt)`; client dùng `serverNow − receivedAt` để tính offset, cập nhật mỗi 500ms. Reload/refresh lấy lại clock server. Warning **dưới 60 giây** đã tồn tại; giữ nguyên, chỉ đổi presentation |
| Hết giờ | Client gọi submit khi remaining = 0; backend cũng finalizes khi GET/save phát hiện hết hạn và qua expiry job. Late save bị từ chối. Không gia hạn hoặc khôi phục đáp án muộn |
| Submit | Confirmation đã tồn tại. Manual submit flush queue trước POST. Backend row lock + idempotent finalize; frontend busy/disabled. Chưa trả lời hết vẫn nộp được, không validation bắt buộc trả lời. Failure ở dialog có thể thử lại |
| Navigation | Chuyển tự do bằng index / trước / tiếp; answered dựa vào answerText không rỗng hoặc selectedOptionIds.length. Current khác answered; không suy diễn là đúng/sai |
| Reconnect | Window `online` gọi flush + GET refresh; Socket.IO reconnect / submitted event gọi refresh, heartbeat 20s. Không có Student offline banner, stale connection countdown hoặc attempt-lock UI |

Không invent: warning 5 phút, countdown mới, word count, flag/review question, blocking unanswered policy, unsubmit/reopen, anti-cheat, tab monitoring, fullscreen/kiosk, local persistence hoặc tính năng kết nối mới.

## B. Before UX audit

Chromium chạy application thật, login seed account, tạo đề 30 câu trên PostgreSQL loopback riêng. Đã mở ảnh trước sửa ở desktop/tablet/mobile, kiểm tra selection, multiple selection, essay, reload, free navigation, confirmation, keyboard và overflow.

- Desktop: title 42px và timer 32px/nền pastel cạnh tranh với prompt 16px. Mục lục 30 nút bo tạo 10 hàng, làm hai card kéo dài bằng nhau dù nội dung không cần.
- Tablet 820: vẫn giữ rail trái 240px, cột đọc/textarea bị bóp; header xuống dòng, logo/tác vụ chiếm thêm chiều cao.
- Mobile 390: header 175px, title/timer/mục lục đứng trước câu hỏi. Khối câu hỏi bắt đầu **814px**, gần hết viewport 900px. Mục lục cuộn riêng nhưng cả card vẫn chiếm nhiều diện tích.
- Options có border/radius từng hàng trong card lớn; nhiều lớp khung hơn mức cần để đọc đề. Submit dùng style destructive màu cam nhạt và đặt cùng hàng trước/tiếp.
- Current answered question mất dấu answered khi chỉ dựa vào fill current; chưa có tổng câu đã trả lời. Essay là textarea form 9 hàng, typography và padding nhỏ.
- Baseline không có document horizontal overflow trong các capture; không gán lỗi overflow không quan sát được.

## C. Focus Desk implementation

[App.tsx](../../apps/web/src/App.tsx) chỉ kích hoạt `focus-shell` cho Student `/exams/:id` và `/attempts/:id`; guard, router, Teacher header/sidebar và các module còn lại giữ nguyên. Header gọn với brand, đường về danh sách, skip link; bỏ global dashboard destinations và footer khỏi hai route này.

[attempts.tsx](../../apps/web/src/features/attempts.tsx) và [student-focus.css](../../apps/web/src/styles/student-focus.css):

- Entry là cột đọc mở, mô tả và definition list thời lượng/lượt/đóng bài, một action bắt đầu/tiếp tục, lịch sử bên dưới rule. Đang start có nhãn busy; lịch sử không còn status enum thô.
- Desktop: câu hỏi bên trái, mục lục phụ bên phải; title bài thi 18px, prompt 21px, timer 23px không nền. Màu giấy/mực/xanh trầm nối với ExamSpace; không dùng sheet authoring, stepper, metadata rail hay sidebar của Teacher Folio.
- Tablet ≤1000px chuyển một cột đọc. Mobile 390 dùng header 56px, title/context và timer thành hàng riêng, mục lục đóng mặc định; khối câu hỏi bắt đầu **241px**. Không sidebar cố định, sticky widget hay overlay che bài viết.
- Native controls giữ nguyên; option thành các dòng ngăn bởi rule, chọn bằng control + dấu lề + nền rất nhẹ. Fieldset/legend hướng dẫn chọn một/nhiều. Target option lớn hơn 44px, focus 3px xanh.
- Essay có vùng viết tối thiểu 340px desktop / 360px mobile, 16–17px, line-height 1.8, padding 16–20px. Không word count giả.
- Mục lục hiển thị số tabular, current bằng outline, answered bằng dấu ✓ và `aria-description`, tổng answered/total. 30 câu được kiểm tra; grid có giới hạn scroll khi dài. Chọn câu đưa focus về heading câu mới và đóng mục lục mobile.
- Submit tách khỏi trước/tiếp. Dialog Student riêng dùng thông điệp không thể sửa đáp án sau nộp, focus ban đầu Hủy, Tab/Shift+Tab tuần hoàn, Escape/Hủy trả focus, disabled/in-flight guard khi nộp, error/retry. Không đổi shared ConfirmButton.
- Prompt được memoize riêng trong Student để nhịp timer không remount ảnh hoặc làm gián đoạn rich content. Code dùng một vùng cuộn `pre`; bỏ overflow/padding/background lồng của Highlight.js trong `.focus-shell`, giữ syntax highlighting.
- Save feedback nhỏ dưới khu vực làm bài; lỗi có alert ở đầu và retry gần trạng thái, không âm thầm báo saved khi lỗi.

## D. Generic patterns removed / self-review

Đã tự đối chiếu các câu hỏi anti-pattern trong brief với ảnh render:

- Bỏ cặp card lớn, card option bo góc, timer tile, numbered chips có nền và title kiểu dashboard.
- Không nested card, KPI/progress percentage, hero/gradient, icon pastel, wizard pills, gamification hoặc shadow trang trí.
- Hierarchy đến từ cột đọc, cỡ chữ, vị trí và khoảng cách; chỉ một nút primary và màu selected theo chức năng. Prompt thắng title/timer ở màn làm bài.
- Bỏ logo vẫn nhận ra nhịp đọc câu hỏi / rule đáp án / answer-sheet index. Đây là tự đánh giá thiết kế, còn chờ user review direction.
- Mobile có reflow và index disclosure riêng, không thu nhỏ desktop. Board có các state thật, không retouch UI.

## E. Verification

Browser dùng seed `student1@exam.local` và dữ liệu test riêng, không database project/cloud. Nội dung/answers/timer/start/submit chạy qua API/DB thật. Fault injection chỉ dùng cho response lỗi/delay và offline; expiry sửa deadline của attempt trong DB test rồi để API xử lý.

Đã xác nhận:

- Entry/start, resume cùng attemptNo=1, load lỗi/loading, start failure và thử lại.
- Single choice chọn/đổi bằng keyboard; multiple check/uncheck; true/false; essay; đáp án khôi phục từ server sau reload.
- Autosave saved/error, đúng 3 retry, manual retry, offline → online save/restore, thay đáp án trong request đang chạy, flush trước nộp.
- Tự do chuyển tới câu 30, trước/tiếp disabled ở hai đầu, current/answered độc lập, timer còn đúng qua reload; threshold thật và server auto submit.
- Confirmation mở/Hủy/Escape/return focus, Tab/Shift+Tab, pending submit khóa controls, failure vẫn cho retry; manual submit sang results, revisit attempt hiển thị đã nộp.
- 1440/820/390: no document horizontal overflow, question nav/paging/submit ≥44×44, focus-visible, reduced motion. Code scroll riêng (350px viewport / 999px nội dung, scrollLeft 250px giữ qua timer tick); Highlight.js không tạo scroll container con. Markdown table, block KaTeX và ảnh 1600×400 thu về 350×87,5px vẫn render, ảnh giữ nguyên DOM qua timer tick.
- Console/pageerror được kiểm tra trong ba responsive flows. Chỉ loại đúng 401 của `/auth/me` trước login (expected auth probe); fault cases cố ý sinh lỗi được kiểm riêng.
- Teacher sidebar: mở/thu, persistence, desktop/tablet workspace, mobile preference và readiness trong suite có sẵn.

Xem [evidence JSON](student-focus-verification.json) cho geometry, counts và lệnh thực thi.

## F. Tests và phân biệt failures

| Gate | Baseline | Sau prototype |
| --- | --- | --- |
| `npm run lint` | PASS | PASS |
| `npm run typecheck` | PASS | PASS |
| `npm run build` | PASS | PASS |
| Targeted unit/frontend (5 files) | 11/11 PASS | 11/11 PASS |
| Attempts + Exams integration (2 files) | 4/4 PASS | 4/4 PASS |
| Student Chromium responsive | 3/3 PASS | 3/3 PASS — 1440/820/390 |
| Student fault/loading/media checks | Chưa thêm | 4/4 PASS; tổng Student suite 7/7 |
| Teacher sidebar compatibility | Không chạy ở baseline | 4/4 PASS ở lượt trước, không đổi shared shell từ đó |

Lần chạy harness baseline đầu báo fail ở cuối cả 3 flow vì thu cả 401 `/auth/me` trước login. Đã xác minh request, lọc đúng URL/status dự kiến và chạy lại **3/3 pass trước sửa UI**; không bỏ assertion hành vi.

**Product bug phát hiện khi hoàn tất rich-content:** clock cập nhật mỗi 500ms khiến `Markdown` render lại; callback component ảnh khai báo trong render bị đổi identity, ảnh bị unmount/remount. Đã reproduce bằng assertion giữ image node qua một nhịp đồng hồ (FAIL trước fix), rồi dùng `memo(Markdown)` riêng cho prompt Student (PASS sau fix). Không sửa shared renderer. Assertion cuộn code vẫn giữ sau timer tick cũng PASS.

**Visual/CSS adjustment:** Highlight.js vốn có nền/padding/overflow trên `code` nằm trong `pre`; CSS Student chuyển ownership cuộn về `pre`, bỏ bề mặt lồng. Không đổi nội dung, parser hoặc Teacher CSS.

Vòng after đầu: responsive và expiry pass; test keyboard phát hiện Shift+Tab từ Hủy có thể đi ra browser chrome trong native dialog. Đã bổ sung vòng focus Student-only, giữ assertion, fault suite chạy lại pass. Đây là lỗi của prototype đã sửa, không phải lỗi backend baseline.

Hai lỗi harness khác được sửa riêng: route mock loading ban đầu khớp cả document nên chuyển sang URL API chính xác; fixture `$$` cùng dòng được remark-math hiểu là inline nên đổi sang delimiters trên dòng riêng để kiểm tra đúng display math. Không thay renderer hoặc hạ assertions.

Warnings baseline và after: Vite Markdown chunk >500kB; pg adapter cảnh báo gọi client.query khi client đang có query; NO_COLOR/FORCE_COLOR. Không sửa dependency/build policy ngoài scope.

## G. Review boards

- [Desktop board](../screenshots/student-focus-prototype/review-board-desktop.png): entry, selected single choice + 30-question index/save/timer, essay, submit confirmation.
- [Mobile board](../screenshots/student-focus-prototype/review-board-mobile.png): entry, selected, multiple choice, expanded navigation 30 câu, essay, confirmation.

Generator [student-focus-boards.py](../../tests/ui/student-focus-boards.py) ghép screenshot Chromium **1:1**, chỉ thêm nền ngoài/gutter/caption. Không device frame, không crop phần UI để che lỗi. Raw captures hiện tại ở `/tmp/focus-after`; raw/log/DB trong `/tmp` của lượt trước đã mất sau gián đoạn môi trường, baseline được giữ theo kết quả đã ghi trong chat/report. Hai board cuối vẫn nguyên vẹn trong repo. Đã tự mở và inspect lại cả hai board sau khi tiếp tục. Không regenerate: các panel của board không chứa code/image stress fixture, và memoization không đổi visual của chúng. Kết quả inspect: chữ/state đúng, không loading/blank capture, không caption chồng/cắt, alignment đúng; có thể mở ảnh gốc để đọc ở 100%.

## H. Changed files

- Source: `apps/web/src/App.tsx`, `apps/web/src/features/attempts.tsx`, `apps/web/src/styles/student-focus.css`.
- Automation: `tests/ui/student-focus.spec.ts`, `tests/ui/student-focus-boards.py`.
- Docs: report này, `docs/ux/student-focus-verification.json`.
- Artifacts: hai review boards trong `docs/screenshots/student-focus-prototype/`.

Không sửa Teacher feature/CSS, Question Bank, Dashboard, shared AnswerControl implementation, results/grading, Live Quiz, API, schema, dependencies, existing tests hoặc approved boards.

## I. Risks / future improvements chưa implement

- **Persistence cũ:** pending answers chỉ trong RAM; beforeunload cảnh báo full reload nhưng không có SPA navigation blocker. Chỉ rời trang sau “Đã lưu”; mất mạng rồi đóng tab có thể mất đáp án chưa gửi. Không thêm local draft storage hoặc đổi API trong prototype.
- **Timer cũ:** dùng clock offset tại load/reconnect, không time-sync polling; thay đổi system clock giữa phiên có thể làm lệch hiển thị đến lần refresh. Server deadline vẫn là thẩm quyền. Không đổi thuật toán đồng hồ.
- **Loading/error cũ:** initial query có retry tự động; sau lỗi cuối không có nút retry tại trang, reload sẽ thử lại. Chưa tạo hệ error recovery mới.
- **Reconnect cũ:** không có Student offline banner; lỗi reconnect ở socket hook được catch im lặng. Save failure vẫn có alert/retry đã test.
- Chỉ Chromium; chưa Safari/Firefox, screen reader thực tế hay usability study. Native semantics, focus, targets/overflow không đồng nghĩa chứng nhận WCAG.
- Timer ở đầu trang, không sticky khi cuộn bài dài. Sticky timer cần review riêng nếu người dùng muốn giữ đồng hồ trong tầm nhìn khi viết dài.
- 30 câu đủ stress direction hiện tại; chưa performance test 500 câu. Không full-system regression hoặc full Student rollout.

## J. Git và cách tái tạo

Branch giữ `ux/education-saas-redesign-pilot`, HEAD giữ `f22be07`; working tree chứa prototype để review. **Không commit, không push, không reset/checkout branch.**

Đặt `TEST_DATABASE_URL` tới PostgreSQL loopback riêng có `test` trong tên; chạy migrations và development seed theo [hướng dẫn automation](UI_PILOT_AUTOMATION.md). Vòng này dùng DB `examspace_focus_test`, binaries/data tạm trong `/tmp/focus-pg`, không cài dependency vào repo. Khi tiếp tục sau gián đoạn đã dựng lại riêng môi trường test này; không chạy lại baseline/audit. Teacher sidebar 4/4 PASS của lượt trước được giữ: shared shell/Teacher không đổi kể từ lần kiểm đó; CSS cuối chỉ scope `.focus-shell`, memoization chỉ ở Student prompt.

```bash
npm run lint
npm run typecheck
npm run build
npx vitest run apps/web/src/features/critical.test.tsx apps/web/src/lib/timer.test.ts apps/web/src/lib/api.test.ts apps/web/src/components/Markdown.test.tsx apps/api/src/modules/attempts/logic.test.ts
npx vitest run --config vitest.integration.config.ts apps/api/test/attempts.integration.test.ts apps/api/test/exams.integration.test.ts
npx playwright test --config playwright.ui.config.ts tests/ui/student-focus.spec.ts
# Teacher compatibility đã chạy trước gián đoạn; không cần rerun sau Student-only fix.
# EXAM_SCREENSHOT_DIR=/tmp/focus-teacher-check npx playwright test --config playwright.ui.config.ts tests/ui/teacher-sidebar.spec.ts
python3 tests/ui/student-focus-boards.py
```

`FOCUS_PHASE=before` chỉ chọn baseline assertions/captures, không khôi phục UI cũ. Muốn tái tạo BEFORE dùng source tại `f22be07` trong checkout riêng và automation mới; không reset workspace này. Các artifacts test Teacher được chuyển vào `/tmp`, bảo toàn approved screenshots.
