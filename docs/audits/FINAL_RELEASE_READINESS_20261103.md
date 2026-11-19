# ExamSpace — Final Release Readiness

**03/11/2026 — NOT READY FOR DEPLOYMENT lên môi trường thật.** Local acceptance và các gate kiểm thử bên dưới PASS; chưa có evidence staging/cloud cho đúng candidate mới. Không còn blocker source được xác nhận trong phạm vi image reliability và blocker remediation đã kiểm tra.

Candidate: branch `ui/final-refinement-recovery`, base HEAD `51251acdb5f4eece85c3d44d2958ca98ba2efe0a` **cộng working tree chưa commit**. Không được coi HEAD hoặc branch staging cũ là candidate này. Lượt này không commit/push/deploy/merge/PR, không truy cập production hoặc credentials thật.

## 1. Lỗi thực sự đã sửa

- **Ảnh lỗi im lặng:** renderer trước đây chỉ render `<img>`, bỏ qua lỗi API signed URL và lỗi tải/decode object. Nay có loading/error state và thao tác retry bằng chuột/Enter/Space. Asset retry gọi lại API authorization/signing, rồi tải lại ảnh; không nối cache-buster vào signed URL. Retry vẫn dùng được trong fieldset chỉ đọc/disabled.
- **Mất trạng thái lỗi khi parent rerender:** browser regression xác nhận renderer inline bị tạo lại khi chọn/autosave đáp án, làm biến mất retry. Nay renderer có identity ổn định, giữ error/retry cho cùng source; đổi source sẽ reset trạng thái đúng.
- Dùng chung cho prompt/options/explanation trong QBank, Builder/preview, Student Exam, grading/results/analytics và Live Quiz; hai preview file cục bộ trong editor cũng dùng renderer này. Không đổi grading, timer, autosave hoặc dữ liệu attempt. Browser kiểm tra trước/sau retry: cùng attempt, nguyên answer row/revision/deadline/status, không thêm answer PUT/submit; sau submit chấm đúng 1 điểm.
- Ba negative controls trên renderer cũ **FAIL đúng mong đợi** vì thiếu alert/retry. Đây là bằng chứng regression bắt lỗi cũ, không phải FAIL còn lại của candidate. [Log](/tmp/examspace-release-readiness-20261103/red-images.log).

## 2. Files thay đổi trong vòng này

| Nhóm | Files |
| --- | --- |
| Source — 2 | `apps/web/src/components/Markdown.tsx`; `apps/web/src/features/question-bank/editor.tsx` |
| Tests — 3 | Mới: `apps/web/src/components/question-image.test.tsx` (7 ca); `tests/e2e/question-image-reliability.spec.ts` (2 ca). Cập nhật `tests/e2e/question-bank.spec.ts`: locator xác định đúng alert validation, thêm assert HTTP 400/`INVALID_IMAGE`, giữ toàn bộ kiểm tra JPEG/WebP/replace/retry cũ. |
| Docs hiện có — 6 | `README.md`; `docs/DEPLOYMENT.md`; `docs/deployment/ENVIRONMENT_MATRIX.md`; `DEPLOYMENT_PLAN.md`; `FREE_STAGING_RUNBOOK.md`; `FREE_STAGING_DEPLOYMENT_REPORT.md` (bốn tên cuối trong `docs/deployment/`). |
| Báo cáo cuối — 1 | File này; không tạo thêm tài liệu dự án khác. |

Không đổi API source, schema/migrations, dependencies, `render.yaml`, workflow CI hay Vite configuration trong lượt này. Hai file autosave `attempts.tsx` và `attempt-integrity.test.tsx` giữ nguyên byte.

## 3. Kết quả kiểm thử mới

Dùng Node 22.23.4, dependencies/browsers hiện có và PostgreSQL **16.15 thật**, database mới `examspace_release_test` tại **127.0.0.1:55447**. Hai migrations applied và development seed PASS. Không dùng cloud DB. Env test vô hiệu dotenv thật, override cả DATABASE_URL/DIRECT_URL/TEST_DATABASE_URL và loại credentials Storage/demo kế thừa. Storage provider của E2E là HTTP fixture cục bộ, không phải Supabase cloud. [PostgreSQL evidence](/tmp/examspace-release-readiness-20261103/postgres-evidence.txt).

| Lệnh | Kết quả | Evidence |
| --- | --- | --- |
| `npm run lint` | **PASS**, full working tree, không thêm exclude | [log](/tmp/examspace-release-readiness-20261103/lint-release.log) |
| `npm run typecheck` | **PASS**, shared/API/web/tests | [log](/tmp/examspace-release-readiness-20261103/typecheck-release.log) |
| `npm run build` | **PASS** | [log](/tmp/examspace-release-readiness-20261103/build-final.log) |
| `npm test -- --reporter=json ...` | **166 PASS / 0 FAIL**, 25 files; gồm 7 image regression và 24 autosave integrity | [JSON](/tmp/examspace-release-readiness-20261103/unit-final-results.json) |
| `npm run test:integration -- --reporter=json ...` | **82 PASS / 0 FAIL**, 18 files | [JSON](/tmp/examspace-release-readiness-20261103/integration-final-results.json) |
| `npm run test:e2e` | **56 PASS / 0 FAIL**: core 22 (20 cũ + 2 ảnh), Student Exam 25, Session Recovery 3, Builder blockers 6; không retry/skip | [log](/tmp/examspace-release-readiness-20261103/e2e-final.log) |
| `npm run test:deployment` | **PASS**, production bundles, SPA subpath/404/deep refresh, session và PDF | [log](/tmp/examspace-release-readiness-20261103/deployment-smoke.log) |
| `DEPLOYMENT_SAME_ORIGIN=true node tests/deployment/production-readiness.mjs` | **PASS**, NODE_ENV=production, TLS cục bộ; cookie/CORS/CSRF/WSS, graceful/crash restart, logout revocation; thêm 3 browser flows production | [log](/tmp/examspace-release-readiness-20261103/production-local-tls.log) |
| `npm audit --audit-level=low --json` | **PASS**, public registry: 0 vulnerabilities | [log](/tmp/examspace-release-readiness-20261103/advisory.log) |
| `git diff --check` | **PASS** | Final workspace review |

**48 E2E chưa chạy ở lần independent verification nay đều đã chạy PASS.** Hai ảnh regression kiểm tra prompt/option, lỗi signing 503 và object download 403, retry lấy lại URL, đáp án/timer/attempt và grading; viewport 390px/1280px không overflow. Targeted runs là tập con, không cộng lại vào tổng 56; ba production flows là lượt probe riêng.

Để giữ evidence gốc, full E2E và deployment probes chạy trong mirror `/tmp/examspace-release-readiness-20261103/workspace`, cùng hash **224 source/test/config files** với repo. Dependencies được sao chép cục bộ sau khi symlink gây Vite font allow-list warning; không sửa Vite để né lỗi. Screenshots/performance JSON mới nằm trong mirror. Lượt core đầu 21 PASS/1 FAIL do locator cũ không còn unique sau khi có alert ảnh; đã bổ sung API assertions và chạy lại toàn bộ bốn nhóm PASS. Lượt image browser đầu cũng bắt được lỗi renderer identity rồi PASS sau sửa. Một hook test ban đầu trả mock function như cleanup đã được sửa; mọi kết quả cuối ở bảng trên là lượt mới sau sửa. Không tăng retries/quota, bỏ ca hoặc hạ assertion.

**NOT RUN:** fresh `npm ci` của candidate, remote CI, cloud/hosted, Safari/Firefox/thiết bị cảm ứng thật, toàn bộ historical UI suites. TLS probe dùng certificate tự ký chỉ ở local và ghi rõ `hostedStagingVerified:false`; không chứng nhận provider SSL, WSS hoặc Storage thật.

## 4. Deployment documentation

Đã đồng bộ sáu tài liệu với source: topology một Express service serve SPA/REST/Socket.IO (`SERVE_WEB=true`), public VITE values cùng origin, backend secrets, DATABASE_URL cho runtime/session và DIRECT_URL cho CLI; Node version, CA/TLS, private bucket/signing, pool budget và role/RLS. [Runbook hiện hành](../deployment/FREE_STAGING_RUNBOOK.md), [environment matrix](../deployment/ENVIRONMENT_MATRIX.md).

Build/start khớp `render.yaml`: `npm ci --include=dev && npm run db:generate && npm run build`; `CLIENT_ORIGIN="$RENDER_EXTERNAL_URL" npm run start -w @exam/api`. **Không migrate/seed ở start.** Có đúng hai migrations hiện có, không migration mới cho ảnh. Target/history/checksums/backup và pending SQL phải được kiểm tra trước thao tác migration được duyệt; local migrate PASS không chứng minh cloud đã migrate.

Blueprint vẫn trỏ `deploy/examspace-free-staging`, khác working tree candidate; chỉ ghi rõ gate chọn revision, không tự đổi config. Giữ SESSION_SECRET hiện có qua redeploy. Tài liệu không còn khẳng định “chưa từng deploy” hoặc gán số PASS/SHA cloud cũ cho candidate mới. Toàn bộ nội dung runbook/report cũ giữ **nguyên văn** trong phần lịch sử; JSON/evidence cũ không bị viết lại. Deployment plan split-origin cũ được gắn nhãn đã thay thế. Public Supabase docs/changelog đã được đọc; không truy cập project.

## 5. Git status và release artifacts

| Baseline | Phân loại đầy đủ |
| --- | --- |
| **20 modified tracked** | **11 source**, **3 tests**, **3 config** (`package.json`, lockfile, CI), **3 docs/evidence** deployment |
| **192 untracked** | **3 source guard**, **3 tests**, **1 Playwright config**, **2 remediation reports**, **10 historical hosted harness**, **173 historical evidence files** |

Sau vòng này: **27 modified tracked, 195 untracked, 0 staged**; branch/HEAD không đổi. Không xóa/rename baseline files. Trong 614 file ban đầu, chỉ **9 file** được sửa có chủ đích ở mục 2; **605 file** còn lại nguyên byte. Nguyên văn hai tài liệu lịch sử được bảo toàn trong nội dung mới; hai file autosave và mọi screenshots/log/JSON/harness lịch sử nguyên byte. [Manifest baseline](/tmp/examspace-release-readiness-20261103/baseline-classification.json), [release manifest](/tmp/examspace-release-readiness-20261103/release-manifest.json), [status](/tmp/examspace-release-readiness-20261103/git-status-final.txt).

**Bắt buộc bàn giao:** base source + reviewed diff, package/lock/CI/test configs, migrations, fonts/CA công khai và docs hiện hành; gồm cả ba guard source untracked (`exams/configuration.ts`, `live-quiz/configuration.ts`, `builder-guard.tsx`), regression tests/config untracked của remediation và hai tests ảnh mới. Chỉ gửi tracked diff hoặc deploy HEAD hiện tại sẽ bỏ sót candidate. Build artifacts cần `apps/api/dist`, `apps/web/dist`, runtime dependencies/generated Prisma phù hợp; quy trình chuẩn tái tạo bằng ci/generate/build, không đưa `.env` thật vào artifact.

**Lưu riêng dưới nhãn lịch sử:** 183 harness/evidence untracked có sẵn và deployment verification JSON cũ; cần giữ provenance để review, không cần đưa vào runtime hoặc tự thực thi. Báo cáo remediation và báo cáo này phục vụ handoff. Pattern scan hẹp của diff/untracked không thấy private-key/JWT/token literal; đây không phải security certification. Không có thao tác stage/archive/publish tự động. Evidence mới ở `/tmp` là scratch, cần sao lưu phần đã review nếu bàn giao sang máy khác; report này tự chứa kết quả chính.

## 6. Vấn đề còn tồn tại

- **Release gate NOT VERIFIED:** HTTPS/cookie/proxy/TLS/session/WSS và private Storage thật trên đúng staging candidate; target migration history/config, backup/restore và restart/rolling overlap chưa xác minh. Historical cloud evidence không thay thế. Không có quyền truy cập production trong nhiệm vụ này.
- **P2 có thể chấp nhận:** Teacher Exam list còn hiển thị error/retry lặp từ CatalogControls + ErrorNotice. Không mất dữ liệu, retry hoạt động; không sửa module ngoài scope.
- **P3/giới hạn:** Markdown chunk ~593.66 kB minified, chưa có đo đạc chứng minh blocker; pg adapter deprecation và NO_COLOR/FORCE_COLOR warnings còn. Free hosting sleep/cold start không phải SLA cho kỳ thi. Giữ nguyên các NOT RUN ở mục 3.

## 7. Khuyến nghị

**NOT READY FOR DEPLOYMENT lên môi trường thật; READY cho bàn giao source local và kiểm chứng staging có kiểm soát.** Các lỗi ảnh và tài liệu trong scope đã xử lý, toàn bộ gate local đã PASS; không còn lỗi source bắt buộc sửa được xác nhận trong vòng này. Chưa đủ bằng chứng để ký go-live đúng candidate trên provider thật. Không dùng test PASS để suy ra mọi môi trường hoặc mọi đường nghiệp vụ đã đạt.

## 8. Các bước trước deploy

1. Review/chốt manifest source đầy đủ, gồm untracked guards/tests; chọn revision/artifact thực sự chứa candidate. Reproduce fresh ci/generate/build và CI với đúng nội dung đó; không tự lấy branch staging/SHA cũ.
2. Khi được duyệt riêng, xác minh staging target, secrets/origin/proxy/CA, DB role/pool budget, migration history/checksums và backup/restore plan; chỉ áp dụng pending migrations sau review, không reset/seed dữ liệu thật.
3. Kiểm chứng staging tách biệt: HTTPS login/expiry/relogin/logout, cookies/CSRF/CORS, WSS/reconnect, ảnh upload/sign/expiry/error/retry với provider thật và public-access denial, Exam/Quiz/grade/export, SPA refresh và dữ liệu/session sau restart. Không dùng destructive local suites vào production.
4. Gắn evidence đã sanitize với đúng artifact, chốt maintenance/rollback và giới hạn hosting rồi mới quyết định go-live. Không triển khai giữa ca thi/Quiz.

PostgreSQL test đã dừng và các listener test được kiểm tra đóng ở cuối lượt. Không commit/push/deploy/merge/PR, không sửa Autonomous Workflow.
