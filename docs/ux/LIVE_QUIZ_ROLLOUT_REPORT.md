# Live Quiz — Full rollout, visual refinement & functional hardening

> Historical phase report. User subsequently approved the complete Live Quiz experience. See [final cleanup and verification](LIVE_QUIZ_FINAL_VERIFICATION.md) for the current decision and commit gates.

11/10/2026 · Branch `ux/education-saas-redesign-pilot` · HEAD `e236cb87221f2596aed424b833f281d6e34be66b`.

**Hoàn thành implementation, verification và review artifacts; chờ user review Full Rollout.** Không commit/push/deploy/merge/PR. Tiếp tục working tree prototype, không reset/checkout/discard. Quyết định review mới của user duyệt Teacher **Session Control**, Student **Live Response**, workflows và server authority; **không duyệt thẩm mỹ prototype**. Full rollout giữ composition và nâng cách thể hiện. Prototype report, verification và boards là evidence lịch sử, được giữ nguyên.

## Khôi phục tiến độ

Đã đối chiếu Git status/diff, source đang sửa, logs và artifact hiện có sau yêu cầu tiếp tục. Không có application crash/test failure trong các final batch logs giải thích việc turn trước dừng; thông tin workspace credit limit đến từ user, không có platform diagnostic log để xác nhận độc lập. Phần dang dở là final browser verification, tái tạo boards sau first-frame clock fix và chốt report/JSON; không audit hoặc triển khai lại prototype.

## Baseline và phạm vi

Source audit đã hoàn thành trong [prototype report](LIVE_QUIZ_PROTOTYPE_REPORT.md), không làm lại. Room lifecycle vẫn LOBBY → LIVE câu 1 → reveal → Next → FINISHED tự động ở câu cuối. Reveal do tất cả người tham gia trả lời hoặc deadline server. Không pause/skip/manual end, không anonymous/nickname, không cơ chế trò chơi mới.

Baseline working tree: 2 tracked modified + 13 untracked files; có source/CSS/tests/automation/evidence prototype. Trước sửa visual, lưu source vào `external-artifacts/live-quiz-rollout/baseline-source` và chạy lại Chromium lifecycle ở 1440/1024/820/390/320: **7/7**, scoped compatibility **1/1**. Prototype trước đó: static gates PASS, unit 41/41, integration 11/11, Chromium/Firefox/WebKit mỗi 5/5 + compatibility 1/1. Baseline của rollout là prototype thực tế này, không phải HEAD chưa có Live Quiz UX.

Thay đổi runtime chỉ ở `apps/web/src/features/quiz.tsx` và `apps/web/src/styles/live-quiz.css`. Builder nhận wrapper styling cùng module; logic biên soạn/lưu/cấu hình câu hỏi giữ nguyên. Backend runtime, DB schema, API/Socket.IO contracts, scoring, timer helper/worker, authentication, shared primitives/shell/global tokens và các module đã duyệt không sửa. Không dependency/font/assets tải ngoài mới.

## Design skill research và mức tích hợp thực tế

Đã kiểm tra catalog và skill files có sẵn; ba skill mục tiêu chưa cài. Đọc README, SKILL.md phù hợp, tree, license, scripts/hook liên quan từ official source ở commit cố định, lưu tham khảo ngoài repo trong `external-artifacts/live-quiz-rollout/research`.

| Nguồn | Version/commit đã đọc | Đã thực hiện | Không thực hiện |
|---|---|---|---|
| [Impeccable](https://github.com/pbakaus/impeccable/tree/d631a8827f99414d2b6daba4ef08b7f8701751d7) | SKILL metadata 4.5.2, `d631a882…` | Đọc critique, typeset, layout, bolder, polish, craft-floor; tham khảo adapt/harden/operate. Hai assessment độc lập: design từ screenshots và mechanical/source evidence. Áp dụng đánh giá hierarchy, role scale, spacing rhythm, trạng thái, bounded self-review. | Không cài launcher/engine/hook, không chạy `/impeccable critique`, detector, overlay, live-server hoặc critique-storage. Đây là **guidance-assisted critique**, không claim một full command run. |
| [Taste Skill](https://github.com/Leonxlnx/taste-skill/blob/717446e07a78d4e6d7918b1fde1a263378eebac9/skills/redesign-skill/SKILL.md) | `717446e0…`, `redesign-existing-projects` | Đọc Scan → Diagnose → Fix; áp dụng giảm repeated framing, phân vai typography, bố cục đọc và hover/pressed/loading/empty/error. | Không dùng experimental v2, GSAP, image generation, gradients/grain, parallax, broken grid hoặc font swap bắt buộc. |
| [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/67803eac81607188194aea9842a723b89326d90d) | `67803eac…`, CLI package 2.5.0 | Đọc SKILL/quick-reference/pro-rules; kiểm tra Python search/imports/persistence paths, rồi **chạy search thật** ở scratch storage cho touch/focus, heading wrapping và React effect/memo. Kết quả JSON lưu cùng provenance. | Không npm/global install, không `--persist` design system, không đưa source/data tool vào app, không chạy installer. |

Impeccable README hiện mô tả launcher tự tải self-contained binary và installer có thể viết provider-native hooks; đọc cả launcher và `.codex/hooks.json` trước khi chọn cách tích hợp. Không chạy context loader; đọc trực tiếp `docs/ux/EXAMSPACE_VISUAL_IDENTITY.md`, current source/styles và prototype evidence. Taste hướng dẫn plain Markdown tương thích Codex; không cần runtime. UI UX Pro Max search dùng Python standard library, domain/stack queries không ghi vào project. License: Impeccable Apache-2.0; Taste và UI UX Pro Max MIT. Không sao chép asset/source của ba repository vào sản phẩm.

Queries đã chạy:

- `touch target focus --domain ux`: kết quả touch sizing/spacing; phân biệt CSS pixels và native units, giữ tiêu chuẩn nội bộ 44px đã có.
- `orphan heading line balance --domain ux`: heading balance chỉ là heuristic; kiểm tra natural wrap. Final review bỏ `balance` riêng cho tên phiên để tránh dấu `·` đứng đầu dòng mobile.
- `rerender memo cleanup --stack react`: cleanup subscriptions/timers, memo có chọn lọc. Giữ wrappers Markdown/AnswerControl đã có; không bật React Compiler hay thay build stack.

User constraints và ExamSpace identity có ưu tiên cao hơn gợi ý skill: giữ system font và palette xanh trầm; không thêm texture/ảnh nền/animation framework; không thay shared shell. Các hook/detector recommendations bị bỏ qua có chủ đích theo phương thức tích hợp ít xâm lấn user cho phép, không phải tool chạy thất bại.

## Visual critique từ ảnh thật

Assessment A đọc 15 ảnh Teacher/Student ở desktop/mobile độc lập với Assessment B. Assessment B kiểm tra source, overflow, computed measurements và rủi ro realtime. Không dùng test PASS để suy ra thẩm mỹ đạt.

| Screen / evidence BEFORE | Vấn đề và tác động | Ưu tiên / refinement | Rủi ro và kiểm chứng |
|---|---|---|---|
| Teacher active 1440 | Hai strong green rules liên tiếp; title/prompt/control/timer đều gần cùng trọng lượng; rail hòa vào nền | P1: giảm framing, prompt 26px/550 với measure rõ; rail có đường chuẩn riêng, index và timer phân vai | Không đảo vùng main/rail; same-state screenshot + keyboard/control flow |
| Student active 390/320 | Bốn hình chữ nhật tách nhau lặp lại khung ngoài; mọi khoảng cách gần như ngang vai | P1: answer rows cùng nhóm, native radios + selected wash; prompt tách khỏi legend, action footer có khoảng riêng | Không thay option semantics/submit; selection/keyboard/touch tests |
| Lobby | Mã/đợi trong một khung trắng giống câu hỏi, thiếu khác biệt trạng thái | P1: vùng mã/waiting xanh nhạt, type code rõ; Student waiting có nhịp đọc riêng, roster mở | Mã vẫn từ server; không nickname/QR; join/count tests |
| Submitted | Radio disabled nhạt là thay đổi mạnh nhất; receipt chỉ một dòng nhỏ có vạch trái | P1: receipt có check SVG, độ tương phản và vùng xác nhận rõ ở vị trí action hiện hữu | Receipt chỉ xuất hiện sau ACK/ownAnswer; lost-ACK tests |
| Finished/reveal | Bảng kết quả nhỏ hơn câu cuối, kết thúc chưa có điểm nhấn | P1: heading kết quả 30px, score/rank phân cấp; câu đã đóng giảm nhấn | Không tự tính/xếp hạng; table lấy server leaderboard |
| Roster / library | Danh sách giống các đoạn văn cùng đường kẻ; tên dài chưa có min-width/wrapping | P2: initials có nghĩa nhận diện người, presence bằng chữ; row typography và spacing; containment title dài | Không tạo identity giả; long-name/title tests |
| Join / preparation | Form và intro khô, tỷ lệ chữ/field/action chưa rõ | P2: title/display scale, intro measure, một form surface; Builder scoped styling | Không đổi fields/validation/business flow; create-room path |

## Refinement đã triển khai

Teacher vẫn là question workspace + control/participant rail. Student vẫn là một vùng Live Response giới hạn chiều rộng. Không thêm dashboard KPI, podium, trophy, confetti, illustration hay một navigation mới.

Phân vai type: context 12–13px/500, body 16px, title session 22px Student/30px Teacher, prompt 26px desktop/22px mobile, question index tabular 36/30px và timer 23/20px. Không tăng tất cả heading cùng lúc. Lớp giấy gần trắng chỉ bao question/form; roster/control dùng cấu trúc mở. Main question không còn strong border-top lặp với session status. Controls có hover/pressed nhanh 120–140ms trên màu, không translate/reflow; reduced-motion tắt transition. Không animation đếm giờ/câu hỏi.

Rhythm phân biệt 8–12px cho metadata, 16px cho controls, 24–32px cho nhóm nội dung, 40px cho main/rail. Mobile giữ controls Next ở trước main sau reveal; không sticky overlay. Finished để kết quả đứng trước câu cuối và giảm độ nhấn nội dung đã đóng. CSS có boundary `.lq`; một bộ rule theo vai trò, không thay global tokens.

Self-review sau lần render đầu xác nhận lobby, receipt, result và open answer rows khác biệt có ý nghĩa. Một lượt sửa visual cuối: tên phiên dùng natural wrap; screenshot chuyển pointer ra ngoài để hover không giống preselection. Khi inspect board, phát hiện first-frame timer có thể thừa 1 giây: thêm red/green regression test và đồng bộ hai mốc local UI tại thời điểm nhận snapshot. Không sửa helper/deadline/scoring. Thông báo network failure của thư viện được viết bằng tiếng Việt và kiểm tra lại trên ba trình duyệt. Không mở vòng redesign thứ hai. User vẫn là người duyệt thẩm mỹ cuối.

## Functional hardening có bằng chứng

| Finding | Reproduction | Fix / giới hạn |
|---|---|---|
| ACK Q1 đến sau Q2 khóa nhầm Q2, hoặc gắn lỗi Q1 vào Q2 | Hai mocked UI tests đỏ trước sửa | Request generation đổi khi question/disconnect/unmount; bỏ ACK/error/finally cũ; Q2 không giữ busy của Q1 |
| Error còn sau retry thành công | Mocked UI test đỏ trước sửa | Clear error khi command/answer retry; test cả Student và Teacher |
| Missing join ACK chờ vô hạn | Unit fake clock + drop **ACK thật** ở browser | Deadline local 8s, lỗi + Kết nối lại; ACK cũ không báo joined; không đổi server lifecycle/reconnect protocol |
| Answer đã commit nhưng ACK mất | Browser chặn một ACK thật, DB count trước reload | Rejoin lấy ownAnswer DB, phục hồi selected/locked; không optimistic accepted hoặc gửi lại tự động |
| Snapshot cũ lùi câu hoặc bỏ reveal | Mocked ordering test đỏ trước sửa | Chặn lùi index/lifecycle và bỏ reveal đã công bố trong cùng room; không thêm sequence/event/schema |
| Snapshot ownAnswer null sau snapshot answer đã ghi | Mocked test đỏ trước sửa; phân biệt với prototype normal-snapshot tests vẫn PASS | Giữ immutable ownAnswer cùng question trong applySnapshot; effect đồng bộ lựa chọn không rewrite |
| Empty/error library và trang sau không có entry rõ | Real empty teacher, network abort, 21 persisted Quiz | Empty guidance, retry, page trước/sau qua API pagination hiện có; không bịa total count |
| Long title/name và Markdown | Real persisted fixtures, 200-char title, dài tên/code/math/table | Wrap/min-width, block code/table scroll nội bộ; không page overflow; answer vẫn gửi được |
| First-frame timer thừa 1 giây | Board AFTER hiện 00:02:01 cho câu 120s; fake-clock test đỏ khi snapshot tới giữa hai UI ticks | Đồng bộ `now` và `received` bằng cùng một `Date.now()` khi apply snapshot. Không sửa timer helper/worker/deadline; full unit và lifecycle ba browser chạy lại |
| Focus sau automatic question transition | Browser Q1 → Q2 bằng server | Focus prompt khi người dùng đang trong Quiz/body, không cướp focus khỏi shared navigation; không chạy theo participant snapshots |

Các guards dùng tính bất biến đã có của server, không sắp xếp mọi snapshot theo clock client. Presence cùng phase vẫn là latest received; protocol chưa có version nên không claim giải quyết mọi thứ tự mạng. Đáp án/điểm/reveal/leaderboard/deadline vẫn server-authoritative. Participant và answer IDs/counts vẫn do DB/server quyết định.

## Coverage theo state thật

| Role / state | Evidence và assertions |
|---|---|
| Teacher entry / preparation | Library 3 Quiz thật ở 5 widths, Builder capture; lifecycle tạo phòng từ UI. Empty/loading/network error/retry, 21 Quiz phân trang và title dài qua hardening. Builder logic không đổi. |
| Teacher lobby | Empty roster → 2 Student, code, Start disabled/enabled, real join ACK. |
| Teacher active / reveal / Next | Question/control/roster, server reveal, real leaderboard, Next chỉ khi source cho phép. Main/rail desktop và control trước question mobile. |
| Teacher finished / recovery | Auto-finish, final leaderboard, reload; real host transport disconnect/rejoin giữ deadline; unit command retry/error và stale ACK. |
| Student join / denied / waiting | Numeric validation, invalid code, lookup pending, join pending/rejected/missing ACK, explicit retry; không báo joined trước ACK. |
| Student active / selected / submitted | Single/multiple/true-false; selection qua participant snapshots; ownAnswer sau reload; mất ACK sau DB commit không tạo đáp án trùng. |
| Student reveal / ranking / finish | Đáp án và explanation từ server; rank/score server, deadline reveal, auto-finish và terminal reload. |
| Student disconnect / recovered | Real WebSocket/polling interruption, disabled submit khi offline, rejoin/state restoration; next-question focus, bỏ late callbacks. |

Unit ordering tests mô phỏng callbacks để tái hiện race có kiểm soát. Browser cases dùng transport/database thật; không đánh đồng hai mức verification. `CANCELLED` được trình bày như terminal state hiện có; không thêm hành động hủy hoặc claim có end-to-end transition sang CANCELLED khi source không cung cấp workflow đó.

## Verification

Runtime test: PostgreSQL 16 cô lập ở loopback, database có `test`; tài khoản synthetic. Không production credentials/data. Playwright dùng 3 authenticated contexts thật và Socket.IO server thật. Unit tests mock callbacks được ghi riêng; không gọi chúng là transport tests.

Kết quả và hashes đầy đủ trong [verification JSON](live-quiz-rollout-verification.json).

| Gate | Kết quả |
|---|---|
| Rollout BEFORE | Chromium 7/7 + compatibility 1/1 |
| Unit/frontend cuối | **50/50**, 17 files; Live Quiz UI 12 tests |
| Integration | **11/11**, 3 files; PostgreSQL thật |
| Chromium | **11/11**: lifecycle/accessibility/denied 7 + hardening 4 |
| Firefox | **11/11**: cùng bộ assertions |
| WebKit | **11/11**: cùng bộ assertions; official MiniBrowser với isolated library wrapper |
| Compatibility | **1/1**, Teacher Exam và Student Catalog computed styles sau SPA navigation không đổi |
| Static | Lint, typecheck, production build PASS |

Tổng **34 browser cases khác nhau**, không failed/skipped/retry ở batches cuối. Sau chỉnh copy lỗi thư viện, chạy lại library case trên cả ba browser và compatibility; sau first-frame timer fix, chạy lại full unit/static, toàn bộ lifecycle 7 cases/browser, cả 4 hardening cases/browser, recapture screenshots và compatibility. Đây là chạy lại các cases đã tính, không cộng để thổi phồng coverage. Integration từ batch full đã PASS; các patch frontend cuối không đổi backend/protocol. Tất cả browser evidence cuối được chụp từ source cuối.

Accessibility đo trên cả ba browser ở 5 widths: keyboard/native radio/checkbox và focus hoạt động; answer/action targets đo được tối thiểu **48px** (assertion yêu cầu ≥44px); primary-button contrast **8.24:1**; reduced-motion không transition; prompt không remount theo timer tick. Timer sampling so với server đạt sai số **0–1s** tại các điểm đo (Chromium/WebKit tối đa 0s; Firefox tối đa 1s); assertion cho phép tối đa 2s cho scheduling, không phải cam kết clock tuyệt đối. Không page overflow ở 15 lifecycle flows và long-content/title/name/landscape tests. Đây là kiểm tra những tiêu chí nêu trên, không phải chứng nhận WCAG đầy đủ.

Batches độc lập cho từng browser/suite để giữ auth rate limit nguyên vẹn. Test viewport lifecycle: 1440/1024/820/390/320; accessibility bổ sung đủ năm widths; landscape 844×390 với rich content. Functional tests kiểm tra Start, single/multiple/true-false, choice preservation, reload Teacher/Student, Student disconnect/reconnect, Next/reveal/deadline, FINISHED/reload, DB unique answers, RBAC. Hardening bổ sung pending/missing join ACK, lost answer ACK sau DB commit, Teacher transport recovery, next-question focus, empty/loading/error/retry, pagination và nội dung dài.

Harness fault giữ/drop payload thật: intercept cả polling/WebSocket; không tạo snapshot/ACK/score giả. HTTP library failure dùng network abort; delayed loading giữ request thật rồi tiếp tục. Code explanation trong fixture được sửa theo từng câu (TLS không dùng lời giải session ID của Q1); không phải thay dữ liệu sản phẩm.

Failures lịch sử giữ riêng: ba ACK/retry red tests, hai stale-state red tests và một first-frame clock red test; một browser harness locator loading khớp hai vùng `Đang tải…` đã scope vào `.lq-index`; một unit health test không mở listener trong sandbox, chạy lại với quyền localhost. Không weaken assertion hay xóa test để lấy PASS.

## Artifacts, git và giới hạn

Artifacts final ở `docs/screenshots/live-quiz-rollout/`, tách khỏi prototype:

- [Desktop board](../screenshots/live-quiz-rollout/review-board-desktop.png): 8 state surfaces Teacher/Student, 1440px.
- [Mobile board](../screenshots/live-quiz-rollout/review-board-mobile.png): 8 states 390px, gồm Teacher Next.
- [Before/after](../screenshots/live-quiz-rollout/visual-before-after.png): 3 cặp cùng state/viewport — Teacher active, Student question, submitted.
- [Recovery/edge evidence](../screenshots/live-quiz-rollout/evidence-states.png): pending/timeout/recovered, empty/error library, disconnected.
- [Board manifest](../screenshots/live-quiz-rollout/board-manifest.json): source hash, source dimensions, crop và display size.

Đã tự mở cả bốn final boards, kiểm tra nhãn/role/state, crop, chữ, responsive hierarchy và khác biệt BEFORE/AFTER. Teacher board giữ control/roster nhẹ hơn câu hỏi; mobile giữ nhóm đáp án dễ quét và receipt rõ; kết quả có điểm nhấn riêng. Đây là đánh giá thiết kế dựa trên ảnh, user chưa duyệt thẩm mỹ mới.

Before/after dùng app thật, cùng state/viewport và fixture tương đương; room code, timer/score có thể khác theo thời điểm thật. Compositor chỉ crop/ghép; không mockup hoặc chỉnh nội dung UI trong ảnh. Raw screenshots/logs ở scratch storage là tạm; manifest/verification giữ source hashes, crop, measurement và outcome.

Git vẫn branch/HEAD đầu báo cáo. **2 tracked modified + 22 untracked files** (bao gồm prototype artifacts giữ lại). Tracked diff chỉ `quiz.tsx` và integration test từ prototype. Runtime thêm CSS scoped; còn lại là UI tests, Playwright config/fixtures/suites/compositors và docs/boards/JSON. Prototype boards/manifest/report và integration test khớp hashes lịch sử. `git diff --check` PASS. Không package/lockfile/shared module thay đổi; không destructive cleanup.

Giới hạn: chưa multi-instance/server-restart/soak với hàng trăm người; chưa full screen-reader certification. Snapshot protocol không có sequence/version; guards chỉ bảo vệ những facts không thể đảo chiều. Timer/scoring algorithms và server 1s worker không thay. Existing build chunk >500kB và pg concurrency deprecation còn nguyên. Không mở global shell/font/navigation redesign.

Dừng để user review Full Rollout và Visual Refinement. Không commit/push/deploy/merge/PR.


Final cleanup provenance: this report records its original phase. `external-artifacts/` identifies historical scratch artifacts, not repository files; those raw captures/logs are no longer available locally. Historical hashes remain original run records. See [final verification](LIVE_QUIZ_FINAL_VERIFICATION.md) for current checks and portable-metadata integrity.
