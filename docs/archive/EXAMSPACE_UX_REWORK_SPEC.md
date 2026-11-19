# ExamSpace — Kế hoạch khắc phục chức năng, hiệu năng và thiết kế UI/UX
## Bản đề xuất v1, ngày 01/10/2026

> Đây là đặc tả cho đợt cải tiến tiếp theo, KHÔNG phải báo cáo kiểm thử đã thực hiện.
> Nguồn đánh giá hiện có: ảnh giao diện và log/báo cáo do người dùng cung cấp; tài liệu công khai của skill và công cụ kiểm thử.
> Source hiện tại của BTL chưa truy cập thành công trong lượt đánh giá này. Mọi nhận định về nguyên nhân trong code phải được xác minh tại repository local trước khi sửa.
> Các chức năng mới hoặc quy tắc bổ sung trong tài liệu này là ĐỀ XUẤT, không được mô tả ngược thành chức năng đã tồn tại.

## 1. Quyết định đề xuất

Dùng đặc tả riêng cho ExamSpace làm căn cứ chính. Có thể dùng UI UX Pro Max như nguồn tham khảo thiết kế, nhưng không giao cho skill tự quyết định nghiệp vụ hoặc ghi đè cấu hình.

Không viết lại toàn ứng dụng. Giữ React/Vite, Express, Prisma, PostgreSQL/Supabase, Session và Socket.IO đang hoạt động, trừ khi kiểm chứng được một thay đổi nhỏ là cần thiết.

Chia thành ba vòng:
1. Audit và tái hiện lỗi; sửa vấn đề chức năng nghiêm trọng và đo hiệu năng.
2. Làm một lát cắt UI hoàn chỉnh: ngân hàng câu hỏi → editor → ảnh → lưu → sửa → lưu trữ/xóa an toàn.
3. Sau khi người dùng xem và chấp thuận hướng giao diện mẫu, triển khai đồng bộ các màn hình còn lại, rồi kiểm thử hồi quy toàn hệ thống.

Không triển khai cloud, nâng gói trả phí, chuyển framework hoặc mở rộng nghiệp vụ ngoài phạm vi chỉ để giải quyết giao diện.

## 2. Bằng chứng và mức chắc chắn

| Nội dung | Bằng chứng hiện có | Kết luận được phép |
|---|---|---|
| Có object trong bucket question-assets | Ảnh Dashboard Supabase | Có object trong Storage. Chưa chứng minh đủ việc liên kết câu hỏi, tải lại trang, quyền đọc hoặc snapshot ảnh. |
| Khó tìm thao tác mở ngân hàng/câu hỏi | Ảnh giao diện và phản hồi của người dùng | Cần cải thiện khả năng nhận biết thao tác; chưa được kết luận router hỏng chỉ từ ảnh. |
| Không thấy xóa câu hỏi | Người dùng báo | Cần tái hiện trên danh sách/editor và kiểm tra API/quyền; chưa được kết luận backend không có endpoint. |
| Giao diện đơ | Cảm nhận người dùng | Chưa xác định do frontend, mạng, DB hay phản hồi UI thiếu. |
| Các bộ test từng PASS | Báo cáo Astra được người dùng cung cấp | Bằng chứng lịch sử do agent báo; không thay thế chạy lại ở commit và môi trường hiện tại. |
| Màu xanh lá–trắng không hợp ý | Yêu cầu trực tiếp của người dùng | Đổi hướng nhận diện; không coi đây là lỗi kỹ thuật của nền tảng hosting. |

Ghi nhận lại mỗi phát hiện với các trường:
ID, actor, route, bước tái hiện, mong đợi, thực tế, mức độ, source path, ảnh/trace, trạng thái.
Trạng thái: REPRODUCED / NOT_REPRODUCED / FIXED_VERIFIED / BLOCKED / PROPOSAL.
Không dùng PASS cho ca chưa chạy.

## 3. Không đánh đồng ba lớp chất lượng

- Đúng nghiệp vụ: có thể tạo đề, nộp bài, chấm điểm, quản lý dữ liệu đúng quyền.
- Dễ sử dụng: người mới tìm được thao tác, hiểu trạng thái, sửa được lỗi nhập liệu, không mất nội dung.
- Thiết kế và độ phản hồi: bố cục, chữ, màu, chuyển động và tốc độ phản hồi phù hợp từng chế độ.

Một API DELETE hoạt động không chứng minh người dùng có nút để thao tác.
Một screenshot đẹp không chứng minh lưu dữ liệu đúng.
Một bài test nộp bài thành công không chứng minh toàn bộ CRUD đã được kiểm tra.
Không tiếp tục dùng số lượng test hay checkbox DoD làm kết luận duy nhất.

## 4. Audit chức năng theo vòng đời, không chỉ theo trang

Đối với User, Class, QuestionBank, Question, Exam, Attempt, Quiz, Room và Result, lập bảng:
- Actor nào được phép?
- Đi vào từ đâu trên giao diện?
- Có thể tạo/xem/sửa/lưu trữ/xóa hay không?
- Các trạng thái nào chặn thao tác và vì sao?
- API/service nào thực hiện?
- Khi lỗi, giao diện phản hồi thế nào?
- Sau reload dữ liệu có đúng không?
- Test nào chứng minh?

Đánh dấu rõ chức năng không có trong yêu cầu gốc. Không tự thêm xóa kết quả thi, sửa điểm tùy ý hoặc cấp quyền Admin sửa nội dung Teacher.

## 5. Chính sách câu hỏi: ưu tiên giữ lịch sử

Đề xuất mặc định:
- Có thao tác rõ ràng “Lưu trữ” để bỏ câu khỏi danh sách đang dùng.
- Có bộ lọc “Đang dùng / Đã lưu trữ”.
- Có “Khôi phục” nếu triển khai được trên model hiện tại.
- “Xóa vĩnh viễn” chỉ triển khai khi chứng minh câu chưa có tham chiếu cần giữ. Nếu chưa đáp ứng an toàn, chỉ cung cấp lưu trữ và mô tả rõ, không giả nhãn “xóa vĩnh viễn”.
- Modal xác nhận phải ghi câu nào, tác động gì, thao tác có khôi phục được không. Hủy không làm thay đổi dữ liệu.

Quy tắc:
1. Không xóa cascade attempt, answer, điểm hay kết quả cũ.
2. Không sửa nội dung snapshot khi sửa/lưu trữ câu gốc.
3. Không xóa object ảnh vẫn được snapshot hoặc dữ liệu khác tham chiếu.
4. Câu bị lưu trữ không được tự lọt vào random pool mới.
5. Kiểm tra tác động tới đề đã publish nhưng chưa bắt đầu, fixed questions và quiz chưa Start.
6. Khi việc lưu trữ làm đề đang sử dụng không còn hợp lệ, phải có quy tắc rõ: từ chối với lý do hoặc quy trình cập nhật có xác nhận. Không âm thầm làm đề thiếu câu.
7. Pool không đủ câu phải báo lỗi có thể xử lý ở publish/start; không tự giảm số câu.
8. Teacher khác và Student phải bị chặn ở backend, không chỉ giấu nút.
9. Mutation phải an toàn khi người dùng double-click hoặc retry.

Việc có snapshot JSON không đủ để bảo đảm ảnh lịch sử an toàn nếu object ảnh hoặc metadata liên kết vẫn bị xóa.

## 6. Editor và Storage: một hành trình người dùng liền mạch

Mục tiêu: tạo câu có ảnh mà người dùng không phải hiểu quy trình cấp ID của backend.

Đề xuất UI:
- Desktop: editor và preview song song; màn nhỏ: tab “Soạn thảo / Xem trước”.
- Loại câu hỏi rõ ràng, option editor phù hợp với từng loại.
- Một hàng thao tác nhất quán: Hủy / Lưu câu hỏi; có trạng thái nội dung chưa lưu.
- Chọn ảnh sớm, xem thumbnail, bỏ/chọn lại ảnh; thông báo định dạng và kích thước rõ.
- Nếu backend yêu cầu questionId trước upload, frontend có thể giữ file tạm và phối hợp tạo/upload/lưu tham chiếu khi người dùng lưu. Cần cơ chế retry/resume; không giả vờ DB và Storage là một transaction phân tán atomic.
- Nếu vẫn giữ quy trình lưu trước rồi upload, phải hướng dẫn ngay tại chỗ, giữ người dùng trong editor và chỉ rõ bước còn lại.
- Phân biệt “ảnh đã tải lên” với “câu hỏi đã lưu ảnh”.
- Báo tiến độ khi có số liệu thật; nếu không có thì dùng trạng thái indeterminate, không tạo phần trăm giả.
- Upload fail giữ nội dung editor và cho thử lại.
- Rời trang khi còn nội dung chưa lưu phải có cảnh báo hợp lý.

Bảo mật và tính toàn vẹn:
- Private bucket không đổi sang public để chữa lỗi hiển thị.
- Không đưa service key vào frontend, URL hay log.
- Backend tiếp tục kiểm tra quyền, MIME/file signature và dung lượng.
- Lưu object path/asset ID ổn định; không lưu signed URL sắp hết hạn làm dữ liệu vĩnh viễn.
- Tạo signed URL sau kiểm tra quyền và chính sách release.
- Ảnh trong lời giải không được lộ trước thời điểm công bố cho phép.
- Lần chọn file bị hủy, upload fail, câu hỏi lưu fail phải có trạng thái nhất quán.
- Dọn ảnh tạm/orphan phải giới hạn đúng tài nguyên do thao tác đó tạo, có xét tham chiếu lịch sử.
- Không sửa/xóa thủ công các bảng storage.* để thay API Storage.

## 7. Hiệu năng: đo rồi mới kết luận

Hiện trạng theo người dùng: frontend/backend local, DB và Storage Supabase cloud.
Không đổ cho Render sleep vì backend chưa được chuyển lên Render.
Không coi gói Free là nguyên nhân mặc định.

Đo riêng:
A. Phản hồi tức thì: click nút, mở menu, gõ, chọn đáp án, chuyển tab.
B. Thời gian thao tác end-to-end: click → request → response → dữ liệu hiển thị.
C. Backend: auth/session, chờ pool, số query, thời gian query, serialize response.
D. Media: upload, xin signed URL, tải ảnh.
E. Runtime frontend: render, Markdown/LaTeX preview, long tasks, bundle.

Quy trình:
- Dùng dữ liệu test kiểm soát, cùng máy/cùng region/cùng điều kiện trước và sau.
- Đo bản dev và bản production build riêng.
- Ghi rõ cold/warm, browser, commit, số mẫu.
- Lấy khoảng 10–20 mẫu warm cho các thao tác chậm để thăm dò; ghi sample size. Không quảng cáo p95 production từ một tập nhỏ.
- Có thể báo median và khoảng dao động. Nếu báo percentile thì nói rõ là thống kê của tập mẫu nhỏ.
- Dùng trace/network timing để phân biệt request chậm với main thread chậm.
- Chỉ tối ưu nơi có bằng chứng: N+1, request nối tiếp không cần thiết, refetch toàn app, query invalidation quá rộng, tải lại Markdown/charts không cần, preview render nặng.
- Không cache chung dữ liệu riêng giữa tài khoản; xóa cache nhạy cảm khi logout hoặc đổi user.
- Không tắt kiểm tra Session/RBAC/CSRF để làm request nhanh.
- Không trì hoãn chọn đáp án cho tới khi autosave xong.
- Không coi “đã lưu” là đúng khi server chưa xác nhận.

Mục tiêu thiết kế đề xuất, không phải kết quả đã đo:
- Control chỉ tác động local có phản hồi nhìn thấy trong khoảng 100–200ms khi máy không bị quá tải.
- Request lâu phải có trạng thái pending và không làm người dùng bấm lặp vô thức.
- Timer và input không bị chặn bởi animation.
- Không dùng animation để che một request bị treo.
- INP lab nếu đo được là chỉ báo tương tác của lần chạy đó, không được ghi là field Core Web Vitals đã PASS.

## 8. Hướng thiết kế: Academic Console

Đây là hướng đề xuất cho ExamSpace, không phải quy chuẩn bắt buộc cho mọi website giáo dục.

### 8.1. Bảng màu dự kiến

| Token | Giá trị gợi ý | Vai trò |
|---|---|---|
| app-background | #F4F6FA | Nền trung tính |
| surface | #FFFFFF | Vùng nội dung |
| text-primary | #172033 | Chữ chính |
| text-muted | #536176 | Chữ phụ |
| sidebar-background | #111C32 | Thanh điều hướng |
| accent | #3157D5 | Hành động chính |
| border | #D9E0EA | Đường phân tách |
| live-background | #151A35 | Khu vực Live Quiz |
| live-accent | #8271F7 | Điểm nhấn Live Quiz |

Đây là palette khởi đầu; phải đo tương phản thực tế cho từng cặp màu và state trước khi chốt.
Màu thành công/cảnh báo/lỗi là màu ngữ nghĩa, không bắt buộc loại bỏ xanh lá khỏi badge thành công.
Không thay tất cả màu xanh lá bằng xanh dương rồi coi là redesign.

### 8.2. Bố cục

Teacher/Admin:
- Sidebar cố định hợp lý ở desktop, drawer có focus management trên mobile.
- Topbar gọn: tên trang/breadcrumb, thông tin tài khoản, thao tác liên quan.
- Tách role và màn làm việc; không dồn tất cả link thành dòng dài tự xuống hàng.
- Nút “Tạo ngân hàng” đặt ở page header, mở form có chủ đích; không để một form lớn trống chiếm đầu mọi trang.
- List/grid/card chọn theo mật độ thông tin, không ép mọi thứ thành card lớn.
- Bảng câu hỏi có nội dung rút gọn, loại, độ khó, điểm, trạng thái, thao tác.
- Thao tác chính “Mở ngân hàng” hoặc “Sửa” phải rõ; menu phụ không chỉ hiện khi hover.

Student:
- Dashboard ít nhiễu; ưu tiên bài thi được giao, trạng thái, thời hạn và nút đúng ngữ cảnh.
- Không sao chép dashboard quản trị cho Student.
- Khi đang thi: không gian tập trung, đồng hồ gọn, số câu và trạng thái lưu rõ.
- Live Quiz có không khí riêng nhưng vẫn cùng nhận diện.

### 8.3. Chữ, khoảng cách, thành phần

- Font sans-serif có đầy đủ tiếng Việt; kiểm tra chuỗi dài và dấu.
- Nội dung thông thường khoảng 14–16px; vùng đề thi có thể lớn hơn theo thiết kế.
- Không dùng heading quá lớn cho một màn quản trị đơn giản.
- Thang khoảng cách thống nhất; control không kéo cao bằng cả card.
- Icon SVG thống nhất; nút chỉ icon phải có accessible name.
- Focus ring phải rõ; không xóa outline để “đẹp”.
- Loading, empty, error, disabled, success là state thật của component, không làm riêng tùy hứng ở từng trang.
- Skeleton chỉ dùng khi tải dữ liệu; không tạo shimmer vô hạn.

### 8.4. Chuyển động

Dự kiến:
- Hover/pressed/menu: khoảng 120–180ms.
- Dialog/drawer/thay đổi trang nhẹ: khoảng 180–250ms.
- Live Quiz chuyển câu/reveal/leaderboard: khoảng 250–400ms tùy tương tác.

Các khoảng trên là đề xuất, phải tinh chỉnh theo cảm nhận và hiệu năng.
Ưu tiên opacity/transform. Không đưa hiệu ứng nặng vào toàn app chỉ vì một màn Quiz.
Tôn trọng reduced motion.
Không làm delay giả trước khi hiển thị dữ liệu.
Không animate hết từng row mỗi khi query refetch.
Khi leaderboard đổi vị trí phải giữ định danh participant ổn định và không giật focus.
Timer đổi số không làm re-render toàn page hoặc rung layout.
Tránh confetti liên tục, âm thanh tự phát, nền chuyển động sau câu hỏi thi nghiêm túc.

## 9. Dùng UI UX Pro Max có kiểm soát

Đề xuất dùng bản mã nguồn mở như thư viện tham khảo, không như bộ máy tự sửa mọi thứ.

Trước khi sử dụng:
1. Xác nhận đúng repository của nextlevelbuilder.
2. Ghi version/commit; không giả định npm package và GitHub main đồng nhất.
3. Đọc hướng dẫn của đúng bản được cài.
4. Không sao chép vào runtime dependencies của app.
5. Không chạy script ghi đè cấu hình/token khi chưa xem đầu ra và diff.
6. Không cấp database key hay env cho công cụ chỉ để chọn giao diện.
7. Không auto-install global packages hoặc cài tất cả platform.
8. Nếu chưa cài, audit chức năng vẫn tiến hành bình thường.

Cách tra cứu:
- Một lượt cho định hướng hệ thống.
- Truy vấn riêng cho form validation, destructive action, dashboard navigation, exam interaction và reduced motion.
- Kiểm tra kết quả có phù hợp ứng dụng thi có đăng nhập, không phải landing page marketing.
- Chỉ trích quy tắc hữu ích vào đặc tả của ExamSpace.
- Không nạp toàn bộ dữ liệu skill vào mỗi lượt agent.

Thứ tự ưu tiên:
Tính toàn vẹn dữ liệu và yêu cầu người dùng
→ kiến trúc đang dùng
→ đặc tả thiết kế đã duyệt
→ gợi ý từ skill.

Một pilot ngân hàng câu hỏi là phép thử chấp nhận. Không cần mua bản Premium để thực hiện pilot này.

## 10. Ma trận kiểm thử đề xuất

Các ca dưới đây CHƯA ĐƯỢC CHẠY trong lượt đánh giá này.
Astra phải gắn từng ca với bằng chứng thực tế; có thể tách thêm test.
Ca tính năng mới đề xuất được đánh dấu rõ khi chưa triển khai.

### A. Điều hướng và câu hỏi

| ID | Ca | Kết quả cần có |
|---|---|---|
| NAV-01 | Từ dashboard Teacher mở ngân hàng qua control nhìn thấy | Vào đúng trang, không cần nhập URL thủ công |
| NAV-02 | Back/Forward/refresh chi tiết ngân hàng | Không sai trang, giữ ngữ cảnh search/page hợp lý |
| NAV-03 | Ngân hàng rỗng, tên dài và danh sách nhiều mục | Empty state hoặc phân trang đúng; không tràn |
| QB-01 | Tạo rồi mở lại từng loại trong 4 loại câu | Dữ liệu và UI đúng loại |
| QB-02 | Sửa câu, option, đáp án đúng, điểm, lời giải; reload | Không mất dữ liệu, backend validate đúng |
| QB-03 | Lưu với trường thiếu/option sai | Lỗi tiếng Việt tại trường, giữ input |
| QB-04 | Hủy sửa/rời trang có thay đổi | Không lưu ngoài ý muốn; cảnh báo hợp lý |
| QB-05 | Lưu trữ câu không được dùng | Biến khỏi active list; thông báo đúng |
| QB-06 | Khôi phục câu đã lưu trữ (nếu áp dụng) | Quay lại đúng danh sách; không duplicate |
| QB-07 | Lưu trữ/xóa câu đang được tham chiếu | Tuân theo quy tắc rõ; không phá đề hay lịch sử |
| QB-08 | Double-click/retry thao tác lưu hoặc xóa | Không tạo trùng hoặc trạng thái sai |
| QB-09 | Teacher B gọi API đối với câu của Teacher A | Bị chặn theo chính sách; không đổi dữ liệu |
| QB-10 | Student gọi API quản lý câu | Bị chặn server-side |
| QB-11 | Random pool sau khi lưu trữ một số câu | Không lấy câu archived; báo thiếu đúng nếu không đủ |
| QB-12 | Xóa vĩnh viễn câu chưa tham chiếu (chỉ nếu triển khai) | Xác nhận rõ; hủy không tác động; không cascade lịch sử |

### B. Ảnh và lịch sử

| ID | Ca | Kết quả cần có |
|---|---|---|
| IMG-01 | Chọn ảnh hợp lệ, lưu câu, rời trang và mở lại | Ảnh hiển thị, không chỉ thấy object trong bucket |
| IMG-02 | Ảnh trong prompt và trong explanation | Vai trò/vị trí liên kết đúng |
| IMG-03 | Sai MIME, giả đuôi, quá dung lượng | Bị chặn; không lỗi nội bộ lộ ra UI |
| IMG-04 | Upload fail/mất mạng rồi retry | Giữ text, không tạo hàng loạt file thừa |
| IMG-05 | Signed URL hết hạn rồi mở lại | Backend cấp quyền/URL mới khi hợp lệ |
| IMG-06 | Sửa/xóa ảnh gốc sau khi có attempt snapshot | Ảnh cũ của attempt còn đúng |
| IMG-07 | Student xin ảnh explanation trước release | Bị chặn; không lộ qua API/signed URL |
| IMG-08 | Teacher khác xin ảnh không thuộc quyền | Bị chặn |
| IMG-09 | Hủy editor sau khi chọn/upload ảnh | Hành vi dữ liệu tạm được xử lý và ghi rõ |

### C. Exam, chấm điểm và kết quả

| ID | Ca | Kết quả cần có |
|---|---|---|
| EX-01 | Student được giao/không được giao cùng Exam | Quyền truy cập đúng |
| EX-02 | Trước openAt/sau closeAt, hết số lần thi | Không bắt đầu trái phép; UI giải thích |
| EX-03 | Chọn đáp án, autosave, reload | Khôi phục đúng, không reset đồng hồ |
| EX-04 | Chọn liên tiếp khi request chậm/thứ tự response đổi | Đáp án cuối được xử lý đúng; không ghi đè bằng request cũ |
| EX-05 | Hết giờ khi tab đóng hoặc mất kết nối | Backend finalize theo deadline; không gia hạn bởi UI |
| EX-06 | Nhấn submit hai lần và submit lúc autosave đang chờ | Không double-submit hoặc mất đáp án đã được server chấp nhận |
| EX-07 | Có essay, chấm từng phần rồi chấm đủ | Trạng thái/điểm cuối đúng; chưa chấm không giả là 0 cuối cùng |
| EX-08 | Ba release mode và các flag chi tiết/đáp án/lời giải | API và UI thống nhất; chưa công bố không lộ |
| EX-09 | Nhiều attempts, highest/latest | Chọn đúng lượt; pending grading xử lý rõ |
| EX-10 | PDF/Excel trước và sau cải tiến giao diện | Đúng dữ liệu, tiếng Việt, quyền export |

### D. Live Quiz và Session

| ID | Ca | Kết quả cần có |
|---|---|---|
| LQ-01 | Login, nhập code hợp lệ/sai, join lại | Lobby đúng; không nhân đôi participant |
| LQ-02 | Start, nhận câu, trả lời, reveal, next, final | Luồng hoàn chỉnh qua control thật |
| LQ-03 | Hai answer đồng thời/answer sau deadline | Chấp nhận đúng một đáp án hợp lệ hoặc từ chối muộn |
| LQ-04 | Student disconnect/reconnect | Phục hồi state, deadline và điểm đúng |
| LQ-05 | Host refresh/disconnect, Next lặp | Không nhảy hai câu; trạng thái/quy tắc host rõ |
| AU-01 | Login demo password ngắn đã tồn tại | Không áp policy tạo mật khẩu vào login |
| AU-02 | Registration/Admin tạo password ngắn | Vẫn giữ policy tạo password |
| AU-03 | Logout/login role khác cùng browser | Không lộ cache/data/ảnh của user trước |
| AU-04 | Tài khoản khóa, CSRF thiếu, URL trái quyền | Bị chặn ở backend; UI xử lý nhất quán |

### E. Thiết kế, phản hồi và khả năng sử dụng

| ID | Ca | Kết quả cần có |
|---|---|---|
| UI-01 | Desktop 1440, laptop 1366/1024, mobile 390 | Không overflow toàn trang, thao tác vẫn tìm được |
| UI-02 | Zoom 200%, tên/câu dài, tiếng Việt có dấu | Không mất chữ hoặc mất nút |
| UI-03 | Tab/Enter/Space/Escape và dialog/drawer | Focus hợp lý, không mắc kẹt hoặc nhảy mất |
| UI-04 | Reduced motion | Giảm hiệu ứng không cần; không mất state |
| UI-05 | Slow API, error, empty, pending, success | Mỗi state có feedback đúng; không giả thành công |
| UI-06 | Request tải lại khi đang gõ/đang thi | Không reset input, focus hoặc scroll |
| PERF-01 | Mở danh sách, editor, lưu câu, start/submit | Có bảng đo trước/sau, cùng điều kiện |
| PERF-02 | Menu/chọn đáp án/preview Markdown dài | Phân biệt nghẽn main thread với chậm mạng |
| REG-01 | Full lint/typecheck/unit/integration/build | Chạy thật, không sửa test để che bug |
| REG-02 | E2E Chromium; Firefox các flow quan trọng khi môi trường cho phép | Report đúng browser đã chạy; BLOCKED khác PASS |
| REG-03 | Production build + deep links + Session + Socket | Không chỉ xác nhận dev server |

## 11. Quy tắc kiểm thử an toàn

- Test phá dữ liệu phải dùng DB test riêng, đã xác minh không trỏ tới Supabase đang dùng.
- Kiểm tra fixture trước khi chạy: cấm reset/truncate/deleteMany không phạm vi trên DB người dùng.
- Không dùng dịch vụ Storage thật cho test hỏng/xóa hàng loạt.
- Test cloud chỉ smoke với dữ liệu tạm có tiền tố riêng, giữ danh sách ID/path tạo mới để dọn đúng phạm vi.
- Không xóa ảnh người dùng vừa upload.
- Không thay `.env`, key, project ref hoặc pooler đã hoạt động.
- HAR/trace/log có thể chứa cookie và signed URL; không commit bản chứa token/secret.
- API seed được phép dùng để setup fixture, nhưng hành vi cần nghiệm thu phải đi qua UI nhìn thấy được.
- E2E dùng getByRole/getByLabel và assertion theo kết quả; không đi thẳng URL editor để bỏ qua nút mở trang đang hỏng.
- Không xóa assertion, thêm skip hoặc tăng timeout toàn bộ để làm xanh suite.
- Test bất đồng bộ phải chứng minh state sau reload, không chỉ toast tức thời.

## 12. Quy trình thực hiện và điểm dừng

### Vòng 1 — Audit và sửa nền
- Inspect branch, diff, docs, scripts, code, test fixtures.
- Chạy baseline an toàn và lập bug list có bằng chứng.
- Tái hiện đầy đủ nhóm chức năng cốt lõi trước khi thay layout diện rộng.
- Sửa P0/P1 và vấn đề CRUD/ảnh/feedback rõ ràng.
- Đo thao tác chậm, sửa bottleneck đã chứng minh.
- Tạo tài liệu audit có ID test và trạng thái.

### Vòng 2 — Pilot giao diện
- Chốt token/components của Academic Console.
- Áp dụng trước cho shell Teacher và hành trình ngân hàng câu hỏi.
- Chụp before/after desktop/mobile, có dữ liệu thực hoặc fixture thật chứ không số liệu giả.
- Test cả control, API, reload, permissions, archived questions và snapshot ảnh.
- Báo nguồn tham khảo skill và phần nào được áp dụng/bỏ qua.
- Dừng để người dùng xem hướng giao diện trước khi lan sang toàn app.

### Vòng 3 — Đồng bộ và nghiệm thu
Chỉ thực hiện sau khi hướng mẫu đã được duyệt:
- Admin, Class, Exam Builder, Student Dashboard, Attempt, Grading, Result/Analytics, Live Quiz.
- Giữ ngữ cảnh thao tác và dữ liệu.
- Chạy full regression với evidence; cập nhật SRS/SDD/VERIFICATION theo source thực tế.
- Nêu hạn chế còn lại, đặc biệt những gì cloud chưa test.
- Không tuyên bố “đẹp” chỉ vì screenshot assertion pass; phải thực sự xem ảnh render.

## 13. Git và tiết kiệm credit

- Làm trên branch riêng; không force-push, không reset --hard, không stash/xóa thay đổi của người dùng.
- Checkpoint riêng cho functional fix, performance fix, shared UI, pilot, rollout.
- Không tự push khi chưa có yêu cầu.
- Prompt nội bộ/skill tooling giữ ngoài repo hoặc trong folder local được exclude.
- Không dùng git add -f với prompt, .env, tool cache hoặc state auth.
- Design spec và QA report là tài liệu sản phẩm, có thể commit sau khi kiểm tra không chứa secrets.
- Ghi tiến độ sau mỗi nhóm công việc: commit, việc đã làm, test đã chạy, test chưa chạy, lệnh tiếp theo.
- Dùng targeted tests khi sửa nhỏ; full gate tại mốc tích hợp, không lặp mọi suite sau từng đổi padding.
- Không bịa phần trăm hoàn thành. Không đưa số test cũ vào final report như kết quả mới.

## 14. Nguồn tham khảo đã đọc

Các nguồn sau hỗ trợ cách nghiên cứu/kiểm thử, không chứng minh code ExamSpace hiện tại đúng.

- Repository và README: `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill`
- Skill entrypoint công khai: `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/main/.claude/skills/ui-ux-pro-max/SKILL.md`
- Review tự thuật của Wilmer Hurtado: `https://wilmerhurtado.com/blog/skill-review-ui-ux-pro-max-realmente-disena-como-un-senior-o-solo-lo-aparenta`
- Phản hồi thiết kế #446: `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/issues/446` — lúc đọc: open; nhận xét cá nhân, chưa phải benchmark.
- Vấn đề ghi đè config #496: `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/issues/496` — trang issue hiện closed, liên kết #501.
- Playwright: `https://playwright.dev/docs/best-practices`
- Phân biệt độ phản hồi với hoàn tất request: `https://web.dev/articles/inp`
- Supabase Storage metadata/object: `https://supabase.com/docs/guides/storage/schema/design`

Kết luận nghiên cứu: đáng thử skill ở phạm vi pilot có kiểm soát. Không có bằng chứng đủ mạnh để bảo đảm cài skill sẽ làm toàn ứng dụng đẹp/dễ dùng hoặc sửa được CRUD.
