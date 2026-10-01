# Sửa timeout và phục hồi seed Supabase — 2026-10-01

## Nguyên nhân và trạng thái ban đầu

Sau migration qua Supabase Session Pooler, submit demo attempt gặp Prisma P2028: transaction mặc định 5 giây đã hết hạn khi commit (~5.947 giây theo lỗi người dùng). `startAttempt`/Quiz Start đã có 15 giây nhưng submit/get/save-expired/job/grading và những interactive transaction khác vẫn dùng mặc định 5 giây. Chỉ tăng submit không bảo vệ các đường gọi finalize còn lại.

`submitAttempt` khóa/đọc attempt, rồi `finalizeTx` lại khóa/đọc cùng dữ liệu; finalize upsert từng answer và đọc lại toàn bộ attempt sau update. Số round trips tăng theo số câu, dễ vượt timeout khi PostgreSQL ở xa. Đo read-only ping transaction trên mạng hiện tại khoảng 306–308 ms, warm-up khoảng 2.3 giây; đây là quan sát tại lần chạy, không phải SLA.

Seed cũ dùng `count(attempt) === 0` trước toàn bộ Start/Save/Submit. Nếu Start/Save đã commit nhưng Submit rollback, rerun thấy attempt tồn tại và bỏ qua. Dữ liệu nền đã upsert theo email/ID cố định và nested create atomic; lỗi thực tế nằm ở khả năng phục hồi phần demo attempt.

Audit trước sửa: 15 users, 2 lớp, 2 banks, 24 câu, 3 Exam, 1 Quiz, 1 attempt IN_PROGRESS, submittedAt/totalScore null. Không reset database.

## Thay đổi

- `src/db/client.ts`: default `transactionOptions={maxWait:5000, timeout:15000}` cho mọi interactive transaction từ createDb. maxWait là chờ lấy transaction; timeout là thời gian chạy transaction, bao gồm chờ row lock. Không tăng vô hạn, không thay isolation level.
- `modules/attempts/service.ts`: giữ lock Attempt/Exam và atomic transaction. Finalize có helper nội bộ dùng trạng thái đã đọc dưới lock; wrapper finalizeTx vẫn tự lock/read cho expiry job và đường Start. Upsert autoScore bằng một câu SQL parameterized `INSERT ... ON CONFLICT`, giữ nguyên ID/answerJson/answerText/savedAt/feedback/manual grading của answer đã có. Update attempt trả luôn include cần dùng. Snapshot Start chuyển từ nested creates theo câu sang createMany trong cùng transaction.
- `modules/exams/service.ts`: đọc union candidates của các pools một lần, phân lại theo bank/difficulty/all tags trước matching. Giữ thứ tự, loại archived/fixed và quy tắc không trùng; bỏ Promise.all trên cùng transaction connection của project.
- `modules/live-quiz/service.ts`: Start dùng cùng transactionOptions, các transaction khác kế thừa default. Không thay scoring/deadline/lock.
- `prisma/seed.ts`: tìm attempt đã có trước khi Start; chỉ điền câu chưa có answer khi còn hạn. Giữ đáp án đã lưu kể cả sai/trống. IN_PROGRESS được hoàn thiện trên cùng ID; hết hạn thì finalize phần đã lưu, không gia hạn/không nhận answer muộn. Lượt đã nộp/GRADED không gọi submit lại. Race expiry/job giữa read/save được xử lý bằng các error code nghiệp vụ; lỗi DB thật vẫn được ném ra để người vận hành biết và rerun.

Không sửa schema, migrations, connection URLs, dependency tree hoặc dữ liệu ngoài seed. Không có retry mù P2028 hay reset database. Sequential rerun sau lỗi là cơ chế phục hồi; chạy một seed process mỗi lần.

Timeout option của Prisma 7 và yêu cầu giữ transaction ngắn: [Prisma v7 transactions](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions).

## Nguồn warning pg

Dependency hiện tại: pg 8.23.0, @prisma/adapter-pg 7.10.0 và @prisma/client 7.10.0. Chạy integration với NODE_OPTIONS=--trace-deprecation xác nhận stack:

```text
pg/lib/client.js:762 — Client.query
@prisma/adapter-pg/dist/index.mjs:645 — PgTransaction.performIO
@prisma/adapter-pg/dist/index.mjs:595 — PgTransaction.queryRaw
@prisma/client/runtime/client.js — interpretNode, Array.map, join
```

Kiểm tra source runtime của đúng phiên bản đã cài cho thấy node `join` chạy `Promise.all(t.args.children.map(...))` để đọc các quan hệ qua cùng transaction client. Vì vậy warning vẫn có trong integration dù đã bỏ Promise.all của project trong pool selection. Đây không phải bằng chứng mất dữ liệu hoặc nguyên nhân riêng của P2028; timeout còn phụ thuộc tổng thời gian transaction/round trips.

Không monkey-patch adapter, không downgrade pg, không tắt warning và không bật preview feature để né warning. Theo dõi compatibility khi nâng pg 9/Prisma trong một thay đổi dependency riêng có full verification. Các diagnostic writes để khảo sát trên Supabase đều cố ý rollback; không giữ fixture.

## Verification

- Typecheck, lint, 22 unit/frontend tests và production build: PASS.
- Integration trên PostgreSQL test riêng: 22 tests/10 files PASS (17 cũ + 5 mới). Không trỏ integration suite vào Supabase application DB và không bỏ guard tên DB chứa test.
- Regression mới: seed fail trước submit rồi chạy lại hai lần giữ counts/IDs/answers/result; giữ saved wrong answer và bỏ qua SUBMITTED; finalize expired partial attempt không gia hạn/nhận muộn; rollback toàn bộ batch grading khi transaction abort; transaction chạy 5.1 giây dùng timeout chung vẫn commit.
- Lần seed Supabase sau sửa: PASS, giữ nguyên attempt `6edd045f-97ed-4a5d-9d9a-a8c2f7e452d5`, attemptNo 1, GRADED, 3/3 điểm. Không tạo attempt mới.
- Seed Supabase lần hai: PASS. Audit trước/sau có cùng SHA-256 fingerprint của IDs, snapshots, answers, savedAt/submittedAt và trạng thái/điểm attempt; counts không thay đổi. Không gọi submit cho lượt GRADED.
- Dữ liệu cuối: 15 users (1 Admin, 2 Teacher, 12 Student), 2 lớp/12 memberships, 2 banks, 24 questions/48 options, 3 Exam/10 fixed questions/1 pool, 1 Quiz/6 quiz questions, 1 GRADED demo attempt có 3 answers và 3/3 điểm. Tổng IN_PROGRESS=0; Student result visible=true.
- Hai lần seed trên Supabase không ghi nhận warning pg. Warning vẫn tái hiện trong integration local ở Prisma relation-query interpreter như phân tích phía trên. Không che hoặc tắt warning.

## Vận hành

Chạy `npm run db:seed` như cũ, không cần SQL sửa tay hay reset. Rerun không sửa password, nội dung đề hoặc lịch thi đã có. Nếu một attempt dở đã hết giờ, kết quả phản ánh đáp án thật đã kịp lưu, không cam kết luôn full score. NODE_ENV=production vẫn cần ALLOW_PRODUCTION_SEED=true theo guard hiện có.
