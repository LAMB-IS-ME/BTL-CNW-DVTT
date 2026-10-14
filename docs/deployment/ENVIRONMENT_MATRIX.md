# Environment matrix — source audit 2026-10-14

Nguồn: `apps/api/src/config/env.ts`, `app.ts`, `db/client.ts`, `prisma.config.ts`, `prisma/seed.ts`, frontend `lib/api.ts`, `lib/socket.ts`, `vite.config.ts`, các config/tests và workflow tracked. Không đọc/copy `.env` thật. D = development; S = staging; P = production. Ví dụ `.invalid` là placeholder phải thay, không phải domain được chọn.

## Runtime, build và seed

| Variable | Used by | Required / environments | Secret/public | Purpose | Default | Safe example | Deployment risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NODE_ENV | API parseEnv, seed, Node tooling | D/S/P; bắt buộc đặt production ở S/P | Public | Security validation/runtime mode | development | production | Không đặt sẽ chạy mode development; local production smoke cũ đặt test. |
| PORT | API server | Optional D/S/P | Public | Bind `0.0.0.0` cùng HTTP/Socket.IO | 3000 | 3000 | Host cấp port phải truyền đúng; API cần process sống lâu. |
| DATABASE_URL | Prisma adapter + session pg pool + seed + CLI fallback | Required D/S/P | Secret | DB nghiệp vụ **và session** | Không | postgresql://exam_audit@127.0.0.1:55449/examspace_deploy_test | URL mẫu chỉ cho disposable cluster; remote dùng credential/TLS/role riêng; không vào VITE. |
| DIRECT_URL | Prisma CLI | Optional D/S/P | Secret | Migration connection ưu tiên trước DATABASE_URL | DATABASE_URL | Để trống khi cùng endpoint phù hợp | Không dùng bởi seed/runtime/session. Khi test luôn override cả hai để tránh migrate nhầm DB. |
| SESSION_SECRET | express-session | Required D/S/P, ≥32 ký tự | Secret | Ký SID | Không | Sinh random 48 bytes bằng crypto, cấp riêng từng environment | Giữ ổn định khi restart; thay làm mất hiệu lực cookie cũ. |
| SESSION_COOKIE_NAME | Session + logout | Optional D/S/P | Public | Tên cookie | online_exam_sid | online_exam_sid | Không đụng cookie app khác cùng host. |
| SESSION_MAX_AGE_MS | Session cookie | Optional D/S/P | Public | Max age cookie | 28800000 | 28800000 | Session store touch và cookie expiry không tương đương sliding-cookie SLA; kiểm tra kỳ hạn staging. |
| CLIENT_ORIGIN | REST CORS, CSRF, Socket.IO | Optional D; required correct value S/P | Public | Exact allowlist, comma-separated | http://localhost:5173 | https://app.example.invalid | Không path/trailing slash/wildcard; production bắt buộc HTTPS; Pages origin không gồm repo path. |
| COOKIE_SECURE | Session + logout | Optional D; true S/P | Public | Chỉ browser HTTPS | false | true | API từ chối production hoặc SameSite=None nếu false; proxy phải được trust đúng. |
| COOKIE_SAME_SITE | Session + logout | Optional D/S/P | Public | Cookie site boundary | lax | lax | Cùng site HTTPS ưu tiên lax; khác site cần none + Secure, vẫn có third-party cookie blocking. |
| TRUST_PROXY | Express | Optional D/S/P; review S/P | Public | Số proxy hops (0–5) | 0 | 1 chỉ khi đúng một trusted edge | Bảo vệ origin server, overwrite forwarding headers; không dùng 1 cho mọi topology. |
| SUPABASE_URL | Backend Storage SDK | Optional non-image flows; required ảnh D/S/P | Public URL | Storage provider URL | Không | https://project-ref.supabase.co | Không thay bằng localhost fixture khi đánh giá hosted readiness. |
| SUPABASE_SERVICE_ROLE_KEY | Backend Storage SDK | Required khi dùng ảnh | Secret | Private object access | Không | Để trống trong template; cấp qua secret store | Quyền cao, backend-only; không dùng anon/public key thay thế. |
| SUPABASE_STORAGE_BUCKET | Storage SDK | Optional D/S/P | Public | Private image bucket | question-assets | question-assets | Bucket phải tồn tại và private; source không tự provision policy/bucket. |
| ALLOW_PRODUCTION_SEED | Seed | Optional D/S/P | Public | Explicit production seed guard | Chặn nếu production, trừ chuỗi true | false | Đây không phải kiểm tra URL; development mode cũng có thể seed remote nếu cấu hình sai. Không bật trong production thật. |
| DEMO_PASSWORD | Seed; một số UI tests | Optional D; riêng demo S nếu được duyệt | Secret | Password **account mới** | Development-only constant trong seed | Để trống ở template local hoặc cấp qua secret store | Không rotate existing account; flag production không bắt buộc password mạnh. Never seed real production. |
| VITE_API_BASE_URL | Web fetch | Optional same-origin; required split-origin D/S/P | Public | API base build time | DEV localhost:3000/api/v1; production /api/v1 | https://api.example.invalid/api/v1 | Build lại khi đổi; không credential/query/hash; no trailing slash. |
| VITE_SOCKET_URL | Web socket.io-client | Optional same-origin; required split-origin D/S/P | Public | Backend origin build time | DEV localhost:3000; production window.location.origin | https://api.example.invalid | Không thêm /api/v1; HTTPS origin dẫn đến WSS. |
| VITE_BASE_PATH | Vite config | Optional D/S/P build | Public | SPA base + asset prefix | / | /project/ | Custom domain thường /; Pages project path cần khớp basename và 404 artifact. |
| BASE_URL, DEV | Vite built-ins, router/auth/api/socket | Generated | Public | Base route / dev fallback | Do Vite cấp | Không tự set | Không phải secret hay runtime backend env. |
| NODE_VERSION | Render blueprint | Host-specific P/S | Public | Chọn Node | Blueprint 22.23.2 | 22.23.2 | `.nvmrc` 22 khác mức pin; npm engines chỉ giới hạn dưới. |

Không có env riêng cho session database, CSRF secret/disable, cookie Domain hoặc Socket server origin: session dùng DATABASE_URL; CSRF token gắn với session; cookies host-only; sockets dùng CLIENT_ORIGIN. Không có Supabase anon key trên frontend. Không invent biến mà source không dùng.

## Test/diagnostic environment

| Variable(s) | Used by | Required/default/example | Visibility / risk |
| --- | --- | --- | --- |
| TEST_DATABASE_URL | API integration, Playwright, deployment probes | Required cho test DB tên chứa `test`; loopback bắt buộc cho browser/new production probe | Secret nếu có credential. Integration và smoke cũ chỉ kiểm tra tên; operator phải bảo đảm disposable loopback. |
| DOTENV_CONFIG_PATH | dotenv loader (dependency), Playwright/recovery/probe | Optional; `/dev/null` khi cô lập | Public path. Tránh nạp `apps/api/.env`; không thay DATABASE_URL đã cấp. |
| LIVE_QUIZ_WEBKIT_EXECUTABLE | playwright.live-quiz.config.ts | Optional path; mặc định bundled Playwright browser | Local tooling; chỉ dùng browser binary cài độc lập. |
| RECOVERY_BASELINE | tests/recovery/lifecycle.spec.ts | Optional `1` bật before assertions | Test mode; không bật khi nghiệm thu after. |
| UI_PHASE, EXAM_UI_PHASE, FOCUS_PHASE, LIVE_QUIZ_PHASE, GRADING_BEFORE | tests/ui | Optional before/after (`GRADING_BEFORE=1` cho before) | Test-only; không runtime, kiểm tra suite tương ứng trước khi dùng. |
| UI_SCREENSHOT_DIR, EXAM_SCREENSHOT_DIR, FOLIO_SCREENSHOT_DIR, FOCUS_SCREENSHOT_DIR, FOCUS_ROLLOUT_DIR, LIVE_QUIZ_SCREENSHOT_DIR, GRADING_SCREENSHOT_DIR | tests/ui | Optional output paths; mặc định trong docs/test-results hoặc /tmp theo suite | Public paths; có thể ghi đè evidence nếu chạy lịch sử. Phase này không chạy visual suites. |
| LIVE_QUIZ_WIDTHS | tests/ui/live-quiz.spec.ts | Optional danh sách width comma-separated | Test-only. |
| NODE_OPTIONS | Node/dependency diagnostics | Optional, ví dụ --trace-deprecation | Không phải app parser; không dùng để tắt TLS verification. |

Các biến phục vụ công cụ mới (`LD_LIBRARY_PATH`, `PATH`) chỉ chọn binaries PostgreSQL đã extract vào scratch, không phải yêu cầu ứng dụng. Playwright browser cache là tool prerequisite; app dependencies vẫn được cài mới bằng npm ci.
