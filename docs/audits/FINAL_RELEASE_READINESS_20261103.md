# ExamSpace — Báo cáo release 03/11/2026

**Kết luận: đã sẵn sàng bàn giao source và kiểm thử trên staging; chưa đủ bằng chứng để go-live trên môi trường thật.** Mọi kiểm thử local đều qua. Phần còn thiếu là kiểm chứng trên hạ tầng thật (mục 5).

## 1. Phạm vi

| Mục | Giá trị |
| --- | --- |
| Branch | `ui/final-refinement-recovery`, đã merge vào `main` qua PR #1 (`8afb7b2`) |
| Commit source | `09a0b17` (builder blockers), `7f38176` (ảnh câu hỏi) trên nền `51251ac` |
| Staging | https://examspace-staging-rc.onrender.com: service `examspace-staging-rc`, nguồn `LAMB-IS-ME/BTL-CNW-DVTT` branch `main`, đang chạy `8afb7b2`, `/api/health` trả ok (20/11/2026) |
| Migration mới | Không có; vẫn là hai migrations `initial` và `integrity` |

## 2. Các lỗi đã sửa

**Builder blockers (`09a0b17`):**
- Cấu hình đề thi và Live Quiz được kiểm tra ở server trước khi lưu, publish hoặc start (`exams/configuration.ts`, `live-quiz/configuration.ts`). Lớp, ngân hàng và câu hỏi phải hợp lệ và thuộc quyền giảng viên.
- Không tạo được phòng Quiz từ nguồn có asset không hợp lệ; phòng cũ tạo trước khi có kiểm tra này vẫn bị chặn khi start.
- Builder đề thi và Quiz chặn rời trang khi còn thay đổi chưa lưu (`builder-guard.tsx`).
- Autosave: lần thử lại sau backoff luôn gửi đáp án mới nhất, không gửi lại payload cũ đã lỗi.

**Ảnh câu hỏi (`7f38176`):**
- Trước đây ảnh lỗi (signed URL lỗi, object 403, ảnh không decode được) chỉ hiện một thẻ `<img>` hỏng, không có thông báo. Nay có trạng thái đang tải, thông báo lỗi và nút **Thử lại**, bấm được bằng chuột, Enter hoặc Space. Thử lại sẽ xin signed URL mới rồi mới tải lại ảnh.
- Trạng thái lỗi được giữ khi component cha render lại (ví dụ khi autosave), và reset khi đổi sang ảnh khác.
- Áp dụng ở mọi nơi hiển thị ảnh: Question Bank, builder và preview, làm bài, chấm điểm, kết quả, thống kê, Live Quiz, và hai preview ảnh chưa lưu trong editor.
- Không ảnh hưởng chấm điểm, timer, autosave hay dữ liệu attempt: test trình duyệt xác nhận bấm Thử lại không tạo thêm request lưu đáp án hay nộp bài.

## 3. Kết quả kiểm thử

Chạy với Node 22.23.4 và PostgreSQL 16.15 thật, trên DB test riêng đã migrate và seed. Storage trong E2E là HTTP fixture chạy local, không phải Supabase.

| Lệnh | Kết quả |
| --- | --- |
| `npm run lint` | Qua |
| `npm run typecheck` | Qua |
| `npm run build` | Qua |
| `npm test` | **166/166 qua, 25 file.** Chạy lại ngày 19/11/2026 trên `7f38176`: vẫn 166/166 |
| `npm run test:integration` | 82/82 qua, 18 file. Chưa chạy lại sau ngày 03/11 |
| `npm run test:e2e` | 56/56 qua: core 22, Student Exam 25, Session Recovery 3, Builder blockers 6. Không retry, không skip. Chưa chạy lại sau ngày 03/11 |
| `npm run test:deployment` | Qua: production bundle, SPA subpath/404/refresh, session, PDF |
| `DEPLOYMENT_SAME_ORIGIN=true node tests/deployment/production-readiness.mjs` | Qua với `NODE_ENV=production` và TLS tự ký local: cookie, CORS, CSRF, WSS, restart, thu hồi session khi logout |
| `npm audit --audit-level=low` | 0 lỗ hổng |

Ba test âm chạy trên renderer cũ đều thất bại đúng như mong đợi, vì thiếu thông báo lỗi và nút thử lại. Điều này xác nhận test bắt được lỗi cũ.

**Chưa chạy:** `npm ci` trên máy sạch, CI trên GitHub, kiểm thử trên cloud, Safari/Firefox, thiết bị cảm ứng thật, các bộ UI lịch sử trong `tests/ui/`.

## 4. Deployment

- Build: `npm ci --include=dev && npm run db:generate && npm run build`.
- Start: `CLIENT_ORIGIN="$RENDER_EXTERNAL_URL" npm run start -w @exam/api`, với `SERVE_WEB=true`. Start không migrate, không seed.
- Service `examspace-staging-rc` deploy từ Public Git Repository `LAMB-IS-ME/BTL-CNW-DVTT`, branch `main`. Auto-deploy tắt; deploy bằng **Manual Deploy** trên dashboard. `render.yaml` khớp với cấu hình service, nhưng không đồng bộ tự động.
- Giữ nguyên `SESSION_SECRET` của service đang chạy.
- Các bước chi tiết xem trong [runbook](../deployment/FREE_STAGING_RUNBOOK.md).

## 5. Vấn đề còn mở

- **Chưa kiểm chứng trên staging cho source mới nhất:**
  - HTTPS, cookie, proxy và TLS tới DB;
  - session sau restart, WSS và kết nối lại;
  - upload, ký URL, hết hạn và thử lại ảnh với Supabase Storage thật;
  - lịch sử migration và kế hoạch backup/restore của DB đích.
- **P2 (chấp nhận được):** danh sách đề thi của giảng viên có thể hiện hai thông báo lỗi kèm nút thử lại cùng lúc (`CatalogControls` và `ErrorNotice`). Không mất dữ liệu; thử lại vẫn hoạt động.
- **P3:** chunk Markdown khoảng 594 kB (minified); cảnh báo deprecation của adapter pg. Gói free của Render ngủ khi không có truy cập, nên không phù hợp cho kỳ thi thật.

## 6. Việc cần làm trước go-live

1. Xác nhận CI xanh trên `main` (`8afb7b2`); build lại từ `npm ci` trên máy sạch.
2. Kiểm tra DB đích: role, số kết nối, `_prisma_migrations`, backup. Chỉ migrate sau khi đã review; không reset, không seed dữ liệu thật.
3. Kiểm thử trên staging theo checklist trong runbook: đăng nhập, hết hạn và đăng nhập lại, đăng xuất, CSRF/CORS, WSS, ảnh (upload, ký URL, lỗi, thử lại, chặn truy cập public), thi, Quiz, chấm, xuất file, refresh route sâu, restart.
4. Chọn thời điểm bảo trì và phương án rollback; không deploy trong ca thi hoặc Quiz.

## Tham khảo

- [Checkpoint builder blockers cùng ngày](../archive/audits/FINAL_BLOCKER_REMEDIATION_20261103.md): đã lưu trữ.
- [Lịch sử khắc phục lỗi](../remediation/REMEDIATION_HISTORY.md).
- [Audit hệ thống 12/10/2026](EXAMSPACE_SYSTEM_AUDIT.md).
