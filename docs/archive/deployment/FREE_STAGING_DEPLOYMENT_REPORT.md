# ExamSpace — Deployment evidence và provenance

Checkpoint hiện hành **03/11/2026**: xem [runbook hiện hành](../../deployment/FREE_STAGING_RUNBOOK.md) và [báo cáo release cuối](../../audits/FINAL_RELEASE_READINESS_20261103.md). Candidate là working tree trên `ui/final-refinement-recovery`, base HEAD `51251acdb5f4eece85c3d44d2958ca98ba2efe0a`; **cloud candidate này NOT VERIFIED**. Không có commit/push/deploy trong lượt hiện tại.

Nội dung và JSON `free-staging-verification.json` bên dưới/đi kèm là evidence lịch sử 10/2026, không cập nhật số PASS bằng kết quả local mới và không chứng nhận release hiện tại. Các kết luận 23 E2E/hai nhóm và workflow cũ chỉ áp dụng checkpoint đó; entrypoint hiện tại có bốn nhóm như runbook. Lịch sử giữ nguyên để bảo toàn provenance.

<details>
<summary>Browser isolation và hosted recovery 16/10/2026 (nguyên văn)</summary>

# ExamSpace — Browser test isolation PASS; chờ review

Cập nhật **16/10/2026**. Hosted Session Recovery và production implementation đã được user duyệt giữ nguyên. **Full E2E PASS tổng 23/23 qua hai nhóm server độc lập: 20/20 + 3/3.** Không phải một Playwright invocation 23 test. Không commit/push/deploy trong lượt này.

## A. Nguyên nhân 429 và cơ chế shared state

`authRoutes()` tạo một limiter dùng chung cho **POST login và register**, quota **30 request/15 phút**. Không truyền store hoặc keyGenerator tùy biến: dependency đang cài dùng **MemoryStore trong từng instance, khóa mặc định theo req.ip** (IPv6 có chuẩn hóa subnet), tính cả request thành công/thất bại. GET me/csrf và POST logout không dùng limiter này. Counter không nằm trong PostgreSQL, không theo account/session; tạo BrowserContext mới không cấp quota IP mới.

Config cũ chạy một worker, không fullyParallel, nhưng cả 23 test dùng một API process/IP. Ba session cases cần 6 login có mục đích: expiry/relogin/revoke 3 lần, network/revalidation 1, cross-tab 2. Trace failure ghi login trước còn quota 0 và lần relogin cuối bị 429; các assertion cross-tab recovery trước đó đã PASS. [Evidence 22/23 cũ](../../deployment/free-staging-evidence/session-recovery-full-suite-blocker.json) giữ nguyên.

Boundary test mới dùng app và limiter thật, CSRF thật, local test DB: 30 request luân phiên login/register nhận validation 400, request thứ 31 nhận 429; fresh app cùng IP/database vẫn nhận 400 trong khi app cũ tiếp tục 429. Như vậy counter độc lập theo instance được kiểm chứng, không chỉ giả định reset process là đủ. Không tạo account bằng các invalid payload này.

## B. Isolation tối thiểu và file thay đổi

- `package.json`: `test:e2e` chạy `playwright test && playwright test --config=playwright.session-recovery.config.ts`.
- `playwright.config.ts`: nhóm core loại đúng file session-recovery, lưu output `test-results/core`; mọi test khác vẫn được discovery tự động.
- `playwright.session-recovery.config.ts` mới: kế thừa cùng config/DB safety guards, chỉ chọn session-recovery, output `test-results/session-recovery`.
- `apps/api/test/auth-rate-limit.integration.test.ts` mới: kiểm tra quota 30/31, login/register dùng chung store và instance độc lập.
- Hai regression files từ lượt trước giữ nguyên: `apps/web/src/features/session-lifecycle.test.tsx` (+3 unit case), `tests/e2e/session-recovery.spec.ts` (+3 browser case).

Mỗi invocation Playwright tự sở hữu API/Vite/local Storage server mới, `reuseExistingServer=false`, worker=1. Invocation đầu phải thành công và dọn server trước khi nhóm sau khởi động. Database test loopback có thể giữ fixtures giữa hai nhóm vì counter không ở DB; không reset data giữa nhóm. Không đổi production source, quota, store, session policy hoặc protocol. Không thêm retries, sleep chờ quota, mock bypass hay bỏ assertion.

Entry point đầy đủ cho local/CI là **`npm run test:e2e`**. `npx playwright test` riêng chỉ chạy core; config recovery riêng chạy 3 regression. Workflow CI hiện tại đã gọi npm entrypoint, không cần sửa workflow. Artifact upload `test-results/` chứa cả hai nhóm. Fresh clone vẫn dùng dependency lock, migrate/seed local test DB và cài Chromium như CI hiện có; không phụ thuộc `/tmp` path hoặc Supabase trong cấu hình commit.

## C. Kết quả và provenance

| Gate | Kết quả |
| --- | --- |
| Full npm E2E entrypoint | **PASS, exit 0**; core **20/20**, recovery **3/3**, hai Playwright invocations liên tiếp, không retries/skips |
| Recovery trong server mới | **3/3 PASS**, gồm lần relogin từng nhận 429 |
| Rate-limit integration mới | **1/1 PASS**, boundary thật 30/31 và store isolation |
| Unit/frontend | Reuse **101/101 PASS**, không thay unit/source kể từ lượt đã kiểm tra |
| Integration liên quan trước đó | Reuse **16/16 PASS**; test rate-limit mới ở lượt riêng, không gán thành một run 17 test |
| Lint/typecheck | **PASS mới** trong scratch candidate sau thay config/test |
| Build | Reuse **PASS**, production/dependencies không đổi |
| Hosted Session Recovery | **APPROVED/PASS**, không chạy lại và không redeploy chỉ vì test config |

[Evidence/hash/case results](../../deployment/free-staging-evidence/browser-isolation-final.json). Raw console logs chỉ `/tmp`; sanitized evidence ghi đủ 23 case và từng nhóm. Các failure lịch sử 22/23, network harness, sandbox được giữ, không đổi thành PASS hồi tố. Workspace-wide lint còn các harness untracked cũ ngoài candidate; lint candidate sạch được kiểm tra riêng, không disable rule.

## D. Hosted và giới hạn giữ nguyên

Staging https://examspace-staging.onrender.com vẫn SHA `bf3c1f5e4133d00d6e463516b5af571d86e3852d`, deploy `dep-db8e5ig473hc739etsbg`; Render Free, auto-deploy OFF theo checkpoint đã xác minh. Không tạo resource, thay DNS, gọi CI thử nghiệm hoặc mutate Supabase trong lượt isolation.

False blocker cũ đã xác định: external-client 401 không phải tín hiệu browser; browser request thực tế gặp `ERR_CONNECTION_CLOSED`. Giữ identity khi lỗi mạng là đúng. Browser nhận 401 thật thì auth/cache invalidated và dashboard biến mất. Visibility revalidation, cross-tab logout/WSS, CSRF/RBAC, stale-response guard và hosted Exam/Quiz smoke PASS. [Hosted auth](../../deployment/free-staging-evidence/session-recovery-hosted.json), [network/visibility/WSS](../../deployment/free-staging-evidence/session-recovery-signals.json), [request origins](../../deployment/free-staging-evidence/session-recovery-exact-sequence.json).

Không cam kết revoke detection trong 45 giây khi browser chưa nhận response/notification; không kết luận nguyên nhân transport close thuộc provider nào. Hosted smoke dùng fixture đã hoàn tất, không chạy mới toàn bộ upload/Exam/Quiz mutation lifecycle hoặc load/cloud-restart test. Khi thêm nhiều auth tests sau này, từng nhóm vẫn phải tôn trọng quota thật; không tự tăng limit. Không tuyên bố production-ready.

## E. Review gate

Scope commit đề xuất: **6 file test/config** liệt kê ở mục B. Reports/evidence/harness ad hoc giữ local để review; không đưa raw logs, cookies/tokens/secrets hoặc 85 artifacts lịch sử vào commit. [Final workspace audit](../../deployment/free-staging-evidence/browser-isolation-workspace.json) ghi exact status/counts/hash.

**85/85 historical artifacts nguyên vẹn, không production source changes, không reset/discard/git clean. Không còn blocker trong phạm vi được duyệt. Dừng để user review; không tự commit/push/deploy. Không cần redeploy chỉ vì thay test/config.**

---

## Lịch sử trước remediation — giữ nguyên kết luận tại thời điểm đó, không phải trạng thái hiện tại

# ExamSpace — Đã redeploy, còn blocker hosted session recovery

Cập nhật **15/10/2026**. Public staging: **https://examspace-staging.onrender.com**. Deployment LIVE đúng HEAD mới; **chưa đạt toàn bộ hosted auth PASS**. Dừng tại blocker đã tái hiện, không sửa production hoặc tạo thêm commit/push/deploy.

| Mục | Kết quả |
| --- | --- |
| Test-only commit / actual deployed SHA | `bf3c1f5e4133d00d6e463516b5af571d86e3852d` |
| Commit message / scope | `test(e2e): scope pagination request assertions`; chỉ `tests/e2e/data-integrity.spec.ts`, 13 thêm / 9 xóa |
| Auth fix được bao gồm | `11e897fe6116002b0068612ed45634071d6f792a` |
| Local full E2E | **20/20 PASS**, recovered completed full run, scratch workspace + loopback PostgreSQL; không skip/retry bổ sung |
| GitHub CI | [38750653237](https://github.com/LAMB-IS-ME/BTL-CNW-DVTT/actions/runs/38750653237) **SUCCESS**; 98 unit, 62 integration, **20/20 E2E**; lint/typecheck/build/deployment smoke PASS, audit 0 vulnerabilities |
| Render deployment | `dep-db8e5ig473hc739etsbg`, **LIVE**, finished 2026-10-15 14:29:00 UTC; đúng một trigger |
| Service | `[redacted]`, Free, auto-deploy OFF, không tạo service mới |
| Startup / health | `server_started`, port 10000; HTTP `/api/health` 200/status ok; platform check vẫn TCP mặc định |
| Runtime logs | 0 error/warn trong 14:27:22–14:38:00 UTC |
| Supabase | `zhdxuqcbvhcnujcdbkgw`, ACTIVE_HEALTHY; không SQL/migration/seed/reset trong lượt này |
| Historical artifacts | 85/85 hash nguyên vẹn; không stage/commit artifacts |
| Main | Không đổi: `2cda149838b20cb0c11c89ddf2203fb474a70f64`; không merge/force push/PR |

## Hosted results trên SHA mới

**PASS:** đăng nhập ngay cho Admin/Teacher/Student, một login mutation mỗi lần, identity đúng và reload; cookie Secure/HttpOnly/Lax; initial check chậm 3 giây chặn early input rồi login thành công; initial check lỗi mạng; invalid cookie; stale Teacher response không ghi đè Student mới; CSRF/RBAC; anonymous/wrong-origin WSS bị từ chối; authenticated WSS; UI logout thu hồi HTTP/WSS và relogin; cookie expiry hiện đúng UI và cho phép relogin. Không page error/static asset failure trong lượt tổng hợp.

**Smoke PASS:** Student xem kết quả Exam đã chấm, Teacher monitor; Teacher/Student khôi phục và reconnect room Live Quiz đã FINISHED qua WSS; protected Storage download; PDF và Excel hợp lệ. Không chạy lại vòng đời tạo/nộp/chấm/quiz answer hoặc Storage upload trên SHA mới nhằm giữ nguyên nội dung fixture. Full lifecycle/upload/responsive evidence của commit trước được ghi rõ ở phần lịch sử bên dưới, không gán thành kết quả fresh của SHA mới.

**FAIL / blocker:** chuỗi cookie expiry → relogin → server-side logout/revocation. Server `/auth/me` đã trả 401 nhưng tab visible/focused vẫn hiển thị dashboard Student, không hiện “Phiên đăng nhập đã kết thúc” sau 45 giây. Đã tái hiện trong script riêng cùng chuỗi; standalone login → revocation PASS. Chưa xác định root cause hoặc chứng minh lỗi được đưa vào bởi auth fix này. Không tăng timeout/retries, không bỏ assertion. Đây là failure UI/session recovery; kiểm tra server vẫn từ chối phiên bị thu hồi.

[Hosted tổng hợp](../../deployment/free-staging-evidence/auth-fix-hosted.json), [lượt đầu giữ nguyên](../../deployment/free-staging-evidence/auth-fix-hosted-first-run.json), [standalone revocation PASS](../../deployment/free-staging-evidence/auth-fix-revocation-diagnostic.json), [chuỗi tái hiện FAIL](../../deployment/free-staging-evidence/auth-fix-revocation-sequence.json), [blocker](../../deployment/free-staging-evidence/auth-fix-hosted-blocker.json). Harness diagnostics lưu metadata HTTP/UI và screenshot, không cookie/token/password/HAR/trace.

## Phạm vi và trạng thái bàn giao

Đã hoàn thành đúng một test-only commit/push, review staged diff và scoped secret scan. [Precommit](../../deployment/free-staging-evidence/pagination-fix-precommit.json), [local E2E](../../deployment/free-staging-evidence/pagination-fix-local.json), [CI](../../deployment/free-staging-evidence/pagination-fix-ci.json), [deploy](../../deployment/free-staging-evidence/auth-fix-render-live.json), [workspace audit](../../deployment/free-staging-evidence/auth-fix-final-workspace.json).

Không sửa nội dung dữ liệu demo, không tạo fixture mới. Login/logout cập nhật session/lastLoginAt; reconnect quiz có metadata presence thông thường. Không thay plan, payment, DNS, môi trường hoặc project FocusLab. Render Free được đọc lại; Supabase Free giữ nguyên cấu hình. Không thao tác tài nguyên trả phí; billing/quota đầy đủ không được MCP cung cấp nên không chứng nhận hóa đơn.

Workspace còn ba tracked report/runbook/JSON modified cùng evidence/harness untracked được giữ local; 0 staged, source test đã commit. Số lượng chính xác trong workspace audit. Không reset/discard/git clean. **Dừng để user review blocker; mọi product fix/commit/push/deploy tiếp theo cần phạm vi mới được duyệt.**

---

## Báo cáo lượt deployment trước — evidence lịch sử, không phải kết quả auth fix

# ExamSpace — Free Staging Deployment

Ngày cập nhật: **15/10/2026**, Asia/Bangkok. Public URL thật: **https://examspace-staging.onrender.com**.

**Đã deploy Render Free; hosted acceptance PARTIAL PASS, còn lỗi đăng nhập sớm.** Bản sửa tối thiểu đã kiểm thử local, chưa commit/push/deploy. Dừng để user review quyền push bổ sung theo yêu cầu resume; không tuyên bố toàn bộ hosted PASS hoặc production-ready.

## A. GitHub

- Repo `LAMB-IS-ME/BTL-CNW-DVTT`, branch `deploy/examspace-free-staging`.
- Local/remote/deployed commit: `39802152a5ec1337f790c34732707556b69247db`, message `feat(deploy): prepare free single-origin staging`.
- Đúng một deployment candidate commit và first push đã được duyệt; không thêm commit/push trong lượt resume.
- [GitHub Actions run 38590756627](https://github.com/LAMB-IS-ME/BTL-CNW-DVTT/actions/runs/38590756627): **SUCCESS**, đúng SHA. CI dùng PostgreSQL service cô lập `localhost:5432/exam_test`; không mutation Supabase thật.
- Remote main vẫn `2cda149838b20cb0c11c89ddf2203fb474a70f64`. Không merge, force push hoặc mở PR.

## B. Render

| Thuộc tính | Giá trị đã đọc từ provider |
| --- | --- |
| Workspace | `tea-db7m2r3ncjis73eq90tg` — Anh Minh's workspace |
| Service | `examspace-staging` / `[redacted]` |
| URL | https://examspace-staging.onrender.com |
| Runtime / region / instances | Node / Singapore / 1 |
| Runtime plan | **free** |
| Auto-deploy / previews | **off / off** |
| Deploy | `dep-db83c4jncjis73efbd10`, **live**, finished 02:11:59 UTC |
| Platform health check | TCP mặc định; MCP create không hỗ trợ field HTTP healthCheckPath |
| Probe HTTP thật | `/api/health` → 200, JSON status ok |

[Evidence cấu hình/deploy](../../deployment/free-staging-evidence/render-live.json). `buildPlan: starter` là lớp build mặc định provider, khác với runtime `plan: free`; không chọn paid compute hoặc premium build. User đã xác nhận không gắn phương thức thanh toán; MCP không cho đọc toàn bộ billing/quota account.

Một Node service phục vụ SPA + API + Socket.IO. Build: `npm ci --include=dev && npm run db:generate && npm run build`. Start: `CLIENT_ORIGIN="$RENDER_EXTERNAL_URL" npm run start -w @exam/api`. Không migrate/seed lúc startup. Log xác nhận `server_started`, port 10000. Truy vấn log app mức error/warn trong khoảng 02:10–02:27 UTC không trả dòng nào; không lưu raw logs mới.

## C. Supabase và dữ liệu

Project ExamSpace `zhdxuqcbvhcnujcdbkgw`, **ACTIVE_HEALTHY**, Free, Sydney; không restore lại. Hosted login/CRUD/session/Storage chứng minh kết nối hoạt động. Database env dùng session pooler, `sslmode=verify-full`, public CA Supabase, không disable kiểm chứng TLS. Kiểm chứng TLS client→pooler trước deploy là evidence riêng, không giả nhận đã đọc TLS socket bên trong Render.

Bucket `question-assets` private. Signed download, upload qua API, render ảnh PNG hợp lệ và reload PASS. Session lưu PostgreSQL: reload, hết hạn đúng session fixture, đăng nhập lại và logout PASS. Hosted process restart chưa chạy.

Fixture namespace **`STAGING-20261015021944`**: 2 tài khoản mới, 1 lớp, 1 bank, 3 câu hỏi, 2 đề, 1 Quiz/room, 2 ảnh. Không cleanup/reset hoặc ghi đè dữ liệu demo. Thao tác hết hạn session chỉ nhắm đúng SID và user ID fixture trong bộ nhớ.

Read-only đối chiếu cuối: 17 users, 3 classes, 30 questions, 5 exams, 3 Storage objects; 2 Prisma migrations vẫn completed. Hai attempt fixture GRADED, điểm 4.50 và 2.00; Quiz FINISHED. [Evidence DB](../../deployment/free-staging-evidence/hosted-database-summary.json). Hardening `_prisma_migrations` từ lượt chuẩn bị vẫn giữ nguyên; không thêm business migration.

## D. Security

Fresh hosted PASS: TLS 1.3 với kiểm chứng certificate thật, HTTP→HTTPS; WSS cùng origin; cookie Secure/HttpOnly/SameSite=Lax; CSRF/CORS; Student bị chặn Admin/Teacher; anonymous/wrong-origin Socket.IO bị từ chối; asset chưa được cấp quyền bị chặn, public Storage URL bị từ chối, ảnh đang được tham chiếu không xóa được. Logout thu hồi cả HTTP session và socket đã xác thực.

Secrets chỉ truyền qua env provider/bộ nhớ. Không lưu password, connection string, session cookie/token, signed URL, HAR/trace/storageState hoặc DB dumps vào evidence. Không thay FocusLab, DNS hoặc phương thức thanh toán.

## E. Hosted tests và lỗi còn lại

| Nhóm | Kết quả thật |
| --- | --- |
| HTTPS, startup, health, SPA deep links, static/source denial | **Fresh hosted PASS** |
| Admin login, list/create, role, lock/unlock | **PASS sau khi initial auth probe hoàn tất** |
| Teacher class, bank, questions, exam/publish, grading | **Fresh hosted PASS**; setup fixtures dùng authenticated API, monitor/grading dùng UI |
| Student discovery, attempt, autosave/reload, server deadline, submit/results | **Fresh hosted PASS**; 4.5/5 và 90% |
| Live Quiz lobby/start/answer/leaderboard/finish/reconnect | **Fresh hosted PASS**, 1 Teacher + 1 Student, WSS thật |
| Storage upload/download, authorization, referenced asset protection | **Fresh hosted PASS** |
| Ảnh hợp lệ hiển thị/giải mã trước và sau reload | **Fresh hosted PASS**, PNG 160×80 riêng |
| PDF/Excel | **Fresh hosted PASS**, HTTP/MIME/signature/nonempty bytes; không audit từng ô/nội dung PDF |
| Responsive 1440/1024/820/390/320 | **PASS**, 6 views × 5 widths, không tràn ngang; screenshots đã lưu |
| Session reload, expiry/recovery, re-login, logout/WSS revoke | **Fresh hosted PASS** |
| Bấm login trước khi initial `/auth/me` hoàn tất | **Fresh hosted FAIL** — lỗi race còn trên deployed commit |
| Cold-start duration, cloud restart/rolling overlap, multi-student load | **SKIPPED**, không suy diễn từ local tests |

[Hosted results](../../deployment/free-staging-evidence/hosted-verification.json), [first-run FAIL](../../deployment/free-staging-evidence/hosted-first-run.json), [valid PNG results](../../deployment/free-staging-evidence/hosted-image-verification.json), [screenshots](../../screenshots/free-staging/hosted/).

Các lỗi harness được giữ evidence: mật khẩu fixture ban đầu không đạt minLength 10 nên API trả 400 (chưa tạo record); assertion timer mặc định 5 giây quá ngắn nên resume cùng fixture với timeout 45 giây; PNG mẫu đầu tiên sai CRC, assertion naturalWidth không đủ chứng minh decode. Đã dùng PNG do browser tạo, kiểm tra `decode()` và reload trên một đề fixture mới. Không xóa/ghi đè ảnh hoặc snapshot trước đó. Không tính những lần lỗi harness là PASS rồi bỏ dấu vết.

### Bản sửa login cần review

Nguyên nhân: `/auth/me` ban đầu trả 401 trong lúc form đang lấy CSRF; generation của session tăng, khiến login bị hủy và báo hết phiên dù chưa đăng nhập. Có thể gặp khi tương tác nhanh trên mạng có độ trễ.

Sửa local: `AuthEntry` đợi initial identity probe kết thúc trước khi hiện Login/Register. Không đổi API, session fencing, CSRF, quyền hoặc database. Phạm vi **3 files**:

- `apps/web/src/App.tsx`: route Login/Register dùng AuthEntry.
- `apps/web/src/features/auth.tsx`: wrapper loading gate 5 dòng.
- `apps/web/src/features/auth-entry.test.tsx`: 2 regression tests với response `/auth/me` bị giữ chậm, rồi trả anonymous và đăng nhập.

**Local PASS**: 16 tests liên quan / 3 files; lint, typecheck, build. Negative control bỏ gate làm cả 2 regression tests FAIL, sau đó khôi phục chính xác candidate. [Evidence fix](../../deployment/free-staging-evidence/login-race-fix.json). Có một lỗi typecheck ban đầu trong test (Testing Library không hỗ trợ option `exact`), đã sửa trước kết quả PASS cuối. Build vẫn có cảnh báo chunk >500 kB đã có từ trước. Chưa deploy bản sửa này.

Evidence local chuẩn bị trước first push: 94 unit, 62 integration, 3 browser và 8 nhóm TLS/restart assertions — **local/reused**, không phải hosted. Xem [verification summary](../../deployment/free-staging-evidence/verification-summary.json).

## F. Giới hạn Free Tier

[Render Free](https://render.com/docs/free): idle spin-down, cold start, một instance, filesystem tạm; 750 instance-hours/workspace/tháng và quota bandwidth/build. Không keep-alive cron. [Supabase Free](https://supabase.com/pricing): 500 MB DB, 1 GB Storage, 5 GB egress + 5 GB cached egress, có thể pause sau tuần không hoạt động. Không đọc được usage còn lại qua MCP hiện tại. Không nâng gói hoặc tạo resource trả phí.

Socket cùng origin dùng WSS trực tiếp, không polling fallback. Health HTTP chỉ liveness; provider hiện dùng TCP health. Không cam kết uptime 24/7, tải lớn hoặc rolling deploy không gián đoạn.

## G. Git và evidence

HEAD vẫn `39802152`; không commit/push bổ sung. Working tree có bản sửa 2 source files, regression test mới, báo cáo/JSON/runbook và hosted evidence/scripts/screenshots. Không stage. 85 historical artifacts được đối chiếu SHA-256 và giữ nguyên; raw logs cũ vẫn local và không đưa vào commit. Danh sách/count chính xác ở [final workspace audit](../../deployment/free-staging-evidence/resume-final-workspace.json).

## H. Điểm dừng / bước cần duyệt

URL đang live để user review. Cần **một approval cho commit/push bản sửa login 3 files**, sau đó manual redeploy service Free hiện có và chạy lại hosted regression đăng nhập cùng smoke chính. Commit đề xuất: `fix(auth): wait for initial session check before login`.

Gate này đến trực tiếp từ yêu cầu resume của user: “chuẩn bị minimal fix, kiểm thử và xin review trước khi push thêm”. Không phải thiếu quyền kỹ thuật hoặc yêu cầu mua gói. Không tự mở phase mới; chưa thực hiện commit/push/redeploy bổ sung.

</details>
