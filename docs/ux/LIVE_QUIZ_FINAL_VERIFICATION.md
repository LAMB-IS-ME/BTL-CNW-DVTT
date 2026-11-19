# Live Quiz — Final cleanup and verification

User approved the complete Live Quiz experience, including desktop/mobile aesthetics, and authorized one local commit: `feat(ui): roll out live quiz experience`. This decision supersedes the pending-review status in the three historical phase reports. No further visual polish is included.

Baseline: branch `ux/education-saas-redesign-pilot`, HEAD `e236cb87221f2596aed424b833f281d6e34be66b`; two tracked modifications and 30 untracked files, all within Live Quiz. No unrelated changes were found.

## Preservation and cleanup

The approved `quiz.tsx` and `live-quiz.css` match the SHA-256 values in the polish verification record. All 11 approved PNG boards match their original hashes, decode successfully, and contain no extra PNG metadata. No board was overwritten or regenerated. No repository artifact was deleted: the existing 32 files are all relevant source, tests, automation, documentation or approved evidence.

Browser capture defaults now use ignored, repository-relative `test-results/` paths. Compositors record source paths relative to their capture root and resolve DejaVu fonts by filename through Pillow. Explicit CLI input/output directories remain supported. Python syntax was checked; historical raw captures are unavailable, so the compositors were not rerun against the approved boards.

Historical reports, verification JSON and manifests retain their original findings and hashes. Machine-specific scratch paths were replaced with logical `external-artifacts/` identifiers. These identify uncommitted historical artifacts; they are not repository links or a promise that the raw files remain available. The final JSON records both original and normalized file hashes. Historical manifest/report hashes describe the original bytes; current metadata hashes are in the final record. Prototype manifest entries follow the same convention, although that manifest retains its original array schema.

The prior scratch PostgreSQL/WebKit runtime and raw logs were absent at the start of this phase. No platform diagnostic evidence establishes why an earlier turn ended. Final verification uses a newly initialized loopback PostgreSQL 16 test database with existing migrations and synthetic seed accounts; no production service is used. Runtime packages were extracted into scratch storage, with no system installation. WebKit uses the official cached WPE binary with a temporary dependency wrapper through the existing executable override.

## Final gates

All final gates passed on 2026-10-12. Exact command outcomes are in [the verification record](live-quiz-final-verification.json).

| Gate | PASS | FAIL | Skipped |
|---|---:|---:|---:|
| Lint / typecheck / build | 3 commands | 0 | 0 |
| Unit/frontend | 53 | 0 | 0 |
| Integration, full suite | 33 | 0 | 0 |
| Chromium | 11 | 0 | 0 |
| Firefox | 11 | 0 | 0 |
| WebKit | 11 | 0 | 0 |
| Compatibility | 1 | 0 | 0 |

No final test failures or retries occurred. Environment setup initially lacked runtime dependencies; these were restored before the gates ran. All 34 browser cases passed. Raw logs and new browser captures remain outside the commit; the record contains command outcomes, summaries, hashes and browser assertion evidence.

The browser matrix covers 1440, 1024, 820, 390 and 320px plus 844×390 landscape rich content. Lifecycle cases use a Teacher and two Students, real Socket.IO, answer persistence, server deadlines, reveal, ranking and automatic finish. Hardening forwards real traffic while dropping ACKs and interrupting transport; it checks timeout/retry, answer recovery, host recovery, focus and library pagination/error states. Unit regressions cover delayed ACKs, immutable snapshot facts and the timer's first frame. Compatibility compares Teacher Exam and Student Catalog computed styles before/after loading Live Quiz CSS through SPA navigation.

To reproduce with the existing harness, set `TEST_DATABASE_URL` to a dedicated loopback database whose name contains `test`, set both `DATABASE_URL` and `DIRECT_URL` to that same database for migrations/seed, disable dotenv file loading with `DOTENV_CONFIG_PATH=/dev/null`, then apply existing migrations and seed and an environment-provided `DEMO_PASSWORD`. Use that password for browser fixtures. Set `LIVE_QUIZ_WIDTHS=1440,1024,820,390,320`, `LIVE_QUIZ_PHASE=after` and `LIVE_QUIZ_SCREENSHOT_DIR` to a scratch capture directory outside Playwright's output directory. Optional `LIVE_QUIZ_WEBKIT_EXECUTABLE` supports a local runtime wrapper.

Run `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, and `npm run test:integration`. For each of `chromium`, `firefox`, `webkit`, run the following two commands separately so each batch receives fresh API rate-limit state:

```sh
npx playwright test --config playwright.live-quiz.config.ts tests/ui/live-quiz.spec.ts --project chromium
npx playwright test --config playwright.live-quiz.config.ts tests/ui/live-quiz-hardening.spec.ts --project chromium
```

Replace the project name for Firefox/WebKit. Then run `npx playwright test --config playwright.ui.config.ts tests/ui/live-quiz-compat.spec.ts`. No new test harness is introduced.

## Scope, security and evidence

Application changes from the baseline are limited to Live Quiz frontend composition and functional hardening, with scoped styling. There are no backend runtime, API/schema, Socket.IO contract, scoring/timer helper, global token, shared component, dependency or other module changes. The backend file in scope adds integration coverage only.

Review includes source/test fixtures, diff whitespace, documentation links, portable paths and secret patterns. Fixture credentials come from existing configuration/environment; boards show synthetic test data. Raw logs, runtime databases, browser session state, cookies, auth tokens and local environment files are excluded from the commit.

Approved boards remain in [prototype](../screenshots/live-quiz-prototype/board-manifest.json), [rollout](../screenshots/live-quiz-rollout/board-manifest.json), and [polish](../screenshots/live-quiz-polish/board-manifest.json) manifests. See [polish desktop](../screenshots/live-quiz-polish/review-board-desktop.png) and [mobile](../screenshots/live-quiz-polish/review-board-mobile.png). Current hashes and exact audited scope are recorded in the final JSON.

Existing build chunk-size and pg concurrent-query deprecation warnings remain. Full screen-reader certification, server restart, multi-instance and large-class load/soak behavior are not tested by this matrix. Snapshot protocol still has no sequence/version; this cleanup does not change recovery architecture.

Only one local commit is authorized. No push, deployment, merge or PR is part of this phase. The commit hash and post-commit working-tree status are reported after creation rather than embedded circularly in its own contents.
