# Exam Folio — Teacher Exam rollout

07/10/2026 · Branch `ux/education-saas-redesign-pilot` · Base `4e70c65`.

Tiếp nối prototype đã được người dùng duyệt. Đã rollout Teacher Exam Management và hoàn thiện đóng/mở sidebar của shared Teacher shell đang có trên Exam, Dashboard và Question Bank. Full rollout và sidebar đã được review, duyệt để đóng gói local commit. Không push. Không đổi route, API, schema, RBAC, backend business logic hoặc dependencies.

## A. Rollout theo nội dung từng bước

| Bước | Composition đã triển khai |
| --- | --- |
| 01 — Thông tin | Phần đầu tài liệu mở trên canvas: title input nổi bật, mô tả, rule và tên lớp đã giao; mô tả đã nhập có sheet preview. Không bọc cả form trong rounded card. Độ rộng vùng nhập giới hạn 720px để đọc/soạn thuận tiện khi workspace rộng. |
| 02 — Lớp & lịch | Nhóm người tham gia và khung thời gian riêng. Mở/đóng nằm trên trục tuyến tính; thời lượng/lượt thi phía dưới. Availability có chữ giải thích chỉ có hiệu lực khi bài đã công bố. Xếp dọc khi thiếu chiều ngang. |
| 03 — Câu hỏi | Giữ source vs selected từ prototype: nguồn mở, selected là sheet; chỉ mục 01–n, prompt, loại/độ khó, điểm và bỏ câu nằm trên trục rõ. Pool dùng rule và nhóm field, tổng câu/điểm vẫn tính từ form. Container query cho hai cột 46/54 theo chiều rộng thực của workspace. |
| 04 — Cài đặt | Ba nhóm mở: tính điểm, thứ tự trong đề, sau khi làm bài. Lề trái giải thích; lề phải controls. Native checkbox/select/input giữ handler cũ; không card cho từng setting. |
| 05 — Rà soát | Review sheet có lifecycle, tên/mô tả, lớp, lịch, thời lượng/lượt, fixed/random/tổng điểm, cách tính/công bố kết quả, thứ tự và nội dung kết quả. Câu hỏi đánh số, điểm ở lề; pool riêng. Những prerequisite còn thiếu có danh sách bằng chữ. |

Navigation giữ đúng 5 bước và behavior. Chỉ mục hai chữ số, tên bước, underline + `aria-current` cho bước hiện tại; ✓/○ và chữ phân biệt đã có/cần bổ sung. Trạng thái dựa trên dữ liệu form, không dựa vào việc đã ghé tab. Cài đặt mặc định hợp lệ ghi “Đã có quy tắc”; bước cuối chỉ đánh dấu “Đã công bố” khi lifecycle xác nhận. Readiness là advisory, không thay validation của server hoặc hứa pool đủ nguồn.

Exam list giữ open list đã duyệt: số thứ tự theo dữ liệu thực, title, lịch, phút/lượt, status chữ+ký hiệu và hierarchy của links. `GET /teacher/exams` hiện không trả quan hệ lớp; không bịa tên lớp hay thêm N+1 request. Tên lớp thật hiện ở bước 01 và 05 qua query lớp đã có.

Primary là Lưu & công bố khi nháp, Lưu bài thi khi published. Preview không có nút lưu. Lưu trữ là text action tách khỏi nhóm primary và có ConfirmAction hiện có. Không thêm unpublish/dirty guard.

## B. Sidebar và reflow

Nút 44×44 ở đầu topbar, icon có `aria-label`, `title`, `aria-expanded` và `aria-controls`. Cùng một DOM button dùng đóng/mở nên focus không mất; Enter/Space hoạt động. Khi đóng ở desktop/tablet, sidebar dùng `display:none`, margin-left của header/main/footer về 0 và main bỏ max-width cũ; không để lại reserved column. Reopen control luôn ở topbar, không đè breadcrumb/title/input.

Preference lưu tại `localStorage['examspace.teacher.sidebar']` (`open`/`collapsed`), mặc định mở. Có try/catch để dùng state trong phiên nếu storage bị chặn; nhánh storage bị chặn chưa được mô phỏng trong automation. Không backend, không đồng bộ preference giữa tài khoản/thiết bị.

Chuyển layout tức thời, không animation toàn trang; phù hợp reduced motion và không để controls di chuyển trong một transition. Mobile ≤700px giữ navigation ngang 5 mục như pilot, ẩn toggle desktop; preference collapsed không làm navigation mobile biến mất hoặc tạo cột cố định.

### Geometry từ Playwright, không chỉ assert hidden

| Viewport | Main mở → đóng | Workspace mở → đóng | Hiệu quả |
| --- | --- | --- | --- |
| 1440 | 1208 → 1440px | 1128 → 1360px | +232px; selected sheet rộng thêm; main x=0 khi đóng |
| 820 | 636 → 820px | 588 → 772px | +184px; source/selected từ xếp dọc chuyển thành hai cột; main x=0 |
| 390 | Main x=0, navigation ngang | Một cột | Không bị desktop preference thu hẹp |

`container: folio / inline-size` làm Exam grid phản ứng với chiều rộng thực, không chỉ viewport breakpoint. 740px là ngưỡng source/selected và nhóm nội dung thành hai cột; 1000px là ngưỡng sheet + readiness rail. Canvas giới hạn 1600px ở màn rất rộng; form văn bản có giới hạn đọc riêng.

Số đo được assert trong [sidebar tests](../../tests/ui/teacher-sidebar.spec.ts) và in trên [board so sánh](../screenshots/exam-folio-final/sidebar-open-vs-collapsed.png). JSON geometry là output regenerate, không commit.

## C. Source và automation

Source chính:

- `apps/web/src/features/exams.tsx`: composition 5 bước, completion evidence, tên lớp, schedule availability và review facts. Giữ mutation sequence và archive cache fix.
- `apps/web/src/styles/teacher-exams.css`: Folio groups, timeline, review sheet và container queries. Scoped Exam.
- `apps/web/src/App.tsx`: preference và toggle shared shell, class collapsed.
- `apps/web/src/styles/teacher-shell.css`: layout collapse/reopen, mobile compatibility; không thay palette/content layout V2.
- `apps/web/src/components/ApplicationSidebar.tsx`: id cho `aria-controls`.
- `apps/web/src/components/Icon.tsx`: hai outline icon đóng/mở sidebar.

Tests:

- Giữ `tests/ui/exam.spec.ts`: thêm configurable screenshot output, chụp dialog đúng viewport, cuộn đầu trang trước chụp, tăng assertion archived sau reload.
- `tests/ui/exam-folio.spec.ts`: giữ prototype checks, thêm output override để chuyển raw captures sang output tạm hoặc ignored.
- `tests/ui/teacher-sidebar.spec.ts`: geometry, click/keyboard, focus, reduced motion, persistence, giữ input, reflow cả 5 bước, compatibility trên pilot, mobile preference, readiness và publish validation.
- `tests/ui/exam-folio-final-boards.py`: ghép ảnh thật ở pixel 1:1; không device frame.

Không sửa source/CSS Dashboard hoặc Question Bank V2. So sánh SHA-256 từ đầu vòng cho thấy ngoài shared shell/icons/sidebar và Exam, các module/backend/shared contracts/dependencies không thay đổi. Những thay đổi lớn so với HEAD trong Exam bao gồm work của các vòng trước; không reset/undo work đó.

## D. Archive cache fix

Prototype đã tái hiện lỗi mở lại sau archive vẫn editable: detail cache có staleTime 10 giây nhưng archive mutation không invalidate. Fix đã được kiểm chứng trước rollout và được giữ nguyên.

Giữ `refreshExam(id)` invalidate `['exam', id]` và `['teacher-exams']` sau save/publish/archive thành công, await trước điều hướng. Không dùng remount để xóa state form đang nhập.

Authoring ở cả 1440/820/390 PASS:

1. Archive → list có “Đã lưu trữ”.
2. Mở lại ngay → tên bài thi và Lưu bài thi disabled; không nhận stale editable detail.
3. Reload → trạng thái lưu trữ vẫn đúng, field/save vẫn disabled.
4. Cancel dialog → focus trở về action ban đầu.

Không làm yếu hoặc bỏ assertion cũ. Vòng này không gặp failure mới cần sửa source.

## E. Verification

| Gate trên source cuối | Kết quả |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS; warning chunk Markdown >500kB vẫn có |
| Unit/frontend: critical, timer, Exam selection | 3 files / 8 tests PASS |
| Targeted Exam UI: `exam.spec.ts` | 7/7 PASS — inventory 3 viewport, authoring/persistence 3 viewport, feedback |
| Prototype behavior: `exam-folio.spec.ts` | 3/3 PASS trên source rollout, output ở /tmp |
| Sidebar + readiness: `teacher-sidebar.spec.ts` | 4/4 PASS |
| Dashboard/QB compatibility: `feedback.spec.ts`, `inventory.spec.ts` | 6/6 PASS |
| Full Chromium E2E: `npx playwright test` | **14/14 PASS**, toàn bộ suite hiện có, không filter |
| Integration riêng | Không chạy: backend/API không đổi; full E2E dùng API/DB thực đã PASS |

Full Chromium bao gồm Exam login/start/autosave/refresh/realtime monitor/submit/essay grading/released result; Live Quiz; mobile RBAC; Question Bank lifecycle, uploads, interrupted upload, retry, debounce, dirty navigation, responsive controls và pilot evidence. Không đổi assertions hay source của suite E2E này.

Các checks targeted đo controls ≥44×44, nằm trong viewport, không horizontal overflow, state 5 bước, focus ring, keyboard chọn câu, renumber, persistence qua API, published/preview/archived, retry/loading/error, dialog trap/Escape/return focus. Sidebar test đo geometry thật cho main/workspace/grid; test mobile bắt đầu bằng desktop preference collapsed.

Thực thi trên hai PostgreSQL loopback DB riêng: `examspace_final_test` cho targeted/screenshots/compatibility; `examspace_regression_test` seed sạch cho full Chromium. DB dự án không được dùng. Web/API/storage test servers do Playwright quản lý; PostgreSQL tạm được dừng sau verification.

Sau khi bổ sung test readiness và polish capture, chạy riêng ESLint + TypeScript tests và targeted sidebar/compatibility; không rerun build/full E2E vì source không đổi. Không gate nào còn fail.

Lệnh chính (đặt `TEST_DATABASE_URL` tới dedicated loopback DB có tên chứa `test`):

```bash
npm run lint
npm run typecheck
npm run build
npx vitest run apps/web/src/features/critical.test.tsx apps/web/src/lib/timer.test.ts apps/api/src/modules/exams/selection.test.ts
EXAM_SCREENSHOT_DIR=docs/screenshots/exam-folio-final FOLIO_SCREENSHOT_DIR=/tmp/exam-folio-final/prototype-checks npx playwright test --config playwright.ui.config.ts tests/ui/teacher-sidebar.spec.ts tests/ui/exam.spec.ts tests/ui/exam-folio.spec.ts
npx playwright test
EXAM_SCREENSHOT_DIR=docs/screenshots/exam-folio-final UI_SCREENSHOT_DIR=docs/screenshots/exam-folio-final/pilot-compatibility npx playwright test --config playwright.ui.config.ts tests/ui/feedback.spec.ts tests/ui/inventory.spec.ts tests/ui/teacher-sidebar.spec.ts
python3 tests/ui/exam-folio-final-boards.py
```

## F. Screenshots và tự review

- [Desktop board](../screenshots/exam-folio-final/review-board-desktop.png) — 4416×3918, 6 màn: list + đủ 5 bước, bước câu hỏi đang thu menu.
- [Mobile board](../screenshots/exam-folio-final/review-board-mobile.png) — 3352×3631, 6 màn 390px + đối chiếu tablet 820px thu menu, có nhãn rõ. Mobile không dùng desktop sidebar.
- [Sidebar mở/đóng](../screenshots/exam-folio-final/sidebar-open-vs-collapsed.png) — 2952×5683, cùng viewport/cùng nội dung, kèm số đo main/workspace.

Automation đã chụp 51 inventory PNG (17 trạng thái × 3 viewport), 2 feedback PNG, 4 sidebar PNG, 6 readiness/validation PNG và 38 PNG compatibility. Ba inventory JSON đều 17/17 không overflow. Cleanup chỉ giữ ba board được link ở trên; raw captures/manifests regenerate bằng commands đã ghi. Có list, create, đủ 5 bước, published, archived, preview, pool, confirmation, missing readiness, validation, loading/empty/error. `monitor-entry` chỉ là evidence của đường vào, không rollout giao diện monitor.

Tự inspect trực tiếp: bước 01, 02, 04 desktop; review mobile; sidebar collapsed desktop/tablet; readiness thiếu; archive dialog mobile và cả ba boards. Kết quả tự đánh giá:

- List/nguồn mở, settings chia rule và timeline theo nội dung; không quay lại rounded card stack/KPI grid.
- Không icon pastel square ở section, không pill cho metadata; status bằng ký hiệu và chữ.
- Cùng motif chỉ mục/rule/lề nhưng mỗi bước có cấu trúc khác nhau. Stepper không pill wizard.
- Title/prompt/metadata có hierarchy chữ; fixed question order và điểm vẫn là trục đọc.
- Mobile giữ order và nhịp đọc dọc; review dài do hiển thị đầy đủ đề, không che input bằng sticky action.
- Collapsed không có khoảng sidebar chết; tablet bớt chiều dài nhờ workspace thành hai cột. Ảnh trước/sau và geometry xác nhận.
- Bỏ logo vẫn còn motif tài liệu; đây là tự đánh giá visual, không thay đánh giá của người dùng.

Polish capture: dùng tên bài thi có nghĩa trong test giữ input và đưa con trỏ ra góc trước chụp sidebar để hover không làm nhầm bước đang active. Ảnh gốc không retouch nội dung, boards giữ 1:1 để mở/zoom đọc.

## G. Giới hạn / future improvements

Chưa kiểm chứng Safari/Firefox, screen reader chuyên dụng hoặc dữ liệu lớn hơn fixtures hiện tại. Không tuyên bố cross-browser hay WCAG certification. Nhánh localStorage bị chặn được xử lý fallback nhưng chưa có test giả lập riêng.

List giữ giới hạn/query contract hiện có (20 mục mặc định, không tổng server/class relation); số hiển thị là số dòng đang tải, không phải tổng tất cả bài thi. Readiness không chứng minh pool đủ câu: server vẫn quyết định công bố.

Unpublish và unsaved-navigation warning chỉ là future improvements, chưa implement theo scope guard. Visual rollout đã được duyệt; các tính năng tương lai không thuộc commit này.

## H. Cleanup và commit scope

Trước cleanup: **13 modified và 14 untracked entries** (entries gồm cả thư mục). Phân loại toàn bộ:

| Nhóm | Files / entries ban đầu | Quyết định |
| --- | --- | --- |
| A — Teacher Exam | Modified `features/exams.tsx`; untracked `styles/teacher-exams.css` | Commit source đã duyệt, không chỉnh visual/behavior |
| B — shared shell/sidebar | Modified `App.tsx`, `components/ApplicationSidebar.tsx`, `components/Icon.tsx`; untracked `styles/teacher-shell.css` | Commit toggle, persistence, accessibility và reflow |
| C — archive cache | Nằm trong `features/exams.tsx` | Giữ invalidate detail/list sau mutation |
| D — tests/automation | Modified `tests/ui/feedback.spec.ts`; untracked `exam.spec.ts`, `exam-folio.spec.ts`, `teacher-sidebar.spec.ts`, `exam-folio-boards.py`, `exam-folio-final-boards.py` trong `tests/ui/` | Commit nguyên trạng; giữ cả generator cũ để tái tạo capture nếu cần |
| E — identity/docs | Untracked `VISUAL_IDENTITY_AUDIT.md`, `EXAMSPACE_VISUAL_IDENTITY.md`, `EXAM_FOLIO_FINAL_REPORT.md`, `EXAM_FOLIO_PROTOTYPE_REPORT.md` trong `docs/ux/` | Giữ ba docs đầu; final report hấp thụ reasoning bug/cache của prototype report rồi loại bản trung gian; sửa link/status |
| F — final evidence | Ba board trong untracked `docs/screenshots/exam-folio-final/` | Giữ nguyên byte, không chỉnh lại visual |
| G — raw captures | Phần còn lại của `exam-folio-final/`, toàn bộ `exam-folio-prototype/` và `exam-redesign/` | Loại **236 PNG/JSON** regenerate được, gồm before/raw/duplicate/intermediate boards/manifests |
| H — temporary artifacts | `test-results/`, build output, browser/DB/cache/log ngoài commit | Đã ignored hoặc ở /tmp; không stage, không xóa dependencies đang dùng |
| I — ngoài scope | Modified 5 `docs/screenshots/question-bank/after-*.png`, `quiz-final.png`, `student-result.png`, `docs/ux/question-bank-performance.json` | 8 artifacts do regression ghi đè được trả về đúng base `4e70c65`; không mang vào commit Teacher Exam |

Thêm ignore rules chỉ cho PNG/JSON generated trong ba thư mục Exam, ngoại lệ rõ cho ba final boards. Không ignore source, tests hoặc Markdown docs. Không đổi runtime source/test/automation trong cleanup; đối chiếu SHA-256 với đầu bước đóng gói. Không đổi ba board đã duyệt.

Final cleanup gates: `git diff --check`, lint, typecheck và build chạy lại. Runtime evidence phía trên được reuse: unit/frontend 8/8, Exam UI 10/10, sidebar/readiness 4/4, compatibility 6/6, full Chromium 14/14; không rerun runtime vì source/test giữ nguyên.

Trước stage và trước commit: kiểm tra allowlist scope, local Markdown links, ignore exceptions, secret patterns và artifact paths. Chỉ có thông tin đăng nhập fixture development đã tồn tại trong test suite, không có production credentials, tokens, .env, DB/browser/cache/build/test-results hoặc logs trong staged diff.

Local commit: `feat(ui): roll out Exam Folio teacher workflow`, branch `ux/education-saas-redesign-pilot`. Không push hoặc rollout module tiếp theo.
