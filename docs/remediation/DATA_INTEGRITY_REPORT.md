# ExamSpace — Data integrity + cross-module remediation

Ngày: 13/10/2026 (Asia/Bangkok). Phạm vi: ASSET-001, SYS-001, SYS-002. Targeted implementation đã được user duyệt cho đúng một local commit; không push/deploy/merge/PR. Bản này bổ sung evidence mới, không thay báo cáo audit lịch sử.

## 1. Baseline và an toàn Git

- Repository `LAMB-IS-ME/BTL-CNW-DVTT`, branch `ux/education-saas-redesign-pilot`.
- HEAD `a830497c72998639bba27b5d8d23c952709720ab`, `fix: resolve admin account mutations and release gates`.
- Bắt đầu không có tracked/staged modifications; đúng 31 untracked artifacts lịch sử. Không reset/checkout/discard/clean. Stage chọn lọc chỉ sau quyết định duyệt local commit.
- [Manifest lịch sử](data-integrity-evidence/historical-artifacts.json) phân loại và SHA-256 từng file: evidence before của phase Admin/audit, DOM/debug captures và logs verification/remediation cũ. Không có source mới, file không liên quan hay temporary files trong 31 paths này; không tự đưa chúng vào scope commit.
- Không có `AGENTS.md` áp dụng trong repository hoặc thư mục cha. Đã đọc SDD, phần storage/snapshot của MASTER_SPEC local, source/schema/routes và test configuration, ba tài liệu audit bắt buộc, asset/pagination probes, UX Question Bank và Exam Folio cùng evidence phase Admin.
- Schema, migrations, dependencies, lockfile và design tokens không đổi. Không truy cập production Supabase.

## 2. Before-fix reproduction

[Asset regression red run](data-integrity-evidence/evidence-summary.json): ba tests đều FAIL trước sửa. Xóa ảnh vẫn đang trong nội dung published trả **204**, expected **409**; ghi asset ID không tồn tại/khác câu hỏi trả **200**, expected **400**; concurrent publish/delete vẫn cho delete **204**. PostgreSQL thật, SDK Storage double.

[Browser before](data-integrity-evidence/browser-before.json): fixture riêng 22 classes, 101 banks; Classes → Exams → Builder qua SPA cho **20** checkbox, reload cho **22**. Browser baseline test PASS nghĩa là xác nhận lỗi, không phải sản phẩm PASS. [Ảnh trước sửa](../screenshots/data-integrity/builder-before.png) được chụp ở nhánh sau reload. Audit lịch sử [asset-probe](../audit/evidence/asset-probe.json) còn chứng minh Start thành công rồi Student GET asset404; [pagination-probe](../audit/evidence/pagination-probe.json) ghi classes/exams20+2 và banks100+2. Không sửa các evidence này.

## 3. Published asset integrity: nguyên nhân và implementation

Trước sửa, DELETE chỉ đếm `AttemptQuestion`/`LiveRoomQuestion` theo question ID. Snapshot được tạo ở Student Start / Quiz host Start, không ở Publish; khoảng trước first attempt chưa có protection. Question create/edit cũng chưa kiểm chứng asset reference nên có thể đưa ID đã xóa vào nội dung.

Sửa tại backend boundary:

1. DELETE lấy catalog advisory transaction lock hiện có của owner; ownQuestion và asset thuộc đúng question được kiểm tra trong transaction.
2. Giữ historical snapshot guard hiện hữu. Thêm kiểm tra references trong prompt, explanation, options, và cả JSON snapshots; bao gồm references legacy khác question. Guard dùng SQL `EXISTS`, không đưa toàn bộ corpus lên Node/client. Có reference trả **409 ASSET_REFERENCED**, thông báo tiếng Việt hướng dẫn gỡ tham chiếu/lưu trước; lịch sử vẫn phải giữ.
3. Create/edit Question kiểm tra toàn bộ `asset:<uuid>` trong prompt/options/explanation: metadata phải còn tồn tại và thuộc đúng question. Trả **400 INVALID_ASSET_REFERENCE** cho missing/foreign references. Hợp với Student signing vốn xác định quyền bằng original question identity.
4. Publish/Attempt Start và Quiz Start kiểm tra assets trước materialization, dưới cùng lock. Tất cả eligible random-pool candidates được kiểm tra, không chỉ draw ngẫu nhiên. Một metadata query gộp theo IDs cho cả tập nguồn, tránh N+1 mỗi câu hỏi.
5. Editor hiện có chỉ gỡ/thay markdown reference; không tự gọi physical DELETE. Giữ flow upload → lưu reference và snapshot-at-Start. Không thêm immutable binary snapshot hay thay scoring/release/timer.

### Thứ tự lỗi DB/Storage

Sau khi xác nhận không còn reference, xóa metadata và **commit DB trước**, rồi mới gọi Storage remove. Nếu DB thất bại, không gọi remove. Trong khoảng sau commit, save/publish/start không thể tạo reference mới tới ID đã mất. Không giữ transaction DB mở trong lúc chờ network Storage.

Nếu Storage remove báo lỗi: trả **502 STORAGE_DELETE_FAILED**, không trả204 và không phục hồi metadata có nguy cơ trỏ tới object đã mất. Retry cùng ID trả404; stale save reference trả400. Có thể còn object mồ côi không được nội dung sử dụng. Đây là giới hạn cleanup, không phải atomic transaction xuyên hai hệ thống. Orphan có thể được nhận diện bằng inventory object paths trong private bucket trừ tập `QuestionAsset.storagePath` hiện còn; path vẫn chứa owner/question IDs. Phải đối soát snapshot/reference và chờ upload đang dở hoàn tất trước một cleanup được duyệt, không xóa ngay theo một inventory có thể đang thay đổi. Test stateful Storage double xác nhận object còn bytes nhưng metadata/reference đã mất; không có missing published image. Chưa có durable cleanup queue; mất tiến trình sau DB commit hoặc provider failure cần đối soát/dọn object riêng. Không tự thêm schema/outbox, không tự chạy cleanup trên production. Upload compensation hiện có được giữ nguyên.

### Ma trận asset

| Trường hợp | Evidence / kết quả |
|---|---|
| Upload draft; remove/replace markdown; PNG/JPEG/WebP; invalid signature/size; retry upload/link | Existing Question Bank browser tests, API/DB + local HTTP Storage double |
| Delete trước first attempt published | 409; provider remove không được gọi |
| Student Start, ảnh render có naturalWidth, reload, submit, signed object GET | Browser mới: HTTP200 và ảnh thật từ local double |
| Prompt/options/explanation; random pool | Integration mới: bảo vệ trước snapshot, Student đọc option image |
| Edit, archive/restore; existing attempt | Historical image vẫn GET200; snapshot giữ asset ID cũ |
| Teacher khác, Student, thiếu CSRF | 404/403/403, không xóa object |
| Storage failure và retry | 502 → metadata không còn referenceable → retry404, stale save400 |
| DB transaction failure | 500, metadata còn, provider remove chưa gọi; retry204 |
| Publish/delete và reattach/delete đồng thời | Published reference không mất; reattach/delete chỉ chấp nhận cặp (409,200) hoặc (204,400) |
| Live Quiz trước/sau Start | 409 trước snapshot; Student GET200; chỉnh source không mất room snapshot |
| Legacy missing source | Start400, không tạo Attempt; không che ảnh lỗi bằng fallback |
| Legacy cross-question reference | DELETE409 |

Review bổ sung sau interruption còn kiểm tra concurrent Student Start/delete: snapshot chứa đúng ID, metadata và PNG bytes vẫn còn; invalid Publish giữ DRAFT, invalid Quiz Start giữ LOBBY và không ghi room snapshots. Tests concurrency chứng minh các interleavings chạy trong PostgreSQL test và lock protocol của các code paths đã đọc; không phải kiểm chứng mọi crash/network failure hay hosted multi-instance deployment.

## 4. Pagination inventory và thay đổi

Contract hiện có: `page` mặc định1, `pageSize` mặc định20, tối đa100, `search` tối đa200 ký tự. Không tăng giới hạn. Các endpoint array cần total được mở rộng **opt-in `view=manage` → `{items,total}`**; request cũ vẫn trả array. Authorization không đổi.

| Consumer / endpoint | Before | After / phạm vi kiểm chứng |
|---|---|---|
| Admin users `/admin/users` | PASS: items/total, page/search/role | Giữ UI; thêm ID tie-break vào createdAt sort. Existing Admin E2E và RBAC chạy lại |
| Admin classes `/admin/classes` | CONFIRMED BUG: chỉ20 | Page/search/total, legacy array giữ nguyên; sort createdAt desc + id asc; browser 23 records |
| Teacher Classes `/teacher/classes` | CONFIRMED BUG: chỉ20 | Page/search/total, URL state; API active/archived filter, stable sort; browser create/edit/list/reload |
| Student discovery `/teacher/students` | CONFIRMED BUG từ source: page state không gửi tới API | Page/search/total; fullName + id sort; browser chọn student22 và xác nhận membership |
| Question Bank manage `/teacher/question-banks?view=manage`, questions | PASS: server filters/search/sort/total/pager | Không sửa management UI; existing comprehensive E2E chạy lại |
| Teacher Exams `/teacher/exams` | CONFIRMED BUG: chỉ20 | Page/search/total, URL state; API status filter, stable sort; browser trang2/search/reload |
| Builder class selector `/teacher/classes` | CONFIRMED BUG/cache collision | Active classes được lọc server trước phân trang; page20 + search, giữ selected IDs ngoài trang |
| Exam fixed/pool bank picker và Quiz bank picker | CONFIRMED BUG: chỉ100 (Quiz xác định từ shared source) | Shared bounded BankPicker dùng existing bank manage contract + active filter, search/page20; hydrate bank đang chọn qua owner detail endpoint |
| Student Exams `/student/exams` | PASS về khả năng đi trang tiếp | Không sửa; first-page loss không áp dụng. RISK: exact-multiple có thể cho đi thêm trang rỗng; sort openAt chưa có ID tie-break |
| Grading submissions `/teacher/exams/:id/submissions` | PASS: existing RecordPager/look-ahead | Không sửa; compatibility và API authorization chạy lại. RISK: submittedAt ties chưa có ID tie-break |
| Teacher Results `/teacher/exams/:id/results` | PASS: items/total/pager | Không sửa; compatibility chạy lại. RISK: fullName ties chưa có ID tie-break |
| Student Results index `/student/exams` | PASS: RecordPager/look-ahead | Không sửa. Membership-dependent history limitation ngoài scope |
| Live Quiz library `/teacher/quizzes` | PASS về khả năng đi trang tiếp | Không sửa library paging/protocol. RISK: exact-multiple trang rỗng và createdAt ties |
| Dashboard recent banks | NOT APPLICABLE | Intentional latest3, không phải toàn bộ danh sách |
| Class roster/detail, own result detail | NOT APPLICABLE | Endpoint trả quan hệ/record, không phải page contract |
| Quiz room history latest20 | NOT APPLICABLE cho finding trang đầu | Existing intentional cap, không mở feature history mới |

Các RISK kể trên là source observations trong module đã có pagination, không phải lỗi thiếu toàn bộ trang sau đã tái hiện. Giữ scope, không tự sửa chúng hoặc tuyên bố boundary/tie testing toàn bộ các module này.

### Chất lượng pagination

Hook mới dùng query key gồm prefix, user ID/role, path, status, search, page và pageSize; debounce250ms; late response thuộc key cũ không thay kết quả hiện tại. Không tự fetch toàn bộ pages hay prefetch không giới hạn. Mỗi navigation/search fetch một page20; metadata total giúp disabled states đúng. Page ngoài total sau mutation được đưa về last page khi response hợp lệ. Search reset page1; list page/search được giữ trên URL khi reload, selectors dùng state riêng không sửa draft URL.

API tests:22 classes/exams/students/admin classes và101 banks; distinct IDs qua trang, equal-createdAt sorting, last page, search, active/archived/status filters, create/edit/archive, empty search, legacy DTO, pageSize101 bị400, owner/role isolation. UI filter hiện có ở Question Bank/Admin users giữ nguyên; không thêm bộ lọc mới vào các màn hình vốn chưa có.

## 5. Builder cache consistency và draft

Root cause chính xác: Classes dùng key `['classes']` và request default20; Builder dùng cùng key với pageSize100, trong staleTime10s nhận lại fresh array20. Reload xóa cache nên request100 trả22.

Key mới phân biệt toàn bộ contract và identity; Classes mutations invalidate prefix `classes`, gồm cả list và selected-class detail. Builder revalidates source theo lifecycle query; không force reload, không reset form khi source refetch. Cả SPA và reload hiển thị **20 trên trang1 / total22**, lớp21–22 có ở trang2 hoặc server search. Đúng yêu cầu discoverability, không ép22 checkbox vào một page.

Selected class IDs/fixed questions/pools nằm trong draft state độc lập. Lớp được chọn ngoài page có nhãn và nút bỏ lựa chọn, đọc name từ owner detail. Bank chọn ngoài page được giữ bằng option riêng theo ID. Archive/mất quyền gây error/validation, không âm thầm xóa lựa chọn hoặc lưu sang record khác. Query không tự overwrite unsaved title.

Unit cases0/1/20/22, late responses, query isolation, retry và page shrink. Browser chọn đúng `Integrity class 22`, đổi page/search, nhập title, đổi bank search, lưu draft; DB xác nhận đúng class ID; mở lại/reload giữ selection. Browser đi qua6 bank pages thu đủ101 IDs không trùng. [Request evidence](../screenshots/data-integrity/request-counts.json) ghi16 catalog-list requests cho toàn bộ kịch bản gồm SPA/reload/search và sáu pages người dùng chủ động mở, tất cả pageSize20. Selected detail requests chỉ cho records đã chọn, không tải toàn database.

Baseline Exam Folio không có route leave blocker cho Builder (report cũ ghi rõ). Không invent cam kết giữ draft qua reload/đóng browser hoặc thêm unsaved-warning feature ngoài scope; bảo vệ state đang nhập trước query/page/search/refetch. Question Bank và Grading leave guards hiện có được regression suite kiểm tra.

## 6. Security và cross-module workflows

- Teacher owner guards và Student own-attempt/snapshot signing vẫn enforce tại API. Admin không inherit Teacher. Missing CSRF, foreign origin, session/role transitions vẫn nằm trong full integration/E2E.
- Private Storage adapter, upload MIME/signature5MB, random owner/question storage paths và signed URL300s giữ nguyên; explanation release/reveal checks giữ nguyên.
- Workflow A: bank upload/link → publish → delete409 → Student image/reload/submit → teacher source edit → historical image200.
- Workflow B: Classes22 → SPA Builder → choose class22 → draft save → DB relationship → reload.
- Workflow C: page2 → search → class rename → student22 membership → create class → total23 → Exam page2/search → Admin page2.
- Workflow D: owner isolation, Student management403, Teacher/Admin role isolation và existing Admin changes/session tests.

## 7. Verification và evidence

Kết quả lệnh cuối, counts và nguồn evidence được ghi ở [verification JSON](data-integrity-verification.json). Regression code mới: `asset-integrity.integration.test.ts` (10), `pagination-integrity.integration.test.ts` (3), `catalog-pagination.test.tsx` (7), `data-integrity.spec.ts` (3). Không xóa tests, weaken assertions hoặc bật retries để che lỗi.

**Trạng thái: remediation đã được user duyệt; checkpoint cleanup cho một local commit. Không có blocker còn mở trong phạm vi đã kiểm chứng.**

| Gate | PASS | FAIL | SKIPPED | Nguồn / cách tổng hợp |
|---|---:|---:|---:|---|
| Unit/frontend | 65 | 0 | 0 | Một batch đã persist; reuse vì product source không đổi |
| Integration | 56 | 0 | 0 | 46 cases không đổi từ batch 54 trước interruption + 10 asset cases chạy lại; không đếm trùng 8 asset cases cũ |
| Browser E2E | 20 | 0 | 0 | 14 PASS xác nhận qua tool transcript + 6 PASS trong batch recovery; không tuyên bố một full run mới |
| Grading/Results compatibility | 16 | 0 | 0 | Cùng batch compatibility cuối với Live Quiz |
| Live Quiz compatibility | 3 | 0 | 0 | Lifecycle/recovery/deadline/results, rejected join, keyboard/timer/touch/contrast/reduced-motion |
| Lint / typecheck / build | PASS | — | — | Lint/typecheck chạy lại sau mở rộng test; build reuse trên product source không đổi |
| Responsive affected screens | PASS | — | — | Builder, Classes, Exams, Admin Classes tại 1440/1024/820/390/320 |

[Compatibility cuối](data-integrity-evidence/evidence-summary.json) là một batch **19/19 PASS, 0 FAIL, 0 SKIPPED**, hoàn thành trong 1,9 phút. Có kiểm tra Grading boundaries 1/20/21/30/100/105 và Student history 0/1/20/25; Live Quiz lifecycle ở 1440, accessibility case ở năm widths. Những giới hạn ở §9 không được tính thành tests SKIPPED; chúng là phần chưa nằm trong coverage hoặc ngoài scope. Các lỗi setup và expected red runs dưới đây được giữ làm lịch sử, không trộn vào counts kết quả cuối.

Static gates chạy ở workspace. Browser suite chạy trong bản sao source ở temporary directory, cùng dependencies và generated Prisma client, không copy `.env`; Vite wrapper chỉ allow dependency paths cho fonts/modules. Các tests cũ được phép ghi output trong bản sao để giữ nguyên approved artifacts. PostgreSQL16 riêng loopback:55439, database có tên `test`, migrations hiện có; synthetic fixtures; Storage SDK/HTTP doubles local. Không cloud/staging/production test.

Lượt đầu unit trong sandbox bị chặn socket của Supertest; chạy lại với local sockets cho phép. Hai lượt full browser đầu bị dừng do bản sao thiếu link nested `@hookform/resolvers`; đã sửa harness dependency links, không sửa production dependency hay assertion. Một locator mới phát hiện label selector không ổn định trong browser; BankPicker được cấp aria-label rõ, kiểm tra lại thành công. Lỗi implicit-any trong test mới được sửa trước final typecheck. Đây không phải final PASS được suy từ baseline.

Lượt compatibility đầu sau recovery chọn toàn bộ 19 cases của hai spec Grading/Results và Live Quiz nhưng thiếu biến `DEMO_PASSWORD` mà fixture yêu cầu. Cả 19 dừng ở setup, trước product assertions; [summary lỗi harness](data-integrity-evidence/evidence-summary.json) được giữ riêng. Lượt sửa cấu hình dùng mật khẩu synthetic của DB test, không đổi assertions hoặc bật retries; phạm vi gồm cả 10 boundary cases ngoài subset 9 cases dự kiến ban đầu.

[Evidence folder](data-integrity-evidence/) trong commit chứa summaries đã chuẩn hóa, hashes và số liệu; raw logs chỉ giữ local, không stage; không lưu traces/cookies/raw browser sessions/database dump/password. Reports audit/UX cũ và31 artifacts lịch sử được giữ nguyên.

## 8. Responsive/accessibility

[Targeted screenshots](../screenshots/data-integrity/) cho Builder, Teacher Classes, Teacher Exams, Admin Classes tại1440/1024/820/390/320; Student image workflow có capture riêng. Browser assert document không horizontal overflow, pager buttons>=44px ở Builder, native button focus/keyboard, nhãn input/select, status/current page/total và disabled ends. CSS mới chỉ scope `.catalog-*`, không đổi global tokens hoặc approved composition. Đã xem representative mobile Builder/Admin captures.

[Geometry](../screenshots/data-integrity/geometry.json) ghi kích thước controls và overflow Builder. Loading/error/retry/off-page selection được unit/browser checks hỗ trợ; existing Question Bank/Live Quiz compatibility bổ sung keyboard/reduced-motion. Không tuyên bố full WCAG/screen-reader certification hoặc mọi long-text/error state ở mọi viewport.

## 9. Giới hạn và next phase

- Storage cleanup orphan risk và crash window như §3; không có transaction phân tán/durable queue. Backend guard bảo vệ app-managed references; không chống operator/provider xóa object bên ngoài ứng dụng, không khôi phục object đã mất trước phase.
- Legacy invalid assets làm publish/start báo lỗi rõ; cần sửa nội dung/upload lại, không ẩn ảnh bằng fallback.
- Offset pagination stable cho dataset không đổi; concurrent inserts/deletes giữa hai requests vẫn có thể dịch offset. Không đổi sang cursor/snapshot contract trong phase này.
- Catalog deletion reference check quét text/JSON bằng EXISTS. Hiếm khi delete và không tải corpus lên client, nhưng chưa load-test corpus rất lớn hoặc hosted Storage.
- Large-class load testing, full screen-reader testing và server restart limitations chưa được xác minh thêm trong cleanup.
- Các RISK inventory chưa phải remediation mới. Auth expiry UX, stale Quiz connected flag sau crash, multi-instance Socket.IO, MASTER_SPEC Git gap, deployment/TLS/storage cloud/report/slides/video vẫn ngoài scope.
- Build còn warning chunk Markdown>500kB; pg hiện có deprecation warning. Dependencies không đổi, không mở dependency remediation/audit mới.
- Không kết luận toàn ExamSpace release-ready. Dừng ở user review; chỉ mở phase tiếp sau quyết định của user.

## 10. Cleanup và local commit

User đã duyệt một local commit: `fix: protect published assets and repair paginated workflows`. Baseline là `a830497c72998639bba27b5d8d23c952709720ab`; commit chứa report này là checkpoint handoff, không ghi hash của chính commit vào nội dung. Post-commit HEAD/status được báo riêng sau khi commit thành công.

[Commit scope](data-integrity-evidence/commit-scope.json) chọn 54 files: 15 product source, 5 tests/fixture, 2 reports, 8 evidence JSON, 22 PNG screenshots và 2 metrics JSON. Trước stage có 13 tracked modified và 86 untracked; cleanup thêm hai evidence summaries/manifests. Giữ đủ matrix ảnh 5 widths cho 4 màn hình, ảnh before Builder và Student image; các PNG không trùng SHA-256. Không xóa/di chuyển file nào. 31 historical artifacts và 16 phase raw logs/checkpoints giữ local, không stage; dự kiến còn 47 untracked sau commit. Không sửa Git excludes.

[Source hashes](data-integrity-evidence/source-final-hashes.json) khớp 169 source/config/test files. Cả 5 dependency manifests/lockfile khớp baseline đã có security gate 0 vulnerabilities; không chạy advisory audit mới hoặc đổi dependencies. [Evidence summary](data-integrity-evidence/evidence-summary.json) giữ test result lines, raw-log hashes và provenance; raw logs không cần tồn tại trên fresh clone để đọc summary. Historical manifest chỉ là provenance của local artifacts, không yêu cầu clone có 31 file đó. Audit reports lịch sử giữ nguyên các kết luận FAIL tại thời điểm audit.

[Security/link audit](data-integrity-evidence/evidence-hygiene.json) mô tả scan staged contents, synthetic fixture exceptions và kiểm tra links trên tập tracked + selected files. Source/tests giữ nguyên trong cleanup nên reuse các gates ở §7; chỉ integrity/scope/security/docs/staged checks chạy mới. Không mở implementation, không push/deploy/merge/PR.

### Tái hiện từ fresh clone

Dùng Node >=22.12, `npm ci`, `npm run db:generate`, rồi `npx playwright install chromium`. Chạy `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`. DB suites cần PostgreSQL 16 riêng trên loopback, database có `test` trong tên; đặt `TEST_DATABASE_URL` và `DATABASE_URL` cùng trỏ vào DB đó, `DOTENV_CONFIG_PATH=/dev/null`, `NODE_ENV=test`. Áp dụng migrations hiện có bằng `npm run db:migrate`, seed bằng `npm run db:seed`. Dùng mật khẩu demo synthetic mặc định của `apps/api/prisma/seed.ts` cho `DEMO_PASSWORD`; E2E hiện có phụ thuộc seed này. Không dùng DB/Storage production.

Chạy `npm run test:integration`, `npm run test:e2e`; compatibility: `LIVE_QUIZ_WIDTHS=1440 npx playwright test --config playwright.ui.config.ts tests/ui/grading-results-rollout.spec.ts tests/ui/live-quiz.spec.ts`. Test configs khởi động local API/web/Storage double. Để giữ approved screenshots, chạy browser tests trên disposable copy/clone vì tests ghi screenshots vào paths trong repository; đặt `GRADING_SCREENSHOT_DIR` và `LIVE_QUIZ_SCREENSHOT_DIR` vào thư mục output riêng. Commands là hướng dẫn tái hiện, không phải tuyên bố đã rerun trong cleanup; batch provenance thật nằm ở §7.

## 11. Recovery trong cùng phase

Lượt tiếp tục giữ đúng branch/HEAD và implementation. `/tmp`, PostgreSQL/scratch source và browser processes đã mất; 31 historical artifact hashes vẫn khớp. Raw final browser log mất, nhưng tool-output transcript xác nhận14 cases đã PASS (Admin3, Core3, Data Integrity3, Question Bank5). [Recovery record](data-integrity-evidence/browser-recovered-progress.json) phân biệt evidence transcript với raw log; chỉ6 cases chưa có kết quả cuối được chạy lại, cùng compatibility chưa chạy. Logs unit65/integration54/static đã persist local, kết quả được trích vào summary và screenshots được giữ trong commit; các evidence này được reuse, không suy diễn browser PASS từ chúng.

Sau recovery chỉ mở rộng asset regression tests (stateful storage bytes/orphan assertions và2 cases mới), không sửa product source. Vì vậy rerun10 asset cases và lint/typecheck; unit65/build và46 integration cases còn lại giữ evidence cũ. Counts tổng integration được tổng hợp từ46 cases không đổi của lượt trước và10 asset cases được chạy lại; không đếm trùng8 asset cases cũ. Source hashes recovery (local-only) và final (committed) ghi chính xác thay đổi test này.

Runtime phục hồi dùng PostgreSQL16.14 trong npm binary bundle (không thêm dependency project); lượt đầu dùng PostgreSQL16.15 từ Ubuntu. [Runtime provenance](data-integrity-evidence/runtime-resume.json) lưu package integrity. Hai DB loopback riêng cho asset/browser, không chia sẻ mutable fixtures giữa hai batch chạy đồng thời.

Lượt tiếp tục cuối tìm thấy log compatibility đã hoàn tất cả 19 cases, bao gồm hai ca Live Quiz từng đang chạy. `/tmp` lại không còn runtime/source copy; không phục hồi DB hoặc chạy lại tests vì evidence cuối đã persist và toàn bộ 169 source hashes khớp. Giữ nguyên implementation, chỉ chốt báo cáo, kiểm tra Git/historical hashes và chuẩn hóa evidence paths.
