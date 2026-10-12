# Live Quiz — UX audit & thin-slice prototype

> Historical phase report. User subsequently approved the complete Live Quiz experience. See [final cleanup and verification](LIVE_QUIZ_FINAL_VERIFICATION.md) for the current decision and commit gates.

11/10/2026 · Branch `ux/education-saas-redesign-pilot` · Baseline `e236cb87221f2596aed424b833f281d6e34be66b`.

**Prototype hoàn thành, chờ user duyệt visual direction.** Chưa bắt đầu full rollout theo mục 0 của brief mới nhất. Không commit/push/deploy/merge/PR. Working tree sạch tại đầu phase; gián đoạn làm mất scratch storage, đã khôi phục runtime test, giữ nguyên source/automation.

## Source và workflow thực tế

Frontend nằm tại `apps/web/src/features/quiz.tsx`: `QuizList`, `QuizBuilder`/`QuizForm`, `QuizJoin`, `QuizRoom(host)`. Routes Teacher: `/teacher/quizzes`, `/teacher/quizzes/new`, `/teacher/quizzes/:id/edit`, `/teacher/quiz-rooms/:id/host`. Student: `/student/quiz/join`, `/student/quiz/:id/:screen`. `screen` không quyết định state: room snapshot quyết định. `Guard` kiểm tra role; server kiểm tra quyền riêng.

Teacher chọn câu từ ngân hàng của mình (không ESSAY), đặt thời gian 5–300 giây/điểm cơ bản 1–10000, lưu rồi tạo phòng qua REST. Builder có reorder lên, bỏ câu, archive và 20 phòng gần nhất. List chỉ tải trang mặc định; không có tổng số/counters đáng tin cho toàn bộ thư viện. Builder và pagination ngoài lát cắt thiết kế này.

Student phải đăng nhập; mã gồm 6 chữ số; GET by-code chỉ tìm phòng, **không** xác nhận được tham gia. Identity lấy từ session, không nickname/anonymous. LOBBY cho người mới; người đã tham gia được rejoin LIVE/FINISHED. Không giới hạn theo class membership trong Live Quiz hiện tại.

Backend: `modules/live-quiz/routes.ts`, `service.ts`, `logic.ts`; transport `sockets/quiz.ts`, `sockets/server.ts`; contract `packages/shared/src/index.ts`. Models: LiveQuiz, LiveQuizQuestion, QuizRoom, QuizParticipant, LiveRoomQuestion, QuizAnswer. Câu hỏi snapshot tại Start; các lần xuất hiện cùng source question có room-question ID riêng. Participant unique `(roomId, studentId)`; answer unique `(roomQuestionId, participantId)`. Transaction khóa room serialize Start/Next/Answer/Reveal.

## State machine, quyền và sự kiện

| State/transition | Authority và trigger | Presentation/persistence |
|---|---|---|
| Create → LOBBY | Teacher owner, POST `/teacher/quizzes/:id/rooms` | DB lưu mã; chưa snapshot questions nên `total = 0` ở lobby |
| Join/rejoin | `quiz:room:join` `{roomId? , code?}`; server lấy actor từ cookie | Ack snapshot cá nhân hóa; participant upsert, không duplicate |
| LOBBY → LIVE câu 1 | Owner `quiz:host:start` `{roomId}`, ít nhất 1 participant | Snapshot câu, set opens/closesAt; không bước Ready riêng |
| LIVE accepting → revealed | Tất cả participants đã trả lời hoặc deadline server | `revealedAt`; reveal/key/explanation/answerCount/leaderboard chỉ từ thời điểm này |
| Revealed → LIVE câu sau | Owner `quiz:host:next` `{roomId}` | Đổi room-question ID, deadline mới, xóa reveal |
| Câu cuối → FINISHED | Server reveal tự động | DB lưu endedAt/finishedAt; leaderboard cuối; không manual End |
| Leave/disconnect | `quiz:room:leave` hoặc socket disconnect | Presence false chỉ khi không còn socket khác của user trong room |
| Reconnect/reload | Socket.IO reconnect → client join lại | Ack lấy snapshot DB, phục hồi ownAnswer/deadline/index |
| CANCELLED | Enum có, không command/UI reachable | Student bị từ chối; không tạo flow cancel giả |

Client emits: `quiz:room:join`, `quiz:room:leave`, `quiz:host:start`, `quiz:host:next`, `quiz:answer` (`roomId`, `questionId`, `selectedOptionIds`). Ack `{data}` / `{error:{code,message}}`.

Server sends `quiz:state` trước các event chuyên biệt trong mỗi broadcast: `quiz:lobby:snapshot`, `quiz:participant:joined/left`, `quiz:started`, `quiz:question`, `quiz:question:closed`, `quiz:reveal`, `quiz:leaderboard`, `quiz:finished`; answer riêng có `quiz:answer:accepted/rejected`, lỗi command có `quiz:error`. UI hiện chỉ subscribe `quiz:state` và errors, dùng ack cho command/answer. Không append participants từ events nên snapshot trùng không tạo hàng trùng.

Socket.IO dùng Express session cookie và Origin allowlist; xác thực ACTIVE user ở handshake, mỗi incoming packet và mỗi 30 giây. Có message limit 180/30s và probe code limit. Client dùng autoConnect false + reconnect mặc định của thư viện, credentials true. Cleanup bỏ listeners, leave và disconnect; UI timer 250ms, server deadline worker 1000ms. Timer tính từ `closesAt`, `serverNow`, receive time; không có tick server mỗi giây. Quy tắc điểm: sai = 0; đúng = base + round(base × 0.5 × clamp(remaining/total)). Rank score giảm dần, joinedAt tăng dần, ID; giữ nguyên.

Không có sequence/version trong snapshot; các broadcast async khác nhau không được tuần tự hóa. Không có replay/delta/cross-instance adapter; hồi phục hiện hữu là join lấy DB snapshot. Không tự thêm protocol/reconnect architecture. Host presence riêng và số người đã trả lời trước reveal không nằm trong snapshot; UI không được suy đoán chúng.

Unsupported: pause, skip, manual end/cancel, kick, host transfer, sửa đáp án đã nhận, anonymous/nickname, streak/power-up/reaction/QR, analytics live answer count trước reveal. Trạng thái local connecting/join pending/disconnected không phải lifecycle DB mới.

## Kiểm chứng trước sửa

Sau khôi phục môi trường: unit baseline 38/38 (16 files), quiz real-transport integration 2/2 PASS. Lần trước sandbox chặn listener localhost, không phải product defect. Lint/typecheck/build baseline PASS ở lượt đầu; cả ba đã chạy lại và PASS sau prototype với automation mới. Build có warning chunk >500kB hiện hữu.

Mocked UI risk tests: ownAnswer selection/duplicate/participant snapshot/recovery PASS; pending join chưa được xác nhận nhưng UI đã báo Trực tuyến FAIL (đỏ trước sửa). Không thay answer-sync khi chưa tái hiện bug.

Playwright BEFORE Chromium đạt 3/3 lifecycle và 1/1 ca ghi nhận lỗi rejected join. Kết quả cuối từng browser được ghi riêng bên dưới và trong verification JSON.

## BEFORE UX findings và hướng chọn

Ảnh thật từ app ở 1440/820/390, mỗi phiên có Teacher + hai Student độc lập. Không có page overflow ở các state đã capture, nhưng có các vấn đề về hierarchy:

| Screen | Evidence / tác động | Prototype |
|---|---|---|
| Teacher lobby | Mã 80px, participant tiles và nút Start dồn giữa cùng một card | Mã trái, mô tả Start mở câu ngay; roster có dòng và trạng thái bằng chữ |
| Teacher active | Roster biến mất; chỉ còn câu hỏi giống Student, không giải thích lúc nào được Next | Question workspace + rail điều khiển/participants; Next chỉ sau reveal, mobile đặt trước nội dung |
| Student active | Tiêu đề phiên 42px lớn hơn prompt 16px; timer thành khối nền lớn; option giống các card con | Tiêu đề phiên 20/18px; prompt 23/20px; timer gọn, có nhãn; native lựa chọn với viền/lề selected |
| Waiting | Hai role dùng cùng composition và cùng mã khổng lồ | Student tập trung “đã vào phòng / chờ giảng viên”, Teacher tập trung chuẩn bị phiên |
| Leaderboard | Các div không có header; ưu tiên người đầu bằng nền vàng, không có cấu trúc cột semantic | Table rank/name/score, chữ số tabular, nền xanh rất nhẹ cho hạng đầu |
| Connection | Socket connected báo online trước join ack; join denied vẫn online + loading | Pending/đã vào phòng/từ chối/mất kết nối dựa trên transport và ack thật |

**Session Control**: vùng câu hỏi lớn + rail điều phối, status rule phân định state; roster luôn có ở active hosting. **Live Response**: một vùng đọc/trả lời giới hạn chiều rộng; trạng thái nhận đáp án nằm sát action. Leaderboard tách khỏi khu vực đang trả lời và chỉ theo dữ liệu server. Typography, mực trầm `#252c2a`, xanh `#24574e`, giấy `#fffefa` lấy từ ExamSpace identity; không đổi global tokens/font/shared shell. Không copy mục lục/điều hướng bài thi của Focus Desk hay workflow soạn đề của Exam Folio.

Đây là tổng hợp từ source, các tài liệu identity đã đọc và visual inspection thật, không tuyên bố dùng một design generator. Không có illustrations, confetti, gradient, KPI tiles hoặc animation mới. User gửi brief Full Rollout giữa lúc finalization: mục 0 yêu cầu review/duyệt prototype trước. Chưa có xác nhận duyệt; **chưa bắt đầu Full Rollout, chưa nghiên cứu/cài/invoke Impeccable, Taste Skill hoặc UI UX Pro Max cho phase đó**.

## Lát cắt đã triển khai và hai rủi ro UI

- QuizList presentation; QuizJoin input/pending/error; lobby Teacher/Student; active shell, question/answer controls; submitted; reveal/leaderboard; FINISHED; mất kết nối/rejoin/rejected join.
- QuizBuilder/QuizForm giữ nguyên. Không pagination rollout, không hoàn thiện mọi empty/error permutation, không redesign shared navigation. Không thay backend runtime, schema, protocol, API, scoring, timer hoặc session transition.
- `AnswerControl` shared không sửa. Live Quiz dùng wrapper memo riêng cho Markdown/answers để timer không bắt render lại nội dung không đổi. Native radio/checkbox và luật chọn/gửi giữ nguyên.
- `ownAnswer`: real snapshots khi Student B/Teacher reload không xóa lựa chọn chưa gửi của Student A, kể cả đổi lựa chọn trước snapshot. Mocked duplicate/participant snapshots cũng PASS; server ownAnswer phục hồi lựa chọn đã nhận và khóa đúng; câu sau reset. **Không sửa effect đồng bộ đáp án**. Reload khi chưa gửi không có persistence local, giữ behavior hiện hữu; không quảng cáo khả năng khôi phục draft chưa gửi.
- Connection bug tái hiện đỏ bằng mocked delayed/rejected ack, và bằng real late participant join vào LIVE. Chỉ sau ack `{data}` mới enable room interactions/báo “Đã vào phòng”. Ack `{error}` hiển thị lỗi và đường trở về; không infinite loading.
- Regression của chính bản sửa: ack cũ sau disconnect có thể bật connected lại. Đã reproduce đỏ rồi sửa bằng generation theo connection + cleanup guard; test xanh. Không thêm event, retry architecture hoặc server-side state.
- Disconnect giữ nội dung gần nhất, ghi rõ stale snapshot, khóa controls cho tới join ack mới. Join input có pending và chặn submit lặp trong request đang chạy. Không optimistic accepted: vẫn chỉ từ answer ack hoặc ownAnswer server.

## Verification và giới hạn coverage

Các lệnh dùng `TEST_DATABASE_URL` loopback, database tên có `test`; seed và Playwright dùng cùng `DEMO_PASSWORD`. Không dùng production Supabase/accounts. PostgreSQL 16 giải nén riêng scratch storage, migration deploy và seed synthetic. Không commit env/password/log/database runtime.

| Gate | Kết quả |
|---|---|
| Baseline `npm run lint`, `npm run typecheck`, `npm run build` | PASS trước sửa UI; log lượt đầu mất khi runtime scratch storage bị thay, kết quả đã ghi trong chat |
| Baseline `npm test` | 38/38, 16 files; loopback rerun PASS |
| Baseline quiz integration | 2/2 real Socket.IO |
| Baseline Chromium | 3/3 multi-context widths + 1/1 rejected-join defect evidence; 4 ca riêng |
| Final `npm run lint`, `npm run typecheck`, `npm run build` | PASS |
| Final `npm test` | 41/41, 17 files; trong đó 3 mocked Quiz UI regression |
| Final integration | 11/11, 3 files: quiz 3, socket 2, auth 6 |
| Final Chromium | 5/5 Live Quiz + 1/1 scoped-style compatibility |
| Final Firefox | 5/5 Live Quiz |
| Final WebKit | 5/5 Live Quiz; runtime libraries giải nén riêng trong scratch storage |

Tổng final browser verification: **16 ca riêng PASS** (Chromium 6, Firefox 5, WebKit 5), 0 fail/skipped/retry trong các batch hoàn tất cuối. Lượt recapture Chromium rejected join 1/1 không cộng trùng. Failures trước khi sửa harness/môi trường được ghi riêng.

Commands: `npx vitest run --config vitest.integration.config.ts apps/api/test/quiz.integration.test.ts apps/api/test/socket.integration.test.ts apps/api/test/auth.integration.test.ts`; `npx playwright test --config playwright.live-quiz.config.ts --project chromium` (tương tự firefox/webkit); compatibility `npx playwright test --config playwright.ui.config.ts tests/ui/live-quiz-compat.spec.ts`. Mỗi browser batch khởi động server riêng để giữ nguyên auth rate limit. Không tăng timeout để che failure.

Mỗi lifecycle browser case kiểm tra REST tạo Quiz/questions + UI Lưu & tạo phòng; 2 Student code join; lobby participant count; Start; snapshot không key/leaderboard trước reveal; radio keyboard; selection qua snapshot; ack/locked; Student reload và Teacher reload giữ deadline; Student transport disconnect/rejoin; reveal sau cả hai trả lời; rank/name/score từ server; Next reset selection; multiple-choice; real 8s deadline khi B không trả lời; true/false; auto FINISHED; reload FINISHED; DB đúng 5 answers, 2 participants; Student bị 403 với Teacher endpoint; không pageerror. Không mocked Socket.IO payload trong browser test.

Integration thêm owner/foreign Teacher, no-participant Start, repeated join không duplicate, repeated Start rejected, Next trước reveal rejected, late new participant LIVE/FINISHED rejected, unjoined answer rejected. Suite gốc kiểm tra concurrent double answer chỉ nhận một, quá deadline rejected, snapshot bất biến sau source question edit, ownAnswer recovery, essay rejected. Socket/auth suites kiểm tra unauthenticated socket, session/CSRF/Origin/locked account và RBAC. Không đổi assertions cũ.

Các failures đã phân loại: fixture đầu dùng nhãn Đúng/Sai bị API True/False hiện hữu từ chối → sửa fixture thành True/False; screenshot join đầu chụp loading → thêm ready assertion và recapture. Firefox `setOffline` giữ WebSocket cũ nên không tạo mất transport thật → dừng batch (1 fail, 1 interrupted, 3 chưa chạy), dùng Playwright forwarding kết nối server thật, đóng hai đầu socket và chặn fallback polling khi gây lỗi; sau đó cho kết nối lại bằng client hiện hữu. Không tạo snapshot/ack giả. Baseline Chromium dùng offline emulation gốc; final các browser dùng harness nhất quán này. WebKit thiếu thư viện và launcher bundle ghi đè LD_LIBRARY_PATH → các packages chỉ giải nén ở scratch storage, wrapper tạm chạy chính binary WPE đã tải, config optional `LIVE_QUIZ_WEBKIT_EXECUTABLE`; không chỉnh binary/cache/system/app dependencies. Các lượt failure môi trường được giữ trong evidence, không tính là PASS.

## Responsive, accessibility và visual self-review

- Flow/captures 1440/820/390; kiểm tra bổ sung 320 cho active Teacher/Student và timer/control layout. Không tràn ngang ở states đã kiểm tra. 1024 và stress hàng trăm participants/nội dung cực dài thuộc coverage mở rộng chưa thực hiện của prototype.
- Keyboard nhập mã → Tab → Enter, Start bằng Enter, radio bằng Space, Tab tới submit và Enter; focus outline trên option; không mất selection khi participant snapshot tới. Radio/checkbox native, fieldset/legend, table headers, error alert, status text.
- Answer labels và primary actions tối thiểu 44×44 tại cả bốn widths đã đo. Primary button contrast đo từ computed styles 8.24:1 trên cả ba browsers; palette cặp chữ/giấy cũng kiểm tra độc lập trong verification. Không tuyên bố chứng nhận WCAG/full screen-reader audit.
- Timer `role=timer`, `aria-live=off`, không nằm trong status live region; snapshot/participant list không tạo toast. Timer UI so với server sai lệch không quá 2s trong kiểm tra offset/reload; deadline không đổi. Không claim đo drift suốt nhiều giờ hoặc WAN latency.
- Reduced-motion context, question animation none; prompt DOM giữ nguyên khi timer/resize. Không thêm animation. Không có sticky layer che nội dung. Mobile Next đưa lên trước nội dung sau reveal; roster xuống sau nội dung.
- Tự inspect desktop/mobile thật, sửa tên participant bị global th uppercase và vị trí Next mobile. Teacher có composition điều phối riêng; Student không có rail/KPI lấn câu hỏi. Bảng xếp hạng có cấu trúc và điểm rõ; không trophy, game mechanics, nested cards. Visual quality là kết luận design review của agent cho prototype, chưa phải user approval.
- Compatibility giữ CSS Quiz đã load qua SPA, so sánh computed styles h1/buttons/inputs/selects ở Teacher Exam và Student Catalog trước/sau; PASS. Approved modules, shared primitives, App.tsx và global tokens/styles không đổi. Builder slice trong quiz.tsx giữ byte-for-byte.

## Artifacts và điểm dừng

- `docs/screenshots/live-quiz-prototype/review-board-desktop.png`
- `docs/screenshots/live-quiz-prototype/review-board-mobile.png`
- `docs/screenshots/live-quiz-prototype/evidence-states.png`
- `docs/screenshots/live-quiz-prototype/board-manifest.json` — source/crop/hash provenance; raw paths scratch storage là runtime evidence, không bắt buộc tồn tại sau checkout.
- `docs/ux/live-quiz-prototype-verification.json`

Compositor `tests/ui/live-quiz-boards.py` chỉ crop/ghép real screenshots, không thiết kế UI giả. Board mobile có crop bỏ shared navigation; Teacher mobile ghi rõ vùng điều khiển. Library dùng Teacher fixture riêng với 3 Quiz để không trình bày danh sách trùng do fixtures tích lũy. Các participant/room của board là dữ liệu test thật. Đã tự mở và inspect cả ba final boards, sửa crop rejected join và crop mobile Teacher để giữ trọn controls, không để mẩu câu hỏi bị cắt. Không ghi đè board đã duyệt ở phase trước.

Git audit cuối: branch `ux/education-saas-redesign-pilot`, HEAD `e236cb87221f2596aed424b833f281d6e34be66b` không đổi; 2 tracked files modified (`quiz.tsx`, quiz integration test), 13 untracked files gồm scoped CSS, UI tests, Playwright config/fixtures/specs/compositor, report/verification và 4 board artifacts. Danh sách và SHA-256 trong verification JSON. `git diff --check` PASS; Builder byte-for-byte unchanged; backend runtime, shared contracts/primitives, approved modules, package manifests/lockfile không đổi.

Remaining risks/out of scope: không có version/order token cho snapshot; broadcasts async có thể chồng nhau (source limitation, chưa tái hiện stale-order corruption). Chưa fault-inject late answer ack sau chuyển câu, network loss giữa DB commit và ack, server restart, multiple API instances hoặc soak/load hàng trăm players. Join ack không có timeout riêng hiện hữu, explicit server disconnect không có architecture recovery mới. Chỉ rejoin theo behavior hiện tại. List pagination/builder refinement và full empty/error permutations chưa rollout. Header shared trên mobile vẫn chiếm diện tích; không redesign module shell trong phase này. Build >500kB warning và pg concurrent-query deprecation đã có; không sửa dependency/backend ngoài scope.

Dừng để review **Live Quiz thin-slice prototype**. Chưa có user approval visual direction; không tự coi tests PASS là duyệt. Brief Full Rollout mới được giữ làm bước tiếp theo có điều kiện, chưa tạo rollout report/boards và chưa tích hợp ba design skill. Không commit/push/deploy/merge/PR.


Final cleanup provenance: this report records its original phase. `external-artifacts/` identifies historical scratch artifacts, not repository files; those raw captures/logs are no longer available locally. Historical hashes remain original run records. See [final verification](LIVE_QUIZ_FINAL_VERIFICATION.md) for current checks and portable-metadata integrity.
