# ExamSpace — Design system

Tài liệu này mô tả token và quy tắc giao diện **đang có trong code**. Nguồn token nằm trong `apps/web/src/styles/`. Khi đổi màu, khoảng cách hay bo góc, hãy sửa token ở đó trước, rồi mới sửa component.

Ba tài liệu cũ (Academic Console, Education SaaS V2, Exam Folio visual identity) đã được gộp vào đây. Bản gốc nằm trong [archive](../archive/ux/).

## 1. Hai bộ token và phạm vi áp dụng

| Bộ token | File | Áp dụng cho |
| --- | --- | --- |
| **V2 — indigo** | `pilot-tokens.css` (`.qb-shell`, biến `--qb-*`) | Teacher Dashboard `/teacher`, Question Bank `/teacher/question-banks/**`, `/teacher/questions/**` |
| **Exam Folio — mực xanh trên nền giấy ấm** | `teacher-exams.css` (`.qb-shell.exam-folio-shell` ghi đè `--qb-*`) | Quản lý đề thi của giảng viên `/teacher/exams`, `new`, `:id/edit`, `:id/preview` |
| | `student-focus.css` (`.focus-shell`, `--focus-*`) | Danh sách đề, màn hình vào thi và làm bài của sinh viên |
| | `grading-results.css` (`.record-page`, `--record-*`) | Chấm bài, kết quả của giảng viên và sinh viên |
| | `live-quiz.css` (`--lq-*`) | Live Quiz: host, sinh viên, kết quả |
| Giao diện cơ sở | `main.css`, `management-refinement.css`, `catalog-pagination.css` | Admin, lớp học và các trang còn lại; thanh điều hướng mobile dùng accent `#176656` |

Route nào dùng shell nào được quyết định trong `apps/web/src/App.tsx` (biến `pilot`, `examManagement`, `studentFocus`). Không tạo thêm bộ token thứ ba. Module mới nên dùng bộ Exam Folio.

## 2. Màu

| Vai trò | V2 (indigo) | Exam Folio |
| --- | --- | --- |
| Nền trang | `#f7f8fc` | `#f3f1ea` |
| Bề mặt / tờ đề | `#ffffff` | `#fffefa` |
| Chữ chính | `#20253d` | `#252c2a` |
| Chữ phụ | `#515c72` | `#535e59` |
| Chữ mờ (metadata) | `#626d82` | `#646d67` |
| Đường phân cách | `#e4e7ef` | `#d7d9d1` |
| Viền control | `#8491a6` | `#7b857c` |
| Accent / nút chính | `#4b47c9` | `#24574e` |
| Accent hover | `#3935a8` | `#19443c` |
| Accent nhạt (chọn) | `#efedff` | `#edf2eb` |
| Thành công | `#166534` | `#246242` |
| Cảnh báo | `#854d0e` | `#825b19` |
| Lỗi / xóa | `#b42318` | `#a1372d` |
| Thông tin | `#3730a3` | `#285782` |

Live Quiz bổ sung `--lq-console: #204c43`, `--lq-console-muted: #d4e4d8` và `--lq-selected: #e5eee2` cho màn hình host.

Màu trạng thái luôn đi kèm chữ, không dùng màu làm dấu hiệu duy nhất. Chữ thường cần độ tương phản tối thiểu 4.5:1, viền control và focus tối thiểu 3:1. Số đo các cặp màu V2 nằm trong [ui-redesign-contrast.json](ui-redesign-contrast.json).

## 3. Chữ, khoảng cách, bo góc, đổ bóng

| Nhóm | Giá trị |
| --- | --- |
| Font | `Inter, system-ui, sans-serif`. Không tải font từ dịch vụ ngoài; font hệ thống có đủ tiếng Việt |
| Cỡ chữ | Tiêu đề trang 32 (mobile 27), section 20, nội dung 14, metadata 12. Input trên mobile 16 để tránh zoom |
| Khoảng cách | 4, 8, 12, 16, 24, 32, 48 px. Lề trang: desktop 40, tablet 24, mobile 16 |
| Bo góc V2 | Control 10, surface nhỏ 12, card/dialog 18, hero 24, pill 999 |
| Bo góc Exam Folio | Control 6, card 0: dùng đường kẻ thay cho card |
| Đổ bóng V2 | Surface `0 2px 8px #20253d04`; dropdown `0 8px 24px #20253d0d`; dialog `0 24px 80px #20253d26` |
| Đổ bóng Exam Folio | Không đổ bóng bề mặt |
| Chuyển động | Hover/press 140ms, dialog khoảng 180ms. `prefers-reduced-motion: reduce` tắt toàn bộ animation |

## 4. Bố cục và breakpoint

- **Trên 960px:** editor câu hỏi hai cột (soạn và xem trước), sidebar giảng viên đóng/mở được và trạng thái được nhớ lại.
- **Từ 960px trở xuống:** editor chuyển sang hai tab "Soạn thảo" và "Xem trước".
- **Từ 700px trở xuống:** thanh điều hướng mobile, trang một cột, bộ lọc xếp dọc.
- **Exam Folio:** số câu và số bước đặt trên một trục lề, nhóm nội dung tách bằng đường kẻ thay vì card. Điểm, nguồn và trạng thái sẵn sàng đặt ở lề cạnh nội dung liên quan.

## 5. Component và trạng thái

- **Nút:** nút chính (accent) chỉ dùng cho một tác vụ chính trên mỗi vùng; nút phụ nền trắng có viền; nút xóa/lưu trữ màu đỏ và luôn có hộp xác nhận. Khi đang xử lý, nút đổi nhãn và bị khóa; không báo thành công trước khi API trả về.
- **Form:** label luôn hiện; dùng input, select, checkbox và radio native; vùng nhấn tối thiểu 44px; focus ring 3px, offset 3px; lỗi hiện ngay cạnh trường.
- **Dialog:** `dialog.showModal()` native, có tên truy cập, Escape để hủy, khóa focus bên trong và trả focus về nút đã mở; không cho đóng khi đang gửi.
- **Bảng và danh sách:** giữ semantic của table; phân trang 20 dòng, filter và trang hiện tại lưu trên URL.
- **Thông báo:** dùng trạng thái inline, không tự biến mất; lỗi luôn kèm nút thử lại. Không dùng thư viện toast.
- **Trống / đang tải / lỗi:** phân biệt "chưa có dữ liệu" với "bộ lọc không khớp"; skeleton tĩnh có live status; khi lỗi, không hiển thị số 0 giả.
- **Ảnh câu hỏi** (`QuestionImage` trong `components/Markdown.tsx`): có trạng thái đang tải và lỗi; nút "Thử lại" xin lại signed URL rồi tải lại ảnh, dùng được cả trong form chỉ đọc.
- **Thay đổi chưa lưu** (`useBuilderGuard` trong `features/builder-guard.tsx`): builder đề thi và Live Quiz chặn rời trang khi còn chỉnh sửa chưa lưu, hỏi xác nhận bằng dialog native và `beforeunload`.
- **Làm bài:** timer, tiến độ, trạng thái autosave và nút nộp luôn hiển thị; đáp án chưa gửi được lên server được giữ tạm trong trình duyệt để khôi phục (`features/attempt-drafts.ts`).

## 6. Không dùng

Gradient trang trí, texture giấy, hình minh họa giả, số liệu KPI giả, icon trong ô pastel ở mọi section, animation khi refetch, hoặc thư viện UI/animation mới.
