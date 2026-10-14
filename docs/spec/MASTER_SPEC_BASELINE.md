# MASTER SPEC — ONLINE EXAMINATION & LIVE QUIZ PLATFORM

**Project type:** Bài tập lớn môn Công nghệ Web và Dịch vụ trực tuyến  
**Working name:** Online Examination Platform  
**Spec status:** Baseline v1 — implementation target  
**Primary language for UI/docs:** Vietnamese, giữ thuật ngữ kỹ thuật tiếng Anh khi cần  
**Repository model:** Monorepo Frontend + Backend + shared package + database schema/migrations + docs  
**Important:** Đây là source of truth về phạm vi nghiệp vụ. Không tự ý mở rộng Core nếu không cần.

---

## 0. Mục tiêu của tài liệu

Tài liệu này dùng để:

1. Khóa phạm vi và nghiệp vụ của project trước khi code.
2. Làm nguồn yêu cầu chính cho coding agent.
3. Làm căn cứ tạo SRS và SDD sau khi implementation hoàn tất.
4. Giảm việc agent tự suy diễn hoặc tự thêm tính năng không cần thiết.
5. Bảo đảm project có đủ Frontend + Backend + Database + WebSocket + Session + deployment + demo data theo yêu cầu BTL.

Nếu implementation thực tế bắt buộc thay đổi một chi tiết kỹ thuật nhỏ vì phiên bản thư viện/API hiện tại, được phép thay đổi **cách triển khai**, nhưng không được làm mất nghiệp vụ cốt lõi đã mô tả trong spec.

---

# 1. Product vision

Xây dựng một nền tảng thi trực tuyến có **hai chế độ độc lập nhưng dùng chung tài khoản, ngân hàng câu hỏi, backend và database**:

## 1.1. Exam Mode

Dành cho kỳ thi/bài kiểm tra chính thức:

- Teacher tạo lớp.
- Teacher tạo ngân hàng câu hỏi.
- Teacher tạo Exam và giao cho một hoặc nhiều lớp.
- Có lịch mở/đóng bài thi.
- Có thời lượng làm bài.
- Student đăng nhập bằng tài khoản.
- Hệ thống random câu hỏi/đáp án theo cấu hình.
- Autosave đáp án.
- Server quản lý timer.
- Tự nộp khi hết giờ.
- Tự chấm câu khách quan.
- Teacher chấm câu tự luận.
- Teacher theo dõi realtime trạng thái thí sinh.
- Student xem kết quả tùy chính sách công bố.
- Teacher xem analytics.
- Teacher xuất Excel/PDF.

## 1.2. Live Quiz Mode

Dành cho quiz realtime kiểu Kahoot:

- Teacher tạo Live Quiz.
- Teacher tạo Room.
- Hệ thống sinh Room Code.
- Student **phải đăng nhập** rồi mới được nhập Room Code.
- Quiz không cần thuộc Class.
- Teacher điều khiển Start/Next.
- Tất cả Student nhận câu hỏi qua WebSocket.
- Câu hỏi có countdown.
- Server chấm điểm realtime.
- Có leaderboard.
- Có animation vừa phải, không lạm dụng.

---

# 2. Out of scope v1

Không triển khai trong Core:

- Camera proctoring.
- Face recognition.
- Browser lockdown.
- AI chấm tự luận.
- AI sinh đề.
- Phát hiện gian lận nâng cao.
- Ghi hình/video call.
- Chat giám thị – thí sinh.
- Thanh toán.
- Mobile native app.
- Microservice architecture.
- Multi-region/high-availability production architecture.

Các mục này có thể ghi trong phần Future Development của báo cáo.

---

# 3. Roles và quyền

Có đúng 3 role chính:

```text
ADMIN
TEACHER
STUDENT
```

## 3.1. ADMIN

Core permission:

- Đăng nhập dashboard Admin.
- Xem danh sách user.
- Tìm kiếm/lọc user.
- Tạo user.
- Khóa/mở khóa tài khoản.
- Đổi role khi hợp lệ.
- Xem overview Class.
- Xem thống kê hệ thống cơ bản.
- Không cần trực tiếp chỉnh nội dung Exam/Quiz của Teacher trong Core.

## 3.2. TEACHER

- Quản lý Class do mình sở hữu.
- Thêm/xóa Student khỏi Class.
- Quản lý Question Bank.
- CRUD Question.
- Upload media cho Question.
- Tạo/chỉnh/publish/archive Exam.
- Giao Exam cho Class.
- Cấu hình random câu hỏi/đáp án.
- Monitor Exam realtime.
- Chấm Essay.
- Xem kết quả/analytics.
- Release result theo chính sách.
- Export Excel/PDF.
- Tạo/chỉnh Live Quiz.
- Tạo Room.
- Host Live Quiz realtime.

## 3.3. STUDENT

- Tự đăng ký tài khoản Student.
- Đăng nhập.
- Xem Exam được giao.
- Bắt đầu attempt nếu hợp lệ.
- Làm bài + autosave.
- Submit.
- Reconnect và tiếp tục attempt còn hạn.
- Xem trạng thái/kết quả theo chính sách.
- Tham gia Live Quiz bằng Room Code sau khi đăng nhập.
- Xem leaderboard/final result của Live Quiz.

---

# 4. Quy tắc tài khoản

## 4.1. Registration

Public registration chỉ tạo role:

```text
STUDENT
```

Không cho public tự đăng ký Teacher/Admin.

Teacher/Admin:

- seed trong development; hoặc
- Admin tạo/promote.

## 4.2. User fields tối thiểu

- `id`
- `email`
- `passwordHash`
- `fullName`
- `studentCode` nullable, unique khi có
- `role`
- `status`
- `createdAt`
- `updatedAt`
- `lastLoginAt`

`status`:

```text
ACTIVE
LOCKED
```

Tài khoản `LOCKED` không được login và session hiện tại phải bị vô hiệu hóa ở lần request tiếp theo.

---

# 5. Kiến trúc tổng thể

```text
┌──────────────────────────────────────────────────────────────┐
│                       Browser / Client                       │
│        React + TypeScript + REST + Socket.IO Client          │
└───────────────────────────┬──────────────────────────────────┘
                            │
             HTTPS REST     │     WebSocket / Socket.IO
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                Node.js + Express + Socket.IO                 │
│                                                              │
│ Auth/Session │ RBAC │ Exam │ Quiz │ Grading │ Export         │
│ QuestionBank │ Class│ Analytics │ Storage │ Monitoring       │
└───────────────┬──────────────────────────────┬───────────────┘
                │                              │
                │ Prisma / PostgreSQL          │ Supabase SDK
                ▼                              ▼
┌──────────────────────────────┐   ┌───────────────────────────┐
│     Supabase PostgreSQL      │   │     Supabase Storage      │
│ data + persistent sessions   │   │   private question media  │
└──────────────────────────────┘   └───────────────────────────┘
```

### Development target

```text
Frontend: http://localhost:5173
Backend : http://localhost:3000
Database: Supabase PostgreSQL
Storage : Supabase Storage
```

### Production/demo target

```text
Frontend: GitHub Pages + custom domain
Backend : Render Web Service
Database: Supabase PostgreSQL
Storage : Supabase Storage
```

Không hard-code domain. Mọi endpoint/origin phải đi qua environment variables.

---

# 6. Technology baseline

Dùng **stable release**, không dùng RC/preview nếu không bắt buộc.

## 6.1. Runtime

- Node.js 24 LTS hoặc LTS stable tương thích với toolchain tại thời điểm triển khai.
- npm workspaces.
- TypeScript strict mode.

## 6.2. Frontend

- React.
- Vite.
- TypeScript.
- React Router.
- TanStack Query cho REST/server state.
- Tailwind CSS.
- shadcn/ui hoặc bộ component tương đương theo cùng design system.
- React Hook Form + Zod.
- Socket.IO Client.
- `react-markdown` + GFM + KaTeX + syntax highlighting cho nội dung câu hỏi.
- Recharts hoặc thư viện chart nhẹ tương đương cho analytics.
- Motion/Framer Motion hoặc CSS transitions cho animation nhỏ.

Không cần Redux nếu không có lý do thực tế.

## 6.3. Backend

- Node.js.
- Express.
- TypeScript.
- Socket.IO.
- Prisma ORM.
- PostgreSQL.
- `express-session`.
- PostgreSQL-backed session store trong môi trường thực.
- Zod cho input validation.
- Argon2id cho password hashing.
- Helmet.
- CORS allowlist.
- Rate limiting cho auth và các endpoint nhạy cảm.
- Multer hoặc streaming multipart tương đương cho upload.
- Supabase server SDK chỉ ở backend.
- Excel export: ExcelJS hoặc thư viện maintained tương đương.
- PDF export: lựa chọn maintained library/cách render bảo đảm **Unicode tiếng Việt**.

## 6.4. Database

Supabase PostgreSQL.

Nguyên tắc:

- Runtime backend dùng connection phù hợp cho persistent server/pooler.
- Migration dùng connection phù hợp với Prisma CLI theo hướng dẫn chính thức hiện hành của Supabase/Prisma.
- Không commit connection string.
- Migration phải version-controlled.

## 6.5. Session

Không dùng Supabase Auth làm auth chính.

Auth chính phải thể hiện:

```text
username/email + password
        ↓
Express backend
        ↓
verify password
        ↓
server-side session
        ↓
HttpOnly session cookie
```

Session data không được đặt trực tiếp trong client-readable cookie.

---

# 7. Repository structure

Target:

```text
/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   │   ├── auth/
│   │   │   │   ├── admin/
│   │   │   │   ├── classes/
│   │   │   │   ├── question-banks/
│   │   │   │   ├── exams/
│   │   │   │   ├── attempts/
│   │   │   │   ├── grading/
│   │   │   │   ├── analytics/
│   │   │   │   └── live-quiz/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   ├── routes/
│   │   │   └── styles/
│   │   ├── public/
│   │   ├── .env.example
│   │   └── package.json
│   │
│   └── api/
│       ├── src/
│       │   ├── config/
│       │   ├── db/
│       │   ├── middleware/
│       │   ├── modules/
│       │   │   ├── auth/
│       │   │   ├── admin/
│       │   │   ├── classes/
│       │   │   ├── question-banks/
│       │   │   ├── exams/
│       │   │   ├── attempts/
│       │   │   ├── grading/
│       │   │   ├── analytics/
│       │   │   ├── exports/
│       │   │   ├── storage/
│       │   │   └── live-quiz/
│       │   ├── sockets/
│       │   ├── jobs/
│       │   ├── utils/
│       │   ├── app.ts
│       │   └── server.ts
│       ├── prisma/
│       │   ├── schema.prisma
│       │   ├── migrations/
│       │   └── seed.ts
│       ├── .env.example
│       └── package.json
│
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── contracts/
│       │   ├── schemas/
│       │   ├── socket-events/
│       │   ├── enums/
│       │   └── types/
│       └── package.json
│
├── docs/
│   ├── SRS.md
│   ├── SDD.md
│   └── DEPLOYMENT.md
│
├── .github/
│   └── workflows/
├── MASTER_SPEC.md
├── README.md
├── package.json
└── .gitignore
```

Có thể điều chỉnh tên folder nhỏ nếu cần, nhưng phải giữ separation rõ giữa frontend/backend/shared/docs.

---

# 8. Database/domain model

Dùng UUID cho entity ID.

Tất cả timestamp lưu UTC. Frontend hiển thị theo timezone browser.

## 8.1. Enums chính

```text
UserRole:
- ADMIN
- TEACHER
- STUDENT

UserStatus:
- ACTIVE
- LOCKED

QuestionType:
- SINGLE_CHOICE
- MULTIPLE_CHOICE
- TRUE_FALSE
- ESSAY

Difficulty:
- EASY
- MEDIUM
- HARD

ExamStatus:
- DRAFT
- PUBLISHED
- CLOSED
- ARCHIVED

ResultStrategy:
- HIGHEST_SCORE
- LATEST_ATTEMPT

ResultReleaseMode:
- IMMEDIATE
- AFTER_CLOSE
- MANUAL

AttemptStatus:
- IN_PROGRESS
- SUBMITTED
- AUTO_SUBMITTED
- PENDING_MANUAL_GRADING
- GRADED

QuestionSourceType:
- FIXED
- RANDOM_POOL

QuizRoomStatus:
- LOBBY
- LIVE
- FINISHED
- CANCELLED
```

---

## 8.2. Core entities

### User

```text
User
- id UUID PK
- email varchar unique not null
- passwordHash varchar not null
- fullName varchar not null
- studentCode varchar unique nullable
- role UserRole not null
- status UserStatus not null default ACTIVE
- lastLoginAt timestamp nullable
- createdAt
- updatedAt
```

### Class

```text
Class
- id UUID PK
- teacherId UUID FK -> User
- name
- code nullable
- description nullable
- archivedAt nullable
- createdAt
- updatedAt
```

### ClassMember

```text
ClassMember
- classId FK
- studentId FK
- joinedAt
UNIQUE(classId, studentId)
```

Only STUDENT được trở thành member.

---

## 8.3. Question Bank

### QuestionBank

```text
QuestionBank
- id
- ownerTeacherId FK -> User
- title
- subject nullable
- description nullable
- isArchived boolean
- createdAt
- updatedAt
```

### Question

```text
Question
- id
- bankId FK -> QuestionBank
- type QuestionType
- promptMarkdown text
- explanationMarkdown text nullable
- difficulty Difficulty
- tags text[]
- defaultPoints decimal
- isArchived boolean
- createdAt
- updatedAt
```

### QuestionOption

```text
QuestionOption
- id
- questionId FK
- contentMarkdown text
- orderIndex int
- isCorrect boolean
```

Rules:

- SINGLE_CHOICE: >= 2 options, đúng chính xác 1 option.
- MULTIPLE_CHOICE: >= 2 options, ít nhất 1 correct.
- TRUE_FALSE: đúng 2 options logic True/False, đúng chính xác 1.
- ESSAY: không có QuestionOption.

### QuestionAsset

```text
QuestionAsset
- id
- questionId FK
- storagePath
- mimeType
- originalName
- altText nullable
- createdAt
```

Asset nằm trong Supabase private bucket.

---

# 9. Exam domain

## 9.1. Exam

```text
Exam
- id
- teacherId FK
- title
- descriptionMarkdown nullable
- status ExamStatus
- openAt timestamp
- closeAt timestamp
- durationMinutes int
- maxAttempts int
- resultStrategy ResultStrategy
- resultReleaseMode ResultReleaseMode
- manualResultsReleasedAt nullable
- shuffleQuestions boolean
- shuffleOptions boolean
- showCorrectAnswers boolean
- showExplanations boolean
- showDetailedScore boolean
- passScorePercent decimal default 50
- publishedAt nullable
- createdAt
- updatedAt
```

Validation:

- `closeAt > openAt`
- `durationMinutes > 0`
- `maxAttempts >= 1`
- chỉ Teacher owner mới chỉnh.
- Khi đã có attempt, không cho sửa cấu trúc câu hỏi/điểm theo cách làm thay đổi attempt hiện có.
- Question content của attempt phải được snapshot.

## 9.2. ExamClass

Một Exam có thể giao nhiều Class.

```text
ExamClass
- examId
- classId
UNIQUE(examId, classId)
```

Teacher chỉ assign Class mình sở hữu.

## 9.3. ExamQuestion — fixed questions

```text
ExamQuestion
- id
- examId
- questionId
- orderIndex
- points
UNIQUE(examId, questionId)
```

## 9.4. ExamQuestionPool — random question rules

```text
ExamQuestionPool
- id
- examId
- questionBankId
- pickCount
- pointsEach
- difficultyFilter nullable
- tagFilter text[]
- createdAt
```

Exam được phép kết hợp fixed questions + random pools.

Publish validation phải kiểm tra mỗi pool có đủ candidate question.

---

# 10. Attempt domain

## 10.1. ExamAttempt

```text
ExamAttempt
- id
- examId
- studentId
- attemptNo
- status AttemptStatus
- startedAt
- expiresAt
- submittedAt nullable
- lastActivityAt
- objectiveScore decimal default 0
- manualScore decimal default 0
- totalScore decimal nullable
- maxScore decimal
- createdAt
- updatedAt

UNIQUE(examId, studentId, attemptNo)
```

`expiresAt`:

```text
min(startedAt + durationMinutes, exam.closeAt)
```

## 10.2. AttemptQuestion

Materialize toàn bộ đề của attempt tại lúc Start:

```text
AttemptQuestion
- id
- attemptId
- originalQuestionId
- sourceType
- orderIndex
- points
- snapshotJson JSONB
- createdAt
```

`snapshotJson` phải đủ để:

- hiển thị prompt;
- hiển thị options đã shuffle;
- chấm điểm server-side;
- giữ nguyên đề kể cả Question Bank bị chỉnh sau đó.

**Không bao giờ gửi answer key trong student DTO.**

## 10.3. AttemptAnswer

```text
AttemptAnswer
- id
- attemptQuestionId unique
- answerJson JSONB nullable
- answerText text nullable
- savedAt
- autoScore decimal nullable
- manualScore decimal nullable
- feedback text nullable
- gradedBy UUID nullable
- gradedAt timestamp nullable
- createdAt
- updatedAt
```

---

# 11. Exam business rules

## 11.1. Eligibility

Student được start Exam khi tất cả đúng:

- account ACTIVE;
- role STUDENT;
- thuộc ít nhất một Class được assign Exam;
- Exam PUBLISHED;
- current time >= openAt;
- current time < closeAt;
- attemptsUsed < maxAttempts;
- không có IN_PROGRESS attempt còn hợp lệ trùng Exam.

Nếu đã có IN_PROGRESS attempt, phải resume thay vì tạo attempt mới.

## 11.2. Start attempt transaction

Trong một transaction:

1. Re-check eligibility.
2. Tính attemptNo.
3. Chọn fixed questions.
4. Chọn random questions từ từng pool, không duplicate.
5. Shuffle question order nếu bật.
6. Shuffle option order cho SINGLE/MULTIPLE nếu bật.
7. TRUE_FALSE nên giữ thứ tự True/False cố định.
8. Snapshot.
9. Tính maxScore.
10. Tạo ExamAttempt + AttemptQuestion.
11. Trả:
   - attemptId;
   - serverNow;
   - expiresAt;
   - sanitized questions không chứa đáp án.

## 11.3. Timer

Server là authority.

Frontend không tự quyết định "còn được làm bài hay không".

Mọi endpoint save/submit phải kiểm tra:

```text
now < expiresAt
AND status == IN_PROGRESS
```

Nếu quá hạn:

- auto-finalize attempt;
- không nhận answer mới.

Frontend countdown:

```text
serverOffset = serverNow - clientNow
remaining = expiresAt - (clientNow + serverOffset)
```

Không cần WebSocket tick mỗi giây.

## 11.4. Expired-attempt job

Backend có background interval đơn giản cho BTL, ví dụ 15–30 giây:

- tìm attempt IN_PROGRESS đã hết hạn;
- auto-submit idempotently;
- auto-grade;
- broadcast trạng thái cho monitor.

Assumption v1: backend chạy một instance trong demo.

## 11.5. Autosave

- Khi Student thay đổi answer, debounce khoảng 500–1000 ms.
- PUT/upsert answer.
- UI hiển thị trạng thái: `Đang lưu… / Đã lưu / Lỗi lưu`.
- Nếu lỗi mạng, retry hợp lý.
- Khi reconnect phải fetch state mới nhất từ backend.
- Không dùng localStorage làm source of truth cho answer.
- Có thể cache tạm UI nhưng server/database là source of truth.

## 11.6. Submit

Submit phải idempotent.

Nếu user nhấn nhiều lần:

- lần đầu finalize;
- lần sau trả state đã submit, không tạo duplicate.

## 11.7. Auto grading

Auto:

- SINGLE_CHOICE
- MULTIPLE_CHOICE
- TRUE_FALSE

ESSAY:

- manual grading.

MULTIPLE_CHOICE v1 dùng exact set match:

```text
selectedCorrectSet == answerKeySet
```

Nếu sai một lựa chọn thì score auto của câu = 0.

Partial credit để Future Development.

## 11.8. Attempt status sau submit

Không có essay:

```text
GRADED
```

Có essay chưa chấm đủ:

```text
PENDING_MANUAL_GRADING
```

Sau khi teacher chấm hết:

```text
GRADED
```

## 11.9. Final result

Nếu nhiều attempts:

- `HIGHEST_SCORE`: attempt có totalScore cao nhất.
- `LATEST_ATTEMPT`: attempt gần nhất.

UI Student có thể xem lịch sử attempt nếu Teacher không cấm; Core có thể hiển thị danh sách attempt và đánh dấu attempt nào được tính final.

---

# 12. Result release rules

Exam có:

```text
IMMEDIATE
AFTER_CLOSE
MANUAL
```

## IMMEDIATE

- Objective-only: visible sau submit.
- Có essay: hiện trạng thái "Đang chờ chấm tự luận"; final score chỉ visible khi attempt GRADED.

## AFTER_CLOSE

Result chỉ visible khi:

```text
now >= closeAt
AND attempt == GRADED
```

## MANUAL

Result chỉ visible khi:

```text
manualResultsReleasedAt != null
AND attempt == GRADED
```

Student luôn được phép biết rằng bài đã nộp thành công, kể cả chưa được xem điểm.

Settings riêng:

- showCorrectAnswers
- showExplanations
- showDetailedScore

Backend phải áp dụng, không chỉ frontend hide.

---

# 13. Realtime Exam Monitoring

Teacher monitor Exam có trạng thái:

```text
NOT_STARTED
IN_PROGRESS
DISCONNECTED
SUBMITTED
```

Yêu cầu user ban đầu tối thiểu:

```text
Đang thi / Đã nộp / Mất kết nối
```

Thêm `NOT_STARTED` để roster hợp lý.

## 13.1. Presence logic

- Student mở active attempt page và Socket authenticated → `IN_PROGRESS`.
- Socket disconnect:
  - chờ grace period khoảng 10 giây;
  - nếu chưa reconnect và attempt còn IN_PROGRESS → `DISCONNECTED`.
- reconnect → `IN_PROGRESS`.
- submit/auto-submit → `SUBMITTED`.

Teacher monitor hiển thị:

- fullName;
- studentCode;
- status;
- startedAt;
- expiresAt/remaining;
- lastActivityAt.

Không hiển thị đáp án hiện tại của Student trong monitor Core.

---

# 14. Class management

Class chỉ bắt buộc cho Exam, **không bắt buộc cho Live Quiz**.

Teacher:

- create class;
- edit;
- archive;
- add student bằng email/studentCode/search;
- remove student;
- view roster;
- view class Exam result.

Student không cần tự join Class bằng code trong Core.

Optional future:

- CSV import;
- join class code.

---

# 15. Question authoring

Question editor phải hỗ trợ:

- Markdown.
- Image.
- LaTeX.
- Code block.
- Live preview.

Recommended rendering pipeline:

```text
Markdown
+ GitHub Flavored Markdown
+ remark-math
+ rehype-katex
+ syntax highlighting
```

Teacher UI:

- chọn Question Type;
- nhập prompt;
- option editor;
- đánh dấu correct;
- points mặc định;
- difficulty;
- tags;
- explanation;
- image upload.

Validation server-side bắt buộc.

---

# 16. Supabase Storage

Bucket:

```text
question-assets
```

Ưu tiên private bucket.

Flow:

```text
Teacher browser
    ↓ multipart
Backend
    ↓ auth + ownership validation
Supabase Storage
```

Không expose `SUPABASE_SERVICE_ROLE_KEY` ra frontend.

Backend trả signed URL hoặc controlled URL cho client khi cần.

Validation upload:

- image only trong Core;
- giới hạn size hợp lý, ví dụ <= 5 MB;
- MIME allowlist;
- random/safe file path;
- không dùng original filename làm storage path trực tiếp.

---

# 17. Live Quiz domain

## 17.1. Quiz

```text
LiveQuiz
- id
- teacherId
- title
- descriptionMarkdown nullable
- isArchived
- createdAt
- updatedAt
```

## 17.2. QuizQuestion

```text
LiveQuizQuestion
- id
- quizId
- questionId
- orderIndex
- timeLimitSeconds
- basePoints
```

Live Quiz chỉ cho phép:

```text
SINGLE_CHOICE
MULTIPLE_CHOICE
TRUE_FALSE
```

Không dùng ESSAY trong Live Quiz v1.

## 17.3. QuizRoom

```text
QuizRoom
- id
- quizId
- teacherId
- code unique
- status
- currentQuestionIndex nullable
- createdAt
- startedAt nullable
- endedAt nullable
- questionOpenedAt nullable
```

Room Code:

- ngắn, dễ nhập;
- ví dụ 6 chữ số;
- collision check;
- không reuse room đang active.

## 17.4. QuizParticipant

```text
QuizParticipant
- id
- roomId
- studentId
- score
- joinedAt
- lastSeenAt
- isConnected
- finishedAt nullable

UNIQUE(roomId, studentId)
```

## 17.5. LiveRoomQuestion

Snapshot question khi room bắt đầu:

```text
LiveRoomQuestion
- id
- roomId
- sourceQuizQuestionId
- orderIndex
- timeLimitSeconds
- basePoints
- snapshotJson
```

## 17.6. QuizAnswer

```text
QuizAnswer
- id
- roomQuestionId
- participantId
- answerJson
- answeredAt
- responseTimeMs
- isCorrect
- pointsAwarded

UNIQUE(roomQuestionId, participantId)
```

---

# 18. Live Quiz flow

## 18.1. Lobby

1. Teacher tạo Room qua REST.
2. Server trả code.
3. Teacher mở Host screen.
4. Student login.
5. Student nhập code.
6. Socket handshake xác thực session.
7. Student join room.
8. Teacher thấy participant realtime.

## 18.2. Start

Teacher nhấn Start:

- server verify teacher owns room;
- snapshot question list;
- status → LIVE;
- broadcast first question.

## 18.3. Question state

Student nhận:

- question content;
- options;
- index/total;
- server timestamp;
- `closesAt`.

Không gửi answer key.

## 18.4. Answer

- Server timestamp lúc nhận.
- Chỉ nhận answer đầu tiên hợp lệ.
- Reject nếu quá deadline.
- Chấm server-side.
- Ack cho Student rằng answer đã được nhận.
- Không gửi correct answer ngay trước reveal.

## 18.5. Scoring formula v1

Deterministic:

```text
if incorrect:
    points = 0

if correct:
    speedRatio = max(0, remainingMs / totalTimeMs)
    speedBonus = round(basePoints * 0.5 * speedRatio)
    points = basePoints + speedBonus
```

Có thể tinh chỉnh hằng số nhưng phải ghi trong SDD.

## 18.6. Reveal

Khi hết thời gian hoặc tất cả participant đã trả lời:

- server đóng nhận answer;
- host/client nhận aggregate;
- broadcast correct answer/reveal;
- broadcast leaderboard.

Teacher nhấn `Next` để sang câu tiếp.

Sau câu cuối:

- status FINISHED;
- final leaderboard.

---

# 19. WebSocket / Socket.IO design

Dùng cùng HTTP server với Express.

Socket auth phải đọc/validate Express session.

Validate Origin.

Không tin `userId`, `role`, `teacherId`, `studentId` do client gửi.

Identity lấy từ session.

## 19.1. Room naming

Internal convention:

```text
user:{userId}
exam-monitor:{examId}
exam-attempt:{attemptId}
quiz-room:{roomId}
quiz-host:{roomId}
```

## 19.2. Exam events

Client → Server:

```text
exam:monitor:join
exam:attempt:presence:join
exam:attempt:heartbeat
```

Server → Client:

```text
exam:monitor:snapshot
exam:participant:status
exam:attempt:submitted
exam:attempt:auto-submitted
```

REST vẫn chịu trách nhiệm autosave/submit; Socket chủ yếu cho presence/monitor event.

## 19.3. Live Quiz events

Client → Server:

```text
quiz:room:join
quiz:host:start
quiz:host:next
quiz:answer
quiz:room:leave
```

Server → Client:

```text
quiz:lobby:snapshot
quiz:participant:joined
quiz:participant:left
quiz:started
quiz:question
quiz:answer:accepted
quiz:answer:rejected
quiz:question:closed
quiz:reveal
quiz:leaderboard
quiz:finished
quiz:error
```

Payload phải có shared TypeScript contracts trong `packages/shared`.

## 19.4. Reconnect

Socket.IO reconnect được phép.

Khi reconnect:

- client re-auth bằng cookie session;
- fetch/join current room/attempt;
- server trả state snapshot hiện tại;
- không dựa chỉ vào event history.

---

# 20. Authentication & session security

## 20.1. Login

Flow:

```text
POST /auth/login
  ↓
validate email/password
  ↓
load ACTIVE user
  ↓
verify Argon2id
  ↓
regenerate session id
  ↓
session.userId = user.id
  ↓
Set-Cookie HttpOnly
```

Regenerate session để giảm session fixation.

## 20.2. Logout

- destroy session server-side;
- clear cookie.

## 20.3. Auth middleware

Mỗi protected request:

1. Validate session.
2. Load user hoặc validate current status.
3. Reject LOCKED.
4. Check RBAC.
5. Check ownership/resource membership.

Không chỉ kiểm tra role ở frontend.

## 20.4. Cookie

Development:

- HttpOnly.
- Secure false nếu localhost HTTP.
- SameSite phù hợp.

Production:

- HttpOnly.
- Secure true.
- SameSite cấu hình theo deployment topology.
- credentials enabled cho fetch.
- CORS exact allowlist, không `*` khi credentials=true.

## 20.5. CSRF

Vì dùng cookie session, triển khai CSRF protection cho state-changing REST requests.

Recommended simple synchronizer-token pattern:

- `GET /api/v1/auth/csrf`
- token random được gắn với session.
- frontend gửi `X-CSRF-Token`.
- POST/PUT/PATCH/DELETE validate token.
- kết hợp Origin allowlist.

Không cần CSRF cho GET read-only.

## 20.6. Rate limits

Tối thiểu:

- login;
- register;
- password-related endpoints nếu sau này có;
- room join/code probing.

## 20.7. Sensitive data

Không log:

- password;
- passwordHash;
- session secret;
- database URL;
- service role key;
- complete answer key trong generic logs.

---

# 21. REST API conventions

Base:

```text
/api/v1
```

Response success:

```json
{
  "data": {}
}
```

Error:

```json
{
  "error": {
    "code": "EXAM_NOT_OPEN",
    "message": "..."
  }
}
```

Validation error có field details nếu cần.

HTTP status dùng đúng semantics:

- 200/201 success
- 204 delete/no body
- 400 validation/business input
- 401 not authenticated
- 403 authenticated but forbidden
- 404 not found
- 409 state conflict
- 429 rate limit

Pagination:

```text
?page=
&pageSize=
&search=
```

---

# 22. REST endpoints — minimum contract

Tên endpoint có thể tinh chỉnh nhỏ, nhưng coverage nghiệp vụ không được thiếu.

## 22.1. Auth

```text
GET    /api/v1/auth/csrf
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/auth/me
```

## 22.2. Admin

```text
GET    /api/v1/admin/users
POST   /api/v1/admin/users
PATCH  /api/v1/admin/users/:id/status
PATCH  /api/v1/admin/users/:id/role
GET    /api/v1/admin/classes
GET    /api/v1/admin/stats
```

## 22.3. Teacher Classes

```text
GET    /api/v1/teacher/classes
POST   /api/v1/teacher/classes
GET    /api/v1/teacher/classes/:id
PATCH  /api/v1/teacher/classes/:id
DELETE /api/v1/teacher/classes/:id

POST   /api/v1/teacher/classes/:id/students
DELETE /api/v1/teacher/classes/:id/students/:studentId
```

## 22.4. Question Banks

```text
GET    /api/v1/teacher/question-banks
POST   /api/v1/teacher/question-banks
GET    /api/v1/teacher/question-banks/:id
PATCH  /api/v1/teacher/question-banks/:id
DELETE /api/v1/teacher/question-banks/:id

GET    /api/v1/teacher/question-banks/:id/questions
POST   /api/v1/teacher/question-banks/:id/questions
GET    /api/v1/teacher/questions/:questionId
PATCH  /api/v1/teacher/questions/:questionId
DELETE /api/v1/teacher/questions/:questionId

POST   /api/v1/teacher/questions/:questionId/assets
DELETE /api/v1/teacher/questions/:questionId/assets/:assetId
```

## 22.5. Teacher Exams

```text
GET    /api/v1/teacher/exams
POST   /api/v1/teacher/exams
GET    /api/v1/teacher/exams/:id
PATCH  /api/v1/teacher/exams/:id
DELETE /api/v1/teacher/exams/:id

PUT    /api/v1/teacher/exams/:id/classes
PUT    /api/v1/teacher/exams/:id/questions
PUT    /api/v1/teacher/exams/:id/pools

POST   /api/v1/teacher/exams/:id/publish
POST   /api/v1/teacher/exams/:id/archive

GET    /api/v1/teacher/exams/:id/monitor
GET    /api/v1/teacher/exams/:id/results
GET    /api/v1/teacher/exams/:id/analytics
POST   /api/v1/teacher/exams/:id/release-results
```

## 22.6. Teacher Grading

```text
GET    /api/v1/teacher/exams/:id/grading
GET    /api/v1/teacher/attempts/:attemptId
PUT    /api/v1/teacher/answers/:answerId/grade
```

## 22.7. Export

```text
GET    /api/v1/teacher/exams/:id/export.xlsx
GET    /api/v1/teacher/exams/:id/students/:studentId/result.pdf
```

Optional advanced:

```text
GET /api/v1/teacher/exams/:id/results-pdf.zip
```

## 22.8. Student Exam

```text
GET    /api/v1/student/exams
GET    /api/v1/student/exams/:id

POST   /api/v1/student/exams/:id/attempts
GET    /api/v1/student/attempts/:attemptId
PUT    /api/v1/student/attempts/:attemptId/answers/:attemptQuestionId
POST   /api/v1/student/attempts/:attemptId/submit

GET    /api/v1/student/exams/:id/results
```

## 22.9. Teacher Live Quiz

```text
GET    /api/v1/teacher/quizzes
POST   /api/v1/teacher/quizzes
GET    /api/v1/teacher/quizzes/:id
PATCH  /api/v1/teacher/quizzes/:id
DELETE /api/v1/teacher/quizzes/:id

PUT    /api/v1/teacher/quizzes/:id/questions
POST   /api/v1/teacher/quizzes/:id/rooms
GET    /api/v1/teacher/quiz-rooms/:roomId
```

Live control Start/Next chủ yếu qua Socket.

## 22.10. Student Live Quiz

```text
GET /api/v1/student/quiz-rooms/by-code/:code
GET /api/v1/student/quiz-rooms/:roomId/state
```

Join realtime qua Socket sau auth.

---

# 23. Frontend routes/screens

## 23.1. Public

```text
/
 /login
 /register
 /403
 /404
```

Landing page chỉ cần ngắn gọn, không biến project thành marketing site.

## 23.2. Student

```text
/student
/student/exams
/student/exams/:examId
/student/attempts/:attemptId
/student/results
/student/results/:examId
/student/quiz/join
/student/quiz/:roomId/lobby
/student/quiz/:roomId/play
/student/quiz/:roomId/result
```

## 23.3. Teacher

```text
/teacher
/teacher/classes
/teacher/classes/:classId

/teacher/question-banks
/teacher/question-banks/:bankId
/teacher/questions/:questionId/edit

/teacher/exams
/teacher/exams/new
/teacher/exams/:examId/edit
/teacher/exams/:examId/preview
/teacher/exams/:examId/monitor
/teacher/exams/:examId/grading
/teacher/exams/:examId/results

/teacher/quizzes
/teacher/quizzes/new
/teacher/quizzes/:quizId/edit
/teacher/quiz-rooms/:roomId/host
```

## 23.4. Admin

```text
/admin
/admin/users
/admin/classes
```

---

# 24. UI/UX direction

Design tone:

```text
Modern academic platform
+ professional
+ clean
+ small amount of gamification in Live Quiz
```

Không làm giao diện quá trẻ con.

## 24.1. General

- Responsive desktop/tablet/mobile hợp lý.
- Keyboard focus visible.
- Form labels rõ.
- Loading skeleton/spinner hợp lý.
- Empty states.
- Error state có hướng xử lý.
- Confirm destructive actions.
- Toast cho save/submit action.
- Không dùng browser `alert()` cho Core UI.
- Không có button giả/placeholder trong final.

## 24.2. Exam Attempt UI

Desktop suggested layout:

```text
┌──────────────────────────────────────────────┐
│ Exam title                    00:32:15       │
├───────────────┬──────────────────────────────┤
│ Question nav  │ Question content             │
│ 1 2 3 4 ...   │                              │
│               │ Answers                      │
│ saved status  │                              │
│               │                              │
├───────────────┴──────────────────────────────┤
│ Previous                 Next / Submit       │
└──────────────────────────────────────────────┘
```

Question nav state:

- unanswered;
- answered;
- current.

Timer warning visual ở ngưỡng hợp lý, không làm animation gây hoảng.

## 24.3. Teacher Monitor

Table/cards:

```text
Student | Code | Status | Started | Remaining | Last activity
```

Status badge realtime.

## 24.4. Live Quiz

Animation allowed:

- page/question transition 200–400 ms;
- countdown;
- option hover/selection;
- score increment;
- leaderboard reorder;
- participant join fade/slide.

Không:

- screen shake;
- confetti liên tục;
- flashing;
- animation dài;
- audio autoplay gây khó chịu.

Respect `prefers-reduced-motion`.

---

# 25. Exam Builder UX

Nên dùng wizard/stepper:

```text
1. Basic information
2. Class & Schedule
3. Questions
4. Settings
5. Preview & Publish
```

## Step 1

- title;
- description.

## Step 2

- classes;
- openAt;
- closeAt;
- duration;
- maxAttempts.

## Step 3

- fixed questions;
- random pools;
- points.

## Step 4

- shuffle;
- result strategy;
- result release;
- answer/explanation visibility;
- pass threshold.

## Step 5

Publish validation summary.

Không cho Publish nếu:

- không có Class;
- không có question source;
- pool thiếu question;
- schedule invalid;
- total max score <= 0.

---

# 26. Result & Analytics

Teacher dashboard cho mỗi Exam:

- total assigned students;
- not started;
- in progress;
- submitted;
- graded;
- average;
- highest;
- lowest;
- pass rate.

Chart:

- score distribution;
- correct-rate per auto-gradable question.

Per-question analytics không tính Essay vào "correct rate".

Student Result:

- final score;
- status;
- attempt used for final;
- detail nếu allowed;
- correct answer nếu allowed;
- explanation nếu allowed;
- teacher feedback cho Essay nếu có.

---

# 27. Export requirements

## 27.1. Excel

Một Exam Excel tối thiểu có:

```text
STT
Student Code
Student Name
Email
Attempt Count
Final Attempt No
Score
Max Score
Percentage
Status
Submitted At
```

Có thể thêm sheet:

- Summary
- Attempts

Excel phải mở được bằng Excel/LibreOffice.

## 27.2. PDF student result

PDF có:

- tên hệ thống;
- exam title;
- student name/code;
- class;
- final score;
- submitted time;
- result status;
- objective/manual breakdown nếu có;
- teacher feedback nếu có.

**Phải test tên tiếng Việt có dấu.**

Không để PDF lỗi font với tên như:

```text
Nguyễn Hoàng Anh
Trần Thị Hương
```

---

# 28. Demo seed data

Tạo seed script development.

Tối thiểu:

- 1 Admin.
- 2 Teacher.
- 12 Student.
- 2 Class.
- 2 Question Bank.
- >= 24 Question:
  - single choice;
  - multiple choice;
  - true/false;
  - essay;
  - ít nhất 1 câu LaTeX;
  - ít nhất 1 câu code block.
- 1 Exam Draft.
- 1 Exam Published với mixed fixed + random pool.
- 1 Exam có dữ liệu result minh họa nếu seed flow phù hợp.
- 1 Live Quiz.

Demo credentials chỉ dành cho dev, ghi rõ trong README.

Không chạy demo seed tự động trên production nếu không có explicit env flag.

---

# 29. Error handling

Backend có centralized error middleware.

Không trả raw stack trace cho production client.

Business error codes nên ổn định, ví dụ:

```text
AUTH_INVALID_CREDENTIALS
ACCOUNT_LOCKED
FORBIDDEN
EXAM_NOT_OPEN
EXAM_CLOSED
ATTEMPT_LIMIT_REACHED
ATTEMPT_EXPIRED
ATTEMPT_ALREADY_SUBMITTED
RESULT_NOT_RELEASED
QUESTION_POOL_INSUFFICIENT
QUIZ_ROOM_NOT_FOUND
QUIZ_ROOM_NOT_JOINABLE
QUIZ_ANSWER_TOO_LATE
```

Frontend map các lỗi chính thành message tiếng Việt dễ hiểu.

---

# 30. Logging

Development:

- structured readable logs.

Production:

- request/error logs vừa đủ.
- không log secrets.
- không log password.
- không log full session data.
- không log answer key tràn lan.

Có endpoint:

```text
GET /api/health
```

Response có service status đơn giản, không lộ secret.

---

# 31. Testing strategy

## 31.1. Unit tests bắt buộc cho logic quan trọng

- password/auth helper;
- exam eligibility;
- timer/expiresAt;
- random question selection no duplicate;
- shuffle/snapshot;
- single-choice grading;
- multiple-choice exact grading;
- true/false grading;
- attempt final score;
- attempt result strategy;
- result release policy;
- live quiz scoring formula.

## 31.2. API integration tests

Tối thiểu:

- register/login/logout;
- RBAC;
- locked account;
- teacher cannot edit another teacher resource;
- student cannot access teacher route;
- start attempt;
- autosave;
- submit;
- expired attempt;
- essay grading;
- result visibility;
- live quiz room basic REST.

## 31.3. Socket tests

Tối thiểu:

- unauthenticated socket rejected;
- Student join live room;
- Teacher gets participant join event;
- quiz start sends question without answer key;
- first answer accepted;
- duplicate answer rejected;
- late answer rejected;
- exam disconnect/reconnect changes presence.

## 31.4. Frontend tests

Không cần test mọi component.

Test các flow critical:

- route guards;
- login form;
- exam timer display logic;
- answer save state;
- teacher monitor status rendering.

## 31.5. E2E smoke tests

Playwright recommended:

1. Teacher login.
2. Student login.
3. Student opens assigned Exam.
4. Start attempt.
5. Answer.
6. Submit.
7. Teacher sees submitted.
8. Teacher grades essay nếu có.
9. Student sees result khi allowed.

Live Quiz smoke:

1. Teacher creates/opens room.
2. Student joins.
3. Teacher starts.
4. Student answers.
5. Leaderboard appears.

---

# 32. Quality gates

Root scripts phải hỗ trợ tương đương:

```text
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run build` phải build toàn workspace cần thiết.

Trước khi coi project hoàn thành:

- lint pass;
- typecheck pass;
- tests pass;
- frontend production build pass;
- backend production build pass.

Không bỏ test bằng cách disable test failing.

---

# 33. Environment variables

## 33.1. Backend `.env.example`

Tối thiểu:

```text
NODE_ENV=development
PORT=3000

DATABASE_URL=
DIRECT_URL=

SESSION_SECRET=
SESSION_COOKIE_NAME=online_exam_sid
SESSION_MAX_AGE_MS=28800000

CLIENT_ORIGIN=http://localhost:5173

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=question-assets

COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
```

Có thể thêm env nếu implementation cần.

## 33.2. Frontend `.env.example`

```text
VITE_API_BASE_URL=http://localhost:3000/api/v1
VITE_SOCKET_URL=http://localhost:3000
```

**Không có secret frontend.**

---

# 34. Development setup

README phải hướng dẫn:

1. Clone repo.
2. Node version.
3. `npm install`.
4. Tạo Supabase project.
5. Lấy database connection.
6. Cấu hình backend env.
7. Tạo Storage bucket.
8. Prisma generate/migrate.
9. Seed.
10. Start backend/frontend.
11. Demo accounts.

Nếu chưa có Supabase credentials, agent vẫn phải hoàn thành source code, migration, env example và hướng dẫn; không được invent secret.

---

# 35. Deployment

## 35.1. Frontend — GitHub Pages

- Build Vite.
- GitHub Actions deploy.
- Hỗ trợ custom domain.
- Không hardcode repo path.
- Xử lý React SPA deep-link refresh trên GitHub Pages.
  - ưu tiên BrowserRouter + SPA fallback nếu triển khai ổn;
  - HashRouter chỉ dùng nếu fallback thực tế không ổn.
- `VITE_API_BASE_URL` production trỏ Backend Render.

Acceptance:

> Refresh trực tiếp route như `/teacher/exams/...` không làm app chết/404 mà không có cách phục hồi.

## 35.2. Backend — Render

Code phải deploy-ready dù giai đoạn đầu chạy local.

- bind `0.0.0.0`;
- use `process.env.PORT`;
- WebSocket chung HTTP server;
- production env qua Render dashboard;
- health endpoint;
- use secure cookie settings;
- `wss` ngoài public internet;
- CORS exact frontend origin.

Không phụ thuộc local filesystem để lưu upload.

## 35.3. Database — Supabase

- migrations committed;
- deploy migration dùng non-destructive production workflow;
- không `db push --force-reset` production;
- backup/export data trước destructive changes khi cần.

---

# 36. GitHub Actions

Tối thiểu CI:

On push/PR:

```text
npm ci
lint
typecheck
test
build
```

Frontend deployment workflow cho GitHub Pages.

Không đưa `.env` hay secret vào workflow file plaintext.

---

# 37. Accessibility & responsive baseline

Tối thiểu:

- semantic HTML;
- label/input relation;
- keyboard navigation;
- visible focus;
- color contrast hợp lý;
- button có accessible name;
- image có alt;
- reduced motion support.

Không cần đạt certification formal nhưng không được bỏ qua basic accessibility.

---

# 38. Performance baseline

Không over-engineer.

Nhưng:

- paginate user/question/result list;
- không fetch toàn bộ question bank nếu rất lớn;
- debounce autosave;
- avoid WebSocket broadcast toàn hệ thống;
- use Socket.IO rooms;
- indexes DB cho FK/search quan trọng;
- không gửi answer key cho student.

Suggested indexes:

- User(email)
- User(studentCode)
- Class(teacherId)
- ClassMember(studentId)
- QuestionBank(ownerTeacherId)
- Question(bankId)
- Exam(teacherId, status)
- ExamClass(classId)
- ExamAttempt(examId, studentId)
- ExamAttempt(status, expiresAt)
- QuizRoom(code)
- QuizParticipant(roomId, studentId)

---

# 39. Data integrity rules

Database/service layer phải enforce:

- role phù hợp với relation.
- Teacher chỉ sở hữu resource của mình.
- Student chỉ access Exam được assign.
- Attempt không thay đổi sau submit ngoài manual grading.
- Answer không được save sau expiry.
- Correct answer không trả trước release/reveal.
- Live Quiz chỉ nhận một answer/participant/question.
- Duplicate join không tạo participant thứ hai.
- Pool selection không duplicate question trong cùng attempt.
- Deleting referenced question nên archive/soft-delete thay vì phá lịch sử.

---

# 40. Important implementation decisions

## 40.1. Snapshot is mandatory

Exam Attempt và Live Room phải snapshot question.

Không render lịch sử dựa trực tiếp vào current Question Bank content.

## 40.2. Server-authoritative time

Không tin client clock để quyết định:

- exam expiry;
- quiz response time;
- quiz deadline.

## 40.3. Server-authoritative scoring

Client không gửi:

```text
isCorrect
score
pointsAwarded
```

Client chỉ gửi answer.

## 40.4. Server-authoritative identity

Không tin client userId/role.

## 40.5. Session over JWT

Primary auth phải dùng server-side Session để đáp ứng yêu cầu môn học.

---

# 41. Suggested implementation order

## Phase 0 — Foundation

- monorepo;
- shared TS config;
- lint;
- env;
- base UI;
- Express;
- Prisma schema;
- health;
- CI.

## Phase 1 — Auth/RBAC

- User;
- register/login/logout/me/csrf;
- sessions;
- role guards;
- Admin user management.

## Phase 2 — Class + Question Bank

- class CRUD;
- roster;
- bank CRUD;
- question editor;
- Markdown/LaTeX/code/image.

## Phase 3 — Exam Builder

- exam CRUD;
- class assignment;
- fixed questions;
- random pools;
- settings;
- publish validation.

## Phase 4 — Student Exam

- eligibility;
- start attempt transaction;
- snapshot;
- timer;
- autosave;
- resume;
- submit;
- auto-submit job;
- objective grading.

## Phase 5 — Monitoring + Essay + Result

- Socket presence;
- teacher monitor;
- manual essay grading;
- release rules;
- student result.

## Phase 6 — Analytics + Export

- stats;
- charts;
- Excel;
- PDF with Vietnamese.

## Phase 7 — Live Quiz

- builder;
- room;
- lobby;
- socket state machine;
- scoring;
- leaderboard;
- animation.

## Phase 8 — Hardening

- security review;
- integration/socket/E2E tests;
- responsive;
- accessibility;
- error UX;
- performance.

## Phase 9 — Deployment/docs

- GitHub Pages workflow;
- Render-ready backend;
- deployment docs;
- final README;
- SRS;
- SDD.

---

# 42. Definition of Done

Project chỉ được coi là hoàn tất nếu:

## Auth

- [ ] Student register/login/logout hoạt động.
- [ ] Session persist server-side.
- [ ] Cookie HttpOnly.
- [ ] RBAC server-side.
- [ ] Locked account bị chặn.
- [ ] CSRF protection cho mutation.

## Admin

- [ ] User list/search.
- [ ] Create user.
- [ ] Lock/unlock.
- [ ] Role management.

## Teacher Class

- [ ] CRUD/archive Class.
- [ ] Add/remove Student.

## Question Bank

- [ ] CRUD bank/question.
- [ ] 4 question types.
- [ ] Markdown.
- [ ] LaTeX.
- [ ] code block.
- [ ] image upload.

## Exam

- [ ] Create/edit/publish.
- [ ] Assign Class.
- [ ] fixed questions.
- [ ] random pool.
- [ ] shuffle questions.
- [ ] shuffle options.
- [ ] attempts setting.
- [ ] result strategy.
- [ ] result release settings.

## Student Exam

- [ ] eligibility.
- [ ] start.
- [ ] server timer.
- [ ] autosave.
- [ ] reconnect/resume.
- [ ] manual submit.
- [ ] auto submit.
- [ ] objective auto-grade.

## Monitoring

- [ ] NOT_STARTED.
- [ ] IN_PROGRESS.
- [ ] DISCONNECTED.
- [ ] SUBMITTED.
- [ ] realtime update.

## Essay

- [ ] Teacher manual grade.
- [ ] feedback.
- [ ] final score update.

## Result

- [ ] release modes.
- [ ] correct answer visibility.
- [ ] explanation visibility.
- [ ] attempt strategy.
- [ ] student result page.

## Analytics/export

- [ ] average/high/low/pass.
- [ ] distribution chart.
- [ ] per-question rate.
- [ ] Excel.
- [ ] Unicode Vietnamese PDF.

## Live Quiz

- [ ] Teacher create Quiz.
- [ ] create Room.
- [ ] logged-in Student join by code.
- [ ] realtime lobby.
- [ ] start.
- [ ] synchronized question.
- [ ] server deadline.
- [ ] server scoring.
- [ ] reveal.
- [ ] leaderboard.
- [ ] final result.
- [ ] reconnect state recovery.
- [ ] restrained animation.

## Engineering

- [ ] migrations committed.
- [ ] seed data.
- [ ] env examples.
- [ ] no committed secrets.
- [ ] lint pass.
- [ ] typecheck pass.
- [ ] tests pass.
- [ ] build pass.
- [ ] GitHub Pages workflow.
- [ ] Render-ready API.
- [ ] README complete.
- [ ] docs/SRS.md.
- [ ] docs/SDD.md.
- [ ] docs/DEPLOYMENT.md.

---

# 43. SRS — mandatory final document

Sau khi implementation đã hoàn tất và test, agent phải tạo:

```text
docs/SRS.md
```

SRS phải phản ánh **hệ thống thực tế đã code**, không chỉ copy nguyên spec.

Viết bằng tiếng Việt, thuật ngữ kỹ thuật có thể giữ English.

Minimum sections:

1. Giới thiệu.
2. Mục đích.
3. Phạm vi hệ thống.
4. Đối tượng sử dụng.
5. Thuật ngữ.
6. Product overview.
7. User roles.
8. Assumptions/constraints.
9. Functional Requirements đánh mã:
   - FR-AUTH-001...
   - FR-ADMIN-...
   - FR-CLASS-...
   - FR-QBANK-...
   - FR-EXAM-...
   - FR-GRADE-...
   - FR-RESULT-...
   - FR-QUIZ-...
10. Non-functional Requirements:
   - security;
   - performance;
   - reliability;
   - usability;
   - accessibility;
   - maintainability.
11. External interface requirements.
12. Data requirements.
13. Major use cases.
14. Acceptance criteria.
15. Requirement traceability table:
   - requirement;
   - implementation module;
   - test(s).

Không ghi requirement mà final code không có.

---

# 44. SDD — mandatory final document

Sau khi implementation đã hoàn tất và test, agent phải tạo:

```text
docs/SDD.md
```

SDD phải phản ánh design thực tế.

Minimum sections:

1. Architecture overview.
2. Technology stack + lý do lựa chọn.
3. C4-like diagrams:
   - System Context;
   - Container;
   - Component.
4. Repository/module structure.
5. Database design.
6. Mermaid ER diagram.
7. Table/entity description.
8. Authentication/session design.
9. RBAC/authorization.
10. CSRF/security design.
11. REST API design.
12. WebSocket event architecture.
13. Exam attempt state machine.
14. Live Quiz state machine.
15. Sequence diagrams bằng Mermaid cho:
    - Login;
    - Start Exam;
    - Autosave;
    - Submit/Auto-submit;
    - Realtime Monitoring;
    - Live Quiz join/start/answer/leaderboard.
16. Timer synchronization.
17. Question snapshot/randomization.
18. Grading.
19. Result release.
20. Storage/file flow.
21. Export design.
22. Error handling.
23. Testing architecture.
24. Deployment architecture:
    - GitHub Pages;
    - Render;
    - Supabase.
25. Environment/configuration.
26. Design tradeoffs & limitations.
27. Future development.

Không bịa component chưa tồn tại trong source.

---

# 45. Deployment document — mandatory

Tạo:

```text
docs/DEPLOYMENT.md
```

Bao gồm:

- Supabase project setup.
- Database URL setup.
- Prisma migration.
- Storage bucket.
- Backend local.
- Frontend local.
- Render backend.
- GitHub Pages frontend.
- custom domain guidance.
- CORS/cookie/SameSite production notes.
- environment variable table.
- seed demo instructions.
- troubleshooting common issues.

Không ghi secret cụ thể.

---

# 46. README — mandatory

README root phải có:

- project intro;
- screenshots section/placeholders nếu chưa commit ảnh;
- feature list;
- architecture summary;
- tech stack;
- repo structure;
- local quick start;
- env setup;
- database migration;
- seed;
- demo credentials development-only;
- commands;
- testing;
- deployment references;
- link đến `docs/SRS.md`, `docs/SDD.md`, `docs/DEPLOYMENT.md`.

---

# 47. Agent working rules

Agent triển khai project phải tuân thủ:

1. Đọc toàn bộ `MASTER_SPEC.md` trước khi code.
2. Không giảm scope Core âm thầm.
3. Không thêm tính năng lớn ngoài scope trước khi Core hoàn thành.
4. Không invent Supabase secret/domain.
5. Không commit `.env`.
6. Không dùng mock data thay cho database ở final core flow.
7. Có thể dùng mock trong unit test.
8. Không trust frontend cho auth, time, score, answer key.
9. Không gửi correct answer cho Student ngoài policy.
10. Không dùng Supabase Auth thay Session.
11. Không bỏ WebSocket bằng polling-only.
12. Không dùng WebSocket tick timer mỗi giây.
13. Không lưu upload vào local disk làm final storage.
14. Không để MemoryStore trong production config.
15. Không bỏ test chỉ để pipeline xanh.
16. Không để core button/action không hoạt động.
17. Không để TypeScript `any` tràn lan.
18. Ưu tiên code rõ ràng hơn abstraction quá mức.
19. Comment code chỉ khi logic khó hiểu; không spam comment.
20. Nếu thư viện trong spec đã deprecated, thay bằng stable maintained equivalent và ghi quyết định trong SDD.
21. Nếu có thay đổi schema/API so với spec để sửa lỗi thực tế, update docs sau cùng.
22. SRS/SDD được tạo cuối cùng từ implementation thực tế.

---

# 48. Acceptance demo script

Project final phải demo được kịch bản sau.

## Scenario A — Exam

1. Admin login.
2. Admin xem user.
3. Teacher login.
4. Teacher mở Class có Student.
5. Teacher mở Question Bank có đủ loại câu.
6. Teacher mở Exam Builder.
7. Show:
   - class assignment;
   - schedule;
   - fixed question;
   - random pool;
   - shuffle;
   - max attempts;
   - result policy.
8. Student login.
9. Student Start Exam.
10. Show timer.
11. Answer một số câu.
12. Show autosave.
13. Refresh trang.
14. Answers và timer được restore đúng.
15. Teacher Monitor thấy Student đang thi.
16. Tắt tab/network client ngắn:
    - Teacher thấy disconnected sau grace period.
17. Reconnect:
    - Teacher thấy in-progress.
18. Student submit.
19. Teacher thấy submitted realtime.
20. Teacher grade Essay.
21. Student xem result theo policy.
22. Teacher mở analytics.
23. Export Excel.
24. Export PDF tiếng Việt.

## Scenario B — Live Quiz

1. Teacher tạo/open Quiz.
2. Teacher Create Room.
3. Student login.
4. Student nhập Room Code.
5. Teacher thấy Student trong lobby realtime.
6. Teacher Start.
7. Student nhận cùng question.
8. Student answer.
9. Show countdown.
10. Reveal answer.
11. Leaderboard.
12. Next.
13. Final leaderboard.

---

# 49. Success criteria cho BTL

Hệ thống phải thể hiện rõ các nội dung công nghệ web có độ phức tạp hợp lý:

- SPA frontend.
- RESTful backend.
- Relational database.
- ORM/migrations.
- Server-side Session.
- Authentication.
- Authorization/RBAC.
- CSRF-aware cookie authentication.
- File storage.
- WebSocket realtime.
- Server-authoritative timer.
- Background expiry processing.
- Auto grading.
- Manual grading.
- Analytics.
- PDF/Excel export.
- Cloud deploy architecture.
- CI.
- Test.

Đây là trọng tâm kỹ thuật cần thể hiện trong báo cáo/slide/demo.

---

# 50. Final instruction

Implementation cuối phải ưu tiên:

```text
correctness
> security/integrity
> core completeness
> usable UX
> visual polish
> optional extras
```

Không hy sinh tính đúng của Exam/Session/Timer/Scoring để thêm animation hoặc tính năng ngoài scope.
