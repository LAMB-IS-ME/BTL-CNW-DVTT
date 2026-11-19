# ExamSpace — Academic Console proposal và phạm vi pilot

Thiết kế modern academic SaaS cho công việc soạn câu hỏi: navy/slate, blue accent, nền gray. Pilot chỉ áp dụng shell khi đang ở đường dẫn Question Bank/editor; rời pilot trở lại giao diện cũ. Không đổi theme toàn cục, framework, Tailwind config, auth/session hoặc DB schema.

## Tokens

| Nhóm | Giá trị / vai trò |
|---|---|
| Font | `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`; không tải font từ dịch vụ ngoài; fallback có tiếng Việt |
| Heading | Page 28/36, section 18/26, panel 16/24, weight 650–750 |
| Body | 14/22 table/form, 15/24 description, 16/27 preview; metadata 12/18 |
| Spacing | 4, 8, 12, 16, 24, 32, 48 px |
| Radius | Control 6, panel/dialog 10, status pill 100 px |
| Shadow | Surface không shadow; dropdown `0 8px 24px #17203314`; dialog `0 24px 80px #111c3233` |
| Background/surface | #F4F6FA / #FFFFFF |
| Ink/muted | #172033 / #536176 |
| Sidebar | #111C32; text #D8E0EF |
| Accent/focus | #3157D5; focus outline 3px + offset 3px; sidebar focus #A0B8FF |
| Border | #D9E0EA (surface); #8491A6 (form controls) |
| Success | #166534 on #ECFDF3; luôn có nhãn chữ |
| Danger | #B42318 on #FFF1F0; destructive confirmation |
| Warning | #854D0E on #FFFBEB |

Cặp text normal cần ≥4.5:1, focus/control boundaries ≥3:1 so với nền. Kiểm tra palette bằng tính WCAG sRGB trong báo cáo cuối, không coi đây là full WCAG audit.

## Hierarchy và components

- Page: sidebar 216px, topbar 64px, breadcrumb nhỏ, heading + mô tả + CTA. Desktop content max 1280px. Mobile nav gọn, list reflow, không card hóa mọi section.
- List/table: một surface có border, header nền slate nhạt, đường phân hàng; tên đậm, subject/count/date/status phụ; “Mở ngân hàng” và “Chỉnh sửa” là control có chữ. Secondary menu không phụ thuộc hover. Có paging 20 hàng, URL lưu filter/page.
- Buttons: primary blue chỉ cho tác vụ chính, secondary nền trắng/viền, text cho điều hướng, danger đỏ cho archive. Busy đổi nhãn và disabled; không giả thành công trước API.
- Form: label luôn hiện, helper text, lỗi cạnh trường + summary; native select/radio/checkbox, min 44px target. Không đổi option TRUE_FALSE wire values (True/False) chỉ đổi nhãn trình bày.
- Dialog: native `dialog.showModal`, accessible name, Escape/hủy, focus containment và trả focus trigger; pending ngăn đóng giữa mutation. Confirm ghi tên nguồn, ảnh hưởng và khả năng khôi phục.
- Dropdown: native details/summary, menu action có chữ; Escape đóng, keyboard focus hiển thị. Không dùng ARIA menu nếu không triển khai roving tabindex.
- Feedback: live status/persistent success inline; lỗi có retry; không auto-dismiss thông báo quan trọng. Toast không là bằng chứng dữ liệu đã persist, E2E reload xác nhận.
- Empty: phân biệt chưa có dữ liệu và bộ lọc không khớp; hướng dẫn cùng CTA tạo/reset filter.
- Skeleton: chỉ khi query pending; có status accessible; error thay skeleton bằng retry. Không shimmer liên tục.
- Editor: form + preview 2 cột desktop; mobile tab Soạn thảo/Xem trước; sticky action footer, dirty state, Hủy. Prompt/options/explanation + metadata chia section, không lồng card mỗi option.
- Media: chọn ảnh trước save, gỡ/chọn lại local; save nội dung → upload → link, báo trạng thái từng bước. Nếu upload fail, giữ ID/nội dung trong editor để thử lại. Gỡ/thay ảnh là thay tham chiếu trong Markdown, giữ object để không phá lịch sử. Không gọi permanent delete trong pilot.

## Motion

Hover/focus/pressed 150ms; dialog 200ms opacity/translate nhỏ. Reduced motion tắt transition/animation. Không animation hàng mỗi refetch, không delay giả, không dependency animation mới.

## Hướng cho các module chưa rollout

Teacher/Admin ưu tiên density vừa phải và navigation nhất quán. Student Exam giữ timer/progress/nav/autosave/submit tập trung, không hiệu ứng làm phân tâm. Live Quiz có thể dùng navy và violet semantic accent, 250–400ms reveal/leaderboard, nhưng cần review riêng. Những đề xuất này chưa được áp dụng.

## UI UX Pro Max

Đã kiểm tra repository [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) và entrypoint ở commit `09170eec67eefd46a7ae85de61b40c194020f997`. Không có bản cài trong skill catalog/local search. Đọc hướng dẫn để đánh giá an toàn; không install, không chạy search/generator, không áp dụng workflow skill, không file nào do skill sinh hoặc sửa. Spec ExamSpace đã xác định hướng thiết kế cụ thể nên dùng CSS/React hiện tại. Không thêm runtime dependency, không cấp credentials cho tooling thiết kế.
