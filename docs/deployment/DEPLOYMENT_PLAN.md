# Deployment plan — đề xuất để review, 2026-10-14

Chỉ chuẩn bị. Chưa tạo project cloud, chưa mở staging, chưa chọn mua dịch vụ, chưa deploy hoặc push. Các bước hosting bên dưới chỉ dùng ở phase được người dùng cho phép sau này. Fresh clone/test hiện tại hoàn toàn từ Git local. Không cần đưa source lên GitHub để hoàn thành phase này.

## Hai phương án phù hợp hiện trạng

| Hạng mục | A — GitHub Pages + Render Web Service (ưu tiên) | B — Render Static Site + Render Web Service |
| --- | --- | --- |
| Frontend | `apps/web/dist`; workflow Pages thủ công hiện có | `apps/web/dist`; Static Site root monorepo, build shared/web |
| Backend | Một Node Web Service luôn chạy, Express + Socket.IO cùng port | Cùng một Node Web Service luôn chạy |
| Database / Storage | Supabase PostgreSQL + private bucket question-assets | Như A |
| Domain | Ưu tiên `app.<domain sở hữu>` và `api.<cùng domain>` HTTPS | Cùng cấu hình custom subdomains |
| SPA | Basename Pages lấy từ metadata; `404.html` phục hồi deep link, HTTP vẫn 404 | Rewrite `/* → /index.html` khi không có static file; cần cấu hình host |
| WebSocket | API Web Service hỗ trợ WSS chung port; frontend chỉ là static client | Như A |
| Chi phí dự kiến USD/tháng | Pages theo eligibility của GitHub account/repo; Render Starter khoảng $7 + Supabase Free $0 hoặc Pro từ $25 + domain/quota/tax | Static Site $0 trong quota; cùng API/DB cost; thêm quota build/bandwidth chung Render |
| Mô hình budget | Khoảng $7 cho API luôn chạy + Supabase Free (còn pause/quota); khoảng $32 với một Supabase Pro project Micro trong credit; domain và vượt quota tính riêng | Tương đương A; không cam kết là báo giá cuối cùng |
| Free-tier limits | Render Free sleep sau 15 phút không inbound traffic; Supabase Free có thể pause sau ít hoạt động 7 ngày; Pages có limits/account eligibility | API/DB như A; static site tính bandwidth/build minutes vào quota |
| Vận hành | Thấp; tận dụng workflow/blueprint đã có, ba dashboard | Thấp–vừa; frontend/backend cùng dashboard nhưng cần cấu hình site mới |
| Code/config cần | Không refactor; nhập env, domain/HTTPS, chọn compute khi được duyệt, kiểm tra publish base | Không runtime code change; static build/publish directory/rewrite/header rules và manual deploy policy |
| Rủi ro | Pages và API default domains khác site: browser có thể chặn cookie dù SameSite=None; initial deep link HTTP404 | Không suy luận các subdomain của provider là cùng site; ưu tiên domain sở hữu; host configuration chưa kiểm chứng |

A được ưu tiên vì phù hợp baseline và tận dụng cấu hình tracked. B hữu ích nếu muốn HTTP200 cho SPA deep links và quản lý frontend/backend cùng nơi. Đây là recommendation, chưa chọn thay người dùng.

Giá/giới hạn tham khảo được kiểm tra ngày 2026-10-14: [Render compute comparison: Starter $7](https://render.com/articles/render-vs-railway), [Render pricing](https://render.com/pricing), [Render Free](https://render.com/docs/free), [Render Static Sites](https://render.com/docs/static-sites), [Supabase pricing](https://supabase.com/pricing), [Supabase Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing). Tổng $32 là phép cộng ước tính, không gồm domain, thuế, usage/add-on hoặc thay đổi giá. Không nâng dependency/runtime để phục vụ proposal này.

GitHub Pages chỉ host nội dung tĩnh; khả dụng theo visibility/repository và account plan. Xem [GitHub Pages overview](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages) và [limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits). B dùng [Render SPA rewrites](https://render.com/docs/redirects-rewrites).

## Cấu hình chung

```text
Browser: HTTPS SPA
  -> HTTPS /api/v1 + credentialed fetch + CSRF
  -> HTTPS Socket.IO handshake / WSS upgrade
Trusted TLS edge (overwrite forwarded headers)
  -> one persistent Express/Socket.IO process
  -> PostgreSQL application + session tables
  -> Supabase private Storage (backend service credential)
```

Không dùng static hosting/serverless request-only function cho Express/Socket.IO. Không thêm Redis, multi-instance, hay đổi protocol. App có memory presence/timer/rooms; PostgreSQL giữ session, snapshot, answers và deadlines. Cần process luôn chạy để expiry jobs/reveal phản hồi kịp. Không dùng “ping giữ sống” như một SLA cho free service. Nếu demo buộc dùng Free, xác nhận DB/service đã awake trước buổi demo, warm health/login/quiz, chấp nhận restart/downtime và có demo local dự phòng.

[Render WebSockets](https://render.com/docs/websocket) hỗ trợ WSS cùng public port; connection bị đóng khi instance thay thế. Render có thể có overlap trong rolling deploy: với startup reconciliation cập nhật participant toàn DB, phải kiểm chứng/cấu hình dừng process cũ trước khi process mới phục vụ. Không deploy giữa ca thi/Quiz; dừng nhận lượt mới, chờ ca kết thúc rồi thay process trong maintenance window. Không coi “one configured instance” là chứng minh không overlap khi deploy.

## Build và start (lệnh chuẩn bị, không tự triển khai)

Backend root monorepo, theo blueprint hiện có:

```bash
npm ci --include=dev
npm run db:generate
npm run build -w @exam/api
# Chỉ khi target/backup/migration review đã được duyệt:
npm run db:migrate
npm run start -w @exam/api
```

`apps/api/dist/server.js` cần external dependencies và `apps/api/assets/fonts`; `tsup` bundle shared source, không cần build shared riêng cho API-only. Prisma CLI là devDependency: không prune trước migration theo start command hiện có. Root workspace start bảo đảm dotenv và relative PDF font path chính xác. Giữ secret ổn định qua redeploy.

Frontend:

```bash
npm ci
npm run build -w @exam/shared
npm run build -w @exam/web
```

Cấp public VITE URLs/base **trước build**; host `apps/web/dist`. Không đưa backend env vào job Pages. Với static host, dùng cache dài cho hashed `/assets/*`, revalidate HTML/404 khi deploy; không cache authenticated API hoặc Socket.IO tại CDN. Cache behavior của provider và rollback cache phải đo ở staging. Không serve `.env`, source config hay raw logs. Không coi `vite --host` hoặc Vite preview là hosted production test.

## Database và Storage

PostgreSQL 16.15 local VERIFIED; CI khai báo PostgreSQL 17 nhưng job hosted chưa chạy phase này. Schema không khai báo minimum PostgreSQL chính thức; không tự suy ra mọi version đều được hỗ trợ. Hai migrations theo timestamp, có partial unique index, CHECK constraints, RLS và session table; không yêu cầu extension bổ sung. `migrate deploy` không cần shadow database. Dùng database trống staging để thử trước khi migrate dữ liệu có giá trị; giữ backup/restore và migration audit riêng. Không dùng reset/db push.

Runtime/seed/session dùng DATABASE_URL; CLI ưu tiên DIRECT_URL. Direct hoặc session pooler phù hợp persistent backend; chọn theo IPv4/IPv6 của host. Runtime tối đa 10 Prisma + 5 session connections/process, cộng CLI/operator và nhu cầu rolling replacement. Chưa đo tải/budget thực trên provider. Role phải có quyền DML và là owner/BYPASSRLS; không dùng anon role. SSL/CA phải hoạt động với cả pg và CLI, không tắt TLS verification. Tham khảo [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres).

Bucket `question-assets` private; PNG/JPEG/WebP ≤5 MB; service credential chỉ backend. Không cần public read policy. Object path theo owner/question/random ID; ký URL 300 giây sau auth/ownership/snapshot/release checks. Bảo vệ ảnh đã referenced/published/snapshotted giữ nguyên. Nếu DB metadata removal thành công nhưng remote delete lỗi, API báo 502 và có thể để orphan object; operator cần đối soát bằng quy trình riêng, không xóa hàng loạt. [Supabase bucket setup](https://supabase.com/docs/guides/storage/buckets/creating-buckets).

## Cross-origin/security configuration

Xem [environment matrix](ENVIRONMENT_MATRIX.md). Cùng site HTTPS: Secure=true, SameSite=lax, CLIENT_ORIGIN exact frontend origin. Khác site: SameSite=none + Secure=true, vẫn phải kiểm thử browser third-party cookie restrictions. Cookie host-only/HttpOnly không cần Domain dùng chung. CSRF giữ nguyên, token mới sau login, logout destroy store/session và disconnect socket.

TRUST_PROXY là số hop đúng topology, không phải bật mù thành 1. Edge cần overwrite X-Forwarded-Proto/For, giới hạn truy cập origin và enforce HTTP→HTTPS. API source không tự redirect HTTP. HSTS/Helmet không thay thế TLS termination. Không wildcard credentials CORS. WSS handshake bắt buộc Origin trong allowlist + session; reload session/user ở event và mỗi 30 giây.

## Staging acceptance còn phải làm sau khi được cho phép

1. User chọn topology/domain/budget; cung cấp environment tách production. Xác minh không sleep/overlap, region, SSL/CA, role/RLS và pool limits.
2. Migrate database staging trống; không seed production. Nếu cần demo staging, cấp password riêng trước lần seed đầu và tắt production-seed flag sau đó. Rerun không thay password/lịch đã có.
3. Ghi rõ real frontend domain, real backend domain và browser site relationship (scheme + registrable domain), phân biệt cross-origin với cross-site. Kiểm tra HTTPS certificate chain, HTTP redirect, proxy-hop spoof rejection; cookie Secure/HttpOnly/SameSite, credentialed CORS allow/deny, CSRF, login/logout và session reload/expiration/revalidation trong các browser mục tiêu. Nếu khác site, thử cả khi third-party cookies bị chặn; local same-site TLS không chứng minh SameSite=Lax hoạt động cross-site. Ưu tiên subdomains cùng site khi phù hợp, không tự sửa cookie/CORS policy để né test.
4. WSS actual upgrade/reconnect, Teacher/Student Exam/Quiz, shutdown/restart trong maintenance window, deadlines/answers không đổi. Theo dõi memory/DB connection usage và event latency.
5. Hosted Storage upload/read/sign/expiry/delete-unreferenced; reject non-owner, invalid MIME/size; published/historical asset deletion 409; explanation visibility theo release; public object URL denied. Không dùng local double làm bằng chứng hosted.
6. SPA refresh direct URLs, base path/static assets, CDN cache invalidation, PDF font, authenticated download; secret scan bundle, provider logs/artifact permissions.
7. Backup/restore rehearsal, health plus DB/auth synthetic checks, quota/billing alerts; capacity/soak cho quy mô demo. Health hiện tại chỉ liveness, không chứng minh DB vẫn sẵn sàng sau startup.
8. Ghi evidence sanitized trước quyết định release. Hosted staging hiện **NOT TESTED**; không gán PASS dựa vào local TLS.

Rollback: giữ build/commit trước và environment ổn định; dừng process mới trước khi bật process cũ. Không rollback schema tự động; migration failure phải review `_prisma_migrations` và backup theo operator plan. Chưa có migration/schema mới trong phase này.
