# ExamSpace — Session lifecycle + Live Quiz recovery remediation

Remediation executed: 2026-10-13 (Asia/Bangkok). Approved cleanup and integrity verification: 2026-10-14. **COMPLETE WITH DOCUMENTED LIMITATIONS — not a system-wide release verdict.** Scope: AUTH-001, REL-001 and the reproduced join/disconnect race. The user approved exactly one local commit, `fix: harden session lifecycle and live quiz recovery`. No push, deploy, merge or PR.

## Baseline and continuity

- Branch `ux/education-saas-redesign-pilot`; parent baseline `d3e7cbadab88a3e4b8839941edaa9d590085e1ca`; confirmed before the authorized commit.
- Initial tracked/staged tree clean; all 47 historical untracked artifacts recorded with SHA-256 in [baseline.json](session-realtime-recovery-evidence/baseline.json). Resume verified every hash unchanged. No reset/checkout/discard/clean.
- Read the system audit, findings, readiness JSON, SDD and deployment/security documentation; verified actual auth, CSRF, Guard, API/download client, socket, Quiz service, startup, deadline, grading and autosave source. Historical audit results are context, not final PASS evidence.
- PostgreSQL 16.15 was downloaded/extracted in `/tmp`, bound only to loopback port 55439. Three disposable databases separate recovery browser, integration, and compatibility jobs. Synthetic fixtures only; no production Supabase/DB/Storage. Existing browser suites run from a scratch copy with matching product source, generated Prisma client/dependencies reused and Vite filesystem allowance for local fonts. No approved screenshots overwritten.
- The previous final `npm test` request was **NOT EXECUTED**: automatic approval review ran out of workspace credits. This was a review failure, not an unsafe-action verdict. The resumed command used the normal approval mechanism and passed; no bypass. The [verification JSON](session-realtime-recovery-verification.json) retains the review-failure classification; the redundant resume checkpoint stays local outside the commit.

## Before-fix reproduction and root causes

| Finding | Fresh reproduction | Root cause / impact |
|---|---|---|
| AUTH-001 | Real PostgreSQL session expiration; Teacher SPA navigation receives 401 yet retains identity, protected route and logout control. | API rejection did not invalidate `['me']` or protected caches; Guard trusted cached identity. Backend authorization remained correct. |
| Expired mutation | Source and browser verification of `CSRF_INVALID` before auth middleware. | CSRF runs before protected authentication. Treating every 403 as expired would misclassify valid-session CSRF/RBAC failures. |
| REL-001 | Teacher + two Student browsers, real Socket.IO; API SIGKILL, close B during outage, restart with A reconnecting. DB and host UI still reported both online. | Persistent `isConnected` survived process death; no startup reconciliation. Membership and answers were correct. |
| Join/disconnect race | Hold real `QuizRoom` row lock, send join, verify handler waits on lock, disconnect socket, release lock. Before-fix regression fails: one phantom online participant. | Disconnect handler ran before `rooms.add`; pending join later persisted online without a live socket. |

[Before browser log](session-realtime-recovery-evidence/before-browser.txt), [session probe](session-realtime-recovery-evidence/session-before.json), [crash probe](session-realtime-recovery-evidence/quiz-before.json), [join race failure](session-realtime-recovery-evidence/join-race-before.txt). Two baseline browser tests passed their **bug-confirmation assertions**, not product acceptance.

## Session behavior and implementation

- Shared API/download boundary ends identity only for the backend's `401 UNAUTHENTICATED` or `401 ACCOUNT_LOCKED`. Credentials errors, ordinary 403/RBAC/Origin failures and network errors retain their own meaning.
- `CSRF_INVALID` resets the cached CSRF token. Protected mutations, including logout, confirm identity through one coalesced read-only `/auth/me` probe. A valid session stays signed in. No mutation is automatically replayed; CSRF/Origin/RBAC middleware is unchanged.
- Confirmed invalidation cancels protected queries, removes protected query/mutation cache and identity, unmounts protected workspaces/sockets, focuses a recovery heading and provides an explicit login link. Subsequent protected calls fail locally instead of repeatedly hitting 401. Request generations discard late success/error responses from a previous identity, including delayed error-body parsing and downloads.
- Foreground `/me` revalidation every 30 seconds detects idle expiry; background tabs resume via normal query focus behavior. Initial network failure offers retry instead of a false expiry or redirect. A fresh anonymous/expired-cookie reload reaches login; the app cannot distinguish a first visit from a missing old cookie and does not invent a cause.
- Successful login cancels old queries/removes protected caches before installing the new identity. Explicit logout is distinct from expiry. Recovery performs a full page login navigation, starts a fresh request lifecycle and routes by the newly authenticated role.
- Student autosave stops its existing retry loop on 401/403. Stored answers, attempt status, grades and result release mode are not changed by client recovery. Server jobs remain responsible for deadline finalization.

### Unsaved work contract

There was no durable draft store in Teacher Exam, Question Bank or Grading; Student autosave's pending queue is memory-only. Confirmed expiry clears the protected workspace and explicitly warns that unconfirmed edits may be lost. **This patch does not preserve volatile edits across re-login** and does not introduce localStorage drafts, silent reauthentication, autosave for manual-save modules, or a replay queue. Existing ordinary dirty-navigation guards still operate while authenticated; invalid-session recovery removes their workspace instead of offering a save action that cannot succeed. Approved browser DB assertions cover Teacher draft not created, stored question unchanged, grading/submitted state unchanged, and accepted Student answer preserved/recovered after login.

### Security policy retained

Default 8-hour cookie maxAge, PostgreSQL session store, HttpOnly/Secure/SameSite configuration, login session/CSRF rotation, password policy, per-request user lookup/role checks, socket Origin/handshake/session reload and 30-second socket auth checks remain unchanged. Tests cover Admin/Teacher/Student expiration and revocation, wrong-role API access, valid-session CSRF/Origin rejection, locked users, unauthorized teacher ownership/student membership and expired/revoked privileged socket packets/reconnect.

## Live Quiz recovery implementation

1. Before attaching Socket.IO, starting jobs or listening for HTTP, startup updates only participants currently `isConnected=true` to false. No membership, answers, score, rank inputs, `lastSeenAt`, room state, snapshot, question index or deadline is reset. Startup fails before listening if this DB step cannot finish.
2. Join/leave transitions are serialized per `(roomId, userId)` in the existing single process. A join whose socket disappeared while awaiting DB completion reconciles presence against actual room sockets. A stale disconnect cannot overtake a new join for the same participant.
3. Offline reconciliation checks all real sockets in the room for that participant. Closing one of two tabs keeps the member online; two near-simultaneous disconnects result in one offline transition. `leaveRoom` writes/emits only when a true flag actually changes.
4. Snapshots use the existing `serverNow` field captured before DB reads; the client ignores older timestamps in addition to existing irreversible progress/reveal/answer and request-generation guards. No event/payload/schema/version change. This is not a distributed total-order protocol; millisecond ties and wall-clock corrections remain limitations of the existing timestamp contract.

Server scoring formula, ranking/tie-break inputs, accepted-answer uniqueness, room locking, absolute deadlines, timer formula and automatic finalization are unchanged. A second crash while the final deadline expires verifies automatic finish after restart. Startup-before-reconnect checks verify offline flags and unchanged `lastSeenAt`; blocked-startup testing holds a participant DB lock while browsers attempt reconnect, then verifies recovery only after the barrier releases. Evidence checks DB rows, authorized server snapshots, real transport ACK/room sockets and host/student UI; screenshots alone are not the basis.

## Verification and evidence status

Approved remediation gates completed with exit 0 on 2026-10-13. **All results below are REUSED in the 2026-10-14 cleanup, not fresh test executions.** The 19 approved source/test/config hashes match; existing dependency/config/schema files match the baseline; accepted logs remain valid. No implementation changed during cleanup, so a full suite rerun was unnecessary. Counts describe separate suites, not a deduplicated grand total.

| Gate | Status | Reused evidence |
|---|---|---|
| Unit/frontend | PASS — 78 tests / 19 files | [unit-accepted.txt](session-realtime-recovery-evidence/unit-accepted.txt), exit 0 |
| Integration | PASS — 62 tests / 15 files | [integration-resume-final.txt](session-realtime-recovery-evidence/integration-resume-final.txt), exit 0 |
| Lint | PASS | [lint-accepted.txt](session-realtime-recovery-evidence/lint-accepted.txt), exit 0 |
| Typecheck | PASS | [typecheck-accepted.txt](session-realtime-recovery-evidence/typecheck-accepted.txt), exit 0 |
| Build | PASS | [build-accepted.txt](session-realtime-recovery-evidence/build-accepted.txt), exit 0; existing >500 kB bundle warning |
| Recovery browser | PASS — all 13 scenarios in one final run | [recovery-accepted.txt](session-realtime-recovery-evidence/recovery-accepted.txt), exit 0 |
| Existing E2E | PASS — 16 tests | [e2e-verified.txt](session-realtime-recovery-evidence/e2e-verified.txt) |
| Live Quiz browser | PASS — 11 tests, five widths | [live-browser-final.txt](session-realtime-recovery-evidence/live-browser-final.txt) |
| Grading/Results + Live Quiz compatibility | PASS — 10 tests | [module-compatibility-accepted.txt](session-realtime-recovery-evidence/module-compatibility-accepted.txt), exit 0 |

All log links are under [session-realtime-recovery-evidence](session-realtime-recovery-evidence/). Earlier non-passing runs remain classified in the verification JSON; redundant raw logs stay local outside the commit: initial sandboxed unit run failed due to local socket restriction and an incomplete test mock; the mock now keeps real API exports and later approved runs pass. One expanded browser run had a deadline fixture race/overlapping expiry-job interference; suites now use separate DBs and wait for authoritative question index before changing a test deadline. The last pre-interruption run had 11 PASS and one logout test harness failure: API-only login had not primed SPA CSRF, so logout correctly succeeded with a fresh anonymous token instead of exercising stale CSRF. The corrected fixture logs in through the UI and keeps the original recovery assertion. No weakened assertions, retries or deleted tests.

Responsive recovery screenshots cover 1440, 1024, 820, 390, 320; all measured document overflow 0px. Heading focus, keyboard Tab/Enter login action and role switch are asserted. [Geometry](session-realtime-recovery-evidence/geometry.json); [screenshots](../screenshots/session-realtime-recovery/). No full screen-reader certification.

## Remaining boundaries

- Single active API process only; running multiple APIs against the same Quiz DB is unsupported. No multi-instance or large-class load-readiness claim.
- No updates are promised while the API is entirely unavailable. Accurate presence resumes at startup/rejoin; offline clients may retain their last snapshot until connectivity changes.
- Volatile unsaved edits are not restored after confirmed expiry; only server-confirmed data survives. No new storage/business rules.
- Timestamp ordering retains the existing millisecond/wall-clock limitations; no breaking protocol upgrade was authorized.
- Hosted TLS/WSS, cross-site browser cookie policy, production Supabase/Storage, cloud restart and load/soak: NOT TESTED. No deployment or system-wide release-ready claim.
- Historical visual board regeneration, unrelated pagination/assets/Admin redesign/dependencies and BTL artifacts: intentionally SKIPPED/out of scope.

## Git / changed files

The approved implementation comprises **15 modified tracked files and 4 new source/test/config files**; all 19 hashes match [the approved manifest](session-realtime-recovery-evidence/verified-source-hashes.json). Product changes stay within session/API/auth/Guard/autosave retry/socket boundaries and Quiz startup/presence/snapshot ordering. The pagination test changes only its API mock to retain AuthProvider exports; no pagination product change.

The [cleanup audit](session-realtime-recovery-evidence/cleanup-audit.json) lists every selected file, category, dependency/config/schema hash, screenshot hash and excluded phase log. The commit selects **46 files**: 19 source/test/config, 2 reports, 20 evidence files and 5 screenshots. **38 redundant phase artifacts remain local and untracked**, alongside all **47 historical artifacts**, preserved byte-for-byte. No files were deleted; no approved review boards were overwritten. Historical manifest paths are inventory records, not dependencies or promised fresh-clone links.

Accepted logs preserve assertions, counts, timings and warnings. Only absolute checkout prefixes in four logs were normalized to `<repository>`; trailing whitespace/extra blank EOF lines were also removed from six logs to satisfy Git whitespace checks. Original and sanitized SHA-256 values are recorded in the cleanup audit. No DB dumps, browser state/traces, credentials, real environment files or runtime files are selected. The browser fixture's explicit local-only signing constant and fake invalid CSRF token are synthetic test inputs, not captured credentials.


### Final compatibility checkpoint

Existing export retry assertion caught a real scoped regression: the new shared auth handling changed the generic non-auth export message. Product fix now retains “Không thể xuất báo cáo.” while still invalidating confirmed expired sessions. The existing browser assertion remains unchanged; a new unit assertion passes. Unit/frontend now 78 PASS. Existing E2E 16 PASS; Live Quiz full lifecycle/hardening 11 PASS across five widths. Related module compatibility rerun PASS — 10 tests, including successful Excel/PDF retry, filenames/MIME/content and full exam scope.

Logout test diagnostics: full navigation after UI login reset SPA CSRF; the test now stays in the authenticated document. Cross-tab expiry follows the documented 30-second foreground check, so its expectation now allows 35 seconds rather than the generic 10-second locator timeout. Both corrected logout scenarios PASS. Earlier logs remain available locally outside the commit and are not described as all-pass runs; their classifications remain in the committed verification JSON.


### Changed tracked files

- `apps/api/src/modules/live-quiz/service.ts`
- `apps/api/src/server.ts`
- `apps/api/src/sockets/quiz.ts`
- `apps/api/test/auth.integration.test.ts`
- `apps/api/test/quiz.integration.test.ts`
- `apps/api/test/socket.integration.test.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/features/attempts.tsx`
- `apps/web/src/features/auth.tsx`
- `apps/web/src/features/catalog-pagination.test.tsx`
- `apps/web/src/features/quiz.test.tsx`
- `apps/web/src/features/quiz.tsx`
- `apps/web/src/lib/api.test.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/socket.ts`

### New source/test/config files

- `apps/web/src/features/session-lifecycle.test.tsx`
- `apps/web/src/lib/session.ts`
- `playwright.recovery.config.ts`
- `tests/recovery/lifecycle.spec.ts`


### Execution provenance and scope of reuse

Acceptance suites were freshly executed during the approved remediation on 2026-10-13 and are reused for cleanup on 2026-10-14. None are borrowed from older historical audits or approved-board results. API integration used final unchanged API source. E2E and Live Quiz browser suites exercised the final auth/quiz paths; the only later product adjustment was preservation of the non-auth download error message, verified by the final unit suite and complete Grading/Results compatibility rerun. The consolidated recovery suite passed all 13 cases after that adjustment. Chromium is the verified browser; Firefox/WebKit were not rerun in this phase. Existing historical visual-board generation was excluded.

### Setup failures retained

The first scratch E2E launch lacked workspace-local `apps/web/node_modules` links and could not resolve `@hookform/resolvers/zod`. That test-owned runner was stopped; linking the already installed dependencies fixed setup, and the unchanged E2E suite passed 16 tests. Ports 3010/5183 were used in scratch-only fixtures/config to run independently from recovery ports 3000/5173. No product networking behavior changed. No raw trace archives were copied from scratch into phase evidence.


## Reproduction from a fresh clone

Run from the repository root with Node >=22.12 and the committed lockfile. Install with `npm ci`, generate Prisma with `npm run db:generate`, and install Chromium with `npx playwright install chromium` (host browser libraries are also required). Provision separate disposable loopback PostgreSQL databases whose names contain `test` for integration, recovery browser and compatibility. Never substitute a production URL. Supply their URLs and a synthetic `DEMO_PASSWORD` through the local test environment; do not commit them. Set `DOTENV_CONFIG_PATH=/dev/null` so repository environment files are not loaded. Set `DATABASE_URL` and `DIRECT_URL` to the chosen isolated database when running `npm run db:migrate` and `npm run db:seed`; the seed is needed for browser fixtures. Keep `TEST_DATABASE_URL` pointed at the same selected fixture database when running each browser suite. Existing core E2E fixtures use the repository seed's development-default password, so their disposable database must use that same test-only seed value.

Commands below are portable equivalents of the recorded gates, **not commands newly executed during cleanup**:

| Gate | Command at repository root |
|---|---|
| Unit/frontend | `npm test` |
| Integration (its own migrated database) | `npm run test:integration` |
| Recovery browser (its own seeded database) | `npx playwright test --config playwright.recovery.config.ts` |
| Existing E2E (16-test core/Admin/Question Bank selection) | `npm run test:e2e -- tests/e2e/core.spec.ts tests/e2e/admin.spec.ts tests/e2e/question-bank.spec.ts` |
| Live Quiz Chromium | `npx playwright test --config playwright.live-quiz.config.ts --project chromium` |
| Grading/Results + Quiz compatibility | `npx playwright test --config playwright.ui.config.ts tests/ui/grading-results-recovery.spec.ts tests/ui/live-quiz-compat.spec.ts` |
| Static gates | `npm run lint`, `npm run typecheck`, `npm run build` |

Run browser commands sequentially with ports 3000/5173 free; existing E2E/UI configs additionally own the local storage fixture on 54329. Recovery config owns Vite and the test owns API startup/SIGKILL/restart. Leave `RECOVERY_BASELINE` unset for acceptance: value `1` is only for the historical bug-confirmation mode against pre-fix source. Recovery tests regenerate this phase's JSON probes/screenshots; preserve accepted evidence before deliberately rerunning. Browser reports/traces produced by existing configs are runtime outputs and were excluded from this commit. No scratch checkout or local absolute path is required to run the committed tests. The recorded older suites used scratch-only port substitutions and font filesystem allowance, as documented above; this cleanup did not rerun a clean install or fresh-clone browser session.

## Cleanup handoff

Fresh cleanup checks: branch/parent baseline, 19 source/test/config hashes, dependency/config/schema baseline comparison, all 47 historical hashes, complete scope/diff review, selected-file secret/artifact review, JSON parsing, report/source/evidence links, screenshot structure and Git whitespace checks. Exact selection and evidence hashes are in [cleanup-audit.json](session-realtime-recovery-evidence/cleanup-audit.json). Staging and its diff must pass before the single authorized commit; post-commit hash, parent, message, file set and tracked/staged cleanliness are checked in the final handoff rather than embedding a self-referential commit hash here.

The reused gates above PASS; no final FAIL or BLOCKED gate remains. Earlier failures/review denial are classified, not counted as passing executions. PostgreSQL was stopped after remediation; [shutdown evidence](session-realtime-recovery-evidence/shutdown.txt) is historical, not a new runtime test. Remaining untracked files are intentionally preserved; do not describe the entire working tree as clean. No push, deploy, merge or PR. Stop for user review of the local commit.
