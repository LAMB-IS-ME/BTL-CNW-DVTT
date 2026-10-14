> Cập nhật approval 14/10/2026: user đã duyệt đúng một commit và first push; raw logs chỉ giữ local, kết quả và fingerprint ở verification-summary.json. Các trạng thái chưa commit/deploy bên dưới là checkpoint trước thao tác, không phải kết quả sau triển khai.

# ExamSpace — Free Staging Deployment: checkpoint chờ duyệt Git

Ngày: **14/10/2026**, timezone Asia/Bangkok. **Chưa có website public; chưa tạo Render service.** Local deployment adaptation đã kiểm thử và sẵn sàng review. Snapshot trước commit được user duyệt. Approval đã nhận; đang thực hiện commit/push. Quy tắc ban đầu: không tự commit source chưa được review và không push lần đầu khi chưa được xác nhận. Không tuyên bố staging hoàn thành hoặc production-ready.

## A. Baseline

| Hạng mục | Thực tế |
| --- | --- |
| Repository | `LAMB-IS-ME/BTL-CNW-DVTT` |
| Branch | `ux/education-saas-redesign-pilot` |
| HEAD | `d7723622cfa943a288279c61e33cee998fe339fe` |
| Baseline tracked/staged changes | 0 / 0 |
| Historical untracked artifacts | 85, đã snapshot SHA-256, không file nào thay đổi |
| Remote đọc trực tiếp | Chỉ có `main`, SHA `2cda149838b20cb0c11c89ddf2203fb474a70f64` |
| GitHub | Repo public từ trước, có quyền push; chưa sử dụng quyền push |

Đã đọc readiness/fresh-clone/deployment plan/JSON, README, đặc tả baseline, env examples, migrations/seed, CI/Pages và các remediation reports liên quan; đối chiếu source security/session/storage/quiz. Kết quả phase trước là lịch sử, không gán thành hosted PASS. [Manifest lịch sử](free-staging-evidence/historical-artifacts.json), [review Git](free-staging-evidence/git-review.json).

## B. Free hosting

- Render MCP truy cập được đúng workspace `tea-db7m2r3ncjis73eq90tg`; `list_services` trả null (không service). Đã xác nhận Free Web Service còn được hỗ trợ. Chưa tạo resource nên chưa kiểm chứng create-time eligibility/build trên account này.
- User đã xác nhận **chưa gắn phương thức thanh toán**. Không thêm thẻ/nâng cấp. Chưa tạo bất kỳ tài nguyên tính phí nào trong lượt này; không có khoản phí resource mới do lượt này tạo ra. Không suy diễn rằng đã đọc được toàn bộ billing account qua MCP.
- Supabase tổ chức đang `free`/`tier_free`; chỉ dùng project ExamSpace đã có. Tên tổ chức là FocusLab, khác với project FocusLab ngoài scope; không đọc/sửa project FocusLab.
- [Render Free](https://render.com/docs/free): 750 giờ/workspace/tháng; idle 15 phút, cold start thường khoảng một phút, ephemeral filesystem. Bandwidth/pipeline tính theo quota workspace; không payment method thì suspend dịch vụ/dừng build khi hết quota. Không keep-alive cron/ping.
- [Supabase Free](https://supabase.com/pricing): 500 MB DB, 1 GB Storage, 5 GB egress + 5 GB cached egress; có thể pause sau một tuần không hoạt động. Hạn mức usage còn lại chưa có endpoint đọc qua MCP hiện tại.

## C. Deployment

Topology đã chuẩn bị và kiểm chứng local: **Browser HTTPS/WSS → một Render Free Node process (React SPA + Express REST + Socket.IO) → Supabase PostgreSQL/private Storage**. Một public origin; không Static Site riêng, DNS/custom domain, Render database, Redis hoặc paid worker.

[render.yaml](../../render.yaml) đã validate với JSON schema chính thức: name đề xuất `examspace-staging`, Singapore, plan `free`, branch đề xuất `deploy/examspace-free-staging`, auto-deploy off, health `/api/health`.

```sh
npm ci --include=dev && npm run db:generate && npm run build
CLIENT_ORIGIN="$RENDER_EXTERNAL_URL" npm run start -w @exam/api
```

Build output `apps/web/dist` và `apps/api/dist/server.js`; static root chỉ web bundle. `SERVE_WEB=true` bật Express static + SPA fallback; default false giữ topology cũ. Missing assets, API, Socket.IO, source/.env và mutation không bị thay bằng SPA HTML. HTML revalidate, hashed assets immutable. Helmet CSP cho phép ảnh từ đúng Storage origin và WSS của exact app origins. Port binding/shutdown/auth middleware nghiệp vụ giữ nguyên.

Phương thức chọn: Git-backed Native Node qua MCP. Repo có sẵn, không cần image registry; MCP không tạo được prebuilt-image service. CLI/API cũng cần remote Git hoặc image, không tự deploy được source local chưa push. Render CLI chưa cài, không có Render API token trong environment; JSON schema validator local thay CLI validation. MCP create không nhận healthCheckPath: phải xác minh cấu hình thực qua service/API sau create, không coi Blueprint field là đã áp dụng.

**Public URL: chưa có.** Không suy đoán URL từ tên đề xuất. Build/start/service logs trên Render: **BLOCKED trước push**. [Runbook và env matrix mới](FREE_STAGING_RUNBOOK.md).

## D. Database / Storage

Project `BTL-CNW-DVTT-ONLINE-PRJ` / `zhdxuqcbvhcnujcdbkgw`, `ACTIVE_HEALTHY`, region `ap-southeast-2`, PostgreSQL `17.11.0.002`. Không gọi restore lại. `list_tables` dùng estimated rows có thể trả 0 sau restore; đã kiểm tra lại bằng SELECT count thực tế, không kết luận DB trống.

- 2 Prisma migrations completed, không rolled back; SHA-256 khớp cả hai file SQL local.
- 15 user: 1 Admin, 2 Teacher, 12 Student; 2 classes, 27 questions, 3 exams; 1 session tại snapshot; 1 Storage object. Không seed/reset/chỉnh dữ liệu ứng dụng.
- Đã xác minh read-only mật khẩu cấu hình cho Admin/Teacher1/Student1 khớp hash và khác password development mặc định. Không lưu password/hash vào evidence.
- Session pooler IPv4 port 5432. Secret hiện có thiếu SSL mode; cấu hình deploy phải bổ sung `sslmode=verify-full` và CA chính thức. **Client→pooler TLS 1.3/authorized certificate PASS**, [evidence](free-staging-evidence/database-tls.json). `pg_stat_ssl` báo đoạn pooler→PostgreSQL nội bộ provider chưa dùng SSL; không nhầm đó với TLS phía client. Chưa kiểm tra kết nối từ Render thực.
- Bucket `question-assets` private, MIME PNG/JPEG/WebP, limit 5 MB. Signed download **200**, 166547 bytes; public download **400**. Không ghi signed URL/object path/token vào report. [Storage read-only evidence](free-staging-evidence/storage-read-only.json). Chưa upload qua hosted app.

Thay đổi remote duy nhất: hardening metadata qua Supabase management migration `protect_prisma_migration_metadata`. Trước sửa `_prisma_migrations` có RLS off và grants cho anon/authenticated. [SQL đã kiểm thử](free-staging-evidence/protect-migration-metadata.sql) thu hồi mọi quyền anon/authenticated/PUBLIC và bật RLS. Đã xác minh lại: anon SELECT false, authenticated INSERT false; số record ứng dụng/object và checksum Prisma không đổi. Security advisor sau sửa chỉ còn 22 INFO `rls_enabled_no_policy`, phù hợp backend owner-only, không ERROR/WARN. Không thay business columns/index/constraints hoặc các migration Prisma cũ. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

## E. Security

Local production fresh PASS: Secure/HttpOnly/SameSite=Lax host-only cookies; exact CORS; CSRF invalid/missing/wrong origin bị reject; logout revoke session và disconnect WSS; PostgreSQL session sống qua SIGTERM/SIGKILL với secret giữ nguyên. Real local WSS handshake/monitor ACK; anonymous/untrusted Origin bị chặn. API/RBAC/ownership/socket regression PASS ở database test riêng.

Browser test đã phát hiện lỗi cùng origin: polling GET của browser không gửi Origin, bị server allowlist từ chối. Đã sửa **client cùng origin dùng `transports:["websocket"]`**; giữ server policy, event payloads, auth/session/CSRF và business rules. Cross-origin client giữ transport defaults. Không có polling fallback trong topology cùng origin; WSS phải hoạt động trên hosted.

Secret scan: current candidate, frontend JavaScript bundle và 332 blobs trong 10 outgoing historical commits; match secrets hiện có trong bộ nhớ + credential/private-key patterns, không phát hiện. Đây là scoped scan, không bảo đảm tuyệt đối mọi unknown secret. CA certificate được commit đề xuất là public certificate, không private key. Không đổi dependency/lockfile. [Scan](free-staging-evidence/security-scan.json).

## F. Test results và provenance

| Kiểm tra | Trạng thái | Evidence / giới hạn |
| --- | --- | --- |
| Lint final | PASS, fresh | [log](free-staging-evidence/verification-summary.json) |
| Typecheck final | PASS, fresh | [log](free-staging-evidence/verification-summary.json) |
| Build production shared/API/web | PASS, fresh | [log](free-staging-evidence/verification-summary.json), warning chunk >500 kB có sẵn |
| Unit/frontend | **94 PASS / 20 files**, fresh | [log](free-staging-evidence/verification-summary.json), gồm 16 regression static-serving mới |
| Integration | **62 PASS / 15 files**, fresh | [log](free-staging-evidence/verification-summary.json), DB test riêng, có cảnh báo deprecation pg |
| Blueprint schema | PASS, fresh | [JSON](free-staging-evidence/blueprint-validation.json) |
| Local migration/seed | PASS, fresh | [migrate](free-staging-evidence/verification-summary.json), [seed](free-staging-evidence/verification-summary.json); chỉ database test mới |
| Production HTTPS/WSS/session/restart | **8 assertion groups PASS**, fresh | [probe](free-staging-evidence/verification-summary.json); self-signed TLS local |
| Core browser trên production cùng origin | **3 PASS**, fresh | Cùng log: Teacher/Student Exam/autosave/refresh/monitor/submit/essay/result; Quiz join/start/answer/final/reload; mobile role guard. Có assertion WSS URLs thật |
| Metadata hardening test | PASS, fresh | [local transaction rollback](free-staging-evidence/metadata-security-local.json), remote verify qua MCP |
| Cloud Storage existing object read/private deny | PASS, fresh | Chỉ read-only, chưa full app roundtrip |
| Remote DB migration/data/password inspection | PASS, fresh | Read-only, không chạy destructive suite trên PostgreSQL 17 |
| Full browser 20 tests của baseline | REUSED / không rerun toàn bộ | [readiness trước phase](DEPLOYMENT_READINESS_REPORT.md); không đổi thành fresh PASS |
| npm ci / full audit của baseline | REUSED / không chạy lại | Không đổi dependencies/lockfile; Render CI/build sau push phải install/audit lại |
| Hosted Admin/Teacher/Student, expiry, WSS/reconnect, Storage upload, PDF/Excel | **BLOCKED** | Chưa service/URL; local regression không thay hosted acceptance |
| Hosted responsive 1440/1024/820/390/320, cold start, public TLS/proxy | **BLOCKED** | Chưa đo; local fresh core có mobile 390 và screenshot desktop 1280 |

First browser run: **2 FAIL / 1 PASS**, lỗi sản phẩm polling/Origin, giữ [log trước sửa](free-staging-evidence/verification-summary.json). Sau sửa source và rebuild: **3 PASS, retries 0**, không đổi expectation nghiệp vụ. Lượt probe nhỏ trước đó chỉ kiểm tra WSS bằng Node client nên chưa bắt được browser polling; ghi đúng phạm vi, không dùng nó phủ định failure.

Các setup failures được xử lý: PostgreSQL extract cần LD_LIBRARY_PATH; validator ban đầu thiếu YAML package/draft 2020 support, đổi sang Python jsonschema; scanner ngoài repo cần resolve dotenv từ repo và quyền subprocess; TLS chưa có CA báo SELF_SIGNED_CERT_IN_CHAIN, thêm CA chính thức rồi verify-full thành công. Không tắt kiểm tra chứng chỉ cloud, không hạ assertions.

Screenshots mới đều là **local synthetic fixtures**: [Exam result](../screenshots/free-staging/local/student-result.png), [Quiz final](../screenshots/free-staging/local/quiz-final.png). Đã xem ảnh Quiz; không có browser cookies/tokens trong ảnh hoặc trace. Không dùng ảnh này làm evidence hosted.

## G. Limitations

Cold start/pausing/single instance được chấp nhận theo yêu cầu user. Chưa có measurement trên Render, chưa chứng minh no-overlap khi deploy hoặc availability giữa ca thi. Một configured instance không loại trừ overlap trong rolling replacement; chỉ deploy/restart trong maintenance window. Health hiện chỉ liveness, DB/auth phải probe riêng. Chưa test cloud upload, hosted PDF/Excel, responsive đủ năm widths hoặc public WSS reconnect. Không production-ready, không SLA, không load claim.

## H. Documentation

- [Verification JSON](free-staging-verification.json).
- [Runbook](FREE_STAGING_RUNBOOK.md): env names, secrets handling, Git/provider gates, commands, quota/recovery/rollback, hosted test checklist.
- [Evidence directory](free-staging-evidence/), [Git review](free-staging-evidence/git-review.json), [candidate source hashes](free-staging-evidence/candidate-source-manifest.json).
- [Screenshots local mới](../screenshots/free-staging/local/); các report/screenshot lịch sử giữ nguyên.

## I. Git và candidate review

**Chưa stage, chưa commit, chưa push, chưa tạo branch mới, chưa merge.** Working branch và HEAD giữ nguyên baseline. `main` remote/GitHub Pages không đổi. 85 historical artifacts giữ nguyên SHA-256.

Candidate runtime: `apps/api/src/web.ts`, hai điểm nối app/env, client Socket.IO same-origin; không đổi UI/business/scoring/timer/schema nghiệp vụ. Config: `render.yaml`, `.env.example`, public Supabase CA. Tests: static regressions, production probe hỗ trợ same-origin, core spec parametrized origin/screenshot + WSS assertion, local probe config. README thêm link trạng thái hiện tại. Danh sách đầy đủ và hashes ở Git review/manifest.

Push dự kiến chứa 10 commits local đã có từ remote main tới `d7723622`, cộng **một commit candidate sau review**. Message đề xuất `feat(deploy): prepare free single-origin staging`; chưa có SHA mới vì user chưa duyệt commit. [Git review JSON](free-staging-evidence/git-review.json) ghi đầy đủ 10 SHA/messages. Push branch mới kích hoạt CI, không tự chạy GitHub Pages; chưa có Render service nên push này chưa trigger Render. Sau tạo service sẽ giữ auto-deploy off.

## J. Next action — cần user approval

**Duyệt candidate và cho phép tạo một commit, rồi push lên `LAMB-IS-ME/BTL-CNW-DVTT`, branch mới `deploy/examspace-free-staging`.** Cần push vì Render phải clone source từ remote Git; source mới hiện chỉ nằm local. Không ảnh hưởng main, không chứa secrets theo scan, không đưa historical untracked artifacts vào commit.

Gate này xuất phát trực tiếp từ yêu cầu user phần 10 và 16, không phải agent tự đặt. Sau approval agent tự thực hiện Git, theo dõi CI, tạo đúng Free service và kiểm thử hosted; không yêu cầu user thao tác kỹ thuật. Điều kiện billing đã được user xác nhận: chưa có payment method. Nếu provider phát sinh yêu cầu OAuth/Repo access hoặc thẻ, dừng đúng bước đó, không suy diễn đã có quyền hay chấp nhận chi phí.
