# UI pilot — automation và evidence

`playwright.ui.config.ts` kế thừa cấu hình E2E hiện có, chạy Chromium với locale `vi-VN`, timezone `Asia/Bangkok`, một worker. Giữ `tests/ui/inventory.spec.ts` và `tests/ui/feedback.spec.ts` để tái tạo ảnh và kiểm tra UI.

## Môi trường local

Cần dependencies của project, Chromium của Playwright và PostgreSQL local cô lập. `TEST_DATABASE_URL` phải trỏ vào loopback và database có `test` trong tên; config từ chối host khác. Không dùng database production hoặc Supabase cloud. Các cổng 3000, 5173 và 54329 phải trống; Playwright tự khởi động API, web và Storage HTTP double rồi dừng chúng sau test.

Tạo riêng database test mới bằng công cụ PostgreSQL local, sau đó đặt URL của database đó và chạy migrations/seed có sẵn. Không đổi schema hoặc fixture của project:

```bash
export TEST_DATABASE_URL='postgresql://test_user@127.0.0.1:55432/examspace_ui_test'
DOTENV_CONFIG_PATH=/dev/null DATABASE_URL="$TEST_DATABASE_URL" DIRECT_URL="$TEST_DATABASE_URL" npm run db:migrate
DOTENV_CONFIG_PATH=/dev/null NODE_ENV=test DATABASE_URL="$TEST_DATABASE_URL" npm run db:seed
UI_SCREENSHOT_DIR=docs/screenshots/ui-redesign/after-v2 npx playwright test --config playwright.ui.config.ts
```

URL trên là ví dụ local; thay user/port bằng cấu hình test của máy. Chạy một suite tại một thời điểm. Inventory dùng seed mặc định: teacher demo, ngân hàng Công nghệ Web căn bản với 12 câu hỏi; tự tạo thêm ba ngân hàng demo qua API. Nên chụp inventory trước full E2E vì E2E thêm dữ liệu phục vụ các flow khác. Nếu sandbox không cho mở cổng local hoặc chạy Chromium, cần quyền thực thi local phù hợp; không sửa test để bỏ assertion.

## Phạm vi kiểm tra

- Ba inventory tests: 1440/820/390, Dashboard, list/detail/editor, archived, preview và dialog/empty states; chờ query/fonts/layout ổn định rồi kiểm tra document overflow.
- Ba shell/feedback tests: navigation, keyboard/focus, control ≥44px, status/actions cùng hàng ở mobile/tablet, dialog bounds, sticky focus, error/retry, loading/search, hover, disabled pager, reduced motion và boundary ngoài pilot.
- Tổng 6 UI tests tạo 38 PNG + 3 manifest JSON. `UI_SCREENSHOT_DIR` chọn nơi lưu; mặc định là `docs/screenshots/ui-redesign/after/`.
- `UI_PHASE=before` mở rộng inventory ra các route audit ban đầu; tên phase chỉ chọn phạm vi/chỗ lưu, không khôi phục source cũ. Muốn tái tạo giao diện trước redesign phải chạy trên checkout tương ứng.
- Full regression: `TEST_DATABASE_URL` như trên, chạy `npx playwright test` (14 tests, gồm 11 Question Bank và 3 core). Suite hiện có còn ghi các snapshot Question Bank/core và performance ở đường dẫn legacy trong docs; review diff các output đó trước khi stage.

## Chính sách evidence

Chỉ version-control [board desktop](../screenshots/ui-redesign/review-board-v2-desktop.png), [board mobile](../screenshots/ui-redesign/review-board-v2-mobile.png) và [sticky focus mobile](../screenshots/ui-redesign/question-bank-sticky-focus-mobile.png). Board được ghép từ screenshot thật ở tỷ lệ 1:1, chỉ thêm label/gutter, không chỉnh UI hoặc device frame.

Raw directories `before/`, `after/`, `after-v2/` được ignore; test logs, traces và `test-results/` cũng không commit. Dùng thư mục ignored khi chọn `UI_SCREENSHOT_DIR` khác. Report/verification chỉ tham chiếu evidence cuối còn giữ. Không cần rerun browser suites chỉ vì cleanup tài liệu hoặc ảnh; nếu source/runtime thay đổi thì chạy checks bị ảnh hưởng.
