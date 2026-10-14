# Đối chiếu MASTER_SPEC — 2026-10-14

`MASTER_SPEC.md` ở root là baseline v1 local, bị `.git/info/exclude` loại khỏi Git. Fresh clone commit `864633b93505fdeebb8c2ca15b0b0c3278a3de9d` không có file này; README và SRS có đúng hai Markdown link bị hỏng. Đây là tài liệu phạm vi cần bàn giao, không phải cấu hình runtime.

Bản [MASTER_SPEC](MASTER_SPEC_BASELINE.md) trong thư mục này giữ nguyên từng byte của bản local đã đọc đủ §0–50. Đã rà soát các chuỗi credential/URL/token/key, nội dung mẫu và thông tin định danh: không phát hiện secret thật, mật khẩu, connection string thật hay dữ liệu cá nhân thật; chỉ có tên minh họa và localhost. Hash và giới hạn scan nằm trong evidence của deployment audit. Không sửa bản root hoặc `.git/info/exclude`. Kiểm tra tiếp sau interruption phát hiện rule `MASTER_SPEC.md` khớp basename ở mọi thư mục: bản chuẩn bị `docs/spec/MASTER_SPEC.md` cũng bị exclude. Bản đó được giữ nguyên local; bản bàn giao chính thức dùng `docs/spec/MASTER_SPEC_BASELINE.md`, đã kiểm tra không bị ignore và có thể review rồi track như file thường. Không force-add hoặc sửa exclude. Ở checkpoint trước cleanup, bản này chưa stage/commit; clone từ baseline vẫn thiếu. User sau đó đã duyệt đưa bản canonical vào đúng một local commit. Gate cleanup kiểm tra lại tính không ignored, byte equality và links; post-commit clone phải xác nhận bản canonical nằm trong Git, không dựa vào file root local.

## Discrepancy và provenance

| Nội dung baseline | Source/docs hiện tại | Phân loại / xử lý |
| --- | --- | --- |
| §6 Node 24 LTS **hoặc** LTS tương thích | `.nvmrc` 22; engines ≥22.12; blueprint 22.23.2 | Khác lựa chọn runtime, không đổi business requirement; kiểm tra mới dùng 22.23.2. Chưa chứng nhận Node 24. |
| §7 folder tree và §22–23 routes gợi ý | Feature files và routes thực tế ở `apps/web/src/App.tsx`, API routers | Baseline cho phép chỉnh tên nhỏ; tra source/SDD để gọi endpoint, không copy toàn contract minh họa như API reference chính xác. |
| §19 danh sách event tối thiểu | `packages/shared/src/index.ts`, `apps/api/src/sockets/*` | Typed event/ACK hiện tại là contract thực thi. Baseline không phải danh mục event exhaustive hiện hành. Không đổi protocol. |
| §5/34 Supabase development, §35 Pages/Render | Local PostgreSQL cũng chạy; chưa chứng nhận hosting | Phân biệt target thiết kế với môi trường đã VERIFIED. Local service tái tạo được không thay hosted Storage. |
| §42 checklist còn để trống | Nhiều phase đã hoàn thành; audit cũ có findings đã remediation | Checklist mô tả acceptance, không phải trạng thái test mới. Xem report theo commit/date; không tự tick toàn bộ. |
| §43–46 SRS/SDD/setup bắt buộc | Có tracked SRS/SDD/DEPLOYMENT/README | IMPLEMENTED; README có số test lịch sử, đã chuyển link tới kết quả mới. SRS/SDD không được coi là exhaustive mô tả UX sau mọi rollout. |
| §47–50 agent instructions và ưu tiên | Giữ như phần lịch sử của tài liệu | Không tạo quyền deploy/push/commit trong phase này; request hiện tại của user kiểm soát phạm vi. |
| §49 báo cáo/slide/demo | Chưa có report nộp môn, presentation hoặc video được nhận diện | MISSING/PARTIAL trong handoff; không có rubric giảng viên để suy diễn video bắt buộc. |

Giữ nguyên baseline nghiệp vụ. Đây là đối chiếu phục vụ deployment/handoff, không phải một lần nghiệm thu lại toàn bộ requirements. Các sửa session/presence/published assets đã có trong commit hiện tại, không bị sửa trong phase này.

Spec gốc có đúng năm Markdown hard-break (hai spaces cuối dòng 3–7). `.gitattributes` chỉ cho file baseline này dùng `whitespace=-blank-at-eol`, giữ byte/hash gốc; không áp dụng cho source hay mọi Markdown và không tắt các whitespace checks khác.
