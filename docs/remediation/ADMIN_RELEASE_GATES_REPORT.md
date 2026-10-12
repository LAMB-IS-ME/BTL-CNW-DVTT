# ExamSpace — Admin P1 + release-gate remediation

> Historical remediation snapshot trước user approval commit. Kết quả cleanup và quyết định commit tiếp theo ở [final cleanup verification](FINAL_CLEANUP_VERIFICATION.md). Raw logs giữ local; các links evidence trỏ tới curated summaries.

Ngày verification: **12/10/2026 (Asia/Bangkok)**. **Remediation hoàn tất để review; không phải xác nhận release-ready toàn hệ thống.** Không commit/push/deploy/merge/PR. Historical System-wide Audit giữ nguyên.

## 1. Baseline và phạm vi

- Repository: `LAMB-IS-ME/BTL-CNW-DVTT`.
- Branch: `ux/education-saas-redesign-pilot`.
- HEAD: `04f99e305c89f17e6ee98ed1ea78124c260d601d` — `feat(ui): roll out live quiz experience`.
- Working tree ban đầu: chỉ untracked `docs/audit/` và `docs/screenshots/system-audit/`; không giả định clean/reset/checkout.
- Đã đọc ba audit reports, Admin/API/browser/advisory/test evidence, source và tests liên quan. [Audit baseline](../audit/EXAMSPACE_SYSTEM_AUDIT.md) và [findings](../audit/EXAMSPACE_FINDINGS.md) không bị sửa.
- Test copy tại `<isolated-test-workspace>`, copy tracked files và remediation source, **không copy `.env`**. [Source manifest](evidence/source-manifest.json) đối chiếu source test với working tree; [historical hashes](evidence/historical-hashes.json) bảo vệ audit/approved screenshots.
- PostgreSQL **16.15**, UTF8, cluster riêng `<isolated-test-cluster>`, loopback `127.0.0.1:55439`, DB `examspace_remediation_test`; hai migrations hiện hữu, synthetic seed/users. Không Supabase production, credentials production hoặc destructive cloud test.
- Node **22.23.2**, npm **10.9.8**, Prisma/adapter **7.10.0**, Chromium Playwright. DB schema, Socket.IO protocol, scoring, result-release policy và visual source ngoài Admin không thay đổi.

## 2. Status matrix

| Finding / scope | Remediation status | Evidence / giới hạn |
|---|---|---|
| ADMIN-001: status/role HTTP500 | **RESOLVED** | API, persistence, lock semantics, concurrency, session/socket và browser PASS |
| Admin role error còn sau successful retry | **RESOLVED** | Browser red trước sửa, green sau sửa, DB + reload xác nhận |
| SEC-001: 3 advisories / 7 entries | **RESOLVED** | Clean install, actual dependency tree, full/prod audit 0; unchanged low gate PASS |
| QA-001: tracked Grading E2E harness | **RESOLVED** | Full tracked suite 17/17 gồm 14 cũ + 3 Admin mới |
| SYS-001: pagination/list/picker limits | **NOT IN SCOPE** | Giữ roadmap phase cross-module correctness |
| SYS-002: Builder cache 20/22 | **NOT IN SCOPE** | Giữ roadmap, không đổi query keys |
| ASSET-001: published image reference 404 | **NOT IN SCOPE** | Existing Storage boundary tests không chứng minh finding đã hết |
| AUTH-001: expired-session SPA recovery | **NOT IN SCOPE** | Backend authorization PASS không giải quyết cached-auth UX |
| REL-001: Live Quiz crash-stale presence | **NOT IN SCOPE** | Normal/reconnect lifecycle PASS không giải quyết crash reconciliation |
| DOC-001 / BTL handoff | **NOT IN SCOPE** | Historical docs/spec provenance/report/slides giữ phase riêng |
| Deployment / hosted verification | **NOT IN SCOPE** | Local bundle smoke PASS; chưa real TLS/cross-site cookies/cloud Storage/WSS |
| Global/Admin visual redesign | **NOT IN SCOPE** | Không redesign/style change |

Không có **PARTIALLY RESOLVED** hoặc **BLOCKED** trong ba release gates được giao. Không diễn giải điều này thành release-ready cho các findings ngoài scope.

## 3. Admin root cause và bản sửa

Hai routes `PATCH /api/v1/admin/users/:id/status` và `/role` gọi `$queryRaw` với `SELECT pg_advisory_xact_lock(904201)`. PostgreSQL trả `void`; Prisma báo **P2010 / UnsupportedNativeDataType** trước actor recheck/update. [Fresh reproduction](evidence/admin-before.json) ghi cả LOCKED, ACTIVE và TEACHER đều HTTP500, DB vẫn STUDENT/ACTIVE. ACTIVE request trước sửa kiểm tra đường unlock query; unlock thực từ LOCKED được regression sau sửa kiểm chứng.

`apps/api/src/modules/admin/lock.ts` gom SQL vào `lockAdminMutations(tx)`:

```sql
SELECT pg_advisory_xact_lock(904201)::text
```

Cả hai routes gọi helper **bên trong transaction cũ**, trước actor recheck. Dùng Prisma tagged-template `$queryRaw`; SQL cố định, không ghép user input/`Unsafe`. Giữ key `904201`, global serialization, transaction options, DTO/API status, self/dependency guards và socket disconnect sau commit. Catalog helper đã cast `::text`, không có cùng lỗi và không bị sửa. Không thêm lock order/transaction mới; các concurrency cases không ghi nhận deadlock, không phải chứng nhận mọi lịch thực thi/load.

### Lock / authorization proof

10 test cases mới trong `apps/api/test/admin.integration.test.ts`:

- Tạo Teacher và Student; login được, DTO không lộ hash; short password/invalid email/name/role 400; duplicate 409.
- Lock/unlock 200 và DB status đúng; locked login 403 `ACCOUNT_LOCKED`; existing session request 401 rồi bị destroy; socket disconnect do server. Unlock cho phép login mới, session đã destroy không tự hồi phục.
- Student ↔ Teacher persist; existing session đọc role mới; Teacher API sau demotion bị403; role mutation disconnect socket. Invalid role/status400, missing user404.
- Self lock/unlock/role409; Teacher có class không đổi role409 `ROLE_HAS_DEPENDENCIES`; same-role no-op và status mutation vẫn hợp lệ. Không invent last-admin policy: source dùng self guard và serialized actor recheck, không có count-based last-admin rule riêng.
- Teacher/Student/anonymous bị chặn qua direct API; thiếu/sai CSRF và foreign Origin403. Existing full auth suite giữ password/session rotation policy.
- **Lock thực:** `pg_locks` của transaction xác nhận key được acquire; connection độc lập gọi `pg_try_advisory_xact_lock` thất bại sau một statement khác trong transaction; thành công sau cả commit và rollback.
- **Concurrent requests:** connection riêng giữ key, chờ quan sát đủ PostgreSQL waiters, rồi nhả; role Teacher→Student và LOCKED→ACTIVE trên cùng user trả state tuần tự đúng, final DB consistent. Không dựa vào sleep hoặc chỉ HTTP200.
- Actor Admin bị demote/lock bởi request đứng trước khi request của actor đang chờ: middleware đã đi qua nhưng transaction recheck trả403, target không đổi.

Session behavior được giữ đúng implementation: Admin lock không chủ động xóa mọi session row ngay lập tức; socket bị ngắt, authorization đọc DB và session được destroy khi request của locked account tới. Không thêm auth architecture mới.

## 4. Admin browser và targeted UI fix

`tests/e2e/admin.spec.ts` có ba cases chạy browser/API/DB thật trên local fixture:

1. Admin login, tạo/search Student, lock, pending confirm/cancel disabled, success status, reload persistence, unlock với lỗi500 một lần rồi retry thật, đổi role hai chiều/reload, self-action error.
2. Role failure409 hiển thị và giữ role cũ → retry PATCH200 → role mới, error biến mất → Prisma đọc DB TEACHER/ACTIVE → reload vẫn TEACHER và không alert.
3. Teacher/Student không vào Admin route và direct API GET/role/lock/unlock403.

Error injection dùng Playwright route đúng **một response** để kiểm tra recovery; successful mutations/retry đi tới API/DB thật. Business dependency409 được integration test bằng class thật. Pending response chỉ trì hoãn network để quan sát button state; không mock backend success. Role select hiện không có loading indicator riêng trong source; phase này không thêm UX feature mới.

Trước sửa, case2 phát hiện alert cũ còn sau role success ([red evidence](evidence/red-summary.json)). Bản sửa duy nhất ở Admin UI là `setError(undefined)` sau role update + refetch thành công. Không thay markup/style. [Locked screenshot](evidence/screenshots/admin-locked.png), [restored screenshot](evidence/screenshots/admin-restored.png); đã xem ảnh restored trực tiếp.

## 5. Dependency advisory analysis và resolution

Audit baseline được chạy lại: **7 affected package entries, 3 advisories**, exit1. Không phải bảy exploit riêng. [Before JSON](evidence/npm-audit-before.json), [production before](evidence/npm-audit-production-before.json).

| Advisory | Baseline path / exposure | Resolution |
|---|---|---|
| [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) | dev `concurrently@10.0.5 → shell-quote@1.9.0`; critical upstream; attacker-controlled token sau comment là prerequisite, dev commands repo là static | Targeted direct patch `concurrently@10.0.6 → shell-quote@1.12.0`; fixed range bắt đầu1.11.0 |
| [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | `tsup→postcss`, `@tailwindcss/vite→node`, `jsdom→css-tree → source-map-js@1.2.1`; build/test tooling, malicious indexed source map DoS | Lockfile refresh trong allowed range thành **1.2.2**, không đổi parent packages |
| [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7) | frontend runtime `rehype-katex@7.0.1`, `remark-math@6.0.0→micromark-extension-math@3.1.0 → katex@0.16.47`; low upstream, cần prototype pollution có sẵn | Override **`katex: 0.18.9`**, cùng bản root/CSS đã dùng; bỏ hai nested0.16.47 và commander8.3.0 chỉ thuộc các copies đó; fixed range bắt đầu0.18.2 |

Không tìm/chứng minh exploit chain từ app input tới shell/source-map/prototype pollution; không biến severity upstream thành confirmed remote compromise. Dependency gate vẫn được xử lý đầy đủ.

KaTeX override vượt declared plugin range `^0.16.0` (pre-1.0 compatibility risk), nhưng không nâng plugin major hoặc renderer root; API dùng là `renderToString`. Đã kiểm cả consumers, security behavior, frontend tests, browser exam/Quiz và build. Không có source renderer/trust options change. Override pin cần được review lại khi plugins hỗ trợ upstream range mới.

Không `npm audit fix`, force upgrade/downgrade, blanket update hoặc advisory ignore. npm gợi ý downgrade plugin majors không được áp dụng. Lần scoped override đầu còn giữ stale micromark nested resolution; đã loại đúng hai stale lock entries của subtree đó và để npm resolve lại với override toàn KaTeX. Không tự viết version/integrity. Final diff chỉ versions và nested removals nêu trên; clean install chứng minh manifest/lock đồng bộ.

## 6. Clean install và CI gate

- **`npm ci` PASS** trong test copy sạch và actual workspace; normal scripts, 839 packages added; 0 vulnerabilities. Lockfile không đổi sau install.
- [Actual resolved tree](evidence/dependency-paths-after.txt): concurrently10.0.6, shell-quote1.12.0, source-map-js1.2.2, cả KaTeX consumers dedupe0.18.9; `npm ls` exit0, không invalid/extraneous trên paths đã kiểm.
- **Sau clean install**: [full `npm audit --json`](evidence/npm-audit-after.json)0; [production `--omit=dev`](evidence/npm-audit-production-after.json)0; [đúng gate `npm audit --audit-level=low`](final-cleanup-verification.json) exit0.
- CI source `.github/workflows/ci.yml` giữ nguyên: Node22 từ `.nvmrc`, npm đi kèm Node (workflow không pin npm riêng), `npm ci`, generate/migrate/seed, lint/typecheck/unit/integration/build/E2E/local smoke và low audit. CI dùng PostgreSQL17; local verification dùng16.15. Không claim GitHub-hosted runner đã thực thi.
- Không đổi workflow triggers/secrets/deploy jobs, audit threshold hay `continue-on-error`.

## 7. KaTeX security và compatibility regression

`apps/web/src/components/Markdown.test.tsx`: **6 PASS**, gồm existing test +5 mới:

- Vietnamese/GFM/table/code highlighting và escaped raw HTML giữ nguyên.
- Inline/block fractions, roots, aligned equations, MathML và malformed-command fallback.
- micromark math HTML extension API render inline/display đúng.
- Cả hai consumer resolve renderer từ chính package context; inherited `trust:true` không tạo image hoặc `javascript:` href; explicit own `trust:true` vẫn có upstream trusted-render behavior. App không bật trust.
- Markdown pipeline vẫn chặn unsafe URL/image khi `Object.prototype.trust` được mô phỏng; prototype luôn restore trong finally.

Hai direct-consumer assertions đã chạy trên old installed dependencies: **2 FAIL/4 PASS**, tạo image từ inherited trust. Cùng assertions trên final dependencies PASS ([red log](evidence/verification-summary.json)). Đây là reproduction của prerequisite upstream trong test, không phát hiện app có prototype pollution entrypoint. Không thay trust policy để đạt green.

## 8. E2E harness và assertions

Fresh baseline core E2E fail đúng `getByLabel("Nhận xét")` khớp textarea và dialog “Điểm và nhận xét chưa lưu” ([log](evidence/red-summary.json), [DOM](evidence/red-summary.json)). Sửa thành `getByRole("textbox", { name: "Nhận xét", exact: true })`; không `nth()`.

Sau đó assertion cũ `4.5/5 · 90.0%` fail vì approved UI tách nodes/spacing ([log](evidence/red-summary.json)). Giữ **điểm4.5/5**, **phần trăm90.0%** bằng hai exact assertions, thêm **feedback được công bố**. Không sửa Grading UI/dialog/draft protection/scoring. Full tracked suite **17 PASS /0 fail /0 skipped**, gồm14 cũ +3 Admin mới; sau tăng assertion DB/reload, Admin subset **3/3 PASS** lại.

## 9. Final verification matrix

Commands dùng latest runtime source; test copy source bằng hash với working tree. Raw logs giữ local, commit dùng summaries và hash provenance; không lưu browser trace/session archives hoặc DB dumps.

| Command / suite | Final result | Evidence |
|---|---|---|
| `npm ci` (clean test copy + workspace) | PASS, exit0 | [copy](evidence/verification-summary.json), [workspace](evidence/verification-summary.json) |
| `npm run db:generate`, `db:migrate`, `db:seed` | PASS | [migrate](evidence/verification-summary.json), [seed](evidence/verification-summary.json) |
| `npm run lint` | PASS | [lint](evidence/verification-summary.json) |
| `npm run typecheck` | PASS | [typecheck](evidence/verification-summary.json) |
| `npm test` | **58/58**,17 files,0 skipped | [unit](evidence/verification-summary.json) |
| `npm run test:integration` | **43/43**,13 files,0 skipped; gồm10 Admin mới | [integration](evidence/verification-summary.json) |
| `npm run build` | PASS | [build](evidence/verification-summary.json) |
| `npm run test:e2e` | **17/17**,0 skipped | [tracked E2E](evidence/verification-summary.json) |
| `playwright test tests/e2e/admin.spec.ts` sau thêm DB assertion | **3/3**,0 skipped | [Admin final](evidence/verification-summary.json) |
| Selected existing Grading/Live Quiz browser compatibility | **9/9**,0 skipped trong selection | [compatibility](evidence/verification-summary.json) |
| `npm run test:deployment` (local bundles only) | PASS | [smoke](evidence/verification-summary.json) |
| `npm audit`, `npm audit --audit-level=low`, `npm audit --omit=dev` | PASS,0 vulnerabilities | JSON + gate ở§6 |
| `git diff --check` / historical artifact hashes | PASS | [git final](FINAL_CLEANUP_VERIFICATION.md) |

Compatibility selection: `LIVE_QUIZ_WIDTHS=1440 npx playwright test --config playwright.ui.config.ts tests/ui/grading-results-rollout.spec.ts tests/ui/live-quiz.spec.ts --grep 'dirty route navigation|saving grading invalidates|reload, close|pending save|two essays|a completed save|real three-context|rejected join|keyboard, timer'`.

Sáu Grading cases giữ dirty navigation/cancel/reload/back/forward, pending/failure/retry, independent students, partial essays/result visibility, cache invalidation và save-completes-navigation. Ba Live Quiz cases gồm real three-context lifecycle/reconnect/deadline/final, rejected join và existing keyboard/timer/contrast/reduced-motion checks. Không rerun toàn bộ visual board scripts/Firefox/WebKit; không claim các cases không được chọn đã chạy.

Full integration cover auth/RBAC/Teacher ownership/Student isolation, classes/banks/archive/publish, attempts/autosave/timer/concurrency, grading/release/results/exports, storage boundary, sockets và Quiz. Tracked browser cover all-role core exam, Grading, Quiz, Question Bank/editor/images/loading/retry/responsive. Local production bundle smoke cover subpath/deep-route refresh, session persistence, bundled API/PDF fonts. Không thay thế hosted Storage hoặc real deployment tests.

### Failures / retries được giữ minh bạch

- Expected red: Admin500/P2010; ambiguous locator; old score layout; KaTeX inherited trust; Admin stale error. Đều có evidence trước/sau.
- New test harness: exact create-role label không khớp accessible name gồm option text; đổi sang combobox scoped trong form. Typecheck bắt optional index/tuple types của tests mới; đã sửa.
- Environment: sandbox DNS/local-socket restriction cần authorized escalation; thiếu `libpq` search path khi setup PG được khắc phục qua runtime library path. Không production access.
- First isolated browser copy dùng symlink dependencies gây Vite font allowlist403; final copy dùng clean install local, không sửa production Vite config.
- Một browser run khởi động trước khi clean-install hoàn tất có server/module churn; lượt retry bị ngắt để sửa harness, để lại test server chiếm port. Đã dừng đúng processes có cwd test copy và rerun với dependency tree ổn định. Các logs đó không được dùng làm final product verdict.
- Automatic Playwright retries không bật; các reruns kể trên là explicit sau sửa. Final selected suites không fail/skip. Build chunk>500kB và pg concurrent-query deprecation là warnings hiện hữu, không bị tắt.

## 10. Changed files, scope audit và remaining risks

**6 tracked files modified:**

- `apps/api/src/modules/admin/routes.ts` — dùng chung helper.
- `apps/web/src/features/admin.tsx` — xóa error sau successful role retry.
- `apps/web/src/components/Markdown.test.tsx` — compatibility/security regressions.
- `package.json`, `package-lock.json` — targeted dependency remediation.
- `tests/e2e/core.spec.ts` — semantic feedback locator và preserved score/percentage/feedback assertions.

**New source/tests:** `apps/api/src/modules/admin/lock.ts`, `apps/api/test/admin.integration.test.ts`, `tests/e2e/admin.spec.ts`.

**New evidence/report:** `docs/remediation/` gồm report này, verification JSON, sanitized summaries/JSON/hashes và hai synthetic Admin screenshots. Existing untracked `docs/audit/`, `docs/screenshots/system-audit/` giữ nguyên. [Git snapshot](FINAL_CLEANUP_VERIFICATION.md) liệt kê đầy đủ modified/untracked files, không chỉ progress log.

Không sửa Teacher Dashboard/QB/Exam/Student/Grading/Results/Quiz runtime hoặc styling, shared tokens, schema, migrations, scoring/release/socket protocol. Chỉ dependency resolution ảnh hưởng shared renderer; compatibility đã chạy. Targeted secret scan không tìm private keys/AWS/JWT credentials trong changed/new deliverables; synthetic test passwords và local test connection không phải production secret. Đây không phải full-history secret audit.

Remaining roadmap: pagination, Builder cache, published-image lifecycle, expired-session UI, Quiz crash presence, narrow Admin UX, documentation provenance/BTL delivery, deployment preparation và authorized staging. Các warnings/deprecated tooling và override maintenance cần theo dõi; không mở rộng phase này. Không xác nhận load/soak/multi-instance, full accessibility, real TLS/browser cross-site cookies/cloud storage/WSS/backup-restore.

Deployment implications: code có thể được user review để commit trong phase sau; hiện chưa commit/deploy. Không migration mới. Security/local release gates đã phục hồi nhưng historical unresolved findings và hosted verification vẫn khiến **overall release/handoff chưa sẵn sàng**.

**Git cuối:** branch/HEAD giữ baseline; changes unstaged; historical artifacts nguyên hash. **NO COMMIT · NO PUSH · NO DEPLOY · NO MERGE · NO PR.** Dừng tại review remediation.
