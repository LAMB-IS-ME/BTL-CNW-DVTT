# Lịch sử khắc phục lỗi

Tóm tắt các đợt sửa lỗi sau audit hệ thống ngày 12/10/2026 ([audit](../audits/EXAMSPACE_SYSTEM_AUDIT.md), [danh sách findings](../audits/EXAMSPACE_FINDINGS.md)). Báo cáo chi tiết của từng đợt nằm trong [archive](../archive/remediation/). Evidence máy đọc (JSON, log rút gọn) vẫn để trong thư mục này.

## Đợt 1 — Admin và release gates (12/10/2026, commit `a830497`)

| Mã | Vấn đề | Cách sửa |
| --- | --- | --- |
| ADMIN-001 (P1) | Khóa/mở khóa và đổi role người dùng trả HTTP 500. Prisma không đọc được kiểu `void` của `pg_advisory_xact_lock` | Gom vào `apps/api/src/modules/admin/lock.ts`, dùng `SELECT pg_advisory_xact_lock(904201)::text` trong transaction cũ |
| SEC-001 | 3 advisory, 7 package entry (gồm `concurrently` → `shell-quote`) | Nâng đúng các dependency bị ảnh hưởng; `npm audit` về 0 |
| QA-001 | Harness E2E chấm bài không ổn định | Sửa harness; thêm `tests/e2e/admin.spec.ts` |

Test thêm: `apps/api/test/admin.integration.test.ts`, regression bảo mật KaTeX trong `Markdown.test.tsx`.
Evidence: [admin-release-gates-verification.json](admin-release-gates-verification.json), [final-cleanup-verification.json](final-cleanup-verification.json), [evidence/](evidence/).

## Đợt 2 — Toàn vẹn dữ liệu (13/10/2026, commit `d3e7cba`)

| Mã | Vấn đề | Cách sửa |
| --- | --- | --- |
| ASSET-001 | Ảnh đã được đề đang publish tham chiếu vẫn xóa được, nên học sinh gặp lỗi 404 | Xóa asset đang được tham chiếu bị chặn bằng `409 ASSET_REFERENCED`. Tạo/sửa câu hỏi kiểm tra mọi `asset:<uuid>` (`400 INVALID_ASSET_REFERENCE`). Publish, bắt đầu bài thi và bắt đầu Quiz kiểm tra asset trước khi tạo snapshot. Xóa ghi DB trước rồi mới xóa Storage; nếu Storage lỗi thì trả `502 STORAGE_DELETE_FAILED` |
| SYS-001 | Danh sách và picker bị cắt ở 20 hoặc 100 mục | Thêm tham số opt-in `view=manage` trả về `{items,total}` và component `catalog-pagination.tsx`. Giới hạn `pageSize` tối đa 100 giữ nguyên |
| SYS-002 | Builder hiện 20/22 lớp do dùng chung cache key `['classes']` với trang Lớp học | Tách query key theo đúng contract; lựa chọn ngoài trang hiện tại vẫn được giữ trong draft |

Giới hạn còn lại: có thể còn object mồ côi trong Storage nếu xóa lỗi giữa chừng; phân trang theo offset có thể lệch khi dữ liệu đổi giữa hai request.
Evidence: [data-integrity-verification.json](data-integrity-verification.json), [data-integrity-evidence/](data-integrity-evidence/).

## Đợt 3 — Session và khôi phục Live Quiz (13–14/10/2026, commit `864633b`)

| Mã | Vấn đề | Cách sửa |
| --- | --- | --- |
| AUTH-001 | Session hết hạn nhưng SPA vẫn giữ danh tính và route được bảo vệ | Chỉ `401 UNAUTHENTICATED` hoặc `ACCOUNT_LOCKED` mới kết thúc phiên. `CSRF_INVALID` reset token rồi gọi `/auth/me` để xác nhận. Khi phiên kết thúc: xóa cache và hiện màn hình đăng nhập lại. Kiểm tra `/me` mỗi 30 giây khi tab đang mở |
| REL-001 | Sau khi API crash, người chơi Quiz vẫn hiện "online" | Lúc khởi động, đặt mọi `isConnected` về false. Tuần tự hóa join/leave theo `(roomId, userId)`. Client bỏ qua snapshot cũ hơn theo `serverNow` |

Giới hạn: chỉ chạy một API process; chỉnh sửa chưa lưu của giảng viên không được giữ qua lần đăng nhập lại.
Evidence: [session-realtime-recovery-verification.json](session-realtime-recovery-verification.json), [session-realtime-recovery-evidence/](session-realtime-recovery-evidence/).

## Các bản sửa sau đó

| Commit | Nội dung |
| --- | --- |
| `11e897f` | Chờ kiểm tra session ban đầu xong rồi mới cho đăng nhập |
| `14e5e58` | Chặn race khi rời phòng Quiz qua socket |
| `046a243` | Chặn đáp án cũ ghi đè đáp án mới và chặn nộp bài sớm |
| `51251ac` | Khôi phục đáp án chưa lưu của sinh viên từ bộ nhớ trình duyệt |
| `09a0b17` | Kiểm tra cấu hình đề và Quiz ở server trước khi publish/start; chặn rời builder khi chưa lưu |
| `7f38176` | Ảnh câu hỏi tải lỗi thì hiện nút "Thử lại" thay vì lỗi im lặng |

Chi tiết hai bản sửa cuối và kết quả kiểm thử nằm trong [báo cáo release 03/11/2026](../audits/FINAL_RELEASE_READINESS_20261103.md).
