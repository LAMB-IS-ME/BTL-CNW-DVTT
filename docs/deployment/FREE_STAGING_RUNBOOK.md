# Runbook deploy staging

Hướng dẫn thao tác để deploy ExamSpace lên Render (gói free) + Supabase. Giải thích chi tiết và troubleshooting xem trong [DEPLOYMENT](../DEPLOYMENT.md); bảng biến môi trường xem trong [environment matrix](ENVIRONMENT_MATRIX.md).

| Mục | Giá trị |
| --- | --- |
| URL staging | https://examspace-staging-rc.onrender.com |
| Kiến trúc | Một Render Web Service phục vụ SPA + REST + Socket.IO cùng origin |
| Service | `examspace-staging-rc` |
| Nguồn | Public Git Repository `https://github.com/LAMB-IS-ME/BTL-CNW-DVTT`, branch `main` |
| Region / plan | Singapore / Free |
| Deploy | Auto-deploy **tắt**; deploy bằng **Manual Deploy** trên dashboard |
| Commit đang chạy | `8afb7b2` (merge PR #1); `/api/health` trả ok ngày 20/11/2026 |
| DB / Storage | Supabase PostgreSQL (session pooler) + bucket private `question-assets` |

Luôn lấy URL thật của service từ dashboard Render.

## 1. Build và start

Các lệnh khớp với `render.yaml` và cấu hình trên dashboard, chạy ở root monorepo:

```sh
npm ci --include=dev
npm run db:generate
npm run build
# Start: không migrate, không seed
CLIENT_ORIGIN="$RENDER_EXTERNAL_URL" npm run start -w @exam/api
```

- Node ≥22.12; service và `render.yaml` ghim `22.23.2`.
- API chạy từ `apps/api/dist/server.js`; SPA nằm ở `apps/web/dist`, được Express phục vụ khi `SERVE_WEB=true`.
- HTTP và WSS dùng chung port do Render cấp.
- `/api/health` chỉ cho biết process còn sống, không kiểm tra DB.
- Không dùng Vite dev/preview làm server production.

## 2. Biến môi trường trên Render

| Biến | Giá trị |
| --- | --- |
| NODE_ENV / SERVE_WEB | `production` / `true` |
| DATABASE_URL | Secret. Session pooler của Supabase; giữ xác minh TLS |
| DIRECT_URL | Secret. Kết nối cho Prisma CLI khi migrate |
| SESSION_SECRET | Đã đặt trên service. **Không tạo lại** khi redeploy |
| CLIENT_ORIGIN | Không nhập; lệnh start lấy từ `RENDER_EXTERNAL_URL` |
| COOKIE_SECURE / COOKIE_SAME_SITE / TRUST_PROXY | `true` / `lax` / `1` |
| SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY | URL project / service role key, chỉ để ở backend |
| SUPABASE_STORAGE_BUCKET | `question-assets` |
| NODE_EXTRA_CA_CERTS | `/opt/render/project/src/apps/api/assets/certs/supabase-prod-ca-2021.crt` |
| VITE_API_BASE_URL / VITE_SOCKET_URL / VITE_BASE_PATH | `/api/v1` / chuỗi rỗng / `/` |
| ALLOW_PRODUCTION_SEED | `false` |

Chỉ cần nhập tay 4 secret: `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## 3. Database

- Có đúng hai migrations: `20260930000000_initial` và `20260930010000_integrity`. Bản sửa builder và ảnh không thêm migration mới.
- **Trước khi migrate:** backup; kiểm tra `_prisma_migrations` trên DB đích; đọc SQL đang chờ.
- Chỉ chạy `npm run db:migrate` với đúng `DIRECT_URL`/`DATABASE_URL` của DB đích. Lệnh này chỉ áp dụng migration đang chờ, không reset.
- Nếu DB đã có đủ 2 migrations thì bỏ qua bước này; không seed lại dữ liệu demo.

## 4. Các bước deploy

1. Chạy `npm run lint`, `npm run typecheck`, `npm test` và để CI chạy xanh trên commit định deploy.
2. Merge vào `main` (qua PR), rồi trên dashboard service `examspace-staging-rc` bấm **Manual Deploy → Deploy latest commit**, hoặc chọn commit cụ thể.
3. Kiểm tra biến môi trường như mục 2, rồi migrate nếu cần (mục 3).
4. Deploy, theo dõi log build và start, đợi health check xanh.
5. Kiểm tra sau deploy:
   - `GET /api/health` trả `{"data":{"status":"ok","service":"exam-api"}}`.
   - Đăng nhập bằng từng role; reload trang; đăng xuất.
   - Mở trực tiếp một route sâu (ví dụ `/student/exams`) và refresh.
   - Giảng viên upload ảnh; sinh viên xem được ảnh trong bài; URL public của object bị từ chối.
   - Làm một bài thi: autosave, nộp bài, xem kết quả; xuất PDF và Excel.
   - Live Quiz: tạo phòng, sinh viên tham gia, tắt mạng rồi bật lại để kiểm tra kết nối lại.
   - Restart service rồi kiểm tra session và dữ liệu vẫn còn.

## 5. Giới hạn gói free và rollback

- **Render Free:** ngủ sau 15 phút không có truy cập, khởi động lại mất khoảng một phút; filesystem tạm thời; có thể restart bất kỳ lúc nào. Không dùng cho kỳ thi thật.
- **Supabase Free:** 500 MB DB, 1 GB Storage; project bị pause sau một tuần không hoạt động.
- **Rollback:** chọn lại bản deploy trước trên dashboard; giữ nguyên `SESSION_SECRET` và URL DB. Schema không tự rollback.
- Không deploy hay restart khi đang có ca thi hoặc Quiz.

## Lịch sử

Runbook và báo cáo của các lượt deploy tháng 10/2026 trên URL cũ `examspace-staging.onrender.com`:
- [Runbook lịch sử](../archive/deployment/FREE_STAGING_RUNBOOK_HISTORY.md)
- [Báo cáo deploy](../archive/deployment/FREE_STAGING_DEPLOYMENT_REPORT.md)
- Evidence trong [free-staging-evidence/](free-staging-evidence/) và [free-staging-verification.json](free-staging-verification.json)
