# Runbook Free Staging — lịch sử

Tách nguyên văn từ `docs/deployment/FREE_STAGING_RUNBOOK.md`. Mô tả lượt deploy staging tháng 10/2026 trên URL cũ `examspace-staging.onrender.com`; không phải chỉ dẫn hiện hành. Runbook hiện hành: [FREE_STAGING_RUNBOOK.md](../../deployment/FREE_STAGING_RUNBOOK.md).

Các SHA/service IDs, approval và số liệu dưới đây chỉ mô tả ngày ghi nhận. Không suy ra trạng thái cloud ngày 03/11/2026, không chạy lại script dựa trên quyền cũ.

<details>
<summary>Runbook checkpoint 15/10/2026 (nguyên văn)</summary>

# ExamSpace — Runbook Free Staging

Ngày cập nhật: 15/10/2026 (Asia/Bangkok). **LIVE SHA `bf3c1f5e4133d00d6e463516b5af571d86e3852d`**, deploy `dep-db8e5ig473hc739etsbg`. CI SUCCESS (98 unit / 62 integration / 20 E2E), hosted auth PARTIAL PASS; blocker expiry → relogin → revocation đã tái hiện. Dừng review, không lặp commit/push/deploy. Xem [report](FREE_STAGING_DEPLOYMENT_REPORT.md).

## 1. Gate trước khi tiếp tục

- User đã xác nhận workspace Render chưa gắn phương thức thanh toán. Chỉ `plan: free`, không thêm thẻ, add-on, disk, Postgres, Redis, cron hoặc ping giữ sống. Nếu provider đòi thanh toán/thẻ, dừng; không đổi sang paid.
- Branch `deploy/examspace-free-staging`, HEAD `bf3c1f5e4133d00d6e463516b5af571d86e3852d`. Chưa có quyền sửa production/commit/push/deploy thêm cho blocker mới. Không merge main/force push hoặc commit 85 historical artifacts.
- Đọc [manifest artifact](../../deployment/free-staging-evidence/historical-artifacts.json), [review Git](../../deployment/free-staging-evidence/git-review.json), [scan secrets](../../deployment/free-staging-evidence/security-scan.json). Kiểm tra lại HEAD/diff/hash trước thao tác được duyệt.
- Quyền MCP Render/Supabase đang hoạt động. GitHub CLI có quyền push nhưng **quyền kỹ thuật không thay sự chấp thuận của user**.

## 2. Cấu hình chính xác

Một Render Native Node Web Service, tên `examspace-staging`, region `singapore`, plan `free`, một instance, repo root, auto-deploy **off**. PostgreSQL/Storage ở Supabase ExamSpace `zhdxuqcbvhcnujcdbkgw`, Sydney `ap-southeast-2`. Không tạo Supabase project hoặc đụng project FocusLab (tên tổ chức chứa ExamSpace cũng là FocusLab; không nhầm tổ chức với project).

```sh
# Build, có devDependencies vì Prisma/Vite/TypeScript cần lúc build.
npm ci --include=dev && npm run db:generate && npm run build
# Start tại repo root trên Render, lấy đúng origin Render cấp.
CLIENT_ORIGIN="$RENDER_EXTERNAL_URL" npm run start -w @exam/api
```

`RENDER_EXTERNAL_URL` là biến [Render tự cung cấp](https://render.com/docs/environment-variables). Không dự đoán URL từ tên service; URL thực phải lấy từ kết quả create/get service. Health `/api/health` chỉ là liveness. Process bind `0.0.0.0:$PORT`, Express + Socket.IO trên cùng port. Build frontend `apps/web/dist`; API entrypoint `apps/api/dist/server.js`; npm workspace start bảo đảm cwd/font PDF đúng.

| Biến | Giá trị/nguồn |
| --- | --- |
| NODE_VERSION | `22.23.2` |
| NODE_ENV | `production` |
| SERVE_WEB | `true` |
| PORT | Render cấp, mặc định nền tảng 10000; app đọc `PORT` |
| VITE_BASE_PATH | `/` |
| VITE_API_BASE_URL | `/api/v1` |
| VITE_SOCKET_URL | Chuỗi rỗng, production dùng `window.location.origin` |
| CLIENT_ORIGIN | Start command lấy `RENDER_EXTERNAL_URL`, exact HTTPS origin |
| COOKIE_SECURE / COOKIE_SAME_SITE | `true` / `lax` |
| TRUST_PROXY | `1`; cần xác minh ingress/forwarded headers trên hosted |
| SESSION_SECRET | Random mới, ít nhất 32 ký tự; giữ ổn định qua redeploy |
| SESSION_COOKIE_NAME / SESSION_MAX_AGE_MS | Giữ default `online_exam_sid` / `28800000` |
| DATABASE_URL | Secret hiện có, session pooler port 5432, đúng username suffix project; thêm `sslmode=verify-full` trong bộ nhớ trước khi cấp Render |
| DIRECT_URL | Cùng session pooler cho Prisma CLI IPv4, verify-full; không migrate lúc start |
| NODE_EXTRA_CA_CERTS | `/opt/render/project/src/apps/api/assets/certs/supabase-prod-ca-2021.crt` |
| SUPABASE_URL | URL đúng project ExamSpace |
| SUPABASE_SERVICE_ROLE_KEY | Secret backend hiện có, truyền bằng secret/env tooling; không vào VITE/bundle/report |
| SUPABASE_STORAGE_BUCKET | `question-assets` |
| ALLOW_PRODUCTION_SEED | `false` |
| DEMO_PASSWORD | Không cần cho runtime; chỉ dùng trong bộ nhớ của smoke harness nếu cần login |

Không in connection string, khóa, cookie hoặc signed URL. Không sửa `.env` hiện có. Không đưa secrets vào Git, body report, trace/HAR hoặc screenshots. Tool trả secrets chỉ được xử lý trong bộ nhớ và chuyển trực tiếp vào env provider, không xuất ra transcript. Nếu không có kênh chuyển secret an toàn, dừng ở access gate, không yêu cầu user dán secret vào chat.

CA công khai tải từ URL mà [dashboard Supabase chính thức khai báo](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json): `https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`. SHA-256 certificate fingerprint: `807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`; hiệu lực đến 26/04/2031. Đây là certificate công khai, không phải private key. `NODE_EXTRA_CA_CERTS` phải tồn tại **trước khi Node khởi động**; không dùng `rejectUnauthorized:false` cho cloud DB. Xem [Supabase SSL](https://supabase.com/docs/guides/platform/ssl-enforcement).

## 3. Database/Storage trước deploy

Đã đọc project/schema/migration/data bằng read-only; 2 migration Prisma completed và checksum khớp source. Không migrate/seed lại. Bucket private đã có và tải ảnh qua signed URL thành công, public URL bị chặn.

Đã áp dụng Supabase management migration `protect_prisma_migration_metadata`: [SQL](../../deployment/free-staging-evidence/protect-migration-metadata.sql) thu hồi quyền `anon/authenticated/PUBLIC`, bật RLS cho `_prisma_migrations`. Đây là hardening metadata, không đổi business schema hoặc checksum Prisma. Không thêm migration Prisma mới và không sửa migration cũ. Đã kiểm tra số record/checksum không đổi và security advisor không còn ERROR.

Runtime/session dùng tối đa 10 + 5 pool connections/process. Client→pooler đã xác minh TLS 1.3, authorized certificate và hostname. `pg_stat_ssl` đo đoạn **pooler→PostgreSQL** nội bộ provider, hiện báo `ssl=false`; không dùng trường đó để suy ra client→pooler không TLS. Không tự đổi cấu hình SSL cấp project hoặc connection topology; hosted acceptance phải kiểm tra lại đường Render→pooler.

Tài khoản demo Admin/Teacher1/Student1 xác minh hash khớp secret demo hiện có, khác password development mặc định. Không reset password, session hoặc lịch đề. Trước hosted tests kiểm tra lịch đề/dữ liệu đang dùng, tạo fixtures có prefix riêng cho lượt test; không chỉnh sửa record demo để kéo dài deadline. Không chạy integration/E2E destructive suites vào Supabase.

## 4. Checkpoint hiện tại và thao tác tiếp theo

Service `[redacted]`, deploy `dep-db8e5ig473hc739etsbg` LIVE đúng HEAD, Free, auto-deploy OFF. CI 38750653237 SUCCESS. HTTP health 200; platform TCP mặc định. Không tạo service hoặc trigger thêm. Giữ SESSION_SECRET/env và dữ liệu.

Bước tiếp theo cần review blocker trong `free-staging-evidence/auth-fix-hosted-blocker.json`. Script `hosted-auth-revocation-sequence.mjs` tái hiện bằng fixture hiện có, không SQL/business mutation; không tự sửa ứng dụng hoặc tăng retries.

## 5. Hosted evidence và cách tiếp tục

Evidence cũ `free-staging-evidence/hosted-verification.json` chỉ cho commit 39802152. Evidence mới `auth-fix-hosted.json` PASS early login/ba vai trò/Exam/Quiz WSS/Storage download/export, nhưng FAIL chuỗi session revocation sau expiry/relogin. Không coi tổng thể PASS. Responsive và upload full lifecycle chưa chạy lại trên SHA mới. PNG fixture lỗi CRC đã được kiểm tra lại bằng valid PNG, evidence riêng `hosted-image-verification.json`.

Fixture prefix `STAGING-20261015021944`; tài khoản mới dùng password derived chỉ trong bộ nhớ từ secret local, không ghi credential. Hai attempt đã GRADED, room FINISHED. Không cleanup/reset/ghi đè ảnh, kể cả fixture lỗi. Không chạy destructive local integration suites vào Supabase.

Scripts `tests/deployment/hosted-staging*.mjs` là harness của lượt đã chạy. Không chạy lại mù quáng: main tạo fixture mới, resume giả định state cũ, image script tạo câu hỏi/đề mới. Đọc checkpoint trước và chỉ chạy kiểm thử còn cần. Không lưu cookies/storageState/HAR/trace hoặc signed URLs. Cold-start duration, hosted process restart/rolling overlap và multi-student load chưa kiểm thử; không cần restart khi có người đang thi.

## 6. Reproduce local evidence

Dùng database loopback mới có `test` trong tên; tuyệt đối không lấy DATABASE_URL cloud làm TEST_DATABASE_URL. Node 22.23.2; PostgreSQL 16.15 test đã dùng, cloud PostgreSQL 17.11 chưa chạy destructive suite.

```sh
# Chỉ sau khi agent tạo database test riêng và đặt DATABASE_URL/DIRECT_URL tương ứng.
DOTENV_CONFIG_PATH=/dev/null npm run db:migrate
DOTENV_CONFIG_PATH=/dev/null NODE_ENV=test npm run db:seed
VITE_API_BASE_URL=/api/v1 VITE_SOCKET_URL='' VITE_BASE_PATH=/ npm run build
DOTENV_CONFIG_PATH=/dev/null DEPLOYMENT_SAME_ORIGIN=true node tests/deployment/production-readiness.mjs
```

Probe yêu cầu `TEST_DATABASE_URL`, từ chối cloud host trước khi mở service. Nó tự tạo certificate localhost, chạy production API, TLS proxy và Chromium; browser bỏ kiểm chứng CA **chỉ cho certificate test này**, không phải cloud. Gồm 8 assertion groups security/restart và 3 core browser scenarios, ảnh được ghi dưới `docs/screenshots/free-staging/local/`. Chạy probe ở scratch checkout nếu cần giữ evidence lượt trước. Existing probe không có `DEPLOYMENT_SAME_ORIGIN=true` vẫn chạy chế độ cross-origin cũ.

## 7. Hạn mức và rollback

[Render Free](https://render.com/docs/free): 750 instance-hours/workspace/tháng, idle 15 phút, cold start thường khoảng một phút, ephemeral filesystem, restart bất kỳ lúc nào, không SSH/one-off jobs. Không có payment method: hết bandwidth thì suspend, hết pipeline quota thì dừng build. Không cố tránh spin-down bằng cron/ping. Nếu gặp suspension do egress DB/Storage lớn, dừng và báo user; không nâng plan.

[Supabase Free](https://supabase.com/pricing): 500 MB DB, 1 GB Storage, 5 GB egress + 5 GB cached egress, pause sau một tuần không hoạt động. Đã restore thì kiểm tra status, không gọi restore lặp. Không có cam kết 24/7 hoặc chịu tải lớn.

Rollback app theo previous deploy/source được duyệt; giữ SESSION_SECRET và DB URLs. Deploy/restart trong maintenance window vì startup reconciliation của single process và rolling overlap cần kiểm chứng hosted. Không rollback DB tự động, không reset dữ liệu, không mở lại grants công khai cho migration metadata. Deployment trước là 39802152 (có early-login race); không tự rollback khi chưa được duyệt.

</details>
