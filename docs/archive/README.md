# Archive — tài liệu lịch sử

Các file trong thư mục này **không còn mô tả trạng thái hiện tại**. Chúng được giữ nguyên nội dung để tra cứu quá trình làm việc. Mọi link tương đối bên trong đã được sửa theo vị trí mới. Tài liệu đang dùng xem tại [README](../../README.md).

## Gốc archive

| File | Lý do lưu trữ |
| --- | --- |
| [EXAMSPACE_UX_REWORK_SPEC.md](EXAMSPACE_UX_REWORK_SPEC.md) | Đề xuất cải tiến UX v1 (01/10/2026), đã triển khai xong qua các đợt rollout UI |
| [SEED_RECOVERY.md](SEED_RECOVERY.md) | Báo cáo sửa timeout seed trên Supabase (01/10/2026); phần cần dùng đã đưa vào mục Migration và Troubleshooting của `docs/DEPLOYMENT.md` |

## deployment/

| File | Lý do lưu trữ |
| --- | --- |
| [DEPLOYMENT_PLAN.md](deployment/DEPLOYMENT_PLAN.md) | Hai phương án split-origin (Pages hoặc Static Site + API) ngày 14/10; đã được thay bằng một Web Service cùng origin |
| [DEPLOYMENT_READINESS_REPORT.md](deployment/DEPLOYMENT_READINESS_REPORT.md) | Ảnh chụp readiness tại `864633b` (14/10) |
| [FRESH_CLONE_SETUP_REPORT.md](deployment/FRESH_CLONE_SETUP_REPORT.md) | Kiểm tra fresh clone tại `864633b`; vấn đề thiếu MASTER_SPEC đã được giải quyết bằng `docs/spec/MASTER_SPEC_BASELINE.md` |
| [FREE_STAGING_DEPLOYMENT_REPORT.md](deployment/FREE_STAGING_DEPLOYMENT_REPORT.md) | Nhật ký ba lượt deploy staging tháng 10 trên URL cũ `examspace-staging.onrender.com` |
| [FREE_STAGING_RUNBOOK_HISTORY.md](deployment/FREE_STAGING_RUNBOOK_HISTORY.md) | Phần lịch sử tách từ runbook (checkpoint 15/10, URL cũ) |

## audits/

| File | Lý do lưu trữ |
| --- | --- |
| [FINAL_BLOCKER_REMEDIATION_20261103.md](audits/FINAL_BLOCKER_REMEDIATION_20261103.md) và file `.verification.json` đi kèm | Checkpoint sửa builder blockers trước bản sửa ảnh; kết luận đã được thay bằng `docs/audits/FINAL_RELEASE_READINESS_20261103.md` |

## remediation/

Bốn báo cáo chi tiết, đã được tóm tắt trong [REMEDIATION_HISTORY.md](../remediation/REMEDIATION_HISTORY.md):

| File | Nội dung |
| --- | --- |
| [ADMIN_RELEASE_GATES_REPORT.md](remediation/ADMIN_RELEASE_GATES_REPORT.md) | Đợt 1: lỗi Admin P1, dependency advisories, harness E2E (12/10) |
| [FINAL_CLEANUP_VERIFICATION.md](remediation/FINAL_CLEANUP_VERIFICATION.md) | Ghi chép commit của đợt 1 |
| [DATA_INTEGRITY_REPORT.md](remediation/DATA_INTEGRITY_REPORT.md) | Đợt 2: asset đã publish, phân trang, cache builder (13/10) |
| [SESSION_REALTIME_RECOVERY_REPORT.md](remediation/SESSION_REALTIME_RECOVERY_REPORT.md) | Đợt 3: session hết hạn, khôi phục Live Quiz (13–14/10) |

## ux/

Báo cáo từng giai đoạn của đợt làm lại giao diện. Token hiện hành nằm trong [DESIGN_SYSTEM.md](../ux/DESIGN_SYSTEM.md). Báo cáo cuối của từng module vẫn ở `docs/ux/`.

| File | Lý do lưu trữ |
| --- | --- |
| [DESIGN_SYSTEM.md](ux/DESIGN_SYSTEM.md) | Đề xuất "Academic Console" cho pilot Question Bank; đã gộp vào design system mới |
| [UI_REDESIGN_DESIGN_SYSTEM.md](ux/UI_REDESIGN_DESIGN_SYSTEM.md) | Token V2 indigo; đã gộp |
| [EXAMSPACE_VISUAL_IDENTITY.md](ux/EXAMSPACE_VISUAL_IDENTITY.md) | Đặc tả Exam Folio; đã gộp |
| [VISUAL_IDENTITY_AUDIT.md](ux/VISUAL_IDENTITY_AUDIT.md) | Audit trước khi chọn hướng Exam Folio |
| [QUESTION_BANK_AUDIT.md](ux/QUESTION_BANK_AUDIT.md), [QUESTION_BANK_PILOT_REPORT.md](ux/QUESTION_BANK_PILOT_REPORT.md) | Pilot Question Bank (01/10) |
| [UI_POLISH_V2_REPORT.md](ux/UI_POLISH_V2_REPORT.md) | Polish V2 cho Dashboard/Question Bank (06/10) |
| [UI_PILOT_AUTOMATION.md](ux/UI_PILOT_AUTOMATION.md) | Cách chạy `playwright.ui.config.ts` cho pilot; tóm tắt đã có trong README |
| [STUDENT_FOCUS_PROTOTYPE_REPORT.md](ux/STUDENT_FOCUS_PROTOTYPE_REPORT.md) | Prototype; bản cuối là `docs/ux/STUDENT_FOCUS_ROLLOUT_REPORT.md` |
| [GRADING_RESULTS_PROTOTYPE_REPORT.md](ux/GRADING_RESULTS_PROTOTYPE_REPORT.md) | Prototype; bản cuối là `docs/ux/GRADING_RESULTS_ROLLOUT_REPORT.md` |
| [LIVE_QUIZ_PROTOTYPE_REPORT.md](ux/LIVE_QUIZ_PROTOTYPE_REPORT.md), [LIVE_QUIZ_ROLLOUT_REPORT.md](ux/LIVE_QUIZ_ROLLOUT_REPORT.md), [LIVE_QUIZ_VISUAL_POLISH_REPORT.md](ux/LIVE_QUIZ_VISUAL_POLISH_REPORT.md) | Ba giai đoạn trước; bản cuối là `docs/ux/LIVE_QUIZ_FINAL_VERIFICATION.md` |
