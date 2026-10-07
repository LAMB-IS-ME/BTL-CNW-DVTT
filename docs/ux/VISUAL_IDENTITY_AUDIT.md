# ExamSpace — Visual identity audit

Ngày 07/10/2026 · **Căn cứ lựa chọn Exam Folio.**

Audit được thực hiện trước prototype, đối chiếu V2 tại `4e70c65` và work Exam ban đầu. Direction đã được chọn, triển khai và duyệt; trạng thái hiện hành ở [báo cáo cuối](EXAM_FOLIO_FINAL_REPORT.md). Những nhận xét “hiện tại” bên dưới mô tả baseline tại thời điểm audit.

“Trông AI-generated” ở đây mô tả cảm nhận về một tổ hợp visual quen thuộc, không phải kết luận về nguồn gốc sản phẩm hay một chỉ số đã được nghiên cứu người dùng xác nhận.

## Bằng chứng đã đọc

- [Board V2 desktop](../screenshots/ui-redesign/review-board-v2-desktop.png) và [mobile](../screenshots/ui-redesign/review-board-v2-mobile.png): Dashboard, Question Bank list/detail/editor/archived.
- [Design system đã duyệt](UI_REDESIGN_DESIGN_SYSTEM.md), [report V2](UI_POLISH_V2_REPORT.md), [hướng dẫn automation](UI_PILOT_AUTOMATION.md).
- Source: [tokens](../../apps/web/src/styles/pilot-tokens.css), [shared shell và Question Bank CSS](../../apps/web/src/styles/question-bank.css), [Dashboard CSS](../../apps/web/src/styles/teacher-dashboard.css), [Dashboard JSX](../../apps/web/src/features/teacher-dashboard.tsx), [sidebar](../../apps/web/src/components/ApplicationSidebar.tsx).
- Teacher Exam đang dang dở: [JSX](../../apps/web/src/features/exams.tsx), [CSS](../../apps/web/src/styles/teacher-exams.css); đã đối chiếu các capture list/schedule/questions/review/mobile của rollout ban đầu. Raw captures đã được final evidence thay thế và loại khi cleanup; [board cuối](../screenshots/exam-folio-final/review-board-desktop.png) ghi lại kết quả đã duyệt, không phải ảnh baseline audit.

## A. Generic AI/SaaS patterns hiện tại

### 1. Các shape khác kích thước nhưng vẫn cùng một họ

`pilot-tokens.css` đặt control 10px, small surface 12px, card/dialog 18px, hero 24px. Badge dùng pill 100px ở `.qb-badge`. Không phải mọi radius bằng nhau; vấn đề là gần như mọi cấp đều là hình chữ nhật bo mềm, nền nhạt, viền nhẹ. Button, input, panel và hero cùng truyền một cảm giác “tile thân thiện”. Vai trò tương tác và vai trò chứa nội dung chưa khác nhau đủ rõ.

Board V2 cho thấy hình dáng này lặp từ navigation đang chọn, icon library, filter inputs đến preview và thanh lưu. Exam tiếp tục thêm `.exam-section-icon` 36×36/radius 10, `.exam-step-number` radius 8 và `.exam-selected` radius 12. Số bước cũng thành một icon tile: motif giáo dục bị biểu đạt bằng thêm một hộp, thay vì bằng thứ tự hay cấu trúc đề.

### 2. Surface bao quanh nội dung mạnh hơn cấu trúc nội dung

`.qb-surface`, `.qb-editor-fields`, `.qb-preview` và `.exam-main-panel` đều làm vùng nội dung thành một tấm trắng/lavender có viền và bo. Phía trong lại có control bo, status pill và vùng selected màu nhạt. Khi nhìn toàn board, người xem nhận ra hệ thống container trước khi nhận ra khác biệt giữa thư viện, đề thi và công việc hôm nay.

Cần ghi nhận V2 **đã bỏ card riêng cho từng section editor**: `.qb-editor-section` chỉ còn separator. Dashboard workflow và Exam summary cũng có phần không card. Vì vậy không nên “xóa hết card” để sửa một chẩn đoán quá rộng. Cần tiếp tục giảm lớp bao và cho mỗi loại nội dung một cách trình bày riêng.

### 3. Màu ít nhưng phân bố quá giống nhau

Nền `#f7f8fc`, trắng, indigo `#4b47c9`, lavender `#efedff/#eeedfc` xuất hiện ở CTA, nav, hero, section marker, preview, selected rows và summary strip. Success mint là bổ sung có ích, nhưng phần lớn màu vẫn đi vào các miếng nền bo góc. Thay indigo bằng xanh lá rồi giữ nguyên cấu trúc sẽ vẫn mang cảm giác template.

Indigo không sai về khả năng đọc: tính riêng `#4b47c9` với trắng cho khoảng **6,90:1**. Nó cũng phù hợp một công cụ số nghiêm túc. Điểm yếu là chưa có lý do riêng của ExamSpace để indigo đồng thời làm màu thương hiệu, điểm nhấn trang trí, trạng thái chọn và motif hero. Đề xuất đổi palette chỉ có ý nghĩa cùng việc đổi composition và quy tắc dùng màu.

### 4. Sidebar hợp lý về chức năng, chưa mang đặc trưng sản phẩm

Sidebar trắng 232px, logo vuông màu accent, selected pill toàn hàng, icon outline, nhãn khu vực uppercase nhỏ và câu slogan ở đáy là cấu trúc dashboard phổ biến. Nội dung vùng đáy có ít quan hệ với tác vụ hiện tại. Không cần chuyển navigation sang vị trí lạ để tạo khác biệt; có thể giữ đường đi quen thuộc và đổi selected treatment thành dấu mục lục/lề đang đọc.

### 5. Hero nói về học tập nhưng dùng ngữ pháp minh họa onboarding

`teacher-dashboard.tsx` có hai tờ giấy xoay, vòng tròn lavender, chấm vàng, dấu cộng và huy hiệu check nổi. Giấy liên quan đúng ngành, nhưng bố cục blob + vật thể nghiêng + check là cách minh họa thông dụng. Hero lớn nói khẩu hiệu, còn dữ liệu thư viện thực đứng sau. Motif “tờ đề” hiện mới là hình trang trí; nó chưa giúp đọc số câu, thứ tự, điểm hay ghi chú trong editor.

### 6. Không hoàn toàn đối xứng, nhưng nhịp lặp vẫn mạnh

Dashboard thực tế dùng tỷ lệ cột `1.35fr / 1fr`; Question Editor dùng `1.15fr / 1fr`. Không có căn cứ nói mọi màn đều đối xứng. Tuy nhiên chúng cùng bắt đầu bằng breadcrumb/kicker/title/description, sau đó là panel lớn, icon tile, các section cách đều. Độ bất đối xứng nhẹ chưa đủ tạo khác biệt về công việc.

Exam có một dải 5 nút cân nhau, số trong hộp, rồi h2 lặp số của bước trong hộp nữa. Người dùng thấy đồng thời “03” ở stepper và section heading. Đây là lặp ornament, chưa bổ sung thông tin.

### 7. Typography đang ưu tiên chrome hơn nội dung học thuật

| Vai trò hiện tại | Bằng chứng CSS | Tác động quan sát/nhận định |
|---|---|---|
| Page title | 32px/1.3, weight 750, tracking −1px; mobile 27px | Đọc rõ nhưng gần như màn nào cũng có cùng giọng và tỷ lệ |
| Hero | 34px/1.22, weight 750 | Chỉ nhỉnh hơn page title; trọng lượng thị giác vẫn dựa nhiều vào khối lavender |
| Section | 20px chung, 17px editor | Chênh lệch title/section ổn, nhưng section marker màu thường cạnh tranh với tiêu đề |
| Question | Table 14px/600; Exam selected 13px/600 | Nội dung chuyên môn có lúc nhỏ hơn phần giới thiệu hệ thống, nhất là mobile |
| Metadata | 12px; một số status/label 11px | Mật độ tốt, nhưng khi nhiều dòng cùng nhỏ/nhạt thì tổng thể thành một lớp xám khó phân cấp |
| Kicker | `.qb-kicker` 10px, tracking 1.5px, uppercase | Tiếng Việt có dấu ở kích thước nhỏ bị vụn; nhiều micro-label không thêm ngữ cảnh |
| Dashboard kicker | Đã override thành 12px, sentence case | Đây là cải tiến V2 cần giữ; không quy mọi kicker về cùng một lỗi |
| Numbers | Exam summary 24px/700, mobile 21px | Có nhấn số nhưng bốn metric ngang nhau dễ thành KPI strip; chưa phân rõ số câu/điểm với metadata |

Stack khai báo Inter rồi system fallback. Không thấy tải Inter bằng `@font-face`, import font UI hoặc `<link>` trong entrypoint; KaTeX có font riêng cho công thức. Vì vậy **không khẳng định máy nào cũng đang render Inter**. Font hiện tại đủ khả năng thử identity bằng tỷ lệ, độ đậm và nhịp đọc; đổi font không phải bước đầu bắt buộc.

### 8. Actions và statuses đang cùng một cấp hình học

V2 đã phân primary/secondary/destructive và cần giữ. Tuy nhiên nhiều action nhỏ vẫn là nút bo nhẹ đứng cạnh pill; hàng có tên, metadata, pill, nút sửa, nút lưu trữ rất đều. Mỗi hàng nhìn như một bản sao, trong khi nội dung câu hỏi có thể là LaTeX, code hoặc văn bản dài.

Exam list hiển thị năm đường đi cho mọi trạng thái. Không đổi đường đi ở audit này; về visual, cần một thao tác theo ngữ cảnh nổi bật, phần còn lại là nhóm công cụ nhỏ. Với bản lưu trữ, nhãn hướng đến “xem cấu hình” sẽ trung thực hơn cảm giác “chỉnh sửa” nếu UI chỉ đọc; quyết định copy/behavior này phải được kiểm chứng ở vòng triển khai riêng.

### 9. Whitespace có scale tốt, nhưng thiếu phân cấp theo tác vụ

4/8px scale không phải nguyên nhân cần bỏ. Vấn đề là nhiều vùng dùng cùng padding 24, gap 24, radius 18 bất kể là thông tin giới thiệu, form hay nội dung đề. Ở mobile, lời dẫn + stepper + section introduction chiếm khá nhiều trước field đầu; summary lại lặp title/count bên dưới. Cần dùng khoảng cách lớn cho chuyển ngữ cảnh, nhỏ cho quan hệ label/value; không random spacing để giả “thủ công”.

### 10. Chưa có motif đi xuyên từ Dashboard đến một câu hỏi

Book icon, tờ giấy, check và số bước đều hợp chủ đề, nhưng chưa tuân theo một quy tắc chung về lề, baseline, thứ tự và dấu đánh. Đặc trưng có thể đến từ cách **đánh số câu và đặt điểm ở lề**, thay vì thêm hình minh họa sách vào mọi màn.

## B. Những phần nên giữ

- Route, RBAC, workflow 5 bước, API, cấu trúc câu hỏi/điểm/pool và logic lưu/công bố.
- Navigation có chữ, vị trí dễ đoán, skip link, `aria-current`, focus rõ và native controls.
- Table/list phục vụ so sánh, nguồn dữ liệu thật, không tạo thống kê minh họa giả.
- V2 dùng một surface form với section separator; không quay lại card cho mỗi field.
- Nội dung Markdown/LaTeX/code; wrap nội dung dài trên mobile; nhãn hiện diện.
- Primary action rõ; destructive tách riêng; dialog có hủy, Escape và trả focus.
- Error/retry/loading/empty phân biệt; không giả thành công hoặc coi lỗi tải là 0 dữ liệu.
- Density vừa phải, 44px touch target theo chuẩn nội bộ, reduced motion và spacing scale nhất quán.

## C. Những phần nên thay

| Giữ mục đích | Thay cách biểu đạt |
|---|---|
| Định vị trang | Bớt kicker/slogan lặp; title + task context ngắn + một đường chuẩn |
| Chia vùng | Sheet cho nội dung soạn; lề chú giải không khung; toolbar không card |
| Nhấn câu được chọn | Checkbox + thứ tự + đường lề; bỏ việc phủ toàn bộ cụm bằng lavender |
| Thể hiện tiến trình | Mục lục 5 bước với current marker; không 5 pill và h2 lặp số trong hộp |
| Cung cấp summary | Một dòng cấu trúc đề và checklist có nghĩa; không hàng bốn KPI trang trí |
| Tạo cá tính | Cột đánh số, đường căn lề, annotation ngắn; bỏ hero giấy nghiêng/check nổi |
| Thể hiện trạng thái | Nhãn chữ + dấu hiệu chức năng; fill pastel dành cho cảnh báo có nội dung |
| Typography | Tăng vai trò question text, ổn định cột số, giảm chữ hoa nhỏ; chưa thêm font |

## D. UI-UX-Pro-Max: đã inspect gì, dùng gì, loại gì

### Nguồn và cách dùng thực tế

Tìm trong workspace, `/home/lamb/Project`, skills và cache Codex không thấy bản cài local. `DESIGN_SYSTEM.md` dẫn repo chính thức cùng commit tham khảo cũ `09170eec67eefd46a7ae85de61b40c194020f997`. Vòng này clone riêng vào `/tmp/examspace-identity-audit/ui-ux-pro-max`, đọc ở **commit `477bcb28c9812b385cb51a4605ddf30d7b2266e2`**. Không coi dữ liệu hiện tại là dữ liệu của commit cũ.

Đã đọc [SKILL.md](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/477bcb28c9812b385cb51a4605ddf30d7b2266e2/.claude/skills/ui-ux-pro-max/SKILL.md), quick-reference, pro-rules, các CSV và script `search.py`, `core.py`, `design_system.py`, `reasoning_contract.py`. Engine tra cứu BM25 trên CSV, sau đó ghép product/style/color/typography/landing và reasoning. Đây không phải công cụ quan sát UI đang render.

Script sử dụng Python standard library; nhánh đã chạy không gọi mạng hay shell. Nhánh ghi tài liệu nằm sau `persist`; đã chạy với `python3 -B`, không `--persist`, `--force`, `--output-dir`, installer, npm hoặc runtime dependency. Kết quả stdout được giữ riêng trong `/tmp/examspace-identity-audit`; hai tài liệu project được biên soạn thủ công. Không cung cấp env/database key cho script. [Mã CLI](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/477bcb28c9812b385cb51a4605ddf30d7b2266e2/src/ui-ux-pro-max/scripts/search.py), [nhánh generation/persistence](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/477bcb28c9812b385cb51a4605ddf30d7b2266e2/src/ui-ux-pro-max/scripts/design_system.py#L944).

### Truy vấn đã chạy và đánh giá kết quả

Các query dưới đây truyền cho `src/ui-ux-pro-max/scripts/search.py` bằng absolute path; dùng `--json` để đọc đầy đủ.

| Query / chế độ | Kết quả kiểm tra | Quyết định cho ExamSpace |
|---|---|---|
| `LMS teacher assessment --design-system` | Khớp LMS; Flat Design; landing Feature-Rich Showcase; typography Bold Typography Mobile | Giữ định hướng chức năng; loại hero/features/CTA marketing và font poster |
| `LMS Learning Management System --domain product -n 2` | LMS đầu tiên; Kids Learning thứ hai | Chỉ dùng LMS; không suy rằng education phải trẻ con |
| `Productivity Tool --domain product -n 1` | Flat Design + Micro-interactions | Thao tác nhanh, ưu tiên việc đang làm |
| `Minimalism Swiss Style --domain style -n 1` | `minimalism-and-swiss-style` | Lấy hierarchy/grid; không biến thành trang trắng vô danh |
| `Editorial Grid Magazine --domain style -n 1` | `editorial-grid-magazine` | Lấy bất đối xứng có căn lề; không dùng drop cap/page flip |
| `Academia Scholarly Mobile --domain style -n 1` | Variant mobile, supplemental, mahogany/brass | Loại: quá cổ điển và nhiều chất liệu cho form thi |
| `Academic Research --domain typography -n 2` | Academic/Research, Academic/Archival | Tham khảo sự phân vai; chưa tải font serif |
| `Minimal Swiss --domain typography -n 1` | Một họ font, đổi weight | Chứng minh không cần thêm font để có hierarchy |
| `LMS Learning Management System --domain color -n 1` | Teal/amber, nhiều semantic token | Tham khảo vai trò, không chép palette nguyên trạng |
| `visual hierarchy whitespace --domain ux -n 3` | Hover/breadcrumb/heading; không khớp tốt ý định | Retry `heading hierarchy`: đúng heading semantics; whitespace lấy từ quick-reference |
| `tabular numbers --domain ux -n 2` | Number Formatting, chưa đúng tabular | Retry `tabular`: **0 kết quả**; dùng rule `number-tabular` trong quick-reference, không báo có database match |
| `multi step progress --domain ux -n 2` | Progress Indicators + Heading Line Balance | Giữ chỉ báo bước; kết quả thứ hai không dùng cho stepper |
| `badge meaning color --domain ux -n 2` | Color Only + Contextual Live Badge Updates | State phải có chữ; tránh nhiều live-region cạnh tranh |
| `focus not obscured --domain ux -n 2` | Hai mức Minimum/Enhanced khác nhau | Focus cần nhìn thấy; không đánh đồng toàn bộ AAA với AA |
| `form label accessibility --stack react -n 2` | Label form controls + useFormStatus | Dùng guidance label; không đổi kiến trúc form theo kết quả thứ hai |

### Knowledge được chuyển thành quyết định

- **Product:** LMS và Productivity là hai profile phù hợp hơn Educational App chung. Giá trị rút ra là khả năng tìm tác vụ và làm việc hiệu quả. Không nhập course grid, forum, gradebook hay calendar integration chỉ vì generator liệt kê. [Products CSV](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/477bcb28c9812b385cb51a4605ddf30d7b2266e2/src/ui-ux-pro-max/data/products.csv#L180), [reasoning LMS](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/477bcb28c9812b385cb51a4605ddf30d7b2266e2/src/ui-ux-pro-max/data/ui-reasoning.csv#L180).
- **Style:** Swiss và Editorial mở ra hierarchy bằng chữ/lề/cột. Academia là đối chứng cần loại. Bento vẫn phụ thuộc card nên không giải quyết feedback hiện tại. Đây là lựa chọn có điều kiện, không trộn toàn bộ preset. [Styles CSV](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/477bcb28c9812b385cb51a4605ddf30d7b2266e2/src/ui-ux-pro-max/data/styles.csv).
- **Typography:** Repo có cả single-family và academic pairings. Chọn phân vai trong system font hiện có; không suy rằng học thuật bắt buộc serif. [Typography CSV](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/477bcb28c9812b385cb51a4605ddf30d7b2266e2/src/ui-ux-pro-max/data/typography.csv).
- **Color:** Bảng LMS là nguồn so sánh, không chứng minh teal là màu thương hiệu đúng. Palette cuối bên dưới là quyết định riêng, có tính contrast riêng. [Colors CSV](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/477bcb28c9812b385cb51a4605ddf30d7b2266e2/src/ui-ux-pro-max/data/colors.csv).
- **Interaction:** Giữ labels, bước hiện tại, state bằng chữ và focus. Không mang scroll reveal, gamification hoặc animation trình diễn vào editor. [UX CSV](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/477bcb28c9812b385cb51a4605ddf30d7b2266e2/src/ui-ux-pro-max/data/ux-guidelines.csv), [quick-reference](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/477bcb28c9812b385cb51a4605ddf30d7b2266e2/.claude/skills/ui-ux-pro-max/references/quick-reference.md).

### Giới hạn và anti-patterns cần đọc đúng

Repo có nhắc purple/pink gradients ở một số ngành, nhưng đó không phải bằng chứng mọi indigo đều “AI”. Profile giáo dục rộng có thể khuyến khích clay/gamification; không áp nó cho giảng viên soạn đề. Tham số variance cao cũng hướng sang Brutalism/Bento, không tự bảo đảm identity tốt.

Đã inspect mã [StylePreview](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/477bcb28c9812b385cb51a4605ddf30d7b2266e2/gallery/components/StylePreview.tsx): gallery dùng demo card, gradient nền và thanh giả để biểu diễn style. Nó không phải ví dụ LMS vận hành hoàn chỉnh. Không cài/chạy gallery, không lấy preview card làm layout sản phẩm. Chưa tìm thấy trong phần đã đọc một case Teacher Exam hoàn chỉnh có thể dùng nguyên mẫu; đề xuất ExamSpace là tổng hợp riêng từ knowledge và code thực tế.

## E. Ba visual directions cho ExamSpace

Đây là ba giả thuyết thiết kế khác nhau về cách tổ chức thông tin, không chỉ ba màu. Điểm phù hợp là đánh giá thiết kế trong vòng audit, chưa được user test.

| Tiêu chí | A — **Exam Folio / Phiếu đề & lề ghi chú** | B — **Signal Desk / Bảng điều phối kỳ thi** | C — **Index Atlas / Mục lục tri thức** |
|---|---|---|---|
| Mood | Điềm tĩnh, học thuật đương đại, gần công việc biên soạn | Chính xác, nhanh, có nhịp vận hành | Cởi mở, có tính khám phá, giống thư mục nghiên cứu |
| Palette concept | Giấy trung tính ấm, mực than, xanh mực trầm; màu semantic nhỏ | Canvas sáng, dải charcoal; vàng nhạt đánh dấu hành động; dữ liệu trung tính | Trắng hơi xanh, mực đen, cobalt cho cross-reference; một điểm đất nung có tiết chế |
| Typography | Title vừa, question text nổi; số thứ tự ở lề; số điểm tabular | Chữ UI gọn, số/thời lượng lớn có chọn lọc; nhãn gắn chặt số | Tên thư viện/title nổi hơn chrome; metadata kiểu index; câu hỏi như đoạn trích |
| Layout | Sheet chính + lề annotation; bất đối xứng do vai trò nội dung | Dải trạng thái ngang + workspace chia vùng chức năng; ưu tiên scan nhanh | Một cột danh mục trội + cột tham chiếu hẹp; nhiều vùng mở |
| Card/surface | Một sheet cho đề; summary/toolbar/rows không card | Surface phân bằng sắc độ và đường chuẩn; không grid KPI card | Danh sách mở, rule dọc/ngang; panel chỉ khi preview/đối chiếu |
| Icon | Outline nhỏ đứng trực tiếp cạnh chữ; không tile nền | Dấu hiệu trạng thái đơn giản, một số pictogram kỹ thuật | Reference marker, số mục và link; ít icon hơn hai hướng còn lại |
| Motion | Phản hồi chọn 120ms; dialog 160ms; không chuyển cảnh giấy | Phản hồi 100–140ms; cập nhật số không nhảy bố cục | Underline/focus ngắn; không animate sơ đồ tri thức |
| Exam treatment | 5 bước như mục lục đề; fixed là câu đánh số; pool là quy tắc lấy mẫu; readiness ở lề | 5 bước như thanh quy trình; fixed/pool chia hai vùng vận hành; readiness là gate có chữ | 5 bước như đề mục tài liệu; nguồn/selected như tham chiếu qua lại; summary là index cấu trúc |
| Ưu điểm | Motif gắn trực tiếp câu/điểm/đề; phù hợp cả thư viện lẫn editor | Scan dữ liệu nhanh; mạnh khi tổ chức nhiều kỳ thi | Mạnh với Question Bank và việc nối kiến thức; ít cảm giác CRUD |
| Nhược điểm | Dễ trượt sang giấy giả/cổ điển nếu lạm dụng texture/serif | Dễ quá enterprise hoặc giống bảng theo dõi chứng khoán; đọc câu dài kém thư thái | Dễ giống wiki; quá nhiều cross-reference có thể làm Exam flow phân tán |
| Phù hợp | **Cao nhất: 9/10** | Khá: 7/10 | Khá cao: 8/10 |

### Chọn A — Exam Folio

Nhiệm vụ cốt lõi đang có là biên soạn và cấu trúc câu hỏi. “Lề + số thứ tự + nội dung + điểm” vừa là nhận diện vừa giúp đọc đề. Hướng A cải thiện sự khác biệt ngay trong một hàng câu hỏi, không cần thêm hero, dữ liệu mới hoặc thay vị trí navigation. B phù hợp hơn với vận hành/monitoring; C phù hợp hơn với khám phá thư viện. Hai hướng đó không được trộn thành ba theme trong cùng sản phẩm.

Chọn palette giấy/mực của A để giảm môi trường tím pastel và tăng cảm giác tài liệu đang làm việc. **Không lấy màu mới làm toàn bộ identity**: khi bỏ màu, cột số, lề annotation, treatment trạng thái và composition vẫn phải nhận ra được.

Spec triển khai đề xuất: [EXAMSPACE_VISUAL_IDENTITY.md](EXAMSPACE_VISUAL_IDENTITY.md). Teacher Exam đã được duyệt theo spec này; các module khác vẫn cần review riêng.

## F. Evidence hiện hành

Giữ audit để bảo toàn reasoning và nguồn nghiên cứu, không giữ toàn bộ lịch sử capture. [Spec](EXAMSPACE_VISUAL_IDENTITY.md) ghi nguyên tắc; [báo cáo cuối](EXAM_FOLIO_FINAL_REPORT.md) ghi implementation, tests và ba board đã duyệt. Source automation được giữ để tái tạo ảnh.
