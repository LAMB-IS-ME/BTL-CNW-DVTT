# ExamSpace — Prioritized findings

Audit 12/10/2026; HEAD `04f99e305c89f17e6ee98ed1ea78124c260d601d`. **AUDIT COMPLETE, RELEASE NOT READY.** Không remediation. P0 Critical / P1 High / P2 Medium / P3 Low là mức ưu tiên của dự án; không thay advisory severity của upstream.

**Tổng: 9 findings — P0: 0, P1: 1, P2: 7, P3: 1.** Năm confirmed product bugs; một test harness bug; một nhóm security advisories; một documentation gap; một architectural limitation. External deployment chưa kiểm thử là gate riêng, không tính thành bug thứ mười.

| ID | Priority | Type | Release category |
|---|---|---|---|
| ADMIN-001 | P1 | CONFIRMED PRODUCT BUG | RELEASE BLOCKER |
| SEC-001 | P2 | SECURITY ADVISORY | RELEASE BLOCKER: current CI policy |
| QA-001 | P2 | TEST HARNESS BUG | RELEASE BLOCKER: tracked E2E |
| SYS-001 | P2 | CONFIRMED PRODUCT BUG | SHOULD FIX BEFORE HANDOFF |
| SYS-002 | P2 | CONFIRMED PRODUCT BUG | SHOULD FIX BEFORE HANDOFF |
| ASSET-001 | P2 | CONFIRMED PRODUCT BUG | SHOULD FIX BEFORE HANDOFF |
| AUTH-001 | P2 | CONFIRMED PRODUCT BUG | SHOULD FIX BEFORE HANDOFF |
| DOC-001 | P2 | DOCUMENTATION GAP | SHOULD FIX BEFORE HANDOFF |
| REL-001 | P3 | ARCHITECTURAL LIMITATION | ACCEPTANCE DECISION REQUIRED |

## ADMIN-001 — Lock/unlock và đổi role không thực hiện được

- **Module / roles / endpoints:** Admin Users; Admin quản trị Teacher/Student/Admin khác. `PATCH /api/v1/admin/users/:id/status`, `PATCH /api/v1/admin/users/:id/role`.
- **Reproduction:** login Admin hợp lệ; tạo Student ACTIVE không có dependencies; PATCH status LOCKED; PATCH role TEACHER. Đọc lại tài khoản. Browser: tìm Student → Khóa tài khoản → Xác nhận.
- **Expected:** thao tác hợp lệ thành công, trạng thái/role được lưu; lock làm API/socket session hiện tại mất quyền. Self-action và đổi role có dữ liệu trả 409 theo contract.
- **Actual:** hai endpoint trả 500 `INTERNAL_ERROR`, dữ liệu vẫn STUDENT/ACTIVE. Browser hiện lỗi hệ thống trong dialog. Unlock đi qua cùng SQL lỗi, nên cũng bị ảnh hưởng theo source; evidence runtime trực tiếp đã lưu cho lock và role. Self-action được kiểm tra trước SQL nên vẫn trả 409; điều đó không chứng minh non-self mutation hoạt động.
- **Evidence:** [API + Prisma probe](evidence/admin-probe.json), [browser probe](evidence/admin-browser-probe.json), [desktop](../screenshots/system-audit/admin-lock-error-1440.png), [mobile](../screenshots/system-audit/admin-lock-error-320.png). `apps/api/src/modules/admin/routes.ts:51,73`.
- **Root cause:** `tx.$queryRaw` deserialize kết quả `SELECT pg_advisory_xact_lock(904201)` kiểu PostgreSQL `void`; Prisma P2010 / UnsupportedNativeDataType. Failure xảy ra trước actor recheck/update. Cả hai operations cùng root cause. Quét source chỉ có hai chỗ lỗi này; `question-banks/lock.ts:8` đã cast `::text`, không có cùng failure.
- **Suggested remediation:** thay cách nhận kết quả advisory lock bằng kiểu Prisma hỗ trợ, ví dụ cast `::text` như catalog lock; giữ lock key, transaction, recheck và business guards. Chỉ là proposal, chưa sửa SQL/source/schema.
- **Scope / complexity / regression impact:** nhỏ, backend Admin; rủi ro concurrency/authorization nếu vô tình bỏ lock hoặc actor recheck. Không cần UI redesign hay schema change.
- **Regression tests:** non-self lock/unlock thành công và DB state; account locked không dùng được session/API/socket cũ; role change hợp lệ; self 409; dependency 409; forbidden roles; actor bị demote/lock trong cạnh tranh không được tiếp tục mutation. Existing integration tên create/search/lock không thực sự gọi status mutation; cần bổ sung assertion nghiệp vụ.
- **Deployment impact:** chặn chức năng Admin core và quản trị quyền truy cập. Không được gọi all-role workflow PASS hay release-ready trước khi sửa và kiểm chứng.

## SEC-001 — Ba advisories ảnh hưởng bảy dependency entries

- **Module / route / roles:** dependency tree, CI/build, renderer toán; không có endpoint khai thác từ xa đã chứng minh.
- **Reproduction:** `npm audit --json` trên lockfile baseline (đã được user cho phép metadata transfer); đối chiếu `npm ls` và `.github/workflows/ci.yml`.
- **Expected / actual:** policy CI `npm audit --audit-level=low` phải đạt; hiện exit 1, 2 critical +1 high +4 low entries, từ 3 advisories. Severity P2 ở đây là ưu tiên xử lý applicability/gate, không hạ nhãn upstream.
- **Evidence:** [npm audit](evidence/npm-audit.json), [dependency paths](evidence/dependency-paths.txt), [analysis](evidence/advisory-analysis.json).

| Advisory | Version / fixed | Dependency path & classification | Prerequisite / actual exposure |
|---|---|---|---|
| [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv), CVE-2026-102422, upstream critical | shell-quote 1.9.0; affected ≥1.8.4 <1.11.0; fixed 1.11.0 | direct dev concurrently 10.0.5 → transitive shell-quote | `quote()` nhận token chứa line terminator sau comment token, rồi dùng trong shell. Dev script của repo là command tĩnh. Chưa tìm thấy untrusted input đi vào đường này ở runtime API. Có trong môi trường cài dev/build. |
| [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), CVE-2026-93749, high | source-map-js 1.2.1; affected ≥1.0.0 <1.2.2; fixed 1.2.2 | transitive tsup→postcss; @tailwindcss/vite→node; jsdom→css-tree | DoS event loop khi tiêu thụ indexed source map có section offsets độc hại. Build/test path; không tìm thấy API nhận source maps từ người dùng. |
| [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7), CVE-2026-103923, low | nested KaTeX 0.16.47; affected ≥0.11.0 <0.18.2; fixed 0.18.2; root 0.18.9 không bị advisory này | direct rehype-katex 7.0.1→katex; direct remark-math 6.0.0→micromark-extension-math 3.1.0→katex; runtime frontend Markdown/math | Cần prototype pollution có sẵn để bypass trust restrictions. Renderer là đường runtime thực, nhưng chưa chứng minh pollution chain/exploit trong ExamSpace. |

- **Root cause:** dependency resolution còn vulnerable transitive versions; root KaTeX mới không thay nested versions.
- **Suggested remediation:** trong phase được duyệt, chọn upstream-compatible releases/overrides có kiểm tra, ưu tiên loại version bị advisory; xem lại toàn cây bằng `npm ls` và audit. Tool gợi ý rehype-katex 1.2.0 / remark-math 3.0.1 là major downgrade, không áp dụng mù quáng. Không chạy `npm audit fix`, không đổi package-lock trong audit.
- **Scope / complexity / regression impact:** vừa; tooling + Markdown renderer. Regression lint/typecheck/build, CI audit, math inline/block/rich question rendering, existing exams/Quiz and export smoke. Không coi bỏ dev dependencies khỏi audit là fix runtime renderer.
- **Deployment impact:** gate CI đã xác nhận FAIL. Critical advisory không đồng nghĩa Critical exploitable ExamSpace vulnerability. Chưa có automatic approval blocker còn tồn tại: lần audit sau user approval đã hoàn tất.

## QA-001 — Core E2E locator Nhận xét bị ambiguous

- **Module / roles / location:** Teacher grading → Student result; `tests/e2e/core.spec.ts:124`.
- **Reproduction:** chạy tracked browser suite; ở grading dùng `tp.getByLabel("Nhận xét").fill(...)`.
- **Expected / actual:** điền feedback textarea; strict mode báo hai matches: textarea Nhận xét và dialog có accessible label “Điểm và nhận xét chưa lưu”. Suite cuối 13 PASS /1 FAIL.
- **Evidence:** [test summary](evidence/test-summary.json); diagnostic trích từ log chuẩn trong summary. Audit copy dùng `getByRole('textbox', {name:'Nhận xét', exact:true})` hoàn thành core workflow 1 PASS; assertion score cũ cũng được tách theo UI score/feedback hiện tại. Raw scratch log riêng mất, kết quả cuối lưu trong transcript; không gọi tracked suite green.
- **Root cause:** locator substring rộng và assertion text cũ sau UI rollout; chưa có product grading failure tại bước này.
- **Suggested remediation / scope / complexity:** nhỏ, chỉ tracked test selector và assertion bám accessible UI hiện tại; giữ nội dung nghiệp vụ và cả score/feedback. Không bỏ test/weaken coverage.
- **Regression tests / impact:** chạy lại nguyên tracked suite sau patch; xác minh autosave/reload/monitor/submit/grading/released results. Không đổi runtime.
- **Deployment impact:** current CI E2E gate FAIL; blocker của verification, không phải product bug.

## SYS-001 — Management lists/picker bỏ sót bản ghi hợp lệ

- **Module / roles / routes:** Teacher `/teacher/classes`, `/teacher/exams`, `/teacher/exams/new` bank selector; Admin `/admin/classes`. API tương ứng có page/pageSize nhưng các UI này chỉ gọi trang đầu.
- **Reproduction:** tạo Teacher với 22 classes,22 exams,102 active banks. GET trang 1/2; mở Classes, Exams, Exam Builder chọn ngân hàng; Admin mở classes.
- **Expected:** tất cả bản ghi hợp lệ có đường tìm/chọn qua pagination/search/load-more. **Actual:** class/exam API trả 20+2; UI hiển thị20, lớp/bài cũ không có link. Bank API100+2; dropdown có100 ngân hàng+placeholder, hai ngân hàng hợp lệ không được chọn. Admin class API có trang2 nhưng UI chỉ20 cards và không có pager.
- **Evidence:** [pagination-probe.json](evidence/pagination-probe.json), [audit reproduction](tooling/remainder.spec.ts.txt). Final retry 1 PASS xác nhận các observation; không phải product PASS. Source `features/catalog.tsx:29`, `features/exams.tsx:40,223`, `features/admin.tsx:172`.
- **Root cause:** client không lưu page/search/total hay render điều hướng cho những lists này. API cap20 default/max100 có chủ đích; bug ở UI discovery, không phải DB mất dữ liệu. Current class picker cũng cap100 và Quiz dùng cùng bank picker pattern; giới hạn >100 class và Quiz picker được xác định qua source, chưa làm boundary browser riêng cho chúng.
- **Suggested remediation / scope / complexity:** vừa, chung phase pagination cross-module; query keys bao gồm parameters; searchable paged selectors giữ selected IDs ngoài trang hiện tại. Chỉ sửa contract nếu thật sự cần totals.
- **Regression tests / impact:** 21+/101+ bản ghi, search/clear/filter đổi trang, archive/restore, không mất selection khi đổi trang; Teacher ownership và Admin role; grading/monitor/results deep links vẫn đúng.
- **Deployment impact:** nên sửa trước handoff/dataset lớn; demo nhỏ có thể che lỗi. Student exam/results, Teacher grading/results, Question Bank management và Quiz library đã có paging; không gán lỗi cho mọi module.

## SYS-002 — Query key lớp dùng chung cho page size khác nhau

- **Module / roles / routes:** Teacher Classes → Exam Builder.
- **Reproduction:** với22 lớp, mở `/teacher/classes` rồi đi bằng SPA qua Bài thi → Tạo bài thi → bước02 trong staleTime10s; đếm checkbox; reload Builder rồi đếm lại.
- **Expected / actual:** cùng22 lớp hợp lệ; trước reload chỉ20, sau reload22.
- **Evidence:** [pagination-probe.json](evidence/pagination-probe.json) `cache.afterSpaNavigation=20`, `afterReload=22`; `catalog.tsx` key `[path]` với path classes; `exams.tsx:216` key `['classes']`, query URL `pageSize=100`.
- **Root cause:** cache key không phản ánh parameters/consumer shape; fresh20-row response được dùng cho picker100-row query.
- **Suggested remediation / scope / complexity:** nhỏ, tách key/chuẩn hóa query factory và invalidate đúng prefix, gộp phase SYS-001. Không chữa bằng reload trang hoặc giảm staleTime toàn app.
- **Regression tests / impact:** Classes→Builder và chiều ngược, create/archive class, cache invalidation, refocus/reconnect; giữ assigned IDs khi nguồn chưa tải đủ.
- **Deployment impact:** có thể giao thiếu lớp do lựa chọn biến mất tạm thời; nên sửa trước handoff, không cần cloud để tái hiện.

## ASSET-001 — Xóa ảnh đang được đề published tham chiếu trước first attempt

- **Module / roles / endpoint:** Teacher Question Bank image lifecycle → Student Exam; `DELETE /api/v1/teacher/questions/:questionId/assets/:assetId`.
- **Reproduction:** upload PNG; gắn `asset:<id>` vào prompt; dùng câu hỏi trong đề, gán lớp, publish; khi chưa có attempt/room snapshot, DELETE asset; Student Start Exam và GET asset.
- **Expected:** không cho xóa resource vẫn được nội dung sử dụng, hoặc xử lý reference nhất quán trước khi xóa. **Actual:** DELETE204, Start thành công, snapshot vẫn chứa asset ID đã xóa, GET asset404.
- **Evidence:** [asset-probe.json](evidence/asset-probe.json), audit tooling. API/Prisma/PostgreSQL thật, Storage là local boundary double có upload/sign/delete; không chứng minh hosted bucket behavior. Lần audit cũ fixture thiếu DELETE trả502 là harness limitation; kết luận mới dựa lần có DELETE thành công.
- **Root cause:** `modules/storage/routes.ts:149–174` chỉ guard AttemptQuestion/LiveRoomQuestion snapshots; chưa guard current question references/published-use trước snapshot. Snapshot ở Start là contract hợp lệ, nhưng copy reference không còn tồn tại tạo câu hỏi hỏng.
- **Suggested remediation / scope / complexity:** vừa, guard live content references và race giữa delete/start/edit/publish; bảo toàn lịch sử, xem orphan cleanup riêng; thêm image unavailable UI hữu ích. Không đổi snapshot timing hay xóa object tự động trong audit.
- **Regression tests / impact:** delete ảnh thực sự không dùng; prompt/options/explanation references; published fixed/random sources; existing attempt/room; concurrent delete/start; authorization; provider failure không làm mất metadata sai.
- **Deployment impact:** nội dung ảnh có thể thiếu khi làm bài; nên sửa trước handoff có ảnh. Điều kiện là owner chủ động gọi delete; chưa chứng minh Student có quyền xóa hay data exfiltration.

## AUTH-001 — SPA giữ trạng thái đăng nhập sau session hết hạn

- **Module / roles / routes:** shared AuthProvider/API wrapper; quan sát Teacher `/teacher/exams`.
- **Reproduction:** login Teacher, clear session cookies để mô phỏng session không còn hợp lệ, chuyển SPA tới protected query.
- **Expected:** hiển thị session-expired recovery/login rõ ràng, xóa identity/cache cũ phù hợp. **Actual:** API401 “Vui lòng đăng nhập.”; URL protected và header/Đăng xuất vẫn tồn tại, retry tiếp tục401; không tự chuyển login.
- **Evidence:** prior-turn completed browser observation và source `apps/web/src/lib/api.ts`, AuthProvider query `['me']`; [test summary](evidence/test-summary.json). Screenshot/raw log của observation cũ mất do scratch reset; không tuyên bố mới rerun ở lượt cuối.
- **Root cause:** API error401 không invalidate/reset auth toàn cục; Guard dùng cached me. Backend từ chối đúng, không phải authorization bypass hoặc chứng minh dữ liệu mới bị lộ.
- **Suggested remediation / scope / complexity:** vừa, central401 recovery giữ redirect đích phù hợp; không retry mutation ngầm; phối hợp protected query cache và draft/unsaved warning.
- **Regression tests / impact:** expiry trong idle/navigation/save/submit, role switch/logout, back button, preserved permitted draft, không redirect loop hay cross-user cache.
- **Deployment impact:** UX phục hồi đăng nhập kém, đáng xử lý trước demo session dài; security enforcement vẫn hoạt động.

## DOC-001 — Fresh clone thiếu spec nguồn và docs có drift

- **Module / roles / location:** handoff/docs, không runtime route. Local MASTER_SPEC và ASTRA_MASTER_PROMPT bị `.git/info/exclude` loại khỏi Git (dòng8 và7).
- **Reproduction:** đối chiếu `git ls-files`, `git check-ignore -v`, Markdown refs. README106 link MASTER_SPEC; SRS5 link ../MASTER_SPEC; IMPLEMENTATION_CHECKLIST3 và VERIFICATION3,5 cũng dựa các local sources.
- **Expected / actual:** clone có requirements provenance và setup hiện hành; clone thiếu cả hai spec, links chính broken; README test counts/audit0 cũ; docs gọi21 tables trong khi schema22 kể cảsession. VERIFICATION là historical 30/09, không nên sửa nó thành record current.
- **Evidence:** [local spec review](evidence/local-spec-review.json), [manifest](evidence/source-manifest.json), report §§15–16.
- **Secret/privacy review:** targeted patterns không phát hiện private keys/AWS/JWT/credential URLs; manual review environment/demo/logging sections không thấy real secret hay private user dataset. ENV examples để trống secret. Đây là bounded review, không phải full-history secret certification. ASTRA chứa hướng dẫn nội bộ cho agent, không cần công khai để chạy app; MASTER là design contract/unchecked DoD, không phải chứng cứ mọi tính năng đã PASS.
- **Root cause:** local-only exclusion và docs không đồng bộ sau rollout. MASTER còn phù hợp core scope nhưng cần annotate implementation/audit deviations, ví dụ Admin failure và gates, trước dùng làm acceptance record; không sửa lịch sử.
- **Suggested remediation / scope / complexity:** nhỏ–vừa; user duyệt publish bản requirements đã rà soát (có thể đưa MASTER vào tracked docs với provenance/design-status rõ), cập nhật links/fresh-clone guide và counts. ASTRA có thể giữ internal và bỏ dependency vào nó từ handoff, hoặc xuất bản bản sanitized nếu cần. Chưa đổi exclude, chưa stage/commit files.
- **Regression tests / impact:** clone sạch, links nội bộ tồn tại, setup theo README, no secrets, migrations/build; giữ historical approved reports nguyên vẹn, chỉ liên kết record audit mới.
- **Deployment impact:** không trực tiếp làm server fail nhưng cản reproducible handoff/BTL acceptance. MASTER §49 có yêu cầu thể hiện công nghệ trong báo cáo/slide/demo; official course rubric/template và video requirement vẫn UNCLEAR.

## REL-001 — Presence Quiz lưu trong DB có thể stale sau crash

- **Module / roles / routes:** Live Quiz Teacher participant list, Student reconnect, roomState/socket; `QuizParticipant.isConnected`.
- **Reproduction:** participant đã join, SIGKILL single local API trước clean disconnect, restart không reconnect Student. Đọc persisted participant.
- **Expected / actual:** indicator phản ánh kết nối thực hoặc unknown; DB vẫn true dù socket cũ không còn. Đây là persisted state được serialize ra UI, không chỉ CSS/visual artifact.
- **Evidence:** [restart.json](evidence/restart.json); `modules/live-quiz/service.ts:80,158,167`; join/upsert settrue, leave setfalse, crash không chạy disconnect handler.
- **Impact / recovery:** Teacher có thể hiểu nhầm Student đang online; reconnect/resync làm mới presence của participant đó, disconnect sạch sau đó setfalse. Student answer acceptance, scoring, deadline và finalization không dựa solely vào flag này; business-state recovery probe PASS. Không chứng minh mất đáp án hoặc điểm sai. Không infer cloud restart readiness.
- **Root cause / suggested remediation:** persisted flag chưa có startup reconciliation/lease expiry. Xem xét mark unknown/offline hoặc heartbeat expiry theo single-instance policy; không tự thêm Redis/multi-instance/Socket.IO protocol change.
- **Scope / complexity / regression:** vừa, reconnect/disconnect/crash, hai tabs một user, expired/finished room và startup timing; tránh đánh offline socket mới. Local business-state recovery phải giữ nguyên.
- **Deployment impact:** P3 operational visibility; user cần quyết định chấp nhận cho demo một instance hay sửa. Cloud WSS/restart và scale chưa tested, giữ gate staging riêng.

## Không phải confirmed bugs

Single-instance event bus/rate limit/presence, RAM-only unsaved queue, latest20 room history, membership-dependent history index, large bundles và memory exports là giới hạn cần chấp nhận/đo thêm. Không có load/soak/multi-instance evidence. Hosted TLS/DB pooling/Storage, browser cross-site cookies, WSS cloud reconnect, backup restore và staging/production URLs **NOT TESTED**. Không tự gán P0/P1 cho các unknown này.

Roadmap và staging acceptance nằm ở [system audit](EXAMSPACE_SYSTEM_AUDIT.md#20-prioritized-roadmap--chỉ-đề-xuất). Recommended next phase: **Admin P1 + release-gate remediation có kiểm chứng**, sau user review/approval. Không bắt đầu sửa trong phase này.
