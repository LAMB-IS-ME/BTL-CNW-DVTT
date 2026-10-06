# Final visual polish pilot — V2

Ngày 06/10/2026 · Branch `ux/education-saas-redesign-pilot` · Checkpoint `5fa11bd`.

Tiếp nối hướng thiết kế V1 đã duyệt. Chỉ polish Teacher Dashboard và Question Bank; giữ nguyên architecture, design tokens, shell/navigation, route/RBAC, business handlers, API, DB/schema và dependencies. V2 đã được duyệt; chỉ đóng gói thành local pilot commit, không rollout sang module khác và không push.

## A. POLISH CHANGES

1. Nội dung câu hỏi dùng cỡ 14px, weight 600 và line-height rõ hơn; metadata nhẹ hơn nhưng giữ tương phản đọc được.
2. Header bảng chuyển về chữ thường theo câu, bỏ letter-spacing/uppercase nhỏ; separator nhẹ và hover/focus theo hàng.
3. Chỉnh sửa có nền indigo rất nhạt; lưu trữ giữ nhãn trực tiếp nhưng giảm trọng lượng thị giác. Xác nhận lưu trữ vẫn dùng destructive styling và hành vi cũ.
4. Detail tablet/mobile gom loại câu hỏi, độ khó và điểm; status cùng hàng với các thao tác. Nội dung câu hỏi không còn bị line-clamp ở viewport nhỏ; giới hạn dữ liệu hiển thị hiện có không đổi.
5. Editor dùng một surface chung cho form; bốn section phân biệt bằng tiêu đề, separator và spacing, thay cho các card riêng.
6. Preview có nền lavender rất nhẹ, nhãn sentence case và hierarchy cân bằng với form. Tabs, save behavior và keyboard focus giữ nguyên.
7. Dashboard giữ nguyên hero/concept; các nhãn phụ dễ đọc hơn, card title 15px và weight 600.
8. Icon thư viện gần đây dùng mint dịu đã có trong palette; dấu check dùng success color. Hover mũi tên chỉ dịch 2px trong 140ms và tuân thủ reduced motion.

### Density — cùng bộ dữ liệu demo

Đo chiều cao PNG full-page, không phải số đo thời gian hoàn thành tác vụ:

| Màn hình | Viewport | V1 | V2 | Giảm |
| --- | ---: | ---: | ---: | ---: |
| Detail, 12 câu hỏi | 1440 | 1807px | 1619px | 10,4% |
| Detail, 12 câu hỏi | 820 | 3596px | 2594px | 27,9% |
| Detail, 12 câu hỏi | 390 | 3996px | 3017px | 24,5% |
| Editor | 1440 | 2243px | 2060px | 8,2% |
| Editor | 820 | 2247px | 2104px | 6,4% |
| Editor | 390 | 2532px | 2365px | 6,6% |

## B. FILES

Source thay đổi trong vòng V2:

- `apps/web/src/styles/question-bank.css`
- `apps/web/src/styles/teacher-dashboard.css`
- `apps/web/src/features/question-bank/banks.tsx` — thêm class cho các ô metadata/status/action; không đổi handler.
- `apps/web/src/features/question-bank/editor.tsx` — đổi cách viết nhãn preview.
- `apps/web/src/features/teacher-dashboard.tsx` — đổi các nhãn phụ sang sentence case.

Automation: `tests/ui/inventory.spec.ts` và `tests/ui/feedback.spec.ts` cho phép chọn thư mục screenshot bằng `UI_SCREENSHOT_DIR`. Bổ sung assertions cho đủ 12 câu hỏi, metadata hiện diện, control ≥44px, control nằm trong viewport, không chồng status và status/action cùng hàng ở tablet/mobile. Không giảm hay bỏ assertion cũ; không sửa các test E2E hiện có.

## C. TESTS

Tất cả kết quả dưới đây xác nhận sau source V2 cuối cùng:

| Gate | PASS | FAIL còn lại |
| --- | ---: | ---: |
| `npm run lint` | 1 gate | 0 |
| `npm run typecheck` | 1 gate | 0 |
| `npm run build` | 1 gate | 0 |
| Unit/frontend | 27 tests duy nhất | 0 |
| Targeted UI | 6 tests, 54,5s | 0 |
| Full Chromium | 14 tests, 2,3 phút | 0 |
| Question Bank E2E | 11 tests, nằm trong 14 ở trên | 0 |
| `git diff --check` | 1 gate | 0 |

Unit run ban đầu: 26 PASS, 1 FAIL tại health test do Supertest không mở được cổng HTTP trong sandbox (`server.address()` trả null). Chỉ chạy lại file `foundation.test.ts` với quyền mở cổng local: 3/3 PASS, không sửa code/test. Hai test của file này đã PASS trước đó nên tổng cuối là 27 test duy nhất, không cộng trùng.

Không chạy lại integration/backend suite: không có thay đổi backend hay business logic; 29/29 PASS của vòng trước là bằng chứng lịch sử, không báo thành lượt chạy mới. Build vẫn có cảnh báo chunk Markdown lớn; E2E có cảnh báo pg concurrent query đã có trước.

Chạy trên PostgreSQL 16 cô lập tại loopback và Storage HTTP double. Chromium xác nhận các flow Question Bank, upload/retry, lifecycle, dirty navigation, responsive và ba flow core Exam/Quiz/RBAC. Targeted UI xác nhận shell boundary, keyboard/focus, dialog bounds, reduced motion và sticky save không che field đang focus.

[Verification JSON](ui-polish-v2-verification.json) lưu kết quả V2, hash source/evidence cuối và số đo density. Source/test runtime giữ nguyên khi cleanup nên reuse Chromium 14/14, UI 6/6 và unit/frontend 27/27; không chạy lại browser/backend suites. Lint, typecheck, build và diff check đã chạy lại sau cleanup ngày 06/10/2026: tất cả PASS (exit 0). Hash của 13 file source/test/config khớp V2 đã duyệt; các local link còn giữ đều hợp lệ. Xem [hướng dẫn automation](UI_PILOT_AUTOMATION.md).

## D. SCREENSHOTS

- [Review board V2 desktop](../screenshots/ui-redesign/review-board-v2-desktop.png) — 4496 × 3445px, Dashboard/list/detail/editor/archived.
- [Review board V2 mobile](../screenshots/ui-redesign/review-board-v2-mobile.png) — 2564 × 3137px, năm màn hình trên + sticky focus.
- [Sticky save / focus mobile](../screenshots/ui-redesign/question-bank-sticky-focus-mobile.png) — 390 × 900px, kiểm tra field lời giải nằm phía trên thanh lưu.

Vòng V2 đã inspect 38 PNG và kiểm tra 29 capture records ở 1440/820/390 không có document overflow. Sau khi được duyệt, chỉ giữ ba evidence cuối trên; raw captures/manifests và board V1 được xóa khỏi workspace, có thể tạo lại bằng automation. Không chỉnh pixel của ba evidence được giữ.

Board dùng screenshot thật ở tỷ lệ 1:1, chỉ thêm label và khoảng cách, không device frame. Full-page editor ghi sticky bar tại vị trí viewport ban đầu; ảnh sticky-focus cho thấy vị trí thanh lưu khi thao tác thật.

## E. RISKS

- Chưa kiểm chứng Firefox/WebKit hoặc bàn phím ảo trên thiết bị thật; vòng này dùng Chromium tại ba viewport yêu cầu.
- Chưa kiểm chứng screen reader hoặc WCAG toàn diện; keyboard/focus/reduced motion và các control chính nằm trong phạm vi đã kiểm tra.
- Chưa kiểm chứng Supabase production; automation dùng môi trường local cô lập.

## F. PHẠM VI COMMIT VÀ CLEANUP

Pilot gồm shared shell/navigation chỉ bật trên route Teacher Dashboard/Question Bank, Dashboard, Question Bank presentation, reusable icons/sidebar, CSS, UI tests/config và documentation/evidence cuối. `features/question-bank/shell.tsx` được chuyển thành `components/ApplicationSidebar.tsx`; không xóa chức năng navigation.

Không có thay đổi backend/schema/API/dependency hoặc redesign Exam, Student Exam, Grading, Results, Live Quiz, Admin. Những thay đổi semantic chung ở main (`id`/`tabIndex`) phục vụ skip link; layout mới chỉ bật trong boundary pilot.

Cleanup bắt đầu với 197 untracked files. Loại bỏ 178 capture/manifest/board trung gian và bốn tài liệu V1 đã được thay thế; giữ source/automation, design system cuối, report/verification V2, contrast measurements, hướng dẫn automation và ba PNG cuối. `.gitignore` loại trừ raw capture directories; không stage env/secrets, dependency/build/cache, raw logs hoặc temporary test results. Chỉ tạo local commit, không push.
