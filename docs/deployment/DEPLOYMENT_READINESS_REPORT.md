# Deployment readiness report — ExamSpace — 2026-10-14

> Snapshot trước commit tại baseline `864633b`. User đã duyệt cleanup và đúng một local commit; các trạng thái “chưa commit” bên dưới ghi nhận checkpoint cũ, không mô tả HEAD của một clone về sau. Xem [cleanup gate](evidence/commit-cleanup.json). Kết quả post-commit được báo riêng sau khi clone NEW HEAD; không ghi PASS trước khi thực hiện.

## Quyết định

**Hoàn tất deployment preparation để user review; chưa production-ready và chưa hoàn tất bàn giao qua Git.** Local runtime tái tạo được từ committed source. Gap đặc tả đã có bản sửa portable chờ review; hosted staging, cloud Storage và các deliverable môn học còn mở. Không deploy, push, merge, PR, stage hoặc commit.

## Baseline và phạm vi

- Repository `<repository-root>` (`LAMB-IS-ME/BTL-CNW-DVTT`).
- Branch `ux/education-saas-redesign-pilot`; HEAD `864633b93505fdeebb8c2ca15b0b0c3278a3de9d`, `fix: harden session lifecycle and live quiz recovery`.
- Baseline: 368 tracked files; không tracked/staged changes; 85 intentional untracked artifacts. Không upstream của branch, không fetch/push để suy đoán trạng thái remote.
- Các commit trước: session recovery → asset/pagination integrity → admin/release gates → Live Quiz → grading/results → Student/Teacher UX. Không sửa lịch sử.
- Thay đổi phase này: README/SRS/deployment guide, comments trong hai env examples, spec bàn giao, reports/evidence, một test probe local production. Không đổi runtime, UI, auth policy, schema/migration, dependency/lockfile, Socket.IO protocol hoặc deployment triggers.

[Baseline](evidence/git-baseline.json), [final Git/integrity](evidence/final-review.json), [machine-readable readiness](deployment-readiness.json).

## Trạng thái tài liệu và implementation

| Hạng mục | Phân loại | Kết quả |
| --- | --- | --- |
| Runtime/source + manifests + migrations + fonts | IMPLEMENTED / VERIFIED local | Fresh clone chạy được bằng dependency install mới |
| MASTER_SPEC tại HEAD | MISSING trong Git | Root file bị exclude, README/SRS links hỏng |
| Bản spec bàn giao | PREPARED / VERIFIED static | `docs/spec/MASTER_SPEC_BASELINE.md` byte-identical, không ignored; chưa commit |
| README số test cũ / VERIFICATION cũ | OUTDATED nếu coi là kết quả hiện tại | README đã chuyển tới report mới; evidence lịch sử giữ nguyên |
| SRS/SDD/seed-recovery/audit/remediation | DOCUMENTED | Đã đối chiếu deployment-critical behavior với source; không coi toàn bộ historical findings còn mở |
| Environment | IMPLEMENTED / DOCUMENTED / VERIFIED parser | [Matrix đầy đủ](ENVIRONMENT_MATRIX.md), không có secrets thật trong templates |
| Hosted topology | DOCUMENTED, NOT TESTED | [Hai lựa chọn](DEPLOYMENT_PLAN.md), chưa tạo hosting |

Bản local `MASTER_SPEC.md` và copy `docs/spec/MASTER_SPEC.md` được giữ nguyên. Kiểm tra khi resume phát hiện exclude dùng basename nên cả copy cùng tên vẫn ignored; bản mới đổi basename để tránh sửa `.git/info/exclude`. Business requirements giữ nguyên. [Reconciliation](../spec/SPEC_RECONCILIATION.md) ghi rõ Node/tooling/routes/checklist-target khác trạng thái thực thi, không viết lại nghiệp vụ theo implementation.

## Verification bắt buộc

| Gate | Status | Phạm vi bằng chứng |
| --- | --- | --- |
| A. Fresh-clone completeness | PARTIAL original / PASS prepared static | Original thiếu spec; runtime files đủ; final prepared overlay resolve links, chưa commit |
| B. Clean npm ci / dependency tree | PASS | Original clone, 839 packages; candidate có install riêng |
| C. Lint | PASS | Original và candidate |
| D. Typecheck | PASS | Original và candidate |
| E. Production build | PASS | Shared/API/web; no source fixes required |
| F. Isolated migrations | PASS | Hai migrations, fresh PostgreSQL 16.15, rerun |
| G. Isolated seed | PASS | Ba roles và demo data; fingerprint rerun unchanged |
| H. Backend production startup | PASS local | NODE_ENV=production trong local TLS probe |
| I. SPA deep-link/static assets | PASS local | Bundle root TLS và `/project/` HTTP404 fallback; chưa hosted CDN |
| J. Authentication/CSRF/CORS | PASS local | Login/logout, denied origins, missing CSRF, role boundaries |
| K. Session persistence | PASS local | PostgreSQL store, SIGTERM exit 0 và SIGKILL/restart, same secret |
| L. Teacher/Student representative flow | PASS | Exam autosave/refresh/monitor/submit/grading/result, Quiz join/start/reveal/final; 20 E2E |
| M. Socket.IO | PASS local | Integration sockets và authenticated WSS monitor ACK; anonymous/wrong-origin rejection |
| N. Environment audit | PASS source/parser | 8 invalid configs rejected; 2 production configs accepted |
| O. Documentation links | PASS prepared static | Original 2 broken targets; final comparison details linked below |
| P. Security-pattern checks | PASS scoped scan | No detected real secret in new deliverables; không phải chứng nhận security toàn hệ thống |
| Q. Regression suites / advisory | PASS | 78 unit, 62 integration, 20 E2E; npm audit low gate 0 vulnerabilities tại lần chạy |

Commands, failure/retry provenance và summary ở [verification](evidence/verification.json), setup ở [fresh-clone report](FRESH_CLONE_SETUP_REPORT.md). Không chạy lại tests khi resume theo user request. Scratch tạm cũ không còn; summary JSON và execution transcript còn hợp lệ, raw logs không còn để kiểm tra lại. Hai clones mới chỉ phục vụ static comparison, không giả lập kết quả execution mới. Không dùng PASS từ các remediation phase cũ thay acceptance của phase này.

## Frontend, backend và database

Web output `apps/web/dist`, build inject VITE URLs; BrowserRouter basename theo Vite base. `404.html` copy từ index phục hồi deep route ở Pages nhưng HTTP status vẫn 404. Original smoke dùng bundled files với NODE_ENV=test; probe mới dùng NODE_ENV=production trên HTTPS local. Chưa kiểm chứng CDN cache/real custom domain. Large Markdown chunk warning được giữ, không redesign/code splitting ngoài scope.

API start bằng `npm run start -w @exam/api`; bundle tại `apps/api/dist/server.js`, fonts/dependencies vẫn cần deploy. Bind `0.0.0.0:PORT`, Express/Socket.IO chung server. Startup đợi reconciliation Quiz presence trong DB trước listen. SIGTERM/SIGINT đóng sockets/server/jobs/pools; graceful và unexpected restart đã kiểm tra local. Health `/api/health` chỉ liveness, không query DB sau startup. Có structured startup/error/job logs và error response được sanitize; chưa có durable request audit/metrics/tracing/load benchmark.

Single API process là giới hạn hiện tại. Rolling replacement có thể overlap dù service khai báo một instance; phải kiểm tra host lifecycle và maintenance window, không tự triển khai Redis/scaling. Không hứa zero-downtime Exam/Quiz. Deadline lưu DB không được gia hạn do outage; câu trả lời chưa save có thể mất khi quá hạn.

PostgreSQL schema/seed gồm session table, RLS, CHECK/unique constraints, không cần extension thêm ngoài mặc định. Runtime dùng max 10 Prisma + 5 session pool connections; CLI ưu tiên DIRECT_URL nhưng runtime/seed/session dùng DATABASE_URL. Chọn trusted table-owner/BYPASSRLS backend role, TLS/CA đúng cho pg/CLI và direct/session pooler tùy host network. Hosted permissions/SSL/limits chưa test. Chi tiết counts/idempotency trong fresh-clone report. Không seed production hoặc sửa schema.

## Auth/security và Storage

Session server-side, SID HttpOnly/host-only; production bắt buộc Secure, exact HTTPS CLIENT_ORIGIN. SameSite=Lax phù hợp same-site HTTPS; None chỉ cho cross-site với Secure và vẫn phụ thuộc browser cookie policy. Frontend fetch/socket gửi credentials. CSRF synchronizer token bắt buộc mutation + Origin allowlist; login regenerate SID/token, logout destroy store và disconnect session sockets. API reload user status/role; sockets revalidate session/user khi event và định kỳ 30 giây. Session-expiry API/socket cases có integration coverage, không cần rerun historical visual recovery suite.

Local probe dùng `https://localhost:5443` và `https://localhost:5444`: **khác origin nhưng cùng site**, không chứng minh third-party cookie acceptance. Self-signed certificate bypass chỉ ở test harness. Proxy trust numeric phải khớp topology; source API không tự redirect HTTP→HTTPS. Staging cần xác nhận real certificate, redirect, forwarded-header overwrite/restriction, WSS và target browsers.

Storage chỉ backend service key, private bucket `question-assets`, MIME/signature PNG/JPEG/WebP ≤5 MB, owner/question/random paths, signed URL 300s sau auth + snapshot/release checks. Published/reference/snapshot protections giữ nguyên; deletion remote failure có thể để orphan nhưng không phá reference. Tests dùng provider-boundary double, không chứng minh hosted Storage. Thiếu credential thì flow ảnh trả lỗi 503 rõ ràng, không fallback local-file runtime. Không tạo bucket, đổi policy, upload hoặc delete production asset.

## CI/CD

`.github/workflows/ci.yml`: push/PR, Node theo `.nvmrc` (22), npm ci → generate/migrate/seed → lint/typecheck/unit/integration/build → Chromium E2E/deployment smoke → npm audit `--audit-level=low`. PostgreSQL 17 service, test DB variables synthetic, poppler-utils và Playwright deps được cài, failure artifact retention 7 ngày. Source/fixtures cần thiết đều tracked. Không cần cloud secret cho local test suite; real Storage bị tách khỏi scope bằng fixture. New local TLS probe chưa được thêm vào CI workflow; chạy thủ công theo guide, cần openssl. Không thay triggers hoặc security gates.

Local commands tương đương đã chạy trên PostgreSQL 16.15; hosted Actions/job permissions/network/image PostgreSQL 17 **NOT TESTED**. CI scripts có thể tái tạo từ clone nhưng không gọi remote CI PASS. Node patch drift qua `.nvmrc` 22 và binary/browser downloads cần theo dõi. Existing E2E tạo screenshots trong clone; failure artifact có thể chứa dữ liệu test, cần review trước publish. Raw browser sessions/logs không đưa vào new evidence.

`pages.yml` chỉ workflow_dispatch, validates public HTTPS VITE URLs, Pages metadata base, artifact upload + deploy job quyền Pages/OIDC. Render blueprint autoDeployTrigger off, mặc định free và migration trong start; cần devDependencies cho Prisma CLI. Không kích hoạt bất cứ workflow/deployment nào.

## BTL handoff

Nguồn yêu cầu: baseline spec §43–49 và SRS; không tìm thấy rubric/template chính thức riêng của giảng viên. Không suy diễn tiêu chí điểm hoặc bắt buộc video.

| Deliverable | Status | Việc còn cần |
| --- | --- | --- |
| Source + lockfile | READY local | Sau review mới quyết định đưa prepared files vào Git |
| Schema / migrations | READY local | Hosted migration/backup validation riêng |
| Seed/demo accounts | READY local | 3 roles; password development chỉ ở source/README, không đưa vào reports; chuẩn bị lịch demo mới nếu đã quá 7 ngày |
| Environment examples | READY prepared | Điền secret thật qua operator secret store sau khi chọn environment |
| Installation guide | READY prepared | Fresh-clone commands và prerequisites đã ghi |
| User guide | PARTIAL | Spec §48 có demo script; chưa có guide riêng theo ba roles đầy đủ |
| Architecture / SRS / SDD | PARTIAL | Có tài liệu tracked; reconciliation deployment có, toàn bộ UX/coverage traceability sau rollout chưa review exhaustive |
| API documentation | PARTIAL | SDD/routes/shared contracts có; chưa có OpenAPI/full consumer guide, rubric necessity UNCLEAR |
| Deployment guide | READY plan / PARTIAL validation | Chưa staging/cloud acceptance |
| Báo cáo nộp môn | MISSING final deliverable | Audit/remediation reports không tự thay báo cáo học phần theo format giảng viên |
| Slides | MISSING | Chưa thấy tracked presentation |
| Demo video | MISSING artifact / UNCLEAR requirement | Chưa thấy video; xác nhận yêu cầu chính thức trước khi làm |
| Official rubric/template | UNCLEAR | Không có nguồn chính thức trong repo |
| Multi-instance/Redis/proctoring | NOT REQUIRED phase/v1 | Không thêm như điều kiện của phase chuẩn bị này |

Không tạo Word/PowerPoint/video trong phase này.

## Findings còn mở và bước tiếp theo

| ID | Loại / trạng thái | Hành động đề xuất |
| --- | --- | --- |
| DOC-DEP-01 | Confirmed handoff blocker tại HEAD; fix PREPARED | Review canonical spec và links; commit chỉ khi user cho phép ở lượt sau. Original clone vẫn thiếu. |
| DEP-EXT-01 | Hosted acceptance NOT TESTED | Chọn topology/budget/domain rồi authorise staging ở phase khác; thực hiện checklist trong plan. |
| DEP-CFG-01 | Configuration risk | NODE_ENV/DB target/seed guard không chống mọi operator mistake; giữ production seed off, verify cả DATABASE_URL/DIRECT_URL, không dùng default demo password trên cloud. Không đổi auth policy. |
| DEP-OPS-01 | Single-instance operational limitation | Avoid sleep, overlapping process replacement và deploy giữa Exam/Quiz; test restart/backup/load trên host thực. |
| DEP-CI-01 | Validation gap | Chưa chạy remote CI/PostgreSQL 17; không push chỉ để trigger. |
| BTL-01 | Delivery gaps | Chuẩn bị user guide/report/slides theo rubric được xác nhận; video requirement còn unclear. |
| EVID-01 | Evidence retention limitation | Scratch/raw logs mất sau interruption; giữ sanitized same-phase summaries và transcript. Static clones mới không thay runtime run cũ. |

Không còn confirmed local runtime/setup failure trong các gates đã thực thi. Warnings dependency deprecations, pg query deprecation và web chunk size được giữ nguyên, không dependency upgrade ngoài scope. Không tuyên bố toàn ExamSpace release-ready.

## Artifacts và final review

- [Fresh-clone setup](FRESH_CLONE_SETUP_REPORT.md)
- [Deployment plan](DEPLOYMENT_PLAN.md)
- [Environment matrix](ENVIRONMENT_MATRIX.md)
- [Readiness JSON](deployment-readiness.json)
- [Verification summary](evidence/verification.json)
- [Fresh/prepared comparison](evidence/fresh-clone-comparison.json)
- [Secrets/security scope](evidence/security-scan.json)
- [Final integrity review](evidence/final-review.json)
- [Production probe source](../../tests/deployment/production-readiness.mjs)

85 historical untracked artifacts và protected local specs/exclude được đối chiếu SHA-256, không thay đổi. Final diff chỉ docs/env comments và new test/report files; không staged changes. Dừng tại user review. **NO COMMIT / NO PUSH / NO DEPLOY / NO MERGE / NO PR.**
