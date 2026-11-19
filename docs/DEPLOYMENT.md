# Triển khai ExamSpace

## Tổng quan

ExamSpace deploy thành **một Render Web Service** (`render.yaml`):

- Lệnh build tạo `apps/api/dist` và `apps/web/dist`.
- Khi start, Express phục vụ SPA (`SERVE_WEB=true`), REST `/api/v1` và Socket.IO trên cùng một origin và cùng một port.
- PostgreSQL (dữ liệu và session) và Storage (ảnh câu hỏi) dùng Supabase.

**Staging hiện tại:** https://examspace-staging-rc.onrender.com

Các bước thao tác deploy nằm trong [runbook](deployment/FREE_STAGING_RUNBOOK.md); bảng biến môi trường chi tiết nằm trong [environment matrix](deployment/ENVIRONMENT_MATRIX.md). GitHub Pages chỉ là [phương án phụ](#phương-án-phụ-github-pages--api-tách-origin).

## Chạy local

Cần Node 22 LTS (≥22.12), npm và PostgreSQL UTF8, hoặc một Supabase project dùng cho development. Không dùng DB production để test.

```bash
npm ci
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Dán chuỗi vừa sinh vào `SESSION_SECRET` trong `apps/api/.env`, rồi điền `DATABASE_URL`. `DIRECT_URL` có thể để trống nếu cùng kết nối đó migrate được. Giữ các giá trị local: `CLIENT_ORIGIN=http://localhost:5173`, `COOKIE_SECURE=false`, `COOKIE_SAME_SITE=lax`, `TRUST_PROXY=0`. Không dùng lẫn `localhost` và `127.0.0.1` trên trình duyệt, vì cookie sẽ không khớp.

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Web ở `http://localhost:5173`, API ở `http://localhost:3000`, health ở `/api/health`. Có thể chạy riêng `npm run dev -w @exam/api` và `npm run dev -w @exam/web` ở hai terminal. Bảng session do migrations tạo, nên không được bỏ bước migrate.

Thiếu cấu hình Supabase Storage thì các luồng không có ảnh vẫn chạy; upload trả `503 STORAGE_NOT_CONFIGURED`. Thêm biến xong thì restart backend.

## Biến môi trường

### Backend (`apps/api/.env` hoặc Render Environment)

| Biến | Giá trị |
| --- | --- |
| NODE_ENV | `development` local, `production` trên Render |
| SERVE_WEB | `false` local (Vite dev server); `true` trên Render để Express phục vụ `apps/web/dist` |
| PORT | 3000 local; Render tự cấp |
| DATABASE_URL | Secret. Kết nối PostgreSQL cho dữ liệu và session |
| DIRECT_URL | Secret. Chỉ Prisma CLI dùng (migrate); để trống thì dùng DATABASE_URL |
| SESSION_SECRET | Secret, ≥32 ký tự. Giữ nguyên giữa các lần redeploy; đổi sẽ làm mọi phiên đăng nhập mất hiệu lực |
| SESSION_COOKIE_NAME / SESSION_MAX_AGE_MS | Mặc định `online_exam_sid` / `28800000` (8 giờ) |
| CLIENT_ORIGIN | Origin chính xác, không path, không dấu `/` cuối. Trên Render, lệnh start tự gán từ `RENDER_EXTERNAL_URL`, không cần nhập |
| COOKIE_SECURE | `false` local, `true` khi chạy HTTPS |
| COOKIE_SAME_SITE | `lax` (local và cùng origin). Chỉ dùng `none` cho phương án tách origin |
| TRUST_PROXY | `0` local; `1` trên Render (một reverse proxy) |
| SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY | URL project / service role key, chỉ để ở backend |
| SUPABASE_STORAGE_BUCKET | `question-assets`, bucket private |
| NODE_EXTRA_CA_CERTS | Trên Render: `/opt/render/project/src/apps/api/assets/certs/supabase-prod-ca-2021.crt` |
| ALLOW_PRODUCTION_SEED | `false`. Chỉ bật tạm khi cố ý seed môi trường demo |
| DEMO_PASSWORD | Tùy chọn: mật khẩu cho tài khoản **mới** khi seed. Để trống thì dùng `DevOnly!2026` (chỉ cho development) |
| NODE_VERSION | Blueprint ghim `22.23.2` |
| TEST_DATABASE_URL | Chỉ dùng khi chạy test: DB riêng có chữ `test` trong tên |

### Frontend (biến public, đóng vào bundle lúc build)

| Biến | Cùng origin (mặc định) | Tách origin (phương án phụ) |
| --- | --- | --- |
| VITE_API_BASE_URL | `/api/v1` | `https://<backend>/api/v1` |
| VITE_SOCKET_URL | chuỗi rỗng | `https://<backend>` |
| VITE_BASE_PATH | `/` | `/<tên-repo>/` với Pages, workflow tự lấy |

`VITE_*` là thông tin công khai; không đặt password, `DATABASE_URL` hay service key vào đây. Đổi giá trị thì phải build lại.

## Supabase PostgreSQL

1. Tạo project, lưu mật khẩu DB vào trình quản lý bí mật, chọn region gần Render (staging dùng Singapore).
2. Trong mục Connect, lấy connection string. Dùng direct connection nếu môi trường hỗ trợ IPv6, hoặc **session pooler** nếu cần IPv4. Không dùng transaction pooler, vì app dùng `connect-pg-simple` và Prisma interactive transactions. Xem thêm [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres).
3. Encode ký tự đặc biệt trong mật khẩu khi ghép vào URL. Giữ xác minh TLS; trên Render, CA được nạp qua `NODE_EXTRA_CA_CERTS`.
4. Chạy `npm run db:generate` và `npm run db:migrate`. Không chạy `migrate reset` hay `db push` trên dữ liệu thật.

**RLS:** migrations bật RLS trên 21 bảng ứng dụng và không tạo policy cho `anon`/`authenticated`, vì frontend không dùng Supabase Auth hay Data API. Runtime role phải là chủ sở hữu bảng hoặc có `BYPASSRLS` kèm quyền DML. Cách đơn giản nhất là dùng chung một role tin cậy cho migrate và runtime. Không bật `FORCE ROW LEVEL SECURITY`. Mỗi process dùng tối đa 10 kết nối Prisma và 5 kết nối session; chỉ chạy một API instance.

## Supabase Storage

1. Tạo bucket `question-assets`, **tắt Public bucket**, chỉ cho phép `image/png`, `image/jpeg`, `image/webp`, giới hạn 5 MB.
2. Điền `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` ở backend. Không cần thêm policy cho `storage.objects`.
3. Luồng ảnh: giảng viên upload qua API; API kiểm tra quyền sở hữu và chữ ký file, rồi chèn `asset:<uuid>` vào Markdown. Người xem nhận signed URL hạn 300 giây sau khi được kiểm tra quyền. Ảnh tải lỗi có nút **Thử lại** để xin URL mới.
4. Asset đang được đề đã publish tham chiếu thì không xóa được (`409 ASSET_REFERENCED`).

## Migration và seed

```bash
npm run db:migrate
npm run db:seed
```

- Có hai migrations: `20260930000000_initial` và `20260930010000_integrity` (bảng session, ràng buộc, index, RLS).
- **Trước khi migrate dữ liệu thật:** backup, đọc SQL các migration đang chờ, kiểm tra bảng `_prisma_migrations`. Rollback ứng dụng không tự rollback schema.
- **Seed:** tạo dữ liệu demo như liệt kê trong README. Seed idempotent theo ID/email, không ghi đè bản ghi đã có, không đổi mật khẩu hay lịch thi. Nếu seed bị lỗi giữa chừng, chạy lại sẽ tiếp tục lượt làm bài demo đang dở và giữ deadline gốc.
- **Transaction:** interactive transactions dùng `maxWait` 5 giây, `timeout` 15 giây, để chịu được độ trễ mạng tới Supabase.
- **Production:** seed bị chặn trừ khi `ALLOW_PRODUCTION_SEED=true`. Nếu cần demo trên cloud: đặt `DEMO_PASSWORD` riêng trước lần seed đầu, rồi tắt flag. Không seed tài khoản mặc định vào hệ thống có người dùng thật. v1 chưa có chức năng đặt lại mật khẩu.
- Đề demo có lịch 7 ngày; hết hạn thì tạo đề mới bằng tài khoản giảng viên.

## Render: SPA + API cùng origin

Tạo service bằng **New → Blueprint** từ `render.yaml`, hoặc nhập thủ công với root directory để trống (root monorepo):

```text
Build:        npm ci --include=dev && npm run db:generate && npm run build
Start:        CLIENT_ORIGIN="$RENDER_EXTERNAL_URL" npm run start -w @exam/api
Health check: /api/health
```

- Blueprint đặt sẵn `NODE_ENV=production`, `SERVE_WEB=true`, `COOKIE_SECURE=true`, `COOKIE_SAME_SITE=lax`, `TRUST_PROXY=1`, `VITE_API_BASE_URL=/api/v1`, `VITE_SOCKET_URL=""`, `VITE_BASE_PATH=/`, `NODE_EXTRA_CA_CERTS`, và tự sinh `SESSION_SECRET` cho service mới.
- **Chỉ cần nhập:** `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Lệnh start **không** migrate hay seed; chạy migrate riêng sau khi đã review. Giữ dev dependencies trong bước build, vì Prisma CLI và Vite cần chúng. Giữ `apps/api/assets/fonts` để xuất PDF.
- Auto-deploy đang tắt và Blueprint trỏ tới branch `deploy/examspace-free-staging`. Trước mỗi lần deploy, cập nhật branch đó hoặc chọn đúng commit trên dashboard.
- Gói free ngủ sau 15 phút không có truy cập: jobs và realtime dừng cho tới khi có request mới. Kỳ thi thật cần instance chạy liên tục. Xem [Render free](https://render.com/docs/free) và [Blueprint spec](https://render.com/docs/blueprint-spec).

**Cookie khi cùng origin:** session cookie là host-only, `HttpOnly`, `Secure`, `SameSite=lax`. Socket.IO dùng chung origin nên trình duyệt tự nâng lên WSS. Không dùng `Access-Control-Allow-Origin: *`.

**Sau mỗi lần deploy, kiểm tra:**
- `/api/health`;
- đăng nhập, reload trang, đăng xuất;
- mở trực tiếp một route sâu, ví dụ `/student/exams`;
- tham gia phòng Quiz và kết nối lại;
- upload rồi xem ảnh.

## Phương án phụ: GitHub Pages + API tách origin

Chỉ dùng khi bắt buộc phải tách frontend ra GitHub Pages. Workflow [pages.yml](../.github/workflows/pages.yml) chạy thủ công (`workflow_dispatch`).

1. Settings → Pages → Source: **GitHub Actions**.
2. Settings → Variables: `VITE_API_BASE_URL` (HTTPS backend kết thúc bằng `/api/v1`) và `VITE_SOCKET_URL` (HTTPS origin của backend).
3. Chạy workflow "Deploy frontend to GitHub Pages". Workflow tự lấy base path và sao chép `index.html` thành `404.html` để deep link vẫn mở được (HTTP status ban đầu vẫn là 404).
4. Trên backend: `SERVE_WEB=false`, `CLIENT_ORIGIN=https://<owner>.github.io` (không kèm `/<repo>/`), `COOKIE_SAME_SITE=none`, `COOKIE_SECURE=true`.

Rủi ro: `github.io` và `onrender.com` khác site, nên trình duyệt chặn cookie bên thứ ba có thể làm đăng nhập thất bại. Nếu bắt buộc tách origin, nên dùng hai subdomain của cùng một domain sở hữu (ví dụ `app.` và `api.`) với `SameSite=lax`.

## Kiểm thử

```bash
npm run db:generate
npm run lint
npm run typecheck
npm test
npm run build
npm audit --audit-level=low
```

Integration và E2E chạy trên một DB test riêng (loopback, tên chứa `test`):

```bash
export DOTENV_CONFIG_PATH=/dev/null
export DATABASE_URL="$TEST_DATABASE_URL" DIRECT_URL="$TEST_DATABASE_URL"
export NODE_ENV=test
unset SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY DEMO_PASSWORD
npm run db:migrate
npm run db:seed
npm run test:integration
npx playwright install --with-deps chromium
npm run test:e2e
npm run test:deployment
```

- Cần `pdftotext` (`sudo apt-get install poppler-utils`).
- Playwright dùng cổng 3000/5173; deployment smoke dùng 3001/5174 và cần build trước.
- `test:e2e` chạy 4 nhóm, mỗi nhóm có server và bộ đếm rate-limit riêng: core, Student Exam, Session Recovery, Builder blockers.
- `node tests/deployment/production-readiness.mjs` chạy thêm với `NODE_ENV=production` và TLS tự ký local (cần openssl, cổng 3002/5443/5444). Bước này không thay cho kiểm tra trên staging.
- Script `tests/deployment/hosted-*.mjs` dùng để kiểm tra staging thật: chúng tạo tài khoản fixture và cần `DEMO_PASSWORD`. Chỉ chạy khi đã thống nhất trong nhóm.
- CI (`ci.yml`) tạo PostgreSQL mới cho mỗi job; mật khẩu `ci-test-only` là giá trị giả.

## Troubleshooting

| Triệu chứng | Kiểm tra |
| --- | --- |
| API báo thiếu env / "Secure cookies required" | `DATABASE_URL`, `SESSION_SECRET` ≥32 ký tự; production bắt buộc HTTPS origin và `COOKIE_SECURE=true` |
| Không kết nối được DB / lỗi IPv6 | Chọn direct hoặc session pooler (IPv4), kiểm tra mật khẩu, TLS, project có bị pause |
| Thiếu bảng session / permission denied | Đã áp dụng đủ 2 migrations chưa; runtime role có quyền DML và bypass RLS |
| Login 200 rồi `/me` trả 401 | Cookie bị chặn: sai `SameSite`/`Secure`/`TRUST_PROXY`, hoặc dùng lẫn localhost và 127.0.0.1 |
| `CSRF_INVALID` / `ORIGIN_REJECTED` | Tải lại trang để lấy CSRF mới; `CLIENT_ORIGIN` phải khớp chính xác origin |
| Socket `connect_error` | Đã đăng nhập chưa, tài khoản có ACTIVE, `CLIENT_ORIGIN` đúng |
| Upload 503/500 | `SUPABASE_URL`, service key, bucket private tồn tại |
| Ảnh hiện lỗi, bấm Thử lại vẫn lỗi | Object trong Storage còn không, signed URL có bị proxy chặn |
| Thiếu font khi xuất PDF | Giữ `apps/api/assets/fonts` trong artifact |
| Prisma P2028 (transaction timeout) khi seed hoặc nộp bài | Mạng tới Supabase chậm; kiểm tra region và pooler. Timeout hiện là 15 giây |
| Trang trắng khi refresh (Pages) | Base path đúng, `dist` có `404.html` |
| Job hoặc phòng Quiz chậm sau thời gian không dùng | Instance free vừa thức dậy; xem log khởi động |
| `npm audit` khác lần trước | Advisory thay đổi theo thời gian; review nâng dependency rồi chạy lại toàn bộ kiểm thử |

## Vận hành

- Không deploy trong lúc đang có ca thi hoặc Quiz: khi khởi động, server đặt lại trạng thái online của mọi người chơi Quiz.
- Không chạy nhiều replica trong v1.
- Theo dõi log process, số kết nối DB, và định kỳ đổi credential. Không xuất log chứa session hay đáp án.
- Mọi thao tác trên cloud (deploy, migrate, đổi secret) cần thống nhất trong nhóm trước khi làm.
