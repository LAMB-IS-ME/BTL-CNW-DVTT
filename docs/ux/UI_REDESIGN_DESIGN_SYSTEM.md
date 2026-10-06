# ExamSpace — Education SaaS, controlled pilot

Hướng thiết kế xác định ngày 05/10/2026, cập nhật theo V2 đã duyệt ngày 06/10/2026; tiếp nối functional pilot tại `5fa11bd`.

## Hướng thiết kế và phạm vi

Một không gian giảng dạy sáng, điềm tĩnh, có điểm nhấn indigo và hình học gợi trang sách. Hierarchy đến từ typography, nhịp khoảng cách và nhóm nội dung; không thêm gradient, gamification hoặc số liệu giả. Dashboard dẫn vào công việc thật và thư viện gần đây. Question Bank giữ table semantic để tìm/so sánh nhanh, thêm nhận diện thư viện thay vì lặp form CRUD.

Shell/component dùng chung được chuẩn bị trong `components`, nhưng chỉ kích hoạt trên `/teacher`, `/teacher/question-banks/**`, `/teacher/questions/**`. Không thay giao diện các module khác khi chưa duyệt rollout. `.qb-shell` là boundary CSS hiện có, được giữ để giảm rủi ro. Business logic, API và backend giữ nguyên.

## Token

| Nhóm | Quy tắc |
| --- | --- |
| Background | `#f7f8fc` |
| Surface / elevated | `#ffffff` / `#ffffff`, elevation riêng cho floating control |
| Text primary / secondary / muted | `#20253d` / `#515c72` / `#626d82` |
| Border / control boundary | `#e4e7ef` / `#8491a6`; viền nhẹ chỉ phân nhóm, viền control vẫn nhận biết rõ |
| Primary / hover | `#4b47c9` / `#3935a8` |
| Primary soft / hero | `#efedff` / `#eeedfc` |
| Success | `#166534` trên `#ecfdf3` |
| Warning | `#854d0e` trên `#fffbeb` |
| Destructive | `#b42318` trên `#fff1f0` |
| Info | `#3730a3` trên `#eeedfc` |
| Typography | Font hệ thống có tiếng Việt, không request font bên ngoài; page title 32/1.3 weight 750 tracking -1px, hero 34/1.22; section 20/1.5, editor section 17; card title 15 weight 600–650; question content 14/1.55 weight 600; body 14/1.55; metadata 12; mobile page title 27 |
| Spacing | 4, 8, 12, 16, 24, 32, 48px; page gutter desktop 40, tablet 24, mobile 16 |
| Radius | Control 10; small surface 12; card/dialog 18; hero 24; status pill 999 |
| Elevation | Surface `0 2px 8px #20253d04`; dropdown/savebar `0 8px 24px #20253d0d`; modal `0 24px 80px #20253d26` |

## Component và trạng thái

1. **Button:** primary indigo cho tác vụ chính; secondary trắng/viền nhẹ; ghost nền trong. Trong question row, chỉnh sửa có nền indigo nhẹ, lưu trữ là text trung tính với nhãn rõ; hover lưu trữ và xác nhận destructive dùng đỏ. Icon action có accessible name, vùng nhấn >=44px. Disabled giữ nhãn và cursor rõ.
2. **Input:** label luôn hiện; input/search/select/textarea native, focus ring 3px + offset 3px, error có viền + chữ. Checkbox/radio native, target không bị overlay. Mobile font 16px. Select dài ưu tiên full row để tránh cắt nhãn.
3. **Card/list/table:** một surface chính; tên ngân hàng 15px, metadata 12px. Question content mạnh hơn metadata; header sentence case, separator nhẹ. Table vẫn giữ row/header semantics. Mobile/tablet gom loại/độ khó/điểm, status và actions cùng hàng; không line-clamp question summary trên viewport nhỏ.
4. **Badge:** pill với chữ trạng thái; success có dot hỗ trợ. Không dùng màu làm dấu hiệu duy nhất.
5. **Dialog:** tái sử dụng native dialog/focus trap/Escape/return focus; radius 18, action footer nền dịu, max-height theo viewport và scroll nội bộ.
6. **Alert/toast:** status inline bền vững, không tự biến mất; error kèm retry; success/unsaved vẫn dùng flow hiện có. Không thêm toast library.
7. **Empty/loading/error:** empty có icon/thông điệp/CTA; skeleton tĩnh có live status; lỗi có retry, không hiển thị số 0 giả khi query lỗi.
8. **Navigation:** sidebar sáng desktop, selected pill indigo và aria-current; topbar cho danh tính/role; mobile navigation 5 mục nhìn thấy cùng lúc, icon + chữ. Skip link vào main. Không thêm drawer để tránh phụ thuộc state khi dirty blocker hoạt động.
9. **Page header/breadcrumb/editor:** breadcrumb nhỏ, h1 rõ và mô tả ngắn; chỉ một CTA chính; header tự wrap. Editor có một surface chung cho form, phân section bằng tiêu đề/separator/spacing. Preview dùng nền lavender nhẹ; lifecycle và sticky savebar giữ nguyên behavior.
10. **Responsive:** >960 hai cột editor, <=960 preview tabs; <=700 mobile nav và page một cột. Dashboard hero bỏ minh họa trang trí trên mobile; quick links và thư viện xếp dọc. Filter mobile thành một cột có đủ nhãn.
11. **Motion:** hover/press 140ms, modal 180ms opacity + translate 6px; dropdown opacity nhẹ; không layout animation khi search/refetch. `prefers-reduced-motion: reduce` tắt motion. Không thêm dependency.

Dashboard lấy ngân hàng đang dùng từ endpoint manage hiện có (3 mục gần đây, total từ server); không suy tổng từ một trang dữ liệu. Link Lớp học/Bài thi/Live Quiz dẫn đến các route hiện có.

Dashboard dùng nhãn sentence case, mint `#356656` trên `#e7f0ed` ở icon thư viện/learning và success ở dấu check; giữ indigo primary. Hover mũi tên 2px/140ms, tắt khi reduced motion. Xem [report V2](UI_POLISH_V2_REPORT.md), [đo tương phản token](ui-redesign-contrast.json) và [automation](UI_PILOT_AUTOMATION.md).
