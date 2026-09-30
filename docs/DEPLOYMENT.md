# Triển khai ExamSpace

Repository sẵn sàng chạy local với PostgreSQL và cấu hình target Supabase, Render, GitHub Pages. Không có secret cloud trong source. Các kiểm chứng local nằm ở [VERIFICATION](VERIFICATION.md); chưa có lần deploy cloud hoặc roundtrip Supabase Storage thật được xác nhận.

## Local quick start

Cần Node 22 LTS (≥22.12), npm, PostgreSQL UTF8 hoặc Supabase development project. Không dùng production database cho test.

```bash
npm ci
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Dán secret vừa tạo vào `apps/api/.env` ở SESSION_SECRET. Điền DATABASE_URL thật; DIRECT_URL có thể để trống nếu cùng kết nối có thể migrate. Không ghi credential vào shell history, Git hoặc frontend. Giữ local origin `http://localhost:5173`, COOKIE_SECURE=false, COOKIE_SAME_SITE=lax, TRUST_PROXY=0. Không trộn hostname localhost và 127.0.0.1 trong browser URL.

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Mở `http://localhost:5173`; API `http://localhost:3000`, health `http://localhost:3000/api/health`. Workspace npm chạy từ `apps/api` nên dotenv đọc `apps/api/.env`; Vite đọc `apps/web/.env`. Có thể chạy riêng `npm run dev -w @exam/api` và `npm run dev -w @exam/web` ở hai terminal. PostgreSQL session table do migrations tạo, không được bỏ migrate.

Thiếu Supabase Storage env vẫn chạy được các flow không có ảnh; upload trả `STORAGE_NOT_CONFIGURED`503. Sau khi thêm env, restart backend. Không có local-file fallback.

## Environment variables

### Backend: apps/api/.env hoặc Render environment

| Biến                      | Cách điền / mặc định                                                                |
| ------------------------- | ----------------------------------------------------------------------------------- |
| NODE_ENV                  | development local, production Render                                                |
| PORT                      | 3000 local; Render cấp tự động, API bind0.0.0.0                                     |
| DATABASE_URL              | URL PostgreSQL thật có quyền đọc/ghi schema app và session; chỉ server              |
| DIRECT_URL                | Prisma CLI dùng trước DATABASE_URL; direct hoặc session-pooler phù hợp cho migrate  |
| SESSION_SECRET            | Random ≥32 ký tự, giữ ổn định giữa redeploy; đổi secret làm phiên cũ mất hiệu lực   |
| SESSION_COOKIE_NAME       | online_exam_sid; đổi nếu chạy nhiều app cùng backend host                           |
| SESSION_MAX_AGE_MS        | 28800000 (8 giờ)                                                                    |
| CLIENT_ORIGIN             | Exact frontend origin; nhiều origin phân cách dấu phẩy, không path/trailing slash   |
| COOKIE_SECURE             | false local HTTP; true production HTTPS                                             |
| COOKIE_SAME_SITE          | lax local/same-site subdomains; none khi frontend/backend khác site                 |
| TRUST_PROXY               | 0 local; 1 cho một trusted Render reverse proxy                                     |
| SUPABASE_URL              | Project URL thật từ Supabase dashboard                                              |
| SUPABASE_SERVICE_ROLE_KEY | Backend service role key; không dùng anon key, không đặt trong VITE_*               |
| SUPABASE_STORAGE_BUCKET   | question-assets, phải là private bucket                                             |
| ALLOW_PRODUCTION_SEED     | false; chỉ bật rõ ràng khi muốn seed môi trường demo production                     |
| DEMO_PASSWORD             | Tùy chọn password cho account mới khi seed; trống dùng DevOnly!2026 chỉ development |
| NODE_VERSION              | Blueprint pin22.23.2; khi nâng version chạy lại full gates                          |
| TEST_DATABASE_URL         | Chỉ test command, DB riêng có chữ test trong tên; không phải app runtime env        |

### Frontend: apps/web/.env; GitHub Actions repository variables khi deploy

| Biến              | Cách điền                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------- |
| VITE_API_BASE_URL | Public backend URL kết thúc `/api/v1`, không trailing slash                               |
| VITE_SOCKET_URL   | Public backend origin, không `/api/v1` hay `/socket.io`                                   |
| VITE_BASE_PATH    | Local/custom domain `/`; project Pages `/TEN_REPOSITORY/`; workflow tự lấy Pages metadata |

VITE_* là thông tin public được đóng vào bundle. Không đặt password, DATABASE_URL hoặc service key tại đây. Thay URL phải build/deploy frontend lại.

## Supabase PostgreSQL

1. Dùng tài khoản của bạn tạo project và lưu DB password trong trình quản lý bí mật. Chọn region gần backend.
2. Trong Connect, lấy connection string đúng project/role. Persistent backend dùng direct connection nếu môi trường hỗ trợ IPv6, hoặc session pooler khi cần IPv4. Dùng direct/session connection cho DIRECT_URL chạy migrations. Đừng thay bằng transaction pooler tùy tiện: app còn dùng connect-pg-simple và Prisma transactions. Tham khảo [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres).
3. Encode ký tự đặc biệt trong password của URL. Dùng TLS theo connection settings/CA của project; không tắt TLS verification toàn process. URL/CA cần phù hợp cả Prisma CLI lẫn pg runtime.
4. Điền backend env và chạy `npm run db:generate`, `npm run db:migrate`. Migration deploy áp dụng SQL có sẵn, không yêu cầu shadow database; không chạy migrate reset hoặc db push lên dữ liệu thật.
5. Kiểm tra tables có trong public schema, gồm `session`. Prisma migrations ban đầu và integrity cần cùng được applied.

### Role và RLS

Migrations bật RLS trên 21 bảng ứng dụng, không tạo policy cho anon/authenticated. Frontend không dùng Supabase Auth/Data API. Vì vậy runtime DB role phải là chủ sở hữu bảng hoặc role server có BYPASSRLS cùng quyền DML; không kết nối bằng anonymous database role. Cách đơn giản cho project BTL riêng là chạy migration/runtime cùng trusted database role. Để tách migration/runtime, DBA cần tạo role backend BYPASSRLS, grant USAGE schema public, SELECT/INSERT/UPDATE/DELETE trên các bảng app, quyền type/sequence nếu cần, và default privileges từ migration owner cho bảng tương lai. Không grant role này cho anon/authenticated. Hướng dẫn tạo Prisma role của [Supabase](https://supabase.com/docs/guides/database/prisma) có ví dụ; credentials phải tự tạo, không copy password minh họa vào production.

Kiểm tra bằng SQL Editor (chỉ đọc):

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
SELECT current_user;
```

Không bật FORCE ROW LEVEL SECURITY nếu backend dùng table owner mà chưa thiết kế policy tương ứng. RLS không thay thế role/ownership checks của API. Runtime có tối đa 10 Prisma connections và 5 session connections mỗi process; chọn connection budget phù hợp project. Chỉ một API instance trong v1.

## Supabase private Storage

1. Tạo bucket `question-assets`, **Public bucket tắt**, MIME cho phép `image/png`, `image/jpeg`, `image/webp`, size limit5 MB. [Tạo bucket và restrictions](https://supabase.com/docs/guides/storage/buckets/creating-buckets).
2. Điền SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ở backend. Service key có đặc quyền; không cần thêm public read/insert policy vào `storage.objects`.
3. Teacher tạo câu hỏi → chọn ảnh → upload → chèn reference `asset:<uuid>` vào Markdown. API kiểm tra owner và file signature rồi ghi bucket/metadata. Student chỉ nhận signed URL sau kiểm tra snapshot/policy; URL hết hạn sau300 giây.
4. Smoke bằng project thật: upload PNG, preview, reload; xác nhận không mở được object qua public URL; Student thấy ảnh prompt trong attempt nhưng không thấy ảnh explanation trước release; Teacher khác bị từ chối. Upload >5 MB/sai MIME bị chặn; asset đã dùng trong snapshot không cho xóa.

Bước 4 còn cần chạy bằng tài khoản/project thật; provider-boundary integration đã pass nhưng không thay thế kiểm chứng external.

## Migration, seed và demo accounts

```bash
npm run db:migrate
npm run db:seed
```

Seed tạo 1 admin, 2 teacher, 12 student, 2 lớp, 2 ngân hàng, 24 câu (6 mỗi loại), 3 đề và 1 Quiz; kết quả minh họa đi qua service Start/Save/Submit thật. Idempotent theo IDs/email, không ghi đè record đã có, không reset password/lịch thi. Sau7 ngày demo exam có thể hết lịch: tạo đề mới bằng Teacher hoặc dùng database demo mới; không reset DB đang có dữ liệu cần giữ.

| Role    | Email development                          | Password mặc định development |
| ------- | ------------------------------------------ | ----------------------------- |
| ADMIN   | admin@exam.local                           | DevOnly!2026                  |
| TEACHER | teacher1@exam.local, teacher2@exam.local   | DevOnly!2026                  |
| STUDENT | student1@exam.local … student12@exam.local | DevOnly!2026                  |

Production seed bị chặn trừ khi ALLOW_PRODUCTION_SEED=true. Nếu cần demo cloud, đặt DEMO_PASSWORD riêng trước seed lần đầu và tắt flag sau đó; E2E của repo chỉ dùng test DB/password development. Không seed tài khoản mặc định vào hệ thống đang phục vụ người dùng thật. v1 không có password reset UI; DEMO_PASSWORD không cập nhật account đã tồn tại.

## Render backend

Tạo Web Service từ repository, root directory để trống (root monorepo). Có thể dùng [render.yaml](../render.yaml) qua New Blueprint, hoặc nhập thủ công:

```text
Build: npm ci --include=dev && npm run db:generate && npm run build -w @exam/api
Start: npm run db:migrate && npm run start -w @exam/api
Health Check: /api/health
```

Blueprint cấu hình Node 22.23.2, production, SESSION_SECRET generated, các credential/origin sync:false; migrations chạy trước start. Không bỏ dev dependencies vì Prisma CLI hiện nằm devDependencies và cần lúc migrate. Không đổi root thành apps/api với các commands trên. Giữ `apps/api/assets/fonts` để PDF chạy từ bundle. Không cần persistent disk vì uploads/session/data ở Supabase.

Điền DATABASE_URL, DIRECT_URL, CLIENT_ORIGIN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; giữ COOKIE_SECURE=true, TRUST_PROXY=1, ALLOW_PRODUCTION_SEED=false. PORT do Render cấp. Socket.IO dùng cùng HTTP service/port, browser URL HTTPS sẽ negotiate WSS; không mở port WebSocket riêng. Health kiểm tra process sống; sau deploy phải smoke login, DB/session và room reconnect.

Blueprint mặc định plan free để không tự chọn tài nguyên trả phí, autoDeployTrigger off; deployment là thao tác bạn chủ động trên dashboard. Free service có thể ngủ sau 15 phút không có inbound traffic, làm jobs/realtime gián đoạn; dùng instance luôn chạy cho kỳ thi thực tế. Đây là giới hạn nền tảng, không phải mất deadline đã lưu trong DB. [Render free limitations](https://render.com/docs/free). Cú pháp build/start/env theo [Blueprint reference](https://render.com/docs/blueprint-spec).

### HTTPS, CORS và cookies

- Frontend `https://OWNER.github.io/REPO/` có origin `https://OWNER.github.io` — không đưa `/REPO/` vào CLIENT_ORIGIN.
- GitHub Pages và `onrender.com` khác site: COOKIE_SAME_SITE=none, COOKIE_SECURE=true. Trình duyệt chặn third-party cookies có thể vẫn từ chối Session.
- Cấu hình ổn định hơn: frontend `https://app.example.com`, API `https://api.example.com` cùng site HTTPS, COOKIE_SAME_SITE=lax; CLIENT_ORIGIN là `https://app.example.com`. Hai domain chỉ là ví dụ, bạn phải sở hữu và cấu hình DNS thật. Cookie host-only trên API là đủ, không cần Domain cookie dùng chung.
- Nếu qua thêm proxy, xem lại TRUST_PROXY theo topology; không đặt true vô điều kiện. Frontend fetch/socket đã bật credentials.
- Không dùng `Access-Control-Allow-Origin: *` cùng cookie. Browser DevTools phải thấy SID HttpOnly; logout xóa cookie/DB session.

## GitHub Pages frontend

Workflow [pages.yml](../.github/workflows/pages.yml) chạy thủ công bằng workflow_dispatch, không tự publish khi push. CI [ci.yml](../.github/workflows/ci.yml) chạy push/PR với PostgreSQL 17 service và toàn bộ gates.

1. Push repository bằng tài khoản của bạn; Settings → Pages → Source: **GitHub Actions**. Kiểm tra CI xanh trên commit muốn deploy.
2. Settings → Secrets and variables → Actions → Variables: thêm `VITE_API_BASE_URL` là HTTPS backend `/api/v1`, `VITE_SOCKET_URL` là HTTPS backend origin. Đây là public URLs, không cần secret DB ở GitHub Pages.
3. Actions → Deploy frontend to GitHub Pages → Run workflow trên main. Workflow validates URLs, build shared/web, lấy base path từ `configure-pages`, upload dist và deploy vào environment `github-pages`.
4. Lấy URL từ job deployment/environment; đặt origin đó trong CLIENT_ORIGIN ở Render và redeploy backend nếu thay env. Mở login, đăng nhập, refresh deep route, thử Exam và Quiz.

Workflow dùng quyền contents:read; chỉ deploy job có pages:write/id-token:write. Cách dùng artifact/environment theo [GitHub custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

### SPA deep links và custom domain

Build script copy index.html thành404.html, assets chứa base path tuyệt đối. BrowserRouter dùng cùng BASE_URL. GitHub Pages trả404.html cho `/REPO/student/exams` nhưng React tiếp tục đúng route; HTTP status ban đầu vẫn404. Không có rewrite server200 ở Pages. Đã có smoke local mô phỏng static404 với production assets và basename `/project/`.

Custom domain: cấu hình trong Settings → Pages → Custom domain, xác minh quyền domain/DNS theo GitHub dashboard, bật Enforce HTTPS; cấu hình API custom domain ở Render nếu muốn cùng site. Run workflow lại sau khi Pages metadata đổi: base path lúc này là `/`. Với Actions artifact, cấu hình custom domain quản lý tại Settings; không cần hardcode CNAME trong repository. Cập nhật VITE URLs/CLIENT_ORIGIN nếu hostname thay đổi, smoke lại cookies và refresh. Không tự invent domain hoặc DNS records của tài khoản.

## Verification commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit
```

Để integration/E2E, tạo DB riêng tên có `test`, đặt TEST_DATABASE_URL trong shell qua secret manager hoặc export URL bạn quản lý; chuẩn bị schema/seed bằng cùng DB:

```bash
DATABASE_URL="$TEST_DATABASE_URL" DIRECT_URL="$TEST_DATABASE_URL" npm run db:migrate
DATABASE_URL="$TEST_DATABASE_URL" npm run db:seed
npm run test:integration
npx playwright install --with-deps chromium
npm run test:e2e
npm run test:deployment
```

`pdftotext` cần cho PDF integration (Debian/Ubuntu: `sudo apt-get install poppler-utils`). Playwright dùng ports3000/5173; deployment smoke dùng3001/5174, production API/web artifacts và static404, kiểm tra login/refresh/PDF. Chạy build trước deployment smoke. Tests không dọn toàn database; fixture có ID ngẫu nhiên. Chỉ chạy trên disposable test DB. CI tạo mới PostgreSQL service mỗi job; credential `ci-test-only` là synthetic fixture, không phải cloud secret.

## Troubleshooting và vận hành

| Triệu chứng                               | Kiểm tra/cách xử lý                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| API thiếu env / Secure cookies required   | Điền DATABASE_URL/secret32+, HTTPS origins và secure=true production                                |
| DB cannot reach / IPv6 issue              | Chọn đúng direct hoặc session pooler IPv4, network/TLS/password, project hoạt động                  |
| Session table missing / permission denied | Apply cả 2 migrations; runtime role có quyền table/session và bypass RLS phù hợp                    |
| Login200 rồi `/me`401                     | Cookie bị browser chặn, sai SameSite/secure/TRUST_PROXY, khác localhost hostname; ưu tiên cùng site |
| CSRF_INVALID / ORIGIN_REJECTED            | Load lại lấy CSRF, kiểm tra exact origin không path/trailing slash; token mới sau login             |
| Socket connect_error                      | Cookie login tồn tại, WSS URL đúng origin, CLIENT_ORIGIN đúng, tài khoản ACTIVE                     |
| Upload503/500                             | Kiểm tra Supabase URL/service key/private bucket, network; không đưa key vào client để sửa          |
| PDF font missing                          | Giữ apps/api/assets/fonts trong deploy, chạy từ workspace command hướng dẫn                         |
| Refresh Pages blank                       | base path từ metadata đúng, dist có 404.html, assets đúng URL; rebuild sau đổi domain               |
| Job/room chậm sau idle                    | Free instance sleep; kiểm tra logs/start, dùng instance luôn chạy cho demo realtime                 |
| Seed không đổi password/lịch              | Thiết kế upsert không ghi đè; tạo dữ liệu mới, không dùng reset production                          |
| npm audit khác báo cáo                    | Advisory thay đổi theo thời gian; review nâng dependency/overrides rồi chạy full gates              |

Trước migrate dữ liệu thật, backup theo project policy. Review SQL migration mới và chỉ chạy migrate deploy sau backup; rollback ứng dụng không tự rollback schema. Khi có migration lỗi, kiểm tra `_prisma_migrations`/log và xử lý migration có kiểm soát, không chạy reset để bỏ lỗi. Không triển khai nhiều replica trong v1. Theo dõi process logs, DB connection budget và credential rotation; không export log chứa Session hoặc đáp án.

## Các thao tác cần tài khoản của bạn

Tạo Supabase project/bucket, nhập DB/service credentials; tạo Render service/chọn plan; push GitHub/bật Actions/Pages/variables/run deployment; quản lý DNS/custom domains; chạy smoke Storage và browser cookies trên URLs thật. Những thao tác này chưa được thực hiện bởi agent và không được tính thành cloud verification đã pass.
