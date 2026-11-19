# ExamSpace — Final blocker remediation và re-audit

**Ngày:** 03/11/2026, Asia/Bangkok. **Đối tượng:** working tree trên `ui/final-refinement-recovery`, HEAD `51251acdb5f4eece85c3d44d2958ca98ba2efe0a`, gồm cả thay đổi chưa commit.

**Kết luận:** READY FOR FINAL ACCEPTANCE.

Phạm vi là hai nhóm blocker của audit 03/11: mất nội dung chưa lưu và published/source invariants, cùng regression và quality gates. Không redesign, không đổi schema/migrations, không truy cập production/credentials thật, không sửa Autonomous Workflow. Không commit/push/deploy/merge/PR.

## A. Root causes

1. **Exam/Quiz Builder:** state form chỉ nằm trong React, không có dirty baseline hoặc blocker/beforeunload. Save dùng nhiều request riêng; lỗi sau create khiến `/new` không giữ ID và lần thử tiếp theo lại POST. Quiz thiếu khóa thao tác đang lưu. Archive không đồng nghĩa lưu nội dung form nên cũng phải kiểm tra dirty trước mutation.
2. **Exam PUBLISHED:** `edit()` chỉ chặn ARCHIVED/có attempt. Các PUT classes/questions/pools có thể xóa sạch nguồn hoặc tạo pool không đủ, nhưng không kiểm tra cấu hình published sau ghi. Builder chỉ gọi `/publish` với thao tác publish mới; một save thường có thể giữ PUBLISHED dù đề không còn làm được.
3. **Nguồn câu hỏi:** PATCH type/tags/difficulty/options kiểm tra schema/asset nhưng không kiểm tra lại các Exam/Quiz phụ thuộc. Đổi filter có thể lấy mất ứng viên cuối của pool; đổi sang ESSAY làm Quiz không start được. Archive đã có guard riêng, sửa chưa có.
4. **Mutation gián tiếp:** room creation đọc Quiz rồi ghi room ngoài một transaction; archive Quiz chưa đồng bộ với start; archive lớp chưa bảo vệ assignment của đề đang công bố.
5. **Lint:** 13 bindings không dùng trong bốn harness hosted untracked. Đây không phải lỗi application source. Ngoài ra audit registry mới phát hiện một advisory minimatch tạo 18 moderate findings theo cây dependency, trái với số 0 không có giá trị xác nhận từ lần audit offline cũ.

**Negative controls trên bản sao source trước sửa:** 4 regression frontend FAIL đúng ở thiếu unload/archive guard; 2 regression PostgreSQL FAIL vì mutation sai trả 200 thay vì 400/409. Các test khác được lọc khỏi negative control, không phải skip của verification cuối. [Frontend red](/tmp/examspace-blocker-remediation-20261103/red-frontend.log), [backend red](/tmp/examspace-blocker-remediation-20261103/red-backend.log).

## B. Changes implemented

### B1. Bảo vệ nội dung chưa lưu

Tái sử dụng kiến trúc `useBlocker` + native dialog/beforeunload của dự án qua [builder-guard.tsx](../../apps/web/src/features/builder-guard.tsx):

- So sánh baseline với các giá trị thực sự được lưu; đổi bước, tìm kiếm hoặc chọn trang của picker không tự tạo dirty state.
- Chặn link nội bộ và Back/Forward khi có thay đổi hoặc request đang pending; lựa chọn ở lại giữ nguyên form. Sau save thành công, tiếp tục đúng đích history đã bị chặn.
- Reload/đóng tab dùng cảnh báo native; không thể bảo đảm phục hồi nếu người dùng chủ động xác nhận bỏ dữ liệu hoặc browser/OS bị kill.
- Dùng ref khóa synchronous để chống hai save đồng thời, disable các input khi pending; request lỗi không ghi nhận baseline đã lưu.
- Chỉ acknowledge payload được server xác nhận, không acknowledge một chỉnh sửa mới hơn. Cập nhật ref trước navigation để không cảnh báo sai sau thành công.
- Giữ ID sau create thành công; nếu bước tạo room sau đó lỗi, retry cập nhật Quiz đó, không tạo Quiz mới.
- **Archive trên form dirty bị chặn trước request**, thông báo cần lưu hoặc bỏ thay đổi trước. Archive không được dùng để đánh dấu nội dung chưa lưu là đã lưu.

Không thêm autosave hoặc local draft persistence cho builder. Không ghi đè bản nháp trên thiết bị/server. Hai file autosave Student không được sửa trong nhiệm vụ này.

### B2. Invariants và toàn bộ mutation paths được rà soát

Quiz không có field PUBLISHED: phạm vi tương ứng là definition chưa archived và room chưa snapshot/LOBBY. Draft rỗng chưa dùng vẫn có thể lưu; tạo room/start cần nguồn hợp lệ. Snapshot của attempt/phòng đã bắt đầu được giữ nguyên.

| Mutation path | Invariant/transaction sau sửa |
| --- | --- |
| `POST /teacher/exams` | Tiếp tục tạo DRAFT bằng schema; không cho client tự đặt status/owner. |
| `PATCH /teacher/exams/:id`; PUT `classes`, `questions`, `pools` | Giữ lock Exam → catalog, khóa sửa khi có attempt; revalidate trạng thái PUBLISHED **trong cùng transaction sau mutation**, rollback nếu sai. |
| **POST `/teacher/exams/configuration`; PUT `/teacher/exams/:id/configuration`** | Envelope metadata + classes + fixed + pools + tùy chọn publish ghi atomically. Cho phép thay fixed sang pool hợp lệ mà không commit trạng thái trung gian. Publish lỗi không để lại Exam tạo dở. |
| `POST /exams/:id/publish` | DRAFT, lịch hợp lệ/chưa hết hạn, lớp active thuộc Teacher, nguồn active đủ câu/không trùng/điểm hợp lệ, asset references hợp lệ. |
| `POST /exams/:id/archive`; DELETE legacy | Archive POST serialize với edit/publish/start bằng row lock; legacy DELETE giữ điều kiện có sẵn. Archive không thay snapshot. |
| POST/PATCH Quiz; PUT `questions` | Draft metadata/schema giữ nguyên; updates khóa Quiz → catalog, kiểm tra nguồn objective/active/ownership/assets. Không cho xóa hết câu khi có LOBBY. |
| **POST `/teacher/quizzes/configuration`; PUT `/teacher/quizzes/:id/configuration`** | Metadata + toàn danh sách câu cùng transaction; lỗi nguồn/validation rollback cả metadata và các bản ghi con. |
| `POST /quizzes/:id/rooms`; socket `quiz:host:start` | Room creation validate nguồn không rỗng/active/asset trong transaction Quiz → catalog. Start giữ thứ tự Room → Quiz → catalog và chặn definition archived. Legacy room vẫn bị kiểm tra tại start. |
| DELETE Quiz | Transaction, không archive khi có phòng LOBBY; trả `QUIZ_HAS_LOBBY`. LIVE/FINISHED snapshot không bị viết lại; Quiz archived không nhận room mới/edit mới. |
| POST/PATCH Question | Schema/asset guards giữ nguyên; PATCH thêm kiểm tra affected published pools và active Quiz sau ghi trong catalog transaction. Vi phạm trả `SOURCE_IN_USE`, rollback cả type/filter/options. |
| DELETE Question/Bank (soft archive), restore | Giữ catalog lock và archive guards đã có. Archive thiếu nguồn bị rollback; restore không thay identity/snapshot. Không thêm hard delete. |
| PATCH Bank metadata | Chỉ title/subject/description theo schema có sẵn; không cho đổi owner/bankId hay sửa filter của câu hỏi gián tiếp. |
| DELETE Class | Catalog transaction chặn archive lớp được giao Exam PUBLISHED chưa đóng (`CLASS_IN_USE`). Metadata/roster mutations giữ policy hiện có; không rewrite lịch sử attempt. |
| Upload/delete asset | Giữ guards reference/snapshot và validation đã có; kiểm chứng lại bằng integration. Không xóa object production. |
| Admin status/role; grading/release | Rà soát: dependency/RBAC guards hiện có không cho đổi chủ sở hữu/xóa source published; chấm/công bố không sửa cấu trúc đề. Không mở thêm quyền Admin. |

Validation tập trung ở [Exam configuration](../../apps/api/src/modules/exams/configuration.ts), [Quiz configuration](../../apps/api/src/modules/live-quiz/configuration.ts), [source lifecycle](../../apps/api/src/modules/question-banks/lifecycle.ts). Reuse row/catalog locks, không thêm lock theo thứ tự ngược. Các lỗi sử dụng mã API có sẵn và thông báo tiếng Việt; bổ sung thông báo `INVALID_CLASS/BANK/QUESTION`.

### B3. Lint và dependency gate

| Harness untracked giữ lại | Số bindings được đánh dấu intentional-unused |
| --- | --- |
| `tests/deployment/hosted-auth-fix.mjs` | 1 (`admin`) |
| `tests/deployment/hosted-auth-revocation-diagnostic.mjs` | 4 (`fixtures`, `pass`, `phase`, `authSocket`) |
| `tests/deployment/hosted-auth-revocation-sequence.mjs` | 4, cùng loại trên |
| `tests/deployment/hosted-staging-image.mjs` | 4 (`pg`, `phase`, `db`, `socket`) |

Chỉ thêm prefix `_` theo chính rule unused-vars đã có, giữ nguyên harness và tác dụng import; không chạy script hosted, không xóa untracked file, không sửa ESLint config/ignore hay hạ phạm vi lint. Các file là evidence/harness lịch sử nằm dưới glob của full lint, không phải application source hoặc entrypoint CI mặc định.

Gate registry mới được sửa bằng **một override chính xác `minimatch: 11.0.1`** và lockfile tương ứng. Chỉ 16 entries trong họ minimatch/brace-expansion/balanced-match thay đổi; không nâng/hạ direct dependencies. Đã kiểm tra engines tương thích Node hiện tại, API được các caller dùng, full lint và PDF/Excel integration. `npm install --ignore-scripts --no-audit --no-fund --prefer-offline` tái dùng bộ đã cài; không chạy `npm audit fix --force`.

Advisory: [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). Live registry audit sau sửa: **0 vulnerabilities**, không dùng cache offline để sign off.

## C. Regression tests added

- **13 frontend/component tests:** [builder-integrity.test.tsx](../../apps/web/src/features/builder-integrity.test.tsx): hai builder với links/Back/Forward/unload, giữ form qua step, picker không dirty, pending/failure/retry, success không cảnh báo sai, tiếp tục đúng history destination, giữ created ID khi tạo room lỗi, và không archive nội dung dirty.
- **8 PostgreSQL integration tests:** [published-invariants.integration.test.ts](../../apps/api/test/published-invariants.integration.test.ts): chặn cấu hình sai, so sánh nguyên trạng mọi field sau rollback, cho phép fixed → pool hợp lệ, khóa sau attempt, create/publish không partial row, filter/options rollback, Quiz source/LOBBY/archive/legacy guard, hai race source mutation.
- **6 Playwright regressions:** [builder-blockers.spec.ts](../../tests/recovery/builder-blockers.spec.ts): native reload/tab-close và history thật, save 503/pending rồi success qua backend thật, dirty archive, UI bỏ câu cuối của PUBLISHED, question editor đổi ESSAY và kiểm tra nguồn pool qua API thật.
- Sáu fixture socket cũ được bổ sung câu khách quan hợp lệ để thỏa room readiness; **không bỏ assertion socket/FIFO/reconnect**. Test asset bổ sung reject tại room creation, đồng thời tạo legacy room trực tiếp trong test để **giữ kiểm tra reject tại start**.
- [playwright.blockers.config.ts](../../playwright.blockers.config.ts) dùng server/rate-limit store mới. `npm run test:e2e` và một step CI hiện có chạy thêm nhóm này; không xây dựng Autonomous Workflow.

## D. Verification results

Tất cả lệnh dùng Node 22.23.4/npm 10.9.9 đã có, `DOTENV_CONFIG_PATH=/dev/null`, env DB chỉ loopback; không lấy `.env` thật. Kết quả dưới đây cho working tree sau sửa, không phải tuyên bố CI remote của HEAD đã chạy.

| Lệnh/gate | Kết quả cuối | Evidence |
| --- | --- | --- |
| `npm run lint` | **PASS**, exit 0, full tree gồm harness untracked; không exclude thêm | [log](/tmp/examspace-blocker-remediation-20261103/lint-final.log) |
| `npm run typecheck` | **PASS**, shared/API/web và tests | [log](/tmp/examspace-blocker-remediation-20261103/typecheck-final.log) |
| `npm run build` | **PASS** | [log](/tmp/examspace-blocker-remediation-20261103/build-final.log) |
| `npm test` | **159 PASS / 0 FAIL**, 24 files; autosave integrity **24/24** | [JSON](/tmp/examspace-blocker-remediation-20261103/unit-final-results.json) |
| Targeted frontend regression | **13 PASS / 0 FAIL** | [log](/tmp/examspace-blocker-remediation-20261103/frontend-target.log) |
| `npm run test:integration` | **82 PASS / 0 FAIL**, 18 files; gồm 8 regression mới | [JSON](/tmp/examspace-blocker-remediation-20261103/integration-final-results.json) |
| `npm run test:e2e` | **54 PASS / 0 FAIL**: core 20, Student Exam 25, Session Recovery 3, blockers 6; bốn nhóm server liên tiếp, không retry/skip | [log](/tmp/examspace-blocker-remediation-20261103/e2e-final.log) |
| `npm run test:deployment` | **PASS**, smoke local: production bundles, SPA subpath/404, deep refresh, Session và PDF | [log](/tmp/examspace-blocker-remediation-20261103/deployment-final.log) |
| `npm audit --audit-level=low --json` (online) | **PASS**, 0 vulnerabilities | [log](/tmp/examspace-blocker-remediation-20261103/advisory-final.log) |
| `npm ls minimatch --all --json` | **PASS**, caller dùng override 11.0.1 | [log](/tmp/examspace-blocker-remediation-20261103/dependency-tree.log) |
| `git diff --check` | **PASS** | Final workspace verification |

Không cộng targeted tests vào tổng một lần nữa. Negative controls FAIL là kết quả mong đợi trên source cũ, không phải FAIL còn lại của sản phẩm. Các lượt trung gian có lỗi fixture, options locator TypeScript, chờ reload bị hủy/DOM commit và một lượt E2E bị API watch restart đã được sửa/chạy lại; không tăng retries, hạ assertion hoặc tăng quota để che lỗi. Source được giữ cố định trong lượt E2E cuối.

## E. PostgreSQL integration/E2E evidence

- **PostgreSQL 16.15 thật**, `examspace_remediation_test` tại **127.0.0.1:55447**; không dùng PGlite, SQLite hoặc mock DB.
- Do host chưa cài PostgreSQL, tải các gói Ubuntu PostgreSQL/server/client/libpq vào `/tmp` rồi giải nén. Không `apt install`, không system service/config. Data directory riêng `/tmp/examspace-blocker-remediation-20261103/postgres-data`, chỉ bind loopback.
- `npm run db:migrate`: **PASS**, hai migrations committed `20260930000000_initial`, `20260930010000_integrity` applied vào database mới. `npm run db:seed`: **PASS**, dữ liệu development riêng. Không reset/migrate/seed cloud.
- [DB/version/migration evidence](/tmp/examspace-blocker-remediation-20261103/postgres-evidence.txt); [migration log](/tmp/examspace-blocker-remediation-20261103/migrate.log); [seed log](/tmp/examspace-blocker-remediation-20261103/seed.log).
- HTTP, Session, CSRF, RBAC, transaction, rollback và socket integration dùng API/PostgreSQL thật. Storage provider trong tests là fixture/double cục bộ, được ghi rõ; không coi đó là Supabase cloud PASS.
- Playwright 503/delay injection chỉ tạo điều kiện lỗi mạng. Các save thành công và kiểm tra published/source state gọi backend thật và đọc lại dữ liệu thật. Không dùng response mock thay kết quả integration/E2E.
- Đã dừng PostgreSQL test và xác minh các cổng 55447/3000/5173/54329/3001/5174 đều đóng. Data/evidence riêng trong `/tmp` được giữ lại; không để service nền chạy.

## F. Remaining risks / NOT RUN

**Không còn blocker được xác nhận trong phạm vi remediation này** khi các gate ở D đều PASS. Những giới hạn sau không được chuyển thành PASS:

- **NOT RUN:** production Supabase/Render, hosted HTTPS/cookie/WSS/cold start/backup, load benchmark, Safari/Firefox, toàn bộ 18 historical UI specs và rubric ngoài repository. Không truy cập production là giới hạn chủ động theo yêu cầu.
- **P2 còn lại ngoài scope:** ảnh lỗi chưa có retry tại chỗ (audit P2-03); error/retry list Exam bị lặp (P2-05); tài liệu deployment lịch sử mâu thuẫn (P2-04). Các báo cáo deployment đang modified của người dùng được giữ nguyên; báo cáo này là checkpoint remediation mới.
- **P3:** Markdown chunk khoảng 592.76 kB minified; chưa đo thấy blocker hiệu năng. Còn warning deprecation của pg adapter khi query chồng nhau và NO_COLOR/FORCE_COLOR trong harness; các gate vẫn PASS, không đổi dependency ngoài pin advisory cần thiết.
- Native `beforeunload` là cảnh báo, không phải lưu nháp. Nếu người dùng xác nhận bỏ thay đổi hoặc browser bị crash/OS kill, builder không có persistence phục hồi. Không thêm autosave builder trong nhiệm vụ này.
- Quiz có LOBBY cần hoàn tất trước archive; sửa cấu hình Exam sau attempt đầu vẫn bị khóa; các snapshot đã tạo không được viết lại.
- Fresh `npm ci` trên máy sạch và GitHub CI remote **NOT RUN**; lockfile/engines được đối chiếu và dependencies hiện tại đã qua các gates local. Không tuyên bố mọi đường nghiệp vụ hoặc mọi môi trường đã được chứng nhận.

## G. Files changed

**26 source/test/config files và 2 report/evidence files.** [Task-only patch](/tmp/examspace-blocker-remediation-20261103/task-only.patch) tách khỏi những thay đổi đã có trước.

- [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
- [apps/api/src/modules/classes/routes.ts](../../apps/api/src/modules/classes/routes.ts)
- [apps/api/src/modules/exams/configuration.ts](../../apps/api/src/modules/exams/configuration.ts)
- [apps/api/src/modules/exams/routes.ts](../../apps/api/src/modules/exams/routes.ts)
- [apps/api/src/modules/live-quiz/configuration.ts](../../apps/api/src/modules/live-quiz/configuration.ts)
- [apps/api/src/modules/live-quiz/routes.ts](../../apps/api/src/modules/live-quiz/routes.ts)
- [apps/api/src/modules/live-quiz/service.ts](../../apps/api/src/modules/live-quiz/service.ts)
- [apps/api/src/modules/question-banks/lifecycle.ts](../../apps/api/src/modules/question-banks/lifecycle.ts)
- [apps/api/src/modules/question-banks/routes.ts](../../apps/api/src/modules/question-banks/routes.ts)
- [apps/api/src/utils/errors.ts](../../apps/api/src/utils/errors.ts)
- [apps/api/test/asset-integrity.integration.test.ts](../../apps/api/test/asset-integrity.integration.test.ts)
- [apps/api/test/published-invariants.integration.test.ts](../../apps/api/test/published-invariants.integration.test.ts)
- [apps/api/test/quiz.integration.test.ts](../../apps/api/test/quiz.integration.test.ts)
- [apps/web/src/features/builder-guard.tsx](../../apps/web/src/features/builder-guard.tsx)
- [apps/web/src/features/builder-integrity.test.tsx](../../apps/web/src/features/builder-integrity.test.tsx)
- [apps/web/src/features/exams.tsx](../../apps/web/src/features/exams.tsx)
- [apps/web/src/features/quiz.tsx](../../apps/web/src/features/quiz.tsx)
- [apps/web/src/styles/live-quiz.css](../../apps/web/src/styles/live-quiz.css)
- [docs/audits/FINAL_BLOCKER_REMEDIATION_20261103.md](../../docs/audits/FINAL_BLOCKER_REMEDIATION_20261103.md)
- [docs/audits/FINAL_BLOCKER_REMEDIATION_20261103.verification.json](../../docs/audits/FINAL_BLOCKER_REMEDIATION_20261103.verification.json)
- [package-lock.json](../../package-lock.json)
- [package.json](../../package.json)
- [playwright.blockers.config.ts](../../playwright.blockers.config.ts)
- [tests/deployment/hosted-auth-fix.mjs](../../tests/deployment/hosted-auth-fix.mjs)
- [tests/deployment/hosted-auth-revocation-diagnostic.mjs](../../tests/deployment/hosted-auth-revocation-diagnostic.mjs)
- [tests/deployment/hosted-auth-revocation-sequence.mjs](../../tests/deployment/hosted-auth-revocation-sequence.mjs)
- [tests/deployment/hosted-staging-image.mjs](../../tests/deployment/hosted-staging-image.mjs)
- [tests/recovery/builder-blockers.spec.ts](../../tests/recovery/builder-blockers.spec.ts)

Không sửa `attempts.tsx`, `attempt-integrity.test.tsx` hoặc ba deployment docs/JSON modified trước phiên. 29 artifact ảnh/JSON do suite cũ ghi vào `docs` đã được lưu riêng cho lượt test và trả về **đúng bytes/hash trước phiên**. Không xóa các artifact cũ hoặc dữ liệu untracked ngoài phạm vi lint nêu trên.

## H. Git status và preservation

Branch/HEAD không đổi; **0 staged, 20 tracked modified, 192 untracked files**. Trước phiên: 5 tracked modified + 183 untracked. Trong 605 file tracked/untracked có sẵn, chỉ 19 file thuộc phạm vi source/test/config/harness nói trên đổi; không thiếu file. Các thay đổi gốc trong 5 file được bảo vệ giữ nguyên byte/hash. [Git status đầy đủ](/tmp/examspace-blocker-remediation-20261103/git-status-after.txt).

Hai checksum autosave trước = sau:

| File | SHA-256 |
| --- | --- |
| `apps/web/src/features/attempts.tsx` | `948b994d8f77071e8c325d02157119988c0606adb752fd4b28b361fedc5aab2a` |
| `apps/web/src/features/attempt-integrity.test.tsx` | `02d43dff2d3541472b1be8aa7c80a231d63f40aa8002078d5e4dade2e52d2440` |

[Machine-readable verification](FINAL_BLOCKER_REMEDIATION_20261103.verification.json) ghi commands, kết quả, file hashes, preservation và trạng thái Git. Raw logs/evidence test riêng ở `/tmp/examspace-blocker-remediation-20261103/`. Chỉ test DB mới được mutate; không reset/stash/clean, không mất file tracked/untracked có sẵn.

## I. Final acceptance recommendation

**READY FOR FINAL ACCEPTANCE.**

Hai nhóm blocker đã sửa và kiểm tra lại bằng Chromium/API/PostgreSQL thật, gồm rollback, concurrency, navigation/unload và pending/failure/success. Full lint, typecheck, build, unit/frontend, integration, bốn nhóm E2E, deployment smoke local và registry advisory gate đều có evidence PASS. Khuyến nghị nghiệm thu Core theo acceptance gates của repository; các giới hạn và P2/P3 ở F vẫn được giữ rõ, không gán thành chứng nhận production.

Đánh giá áp dụng cho working tree đã kiểm chứng, không cho bản deployment cloud chưa được truy cập. Không suy ra toàn sản phẩm đạt chỉ vì test PASS; kết luận dựa trên root-cause fixes, negative controls, rollback/concurrency evidence, browser tái hiện luồng lỗi và toàn bộ gates local của repository. Không thực hiện commit/push/deploy/merge/PR.
