# ExamSpace — Exam Folio

**Đặc tả visual identity · 07/10/2026 · Full Teacher Exam rollout và sidebar đã được duyệt.**

**Trạng thái hiện tại:** Teacher Exam Folio đủ 5 bước và shared Teacher sidebar đóng/mở đã được review, duyệt để đóng gói local commit. [Báo cáo rollout và verification](EXAM_FOLIO_FINAL_REPORT.md) là evidence hiện hành. Không rollout visual sang module khác.

Direction: **Phiếu đề & lề ghi chú**. Căn cứ: [Visual identity audit](VISUAL_IDENTITY_AUDIT.md), source và board V2 hiện có, cùng research UI-UX-Pro-Max ở commit `477bcb28c9812b385cb51a4605ddf30d7b2266e2`.

## 1. Ý tưởng và phạm vi

ExamSpace là bàn làm việc để biên soạn câu hỏi và tổ chức một kỳ thi. Nhận diện đến từ **một lề có thứ tự, nội dung đọc rõ và những chú giải đúng chỗ**. Cảm giác học thuật được tạo bằng cấu trúc tài liệu đang sử dụng, không cần giả giấy cũ hoặc huy hiệu trường học.

Ba dấu hiệu phải xuất hiện nhất quán:

1. **Lề chỉ mục:** số câu/số bước nằm trên một trục căn rõ; không nằm trong square pastel.
2. **Đường chuẩn:** một rule ngang chắc ở đầu tài liệu, separator nhẹ giữa nhóm; không bọc mỗi nhóm bằng card.
3. **Chú giải ở lề:** điểm, nguồn, readiness đặt cạnh nội dung có liên quan; không biến mọi con số thành KPI.

Các màn hình dùng chung type/color/control tokens nhưng có composition riêng. Dashboard là bàn công việc; Question Bank là mục lục; editor là tờ soạn; Exam là đề đang thiết lập.

Spec ghi lại định hướng chung; Teacher Exam là implementation đã được duyệt. Không mở rộng sang Student Exam, Grading, Results, Live Quiz hoặc Admin. Giữ API, business rules, schema, RBAC và thứ tự 5 bước. Dashboard/Question Bank giữ design system V2, chỉ dùng thêm shared sidebar preference.

## 2. Những điều tạo nên direction

| Phải có | Không dùng để thay thế |
|---|---|
| Nội dung câu hỏi làm trọng tâm | Hero marketing lớn trước tác vụ |
| Tỷ lệ sheet/lề khác nhau theo việc | Mọi trang một grid card giống nhau |
| Chữ và số có vai trò rõ | Tăng tất cả heading lên bold hoặc dùng một loạt micro-label |
| Đường căn chung nối số–nội dung–điểm | Số trong hộp trang trí và icon tile ở mọi section |
| Palette trung tính ấm, mực trầm | Đổi indigo sang xanh lá nhưng giữ toàn bộ silhouette cũ |
| Khoảng cách theo quan hệ nội dung | Random radius/gap/rotation để tạo vẻ “không máy móc” |
| Controls native, rõ tương tác | Input chỉ là gạch chân mờ vì muốn giống giấy |

Không dùng texture giấy, dòng kẻ chạy sau văn bản, lỗ gáy sổ, góc gập, băng dính, bút vẽ tay, stamp nghiêng, drop cap, huy hiệu chứng nhận hoặc hiệu ứng lật trang. Motif phục vụ căn chỉnh và scan; phần trang trí không được làm giảm diện tích nội dung.

## 3. Palette và vai trò màu

Tên token dưới đây là tên đặc tả; agent triển khai sau cần map vào hệ token hiện có, không tạo hai hệ cạnh tranh hoặc thay toàn bộ `.qb-shell` trước khi phạm vi rollout được duyệt.

| Vai trò | Giá trị đề xuất | Dùng cho |
|---|---|---|
| Canvas | `#F3F1EA` | Nền làm việc trung tính ấm, không gradient |
| Sheet | `#FFFEFA` | Bề mặt soạn/đọc đề; gần trắng, không sepia |
| Elevated | `#FFFFFF` | Dialog/menu; không dùng cho mọi section |
| Ink | `#252C2A` | Nội dung và title |
| Secondary ink | `#535E59` | Mô tả, label hỗ trợ |
| Muted ink | `#646D67` | Metadata; không giảm opacity thêm |
| Rule | `#D7D9D1` | Separator trang trí, không thay border của control |
| Control boundary | `#7B857C` | Viền input/select khi cần nhận diện control |
| Brand / action ink | `#24574E` | Primary button, active marker, link chính |
| Brand hover | `#19443C` | Hover primary |
| Selected wash | `#EDF2EB` | Một hàng được chọn khi cần; không phủ cả panel |
| Navigation hover | `#E7EDE6` | Phản hồi hover nhẹ, không phải active pill |
| Focus | `#245EA6` | Focus ring; không dùng làm màu trang trí thứ hai |
| Success | `#246242` / `#EAF3EC` | Thành công đã được xác nhận, nhãn Published kèm chữ |
| Warning | `#825B19` / `#F8F0DC` | Cần xử lý, lịch không hợp lệ; không tô tất cả Draft vàng |
| Danger | `#A1372D` / `#FBEDE9` | Lỗi và xác nhận lưu trữ |
| Info | `#285782` / `#EAF0F6` | Thông báo hướng dẫn có ý nghĩa nghiệp vụ |

Mực xanh trầm được chọn vì phối được với sheet ấm mà vẫn giữ cảm giác công cụ hiện đại. Đây là lựa chọn thiết kế riêng, không phải kết luận “education phải dùng xanh”. Profile LMS trong UI-UX-Pro-Max cung cấp một palette teal/amber để đối chiếu; spec không sao chép palette đó. [Nguồn so sánh](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/477bcb28c9812b385cb51a4605ddf30d7b2266e2/src/ui-ux-pro-max/data/colors.csv).

Indigo hiện tại đủ tương phản và không cần loại vì “AI purple” nói chung. Đổi ở đây nhằm nhất quán với hướng giấy/mực và giảm dấu ấn lavender đang lan ra mọi cấp. Nếu giữ indigo vì chi phí migration, vẫn phải áp dụng shape/composition của direction A; đó chỉ là phương án migration, không phải direction thứ tư.

### Phép tính tương phản cho palette đề xuất

Đã tính offline bằng relative luminance sRGB và `(Lmax + 0.05) / (Lmin + 0.05)`. Đây là kiểm tra cặp màu đặc, **không phải kết quả kiểm thử UI, screen reader hay chứng nhận WCAG toàn trang**.

| Cặp | Tỷ lệ |
|---|---:|
| Ink / Sheet | 14,13:1 |
| Secondary / Sheet | 6,68:1 |
| Muted / Canvas | 4,73:1 |
| Chữ trắng / Primary | 8,24:1 |
| Control boundary / Sheet | 3,79:1 |
| Focus / Sheet | 6,45:1 |
| Focus / Canvas | 5,76:1 |
| Success text / Success background | 6,39:1 |
| Warning text / Warning background | 5,34:1 |
| Danger text / Danger background | 5,93:1 |
| Info text / Info background | 6,59:1 |

Giữ mục tiêu nội bộ ≥4,5:1 cho chữ thông thường, ≥3:1 cho ranh giới control và dấu hiệu đồ họa có nghĩa. Rule nhẹ chỉ tách nhóm, không mang trạng thái một mình. Muted sát ngưỡng hơn màu chữ khác: không thêm opacity hoặc đặt lên nền lạ. Focus dùng outline 3px, offset 3px; trên button đậm có khoảng phân cách màu sheet để ring vẫn nhận ra. Các tổ hợp hover/disabled/selection/overlay phải được kiểm tra khi có bản render.

## 4. Shape language

### Lề và marker

- Question index: cột 32px desktop, 28px mobile; chữ 13px/600, số tabular. Số thực theo thứ tự đang có; không sinh mã câu hỏi giả.
- Active marker: đường đứng 3px, cao khoảng 20px, căn giữa hàng. Dùng cho vị trí navigation hoặc hàng được chọn; label/checkbox vẫn phải truyền trạng thái.
- Document rule: 2px ở đầu sheet, màu ink; không lặp trước mỗi field. Section rule: 1px `Rule`.
- Annotation rail: 224–248px desktop, không background/card, ngăn với nội dung bằng khoảng cách hoặc một rule dọc.
- Không vẽ dấu tick vào mọi số thứ tự. Tick chỉ có nghĩa hoàn tất/đã kiểm tra; current step khác với completed step.

### Radius theo vai trò

| Thành phần | Radius | Border/shadow |
|---|---:|---|
| Sheet chính | 0px | Một rule đầu, viền ngoài tùy bề mặt; không shadow |
| Data row / section / summary | 0px | Separator hoặc không border |
| Button | 4px | Solid primary hoặc outline secondary; không shadow mặc định |
| Input/select/textarea | 6px | Border nhận diện rõ |
| Status nhãn không tương tác | 2px nếu cần outline | Mặc định chữ + symbol; không pill |
| Selected question row | 0px | Accent ở lề, checkbox; wash tùy density |
| Menu | 8px | Viền và shadow nổi nhẹ |
| Dialog | 10px | Shadow duy nhất rõ hơn; vẫn cùng type/color |
| Avatar | Tròn | Ngoại lệ có ý nghĩa con người, không áp cho icon |

**Card chỉ dùng khi một đơn vị thật cần được tách khỏi luồng xung quanh**: một preview document, một nhóm độc lập có thao tác riêng, một dialog. Không gọi mọi sheet là card rồi lồng thêm card bên trong. Mỗi vùng làm việc chỉ có một cấp bao bề mặt; control là ngoại lệ chức năng.

## 5. Typography: giữ font, thay vai trò

Giữ stack system hiện có, không thêm CDN, font package hay tải font ngoài. Inter chỉ được sử dụng nếu có sẵn; không giả định nó đã được bundle. Không đổi font công thức KaTeX, code hoặc kiểu chữ do nội dung chuyên môn yêu cầu.

| Vai trò | Desktop / tablet | Mobile | Weight / tracking | Quy tắc |
|---|---|---|---|---|
| Page title | 30/38px | 26/34px | 650; −0,4px | Sentence case, không ép `<br>` cho tên do user nhập |
| Dashboard opening | 36/44px | 28/36px | 600; −0,5px | Một câu về công việc; không thêm slogan phụ |
| Section heading | 20/28px | 19/27px | 600; 0 | Chênh với label bằng khoảng cách và cấp heading |
| Exam title trong sheet | 24/32px | 22/30px | 650; −0,2px | Giống đầu một đề thi, không giống tên card |
| Question text khi đọc/soạn | 16/26px | 16/26px | 500; 0 | Vai trò chính; prose dài có thể 400 |
| Question text trong danh sách dày | 15/23px | 16/25px | 500; 0 | Không clamp nội dung cần để chọn câu |
| Body | 15/24px | 16/25px | 400; 0 | Dòng đọc khoảng 60–75 ký tự desktop; co tự nhiên mobile |
| Field label / action | 13/20px / 14/20px | 14/21px | 500–600; 0 | Không uppercase để giả trọng lượng |
| Metadata | 12/18px | 12/18px | 400; 0 | Không chứa hướng dẫn dài hoặc điều kiện công bố quan trọng |
| Figure/score chính | 28/34px | 24/30px | 600; 0 | Chỉ 1–2 số cần nhấn trong một vùng; luôn có đơn vị |
| Row points / timer metadata | 14/20px | 14/20px | 500; 0 | `tabular-nums`; canh cột, không dùng mono cho mọi chữ |

Weight 650 là giá trị đề xuất trên stack hỗ trợ; font không hỗ trợ intermediate có thể map 600/700. Không yêu cầu import variable font chỉ để đạt con số này. Kiểm tra thực tế trên fallback Linux/Windows/macOS khi triển khai.

Loại kicker uppercase mang tính slogan khỏi đầu các màn tác vụ. Có thể giữ subject thật như “Công nghệ Web” bằng sentence case 12/18. Chỉ dùng tối đa một dòng contextual label trước h1 khi nó thêm thông tin chưa có trong breadcrumb.

Câu hỏi, công thức và đoạn code cần reflow nhưng không bóp nhỏ để vừa hàng. Code dài được scroll riêng trong block; text tiếng Việt không dùng `word-break: break-all`. Cột số dùng tabular figures để giá trị đổi không làm nhảy bố cục. Rule tabular lấy từ quick-reference; query CSV không có match chính xác trong lượt nghiên cứu. [Typography guidance](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/477bcb28c9812b385cb51a4605ddf30d7b2266e2/.claude/skills/ui-ux-pro-max/references/quick-reference.md).

## 6. Spacing và composition

Giữ đơn vị 4/8px. Dùng các tier khác nhau vì vai trò khác nhau, không vì muốn “phá đều” bằng ngẫu nhiên:

- Label → input: 8px. Metadata liên quan: 4–8px.
- Trong một nhóm field: 16px. Question row: padding dọc 12–16px, không khoảng trống 24px quanh mọi câu.
- Giữa hai nhóm khác nghĩa: 32px; giữa hai khối công việc lớn: 40–48px.
- Sheet inset: 24px desktop, 20px tablet, 16px mobile. Lề số là một cột riêng, không cộng padding trái nhiều lần.
- Page gutter: 32px desktop, 24px tablet, 16px mobile. Main tối đa khoảng 1240px khi màn rộng hơn 1440; nội dung câu không giãn theo toàn bộ chiều ngang.

| Màn | Composition chủ đạo | Điều tránh |
|---|---|---|
| Dashboard | Tiêu đề ngắn; thư viện đang làm chiếm ~2/3; links công việc ~1/3; dữ liệu thật đứng trước | Hero + 3 feature cards + KPI strip |
| Question Bank list | Toolbar mở + bảng/mục lục có đường chuẩn | Card cho từng bank trên desktop |
| Question Bank detail | Tên ngân hàng + metadata; câu hỏi là hàng đánh số, actions ở cuối | Status/action giành trọng lượng ngang question text |
| Question editor | Tờ soạn chính + preview document nhỏ hơn; section dùng khoảng trắng | Hai card đối xứng, cùng trọng lượng, màu pastel toàn khối |
| Exam identity/schedule/settings | Tờ cấu hình + lề readiness | H2 có icon tile ở mọi section |
| Exam questions | Nguồn 46% / đề đã chọn 54%; pool là phần của cấu trúc đề | Hai thẻ thư viện đối xứng, không nhận ra bên nào là kết quả |
| Exam review | Đề là nội dung chính; summary ở lề, publish actions rõ | Overview toàn badge và KPI, câu hỏi xuống dưới quá xa |

## 7. Component treatments

| Component | Treatment | Card? |
|---|---|---|
| Sidebar/navigation | Giữ các destination/nhãn đang có. Nền cùng canvas hoặc nhẹ hơn; active bằng rule trái + chữ 600. Icon outline không nền. Bỏ slogan đáy nếu không có thông tin tác vụ | Không |
| Mobile navigation | Giữ năm mục nhìn thấy, labels và targets ≥44px; current dùng underline/marker. Không đổi sang drawer chỉ để tạo khác biệt | Không |
| Primary button | Chữ trắng trên brand ink, radius 4, cao tối thiểu 44px; không icon nếu chữ đã đủ | Không |
| Secondary/tertiary | Secondary outline; tertiary chữ có hover/underline rõ, hit area giữ đủ lớn | Không |
| Input/select | Native, radius 6, label ngoài, focus ring rõ; nền sheet/trắng. Không “input bằng dòng kẻ” thiếu affordance | Không |
| Question row | Số ở lề, nội dung giữa, điểm/actions canh cuối; metadata xuống dòng phụ. Mobile points/actions dưới nội dung | Không |
| Question editor | Một sheet; prompt → options → explanation theo section. Preview tự mang hình tài liệu, không lavender card | Một document surface, không card từng section |
| Exam stepper | Mục lục 5 bước; current có underline/marker và chữ, bước còn lại là text button | Không |
| Exam summary | Annotation rail; câu/điểm/thời lượng ghi có đơn vị, checklist liên kết tới bước | Không |
| Status badge | Mặc định label có symbol; draft trung tính, published check + chữ, archived archive icon + chữ. Outline 2px radius chỉ khi cần scan list | Không pill/card |
| Selected question | Số thứ tự, checkbox/lề selected, điểm là control riêng; không nhấn cả panel màu | Không |
| Random pool | Một dòng quy tắc + các field trực tiếp bên dưới; phân bằng rule, đánh số nhóm | Không; không folded card mặc định |
| Dashboard blocks | Recent banks dạng mục lục mở; các đường vào việc khác là links chia hàng. Chỉ tách một vùng trọng tâm nếu dữ liệu cần | Không card đồng loạt |
| Empty state | Một marker tài liệu đơn giản hoặc số mục trống, câu hướng dẫn cụ thể và CTA. Không illustration lớn | Trong vùng nội dung hiện có, không card lồng |
| Loading/error | Skeleton bám shape thật; error có chữ và retry; không shimmer hoặc đổi thành empty | Không thêm card để báo mỗi lỗi |
| Dialog | Một surface nổi nền trắng, heading rõ, body ngắn, action footer; hủy focus đầu, Escape/return focus giữ nguyên | Có |

Icon giữ bộ SVG hiện có, nét nhất quán khoảng 1,7–2px, cỡ 18–20px. Icon cạnh label chỉ hỗ trợ, không cần accessible name trùng; icon-only control phải có nhãn và target đủ rộng. Logo mark hiện có không cần thay trong rollout đầu; bỏ square pastel ở nội dung không có nghĩa phải tự thiết kế lại logo.

## 8. Teacher Exam: đặc tả theo flow hiện có

### 8.1 Khung và thứ tự không đổi

Giữ các route đã implement:

- `/teacher/exams`
- `/teacher/exams/new`
- `/teacher/exams/:id/edit`
- `/teacher/exams/:id/preview`
- Link sang `/teacher/exams/:id/monitor` vẫn có; màn monitor không thuộc rollout visual này.

Giữ đúng thứ tự **Thông tin → Lớp & lịch thi → Câu hỏi → Cài đặt → Kiểm tra & công bố**. Đây là navigation giữa các panel đã tồn tại; không thêm step, lock-step, URL state mới hoặc wizard mới.

Sơ đồ dưới là bố cục đề xuất, không phải UI đã render:

```text
Điều hướng       Bài thi / Chỉnh sửa
                 Chỉnh sửa bài thi                  Bản nháp
                 Kiểm tra Công nghệ Web
                 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                 01 Thông tin   02 Lớp & lịch thi   03 Câu hỏi ...

                 Tờ cấu hình / nội dung đề          Lề ghi chú
                 [nhóm nội dung theo bước]          12 câu · 20 điểm
                                                   45 phút / lượt
                                                   Trước khi công bố
                                                   ✓ Tên bài thi
                                                   ○ Chưa chọn lớp

                 Trước · Tiếp                      Lưu | Lưu & công bố
                 Về danh sách                      Lưu trữ
```

Không cố đặt mọi chữ lên đúng một dòng khi viewport hẹp. Sơ đồ chỉ biểu đạt quan hệ, không phải thông số fixed-width.

### 8.2 Stepper

Desktop: một hàng, các mục có độ rộng theo nhãn, không ép năm ô bằng nhau. Số `01–05` dùng tabular và không nền. Current có underline 3px hoặc marker lề, `aria-current="step"`; h2 panel không lặp số trong một tile nữa.

Mobile: một dòng “Bước 3/5 · Câu hỏi” và danh sách năm text button wrap 3+2 hàng; target ≥44px. Mọi bước vẫn truy cập trực tiếp, không hidden menu, không scroll ngang. Dòng current thay phần introduction lặp, không cộng thêm một banner.

Không đánh dấu bước đã “hoàn tất” chỉ vì user từng click. Chỉ đánh completed nếu hệ thống hiện có trạng thái hợp lệ tương ứng; nếu chưa có, chỉ phân current/other.

### 8.3 Bước 1 — Thông tin

Tên bài thi là field nổi bật nhất, mô tả ngay dưới, chiều dài dòng vừa đọc. Tên môn chỉ hiện khi dữ liệu thật đã có, không thêm field môn giả. Preview Markdown đặt sau phần nhập với nhãn nhỏ và một đường chuẩn; không bao một card thứ hai. Bên lề chỉ cần số câu, thời lượng và trạng thái chuẩn bị, không lặp nguyên mô tả.

### 8.4 Bước 2 — Lớp & lịch thi

Hai nhóm rõ: “Giao cho lớp” và “Lịch mở bài”. Class là checkbox rows không card. Open/close ở một cặp field; duration/attempts ở cặp kế tiếp. Múi giờ dùng lời giải thích một lần gắn với lịch, không thêm tooltip bắt buộc. Giữ mọi giá trị mặc định/ràng buộc/API hiện có.

Thời lượng có đơn vị “phút / lượt”; open/close là khung khả dụng. Không vẽ countdown động để minh họa thời lượng cấu hình, vì đó là hai khái niệm khác nhau.

### 8.5 Bước 3 — Nguồn câu hỏi và đề đã chọn

| Phần | Cách trình bày |
|---|---|
| Nguồn | Select ngân hàng + tìm câu hỏi ở đầu. List checkbox theo nguồn, metadata loại/độ khó ở dòng phụ |
| Đề đã chọn | Tên “Câu cố định · n”; mỗi câu đánh số từ thứ tự thật, prompt và điểm canh riêng; Bỏ là text action có nhãn rõ |
| Selection | Native checkbox giữ trạng thái; lề 3px và wash rất nhẹ chỉ tại hàng đã chọn; không phụ thuộc màu |
| Question dài/code | Cho wrap; điểm/actions không chen vào chiều rộng prose. Không cắt prompt cần để phân biệt câu |
| Random pool | Sau fixed questions, cùng cấu trúc đề; khác biệt bằng nhãn “Quy tắc lấy câu”, không giả thành một câu hỏi |
| Counts | Một câu tóm tắt: “3 câu cố định + 2 câu ngẫu nhiên · 5 điểm”; ví dụ minh họa, runtime phải tính từ dữ liệu thật |

Desktop có thể giới hạn cuộn vùng nguồn khi list dài để giữ selected cạnh đó; phải nhìn thấy scrollbar, focus tự vào vùng nhìn thấy và không bẫy scroll. Mobile ưu tiên main page scroll cho list, dùng phân trang có sẵn; không thêm list ảo, drag/drop, paging API hoặc bộ lọc mới chỉ để đạt hình dáng.

Trên 390px, source trước, selected tiếp, pool sau; title và count của selected đủ rõ để tìm lại. Một affordance nhảy đến vùng selected có thể là anchor nội trang ở vòng implementation nếu cần, không là wizard hay một màn mới.

### 8.6 Random pool

Hiển thị “Nhóm 1” bằng chữ và rule, không icon box. Câu mô tả đọc được từ giá trị hiện tại, ví dụ **“Lấy 2 câu · mỗi câu 1,5 điểm”**; bên dưới là ngân hàng, số câu, điểm, độ khó và tags hiện có. Chỉ dùng tên nguồn thật, không tạo môn hay độ phủ kiến thức chưa có dữ liệu.

Filter có label; tags giải thích cách phân tách. Button thêm nhóm là secondary; bỏ nhóm là text destructive nhẹ, tách khỏi field số. Không thêm confirm cho mọi lần bỏ nếu flow cũ không có. Không hiển thị “pool đủ câu” khi client chưa được backend xác nhận; số câu trong một trang tìm kiếm không chứng minh khả năng lấy không trùng.

### 8.7 Bước 4 — Cài đặt

Ba nhóm nội dung, phân bằng h3/spacing: tính kết quả; thời điểm công bố kết quả; trộn đề/nội dung được xem. Nhãn tiếng Việt map vào enum cũ. Không thay checkbox thành switch nếu mang ý nghĩa thiết lập chỉ có hiệu lực sau Lưu; giữ controls hiện tại để tránh gợi cảm giác toggle được áp dụng tức thì.

Không biến việc bật shuffle thành badge hay achievement. Công bố bài thi và công bố kết quả phải dùng copy khác nhau, không gộp thành một trạng thái “Published”.

### 8.8 Bước 5 — Preview và publish readiness

Tờ preview có title, description, một dòng lịch/thời lượng, câu hỏi đánh số và điểm ở lề phải. Không bọc từng câu trong card. Options là nội dung preview, không mang affordance radio có thể click nếu đây không phải bài làm tương tác. Giao diện preview không được tự bổ sung đáp án đúng hay dữ liệu không thuộc flow hiện có.

Readiness dùng ba lớp thông tin tách biệt:

| Lớp | Ví dụ | Điều không được suy diễn |
|---|---|---|
| Trạng thái vòng đời | Bản nháp / Đã công bố / Đã lưu trữ | Không suy từ việc đang ở bước 5 |
| Trạng thái lưu | Đang lưu / Đã lưu / Lưu thất bại nếu handler hiện có cung cấp | Không ghi “Tất cả đã lưu” chỉ vì checklist đủ |
| Chuẩn bị công bố | Có tên, có lớp, có nguồn, lịch hợp lệ từ thông tin kiểm tra được | Không bảo đảm backend sẽ chấp nhận pool/ownership/attempt constraints |

Checklist dùng “Đã có” / “Còn thiếu” / “Chưa kiểm tra” theo bằng chứng thật, mỗi mục chỉ rõ bước liên quan. Tên checklist là “Trước khi công bố”, không dùng “100% sẵn sàng” hay donut completion. Khi đủ thông tin client, copy là “Đã có thông tin cơ bản; nguồn câu hỏi được kiểm tra khi công bố”. Không thêm validation rule mới trong visual rollout.

Publish vẫn dùng endpoint/handler hiện có. Primary action không đổi side effects, không tách save/publish thành API mới. Không thêm autosave, unpublish, schedule-release hoặc dirty guard vì đó là chức năng chưa được yêu cầu cho direction.

### 8.9 Draft, published, archived và actions

- **Draft:** “Bản nháp” trung tính, không phải warning. Action lưu và công bố phân cấp; ở các bước soạn, trạng thái current vẫn rõ.
- **Published:** check + “Đã công bố”; thông báo ràng buộc chỉnh cấu hình dùng dữ liệu/rule thực. Không đồng nghĩa đang mở, đã có người thi hoặc kết quả đã phát hành.
- **Archived:** icon lưu trữ + chữ, giảm nhấn phần thao tác nhưng không làm mờ toàn bộ câu hỏi. Nội dung lưu trữ cần đọc rõ. Không dùng opacity toàn sheet.
- **Save/error:** phản hồi gần action và tại vùng thông báo có thể tìm thấy; giữ input. Không flash success rồi tự biến mất trước khi user đọc.
- **Destructive:** đặt ngoài nhóm Lưu/Công bố, confirmation vẫn có Hủy và focus return. Không thêm một modal “chúc mừng công bố”.

Nhãn trạng thái phải phản ánh dữ liệu đã nhận, kể cả khi đi back/reload hoặc cache đang refetch. Việc xử lý failure kỹ thuật đã biết của rollout đang tạm dừng không được thực hiện trong audit; vòng implementation sau phải giải quyết trước khi tuyên bố state đúng.

## 9. Responsive và density

| Viewport | Quy tắc |
|---|---|
| 1440 | Sidebar mở 232px, gutter 40px; workspace 1128px, khi đóng 1360px. Rail 224px; source/selected 46/54 theo chiều rộng thực |
| 820 | Sidebar mở 184px, workspace 588px: questions một cột. Đóng sidebar: workspace 772px, questions hai cột. Summary dưới content; không thu font |
| 390 | Nav 5 mục hiện có, gutter 16px. Không outer border/shadow cho sheet nếu chỉ làm hẹp nội dung. Field full width; index/prompt một hàng, points/actions hàng sau; stepper wrap |

Container queries theo workspace: ≥740px cho source/selected và nhóm nội dung hai cột; ≥1000px cho sheet + rail. Sidebar desktop/tablet đóng bằng display:none và margin main về 0; mobile ≤700px giữ navigation ngang. Preference lưu localStorage, không animate reflow. Không thay shell module ngoài phạm vi hiện có.

Mặc định **không thêm sticky action mới cho Exam**. Footer trong flow gồm Trước/Tiếp, rồi nhóm Lưu/Công bố; mobile mỗi control cao ≥44px và gap ≥8px. Nếu vòng sau chọn sticky vì đề dài, phải có khoảng bù và bảo đảm field/focus không bị che; đó là quyết định implementation cần evidence riêng. Không đưa sticky vào spec chỉ để bù cho form quá nhiều khoảng trắng.

## 10. Motion, focus và state

- Hover/pressed: đổi màu hoặc underline trong khoảng 120ms; không nâng card, scale hàng, lắc lỗi hoặc di chuyển button.
- Dialog: opacity tối đa 160ms; đóng khoảng 100ms; giữ native focus behavior. Reduced motion bỏ animation.
- Chọn câu: checkbox/count cập nhật tức thời; hiệu ứng nền có thể 120ms và hủy được. Không trì hoãn semantic state chờ transition.
- Đổi bước: nội dung xuất hiện ngay; không slide cả sheet. Giữ focus và kiểm chứng navigation keyboard trong targeted UI tests.
- Loading: skeleton tĩnh theo loại vùng. Không show readiness hoàn tất trong khi nguồn chưa tải/xảy ra lỗi.
- Error: chữ chỉ rõ vấn đề nếu API có thông tin; retry không làm mất nội dung. Không đổi thông báo thật thành thông báo thành công mang tính trang trí.

Tách current/hover/focus/selected/disabled. Underline navigation không thay focus ring. Không dùng màu một mình cho câu đã chọn, trạng thái publish hoặc validation. [Nguồn nguyên tắc trạng thái và focus](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/477bcb28c9812b385cb51a4605ddf30d7b2266e2/src/ui-ux-pro-max/data/ux-guidelines.csv).

## 11. Áp dụng nhận diện ngoài Exam trong tương lai

Đây là hướng tham chiếu, chưa phải rollout authorization:

- **Dashboard:** bỏ hero illustration hiện tại khỏi vị trí chi phối. Lời chào ngắn ở đầu; “Tiếp tục biên soạn” và ba bank thật là vùng chính. Các links Lớp/Bài thi/Quiz nằm ở cột phụ không tile. Không tạo số deadline/bài chờ chấm nếu endpoint hiện có không cấp.
- **Question Bank:** giữ table semantics/filter/pager. Tên bank và nội dung câu là hàng mục lục; số câu/loại/độ khó là chú giải. Không biến mọi bank thành “tấm giấy riêng” vì sẽ quay về card grid.
- **Question editor:** giữ layout/preview tabs/lifecycle/dirty blocker đã có. Sheet soạn và preview khác vai trò, không khác bằng hai pastel; chữ câu hỏi và baseline là điểm nối với Exam.

## 12. Tiêu chí review cho agent triển khai sau

Các tiêu chí dưới đây dùng cho review; kết quả implementation và kiểm thử hiện tại nằm trong [báo cáo cuối](EXAM_FOLIO_FINAL_REPORT.md).

1. Đặt list, editor, Dashboard cạnh nhau: cùng family nhưng phải khác composition theo tác vụ, không chỉ khác title và icon.
2. Bỏ màu khỏi ý tưởng: vẫn đọc được index, current step, selected, lifecycle và thứ bậc actions.
3. Không còn square pastel cho mọi section/icon hoặc hero giấy nghiêng. Số thứ tự chỉ xuất hiện nơi có thứ tự thật.
4. Mỗi vùng chỉ một cấp surface; selected/pool/summary không là ba card lồng trong card chính.
5. 5 bước và thứ tự hiện tại giữ nguyên; không thêm chức năng để làm mockup đẹp.
6. Body/question mobile 16px theo spec; metadata không chứa nội dung bắt buộc phải đọc dài. Kiểm tra tiếng Việt, công thức và fallback font thực.
7. Tên bài thi dài, câu có code/LaTeX, nhiều class, nhiều selected và nhiều pool không tràn; không che dữ liệu để đạt chiều cao đẹp.
8. Trạng thái nháp/công bố/lưu trữ và trạng thái lưu không bị nhập làm một; checklist không quảng cáo mức chắc chắn hơn backend.
9. Focus, native controls, 44px target, dialog, reduced motion và error recovery được giữ. Chưa xác nhận a11y toàn diện chỉ bằng contrast tokens.
10. Review board tương lai dùng ảnh thật, nhãn rõ, tỷ lệ đủ đọc; không chỉnh ảnh để che layout lỗi. Baseline failure đang dừng phải được xử lý/kiểm chứng ở task implementation riêng.

Không dùng prompt triển khai chỉ gồm “modern education SaaS”. Brief ngắn cần giữ đủ: **Exam Folio; sheet phẳng, lề số, chú giải không card; system font; canvas ấm và mực trầm; controls 4–6px; nội dung câu nổi hơn chrome; giữ nguyên flow và dữ liệu.**

## 13. Hồ sơ nghiên cứu và trạng thái bàn giao

UI-UX-Pro-Max cung cấp các gợi ý style, typography và UX đã được chọn lọc trong [audit](VISUAL_IDENTITY_AUDIT.md#d-ui-ux-pro-max-đã-inspect-gì-dùng-gì-loại-gì). Exam Folio, palette cụ thể, cột lề, radius theo vai trò và treatment của từng bước là **đề xuất tổng hợp riêng cho ExamSpace**, không phải output generator đã áp vào product.

Palette và composition đã render, được review qua ba board cuối; automated Chromium đã PASS. Chưa kiểm chứng mọi fallback font/zoom, Safari/Firefox hay usability study với người dùng cuối. Xem giới hạn và verification trong [báo cáo cuối](EXAM_FOLIO_FINAL_REPORT.md).
