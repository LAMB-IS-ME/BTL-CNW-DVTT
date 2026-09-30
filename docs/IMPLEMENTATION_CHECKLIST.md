# Implementation checklist

Nguồn yêu cầu: MASTER_SPEC.md và ASTRA_MASTER_PROMPT.md (đã đọc đầy đủ).
Repository ban đầu: LICENSE và hai tài liệu; chưa có ứng dụng. Runtime hiện có Node 22.23.2 LTS.

Mỗi phase phải qua lint, typecheck và relevant tests trước phase tiếp theo. Không đánh dấu hoàn tất khi chưa có bằng chứng.

- [x] Phase 0: npm workspaces, strict TypeScript, lint, env validation/examples, base UI, Express health, toàn bộ Prisma schema/migration, CI.
- [x] Phase 1: Argon2id, register/login/logout/me/csrf, PostgreSQL sessions, RBAC, locked account, Admin user management và UI.
- [x] Phase 2: Class/roster, Question Bank/4 question types, Markdown/GFM/LaTeX/code preview, private Supabase image upload.
- [x] Phase 3: Exam CRUD/builder/preview, assign classes, fixed + random pools, schedule/settings/publish validation.
- [x] Phase 4: eligibility, transaction-safe start, snapshot/shuffle, timer, autosave/resume, idempotent submit, expiry job, grading.
- [x] Phase 5: authenticated Socket presence/grace period/monitor, essay grading/feedback, release policies, student results/history.
- [x] Phase 6: final-attempt analytics/distribution/question rates, Excel, Vietnamese Unicode PDF.
- [x] Phase 7: Quiz builder, room codes/lobby, snapshot/state machine, deadlines/scoring/reveal/leaderboard/reconnect, UI animation.
- [x] Phase 8: security review, unit/API/socket/frontend/E2E tests, responsive/accessibility/error UX, full verification và DoD audit.
- [x] Phase 9: GitHub Pages SPA fallback/workflow, Render readiness, README, docs/SRS.md, docs/SDD.md, docs/DEPLOYMENT.md.

## Verification log

Các kết quả đã chạy ghi bên dưới. Supabase credential chưa được cung cấp; không tự tạo credential. Integration suite sẽ dùng PostgreSQL test riêng khi khả dụng; Storage thật cần project Supabase của người dùng.

Phase 0: lint/typecheck/3 tests/build pass; Prisma client 7.10.0 generated, initial SQL đã tạo trong repository.

Phase 1: lint/typecheck, 4 unit + 3 PostgreSQL API integration tests pass.

Phase 2: lint/typecheck, 5 unit + 4 PostgreSQL API tests pass. Supabase Storage external verification pending credentials.

## Nhật ký tiếp tục trước đây

Đã đối chiếu ghi chú đính kèm với source, Git, scripts, schema/migration và các tests. Không khởi tạo lại project. Phase 2: bổ sung test upload/preview và build; Phase 3 backend đã bắt đầu, UI/tests chưa hoàn tất. Tại thời điểm ghi chú này, Phase 4–9 chưa triển khai; xem checklist hiện tại phía trên.

Phase 2 re-verification: lint/typecheck/build pass; 6 unit/frontend + 5 PostgreSQL integration tests pass. Database test đã phục hồi từ migration (UTF8).

Phase 3: lint/typecheck/build pass; 9 unit/frontend + 6 PostgreSQL integration tests pass.

Phase 4: lint/typecheck/build pass; 14 unit/frontend + 9 PostgreSQL integration tests pass, gồm concurrent Start và expiry commit.

Phase 5: lint/typecheck/build pass; 16 unit/frontend + 12 API/socket integration tests pass.

Phase 6: lint/typecheck/build pass; 16 unit/frontend + 13 integration tests pass. Excel được đọc lại bằng ExcelJS; PDF được pdftotext kiểm tra cả hai tên tiếng Việt yêu cầu.

Phase 7: lint/typecheck/build pass; 17 unit/frontend + 15 API/socket integration tests pass.

Phase 8: lint/typecheck/build pass; 22 unit/frontend + 17 integration (gồm socket và Storage provider boundary) + 3 Playwright Chromium E2E pass. npm audit: 0 vulnerabilities. Ảnh minh họa là screenshot E2E thật.

Phase 9: GitHub Pages workflow_dispatch với metadata base path/404 fallback; Render blueprint; CI PostgreSQL 17 + integration/E2E/deployment smoke; README/SRS/SDD/DEPLOYMENT/VERIFICATION hoàn tất. Production artifacts smoke đã pass với deep route subpath, refresh, Session login và PDF font.

Final audit: đối chiếu trực tiếp 80 checkbox DoD; source Core hoàn tất. Supabase external Storage, hosted DB và cloud deployment chưa được xác nhận vì chưa có credentials/tài khoản; xem VERIFICATION.md.
