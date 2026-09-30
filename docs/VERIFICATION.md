# Verification & Definition of Done audit

Đối chiếu trực tiếp Section 42 của MASTER_SPEC.md với source hiện tại. Mỗi checkbox bên dưới giữ nguyên nội dung yêu cầu; `[x]` nghĩa là phần implementation đã có và bằng chứng tương ứng đã được kiểm tra, không có nghĩa cloud đã được triển khai. MASTER_SPEC.md gốc không bị sửa.

Bản kiểm chứng: 2026-09-30; source commit `07f02c3`. Kiểm tra secret theo file env và các credential patterns không có finding; test/demo passwords được ghi rõ là synthetic development. Whitespace gốc trong MASTER_SPEC, license font và SQL generated được giữ nguyên.

## Full verification

| Gate                     | Kết quả                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| npm run lint             | PASS                                                                    |
| npm run typecheck        | PASS; gồm app, integration và E2E TypeScript                            |
| npm test                 | PASS — 22 tests / 11 files (unit/frontend)                              |
| npm run test:integration | PASS — 17 tests / 9 files, PostgreSQL thật                              |
| npm run test:e2e         | PASS — 3 tests, Chromium thật                                           |
| npm run build            | PASS shared/API/web production; có cảnh báo lazy Markdown chunk >500 kB |
| npm run test:deployment  | PASS production bundles, subpath404, refresh/login và PDF               |
| npm audit                | 0 vulnerabilities tại lần kiểm tra                                      |

Integration 17 gồm: auth 4, catalog 2, exam 1, attempts 3, grading 1, socket 2, exports 1, quiz 2, Storage boundary 1. Trong 17 có 2 Exam Socket tests và 1 Quiz Socket flow test; Quiz suite còn 1 REST test từ chối essay (không cộng trùng). Một Storage test thay external SDK provider; DB vẫn thật. Tổng 42 automated cases unit/integration/E2E, cộng 1 deployment smoke scenario đã pass.

### Browser flows đã chạy

1. Teacher/Student đăng nhập ở contexts độc lập; tạo Exam qua REST thật, Start UI, autosave, refresh giữ đáp án, monitor realtime, submit, teacher chấm essay, student thấy 4.5/5.
2. Teacher tạo Quiz/phòng, Student join, lobby, Start, gửi đáp án, reveal/final leaderboard; reload phục hồi state.
3. Viewport 390×844: đăng nhập, server-backed role guard, không tràn ngang.
4. Deployment smoke dùng web production với basename `/project/`, static server trả404.html, API `dist/server.js`: deep link/reload, Session login và PDF font từ bundle.

### Môi trường và phạm vi bằng chứng

Node 22.23.2; PostgreSQL 17.6 test UTF8 local, hai migrations applied; seed thật. PostgreSQL embedded chỉ là công cụ ngoài repository để dựng test DB, không là dependency sản phẩm. CI dùng official postgres:17 service. Chromium cài qua Playwright; PDF đọc bằng pdftotext. Credentials test là synthetic local, không phải Supabase.

Không skip failing test. Production artifact smoke chạy HTTP local với NODE_ENV=test để kiểm tra bundle/font/routing, không giả định đã kiểm chứng Render TLS. UI screenshot trong docs/screenshots từ E2E thật.

## Đối chiếu từng checkbox

### Auth

Implementation: `modules/auth`, `app.ts`, `middleware`. Bằng chứng: auth.integration.test.ts; password.test.ts; socket.integration.test.ts.

- [x] Student register/login/logout hoạt động.
- [x] Session persist server-side.
- [x] Cookie HttpOnly.
- [x] RBAC server-side.
- [x] Locked account bị chặn.
- [x] CSRF protection cho mutation.

### Admin

Implementation: `modules/admin/routes.ts`, `web/features/admin.tsx`. Bằng chứng: auth.integration.test.ts; review danh sách/overview routes.

- [x] User list/search.
- [x] Create user.
- [x] Lock/unlock.
- [x] Role management.

### Teacher Class

Implementation: `modules/classes/routes.ts`, `web/features/catalog.tsx`. Bằng chứng: catalog.integration.test.ts; Exam E2E fixture.

- [x] CRUD/archive Class.
- [x] Add/remove Student.

### Question Bank

Implementation: `modules/question-banks`, `modules/storage`, `web/components/Markdown.tsx`. Bằng chứng: catalog.integration.test.ts; storage.integration.test.ts; Markdown.test.tsx; question.test.ts.

- [x] CRUD bank/question.
- [x] 4 question types.
- [x] Markdown.
- [x] LaTeX.
- [x] code block.
- [x] image upload. — Upload/signing/permission được test với provider double và DB thật; **Supabase network roundtrip còn chờ credentials**. Không mock runtime.

### Exam

Implementation: `modules/exams`, `web/features/exams.tsx`. Bằng chứng: exams.integration.test.ts; selection.test.ts; attempts.integration.test.ts.

- [x] Create/edit/publish.
- [x] Assign Class.
- [x] fixed questions.
- [x] random pool.
- [x] shuffle questions.
- [x] shuffle options.
- [x] attempts setting.
- [x] result strategy.
- [x] result release settings.

### Student Exam

Implementation: `modules/attempts`, `jobs/expiry.ts`, `web/features/attempts.tsx`. Bằng chứng: attempts.integration.test.ts; attempts/logic.test.ts; timer.test.ts; Exam E2E.

- [x] eligibility.
- [x] start.
- [x] server timer.
- [x] autosave.
- [x] reconnect/resume.
- [x] manual submit.
- [x] auto submit.
- [x] objective auto-grade.

### Monitoring

Implementation: `sockets/server.ts`, `sockets/presence.ts`, `web/features/results.tsx`. Bằng chứng: socket.integration.test.ts; critical.test.tsx; Exam E2E.

- [x] NOT_STARTED.
- [x] IN_PROGRESS.
- [x] DISCONNECTED.
- [x] SUBMITTED.
- [x] realtime update.

### Essay

Implementation: `modules/grading/routes.ts`, `web/features/results.tsx`. Bằng chứng: grading.integration.test.ts; Exam E2E.

- [x] Teacher manual grade.
- [x] feedback.
- [x] final score update.

### Result

Implementation: `modules/results`, `web/features/results.tsx`. Bằng chứng: results/logic.test.ts; grading.integration.test.ts; storage.integration.test.ts; Exam E2E.

- [x] release modes.
- [x] correct answer visibility.
- [x] explanation visibility.
- [x] attempt strategy.
- [x] student result page.

### Analytics/export

Implementation: `modules/analytics`, `modules/exports`, `web/features/analytics.tsx`. Bằng chứng: exports.integration.test.ts: ExcelJS + pdftotext; source review chart/pagination.

- [x] average/high/low/pass.
- [x] distribution chart.
- [x] per-question rate.
- [x] Excel.
- [x] Unicode Vietnamese PDF.

### Live Quiz

Implementation: `modules/live-quiz`, `sockets/quiz.ts`, `web/features/quiz.tsx`. Bằng chứng: quiz.integration.test.ts; live-quiz/logic.test.ts; Quiz E2E; CSS reduced-motion review.

- [x] Teacher create Quiz.
- [x] create Room.
- [x] logged-in Student join by code.
- [x] realtime lobby.
- [x] start.
- [x] synchronized question.
- [x] server deadline.
- [x] server scoring.
- [x] reveal.
- [x] leaderboard.
- [x] final result.
- [x] reconnect state recovery.
- [x] restrained animation. — CSS transition/animation và prefers-reduced-motion; ảnh E2E lấy khi animation hoàn tất.

### Engineering

Implementation: Repository, scripts, workflows và docs. Bằng chứng: Full verification bên trên; review source và Git.

- [x] migrations committed. — Hai SQL migrations initial/integrity đã commit trong apps/api/prisma/migrations; source commit `07f02c3`.
- [x] seed data.
- [x] env examples.
- [x] no committed secrets. — Env examples rỗng; .env/generated/build/node_modules ignored. Test passwords synthetic được ghi rõ.
- [x] lint pass.
- [x] typecheck pass.
- [x] tests pass.
- [x] build pass.
- [x] GitHub Pages workflow. — pages.yml workflow_dispatch; production build + subpath404/refresh smoke local. Chưa publish lên GitHub.
- [x] Render-ready API. — render.yaml;0.0.0.0/PORT, shared HTTP/WSS, health, HTTPS cookie/CORS env. Bundle smoke local; chưa deploy Render.
- [x] README complete. — README.md: quick start, demo, commands, screenshots, deploy/docs links.
- [x] docs/SRS.md. — SRS 15 phần, FR IDs và traceability.
- [x] docs/SDD.md. — SDD 27 phần, Context/Container/Component/ERD/sequences/state diagrams.
- [x] docs/DEPLOYMENT.md. — Local, Supabase/RLS/Storage, Render/cookie, Pages/custom domain, troubleshooting.

## Kiểm chứng external chưa thực hiện

- Supabase Storage thật: upload/private object/signed URL qua network và cấu hình bucket của người dùng.
- Supabase hosted migration/runtime permissions/TLS/connection pool với credentials thật.
- Render deployed health/login/WSS/restart và GitHub Pages published URL/custom DNS/cookie trên browser người dùng.
- GitHub Actions chạy trên GitHub runner; commands tương ứng đã chạy local, chưa claim workflow run cloud.

Các bước này cần người dùng tạo/cấp tài khoản; hướng dẫn và lệnh có trong DEPLOYMENT.md. Không có secret giả, mock final flow hoặc button Core placeholder để che phần external chưa xác minh.

## Giới hạn còn lại

Một API instance; presence/rate limit trong memory. Free hosting sleep làm job xử lý trễ nhưng không nhận đáp án muộn. Browser third-party cookie có thể chặn cross-site Session; nên dùng app/API cùng site HTTPS. Chưa load test hay screen-reader/WCAG audit. Export giữ workbook/PDF trong memory; Markdown chunk còn lớn; pg8 phát deprecation warning queued transaction queries. Chi tiết thiết kế và tradeoffs ở SDD.md.

## Lặp lại nghiệm thu

Xem DEPLOYMENT.md → Verification commands. Dùng DB test riêng đã migrate/seed, có Chromium và poppler-utils. Chạy lint, typecheck, unit, integration, build, E2E, deployment smoke, audit. Không chạy test vào production DB.
