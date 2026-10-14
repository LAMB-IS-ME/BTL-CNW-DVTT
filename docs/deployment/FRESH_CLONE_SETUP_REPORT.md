# Fresh-clone setup report — 2026-10-14

> Snapshot trước commit tại baseline `864633b`. User đã duyệt cleanup và đúng một local commit; các trạng thái “chưa commit” bên dưới ghi nhận checkpoint cũ, không mô tả HEAD của một clone về sau. Xem [cleanup gate](evidence/commit-cleanup.json). Kết quả post-commit được báo riêng sau khi clone NEW HEAD; không ghi PASS trước khi thực hiện.

## Kết luận và provenance

**Runtime local tái tạo được từ committed source. Bàn giao tài liệu tại HEAD còn thiếu MASTER_SPEC.** Bản sửa tài liệu/test đã chuẩn bị nhưng chưa stage/commit. Không gọi prepared overlay là clone của một commit đã chứa các sửa đổi.

Repository `LAMB-IS-ME/BTL-CNW-DVTT`, branch `ux/education-saas-redesign-pilot`, HEAD `864633b93505fdeebb8c2ca15b0b0c3278a3de9d`. Baseline có 368 tracked files, 0 tracked modifications, 0 staged changes, 85 historical untracked files. Xem [Git baseline](evidence/git-baseline.json).

| Môi trường | Nguồn / nội dung | Kết quả và giới hạn |
| --- | --- | --- |
| Original fresh clone ban đầu | `<audit-scratch>/clone`, `git clone --no-local --no-hardlinks` từ repository local | Tracked committed source; không copy `.env`, node_modules hoặc artifacts local. Quality/install/DB/browser tests PASS; hai links tới MASTER_SPEC hỏng. |
| Prepared fresh clone ban đầu | `<audit-scratch>/candidate`, clone riêng + explicit overlay tài liệu/examples/probe chưa commit | Cài node_modules riêng bằng npm ci offline từ cache registry vừa tải ở phase này; generate/build/lint/typecheck và local production TLS probe PASS. Không phải Git-only completeness PASS. |
| Local production HTTPS/WSS | Candidate API bundle, NODE_ENV=production, TLS proxy localhost 5443/5444 → API 3002 | Cookie/auth/CSRF/CORS/WSS/restart PASS. Self-signed local certificate, browser test bỏ kiểm tra CA; không chứng minh public certificate hoặc cross-site cookies. |
| Hosted staging | Không provision/deploy | **NOT TESTED**: provider TLS/WSS, cross-site cookie behavior, bucket policies thật, CDN/backup/capacity. |
| Clones phục hồi để đối chiếu | `<review-scratch>/original` và `<review-scratch>/prepared` | Tạo mới sau interruption, chỉ kiểm tra file/hash/links; **không cài dependencies hoặc chạy lại tests**. Prepared chứa explicit final overlay. |

Sau interruption do workspace credit limit, `<audit-scratch>` không còn: clones, database, binaries và raw logs không còn để mở lại. Các summary JSON, test command/exit status và execution transcript vẫn có; tiếp tục dùng evidence của cùng phase theo yêu cầu user, không thay bằng kết quả audit lịch sử. SHA raw log đã ghi chỉ là fingerprint lịch sử, không thể kiểm lại khi file đã mất. New comparison không tái tạo hay thay thế runtime evidence đã mất. [Verification](evidence/verification.json) ghi rõ provenance; [comparison](evidence/fresh-clone-comparison.json) ghi hashes final overlay và source so với HEAD.

## Kết quả thực thi đã hoàn thành

Node 22.23.2, npm 10.9.8; PostgreSQL 16.15 UTF8, role local `exam_audit`, loopback 55449. Hai database độc lập `examspace_deploy_test` và `examspace_integration_test`. Ubuntu PostgreSQL packages được download/extract vào scratch, không cài/thay system service. Playwright Chromium revision 1243 đã có trong tool cache, được tái sử dụng như browser prerequisite; không tái sử dụng app node_modules hoặc kết quả browser tests.

| Command / check | Kết quả | Evidence / ghi chú |
| --- | --- | --- |
| Local Git clone | PASS | 368 committed files; original thiếu MASTER_SPEC |
| `npm ci` | PASS | 839 packages added; dependencies từ lockfile, cache riêng ban đầu trống |
| `npm ls --all` | PASS | Không invalid/unmet dependency gate |
| `npm run db:generate` | PASS | Prisma 7.10.0, generated client không cần track |
| `npm run lint` | PASS | Original committed source |
| `npm run typecheck` | PASS | App/shared/tests strict |
| `npm test` | PASS | 78 tests / 19 files |
| `npm run build` | PASS | Shared, API dist, web dist + 404; chunk >500 kB warning |
| `npm run db:migrate` | PASS | Hai migrations, rerun không pending migration |
| `npm run db:seed` hai lần | PASS | Counts và fingerprint 15 bảng không đổi |
| `npm run test:integration` | PASS | 62 tests / 15 files, DB riêng; auth, ownership, grading, sockets, seed recovery, assets |
| `npm run test:e2e` | PASS | 20 Chromium tests, real API/DB + local Storage provider double |
| `npm run test:deployment` | PASS | Bundle API/web, subpath `/project/`, HTTP404 fallback, refresh/login/PDF font; NODE_ENV=test |
| `node tests/deployment/production-readiness.mjs` | PASS | Candidate-only new probe; 8 nhóm assertions, NODE_ENV=production, local TLS/WSS |
| Environment parser negative cases | PASS | 8 invalid configs rejected, 2 valid production configs accepted |
| Production probe remote-DB guard | PASS | Remote hostname bị từ chối trước khi mở services |
| `npm audit --audit-level=low --json` | PASS | 0 vulnerabilities tại thời điểm thực thi; không hạ gate |
| Hosted PostgreSQL 17 CI job / staging | NOT TESTED | CI source review và local commands không thay hosted execution |

Sandbox run đầu có DNS denial, một Supertest health socket failure (77/78), và candidate esbuild install EPERM. Cùng commands/source đã PASS khi được cấp quyền thực thi phù hợp; không sửa product/test assertions để né lỗi. Các kết quả đó không được cộng thành nhiều lần PASS. E2E có ghi ảnh/performance artifacts **trong clone ban đầu**; chúng không được chép về repository chính.

## Các file cần thiết và gap đã xác nhận

Đã có tracked manifests/lockfile, shared package, TS/Vite/tsup configs, source, hai SQL migrations, Prisma schema/seed, font PDF/license, `.env.example`, CI/Pages workflows, render.yaml và fixture Storage test. Không phát hiện runtime cần local-only source khi các flow được kiểm thử.

MASTER_SPEC local bị `.git/info/exclude` loại khỏi Git. Cả basename `MASTER_SPEC.md` trong thư mục con cũng bị exclude. Bản bàn giao mới [MASTER_SPEC_BASELINE](../spec/MASTER_SPEC_BASELINE.md) giữ byte/hash của bản gốc, không bị ignore; README/SRS trỏ vào bản này. Root spec, bản copy local cũ `docs/spec/MASTER_SPEC.md`, ASTRA prompt và exclude được giữ nguyên. ASTRA là prompt triển khai local, không có tracked link cần giải quyết, không đưa vào bàn giao. Xem [đối chiếu spec](../spec/SPEC_RECONCILIATION.md).

Original clone static comparison vẫn có đúng hai Markdown file-target links hỏng. Prepared final comparison phải có 0 broken file/anchor links trong README và docs. Chỉ sau user review và một commit được cho phép ở phase khác thì Git clone mới nhận bản sửa. Không giả định các untracked file hiện tại đã được bàn giao qua Git.

## Hướng dẫn tái tạo bằng local Git

Prerequisites: Node 22 ≥22.12 (lần đã kiểm tra 22.23.2), npm, PostgreSQL server/client UTF8, `openssl`, `pdftotext`, browser dependencies. Không cần GitHub. PostgreSQL 16.15 đã kiểm tra; workflow khai báo 17, chưa có chứng nhận 17 mới trong phase này.

Từ repository source, tạo scratch mới bằng commands sau. Đây là hướng dẫn cho lần setup sau, không phải commands đã chạy lại khi resume:

```bash
SOURCE_REPO="$PWD"
EXAM_AUDIT_ROOT="$(mktemp -d)"
git clone --no-local --no-hardlinks "$SOURCE_REPO" "$EXAM_AUDIT_ROOT/clone"
cd "$EXAM_AUDIT_ROOT/clone"
npm ci
npm run db:generate
```

Cài PostgreSQL bằng package manager phù hợp máy và chọn `PG_BIN` của version đó. Với PostgreSQL 16 trên Ubuntu thường là `/usr/lib/postgresql/16/bin`. Audit trước dùng binaries extract riêng, không yêu cầu copy database có sẵn. Cluster sau chỉ dành cho disposable local tests, trust auth và loopback; không dùng cho máy shared không tin cậy hoặc DB production.

```bash
PG_BIN=/usr/lib/postgresql/16/bin
"$PG_BIN/initdb" -D "$EXAM_AUDIT_ROOT/pgdata" -U exam_audit --auth=trust --encoding=UTF8 --no-locale
"$PG_BIN/pg_ctl" -D "$EXAM_AUDIT_ROOT/pgdata" -l "$EXAM_AUDIT_ROOT/postgres.log" \
  -o "-h 127.0.0.1 -p 55449 -k $EXAM_AUDIT_ROOT" start
"$PG_BIN/createdb" -h 127.0.0.1 -p 55449 -U exam_audit examspace_deploy_test
"$PG_BIN/createdb" -h 127.0.0.1 -p 55449 -U exam_audit examspace_integration_test
export DOTENV_CONFIG_PATH=/dev/null
export NODE_ENV=test
export TEST_DATABASE_URL=postgresql://exam_audit@127.0.0.1:55449/examspace_deploy_test
export DATABASE_URL="$TEST_DATABASE_URL"
export DIRECT_URL="$TEST_DATABASE_URL"
npm run db:migrate
npm run db:seed
npm run db:migrate
npm run db:seed
```

Đổi `TEST_DATABASE_URL`/`DATABASE_URL`/`DIRECT_URL` đồng bộ sang `examspace_integration_test`, migrate/seed rồi chạy integration trên DB đó. Không chạy API expiry job của browser suite đồng thời với integration trên cùng DB. Nếu port đã được dùng, không kill process lạ; chọn cấu hình riêng hoặc giải phóng services do chính bạn tạo.

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --audit-level=low
export TEST_DATABASE_URL=postgresql://exam_audit@127.0.0.1:55449/examspace_integration_test
export DATABASE_URL="$TEST_DATABASE_URL" DIRECT_URL="$TEST_DATABASE_URL"
npm run db:migrate
npm run db:seed
npm run test:integration
export TEST_DATABASE_URL=postgresql://exam_audit@127.0.0.1:55449/examspace_deploy_test
export DATABASE_URL="$TEST_DATABASE_URL" DIRECT_URL="$TEST_DATABASE_URL"
npx playwright install --with-deps chromium
npm run test:e2e
npm run test:deployment
# Chỉ có sau khi prepared changes đã được đưa vào bản source đang kiểm tra:
node tests/deployment/production-readiness.mjs
```

Không copy node_modules/.env từ repository chính. Với local interactive development, copy hai `.env.example` **từ clone**, điền local DB URL và SESSION_SECRET tự sinh, rồi dùng `npm run dev` theo [setup guide](../DEPLOYMENT.md#local-quick-start). Các browser tests hiện có dùng development seed password đã khai báo trong source/README; không dùng custom demo password khi chạy suite hardcoded này. Không đưa password vào report/evidence.

## Database/seed observations

Migrations theo thứ tự `20260930000000_initial`, `20260930010000_integrity`; session table do migration tạo, `createTableIfMissing=false`. Có 21 bảng bật RLS; extensions kiểm tra chỉ có plpgsql. Seed không cần Supabase Storage hay ignored file; tạo 15 users (1 Admin/2 Teacher/12 Student), 2 classes, 2 banks, 24 questions, 3 exams, 1 quiz, 1 graded demo attempt điểm 3. Xem [counts](evidence/seed-counts.json) và [rerun fingerprint](evidence/seed-rerun.json).

Seed upsert không ghi đè dữ liệu/password/schedule; phục hồi attempt dở theo deadline gốc. Chạy một seed process mỗi lần. Lịch đề mới đóng sau 7 ngày; seed lại không kéo dài, nên dùng DB demo mới hoặc Teacher tạo đề mới trước buổi demo. Không reset dữ liệu cần giữ. Production guard chỉ kiểm tra NODE_ENV và explicit flag; không thay thế việc xác minh DB đích/password riêng.

Khi hoàn tất một lần kiểm tra mới, dừng **cluster do lần đó tạo** bằng `pg_ctl -D "$EXAM_AUDIT_ROOT/pgdata" stop -m fast`; giữ scratch/evidence theo nhu cầu review. Khi resume lần này, cluster cũ và scratch đã mất; không dựng lại DB hoặc chạy lại tests.
