import "dotenv/config";
import { pathToFileURL } from "node:url";
import { createDb, type Db } from "../src/db/client.js";
import { hashPassword } from "../src/modules/auth/password.js";
import {
  startAttempt,
  saveAnswer,
  submitAttempt,
} from "../src/modules/attempts/service.js";
import { snapshotSchema } from "../src/modules/attempts/logic.js";
const id = (n: number) =>
  `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
export async function seedDemo(db: Db) {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_PRODUCTION_SEED !== "true"
  )
    throw new Error("Production demo seed requires ALLOW_PRODUCTION_SEED=true");
  const passwordHash = await hashPassword(
    process.env.DEMO_PASSWORD || "DevOnly!2026",
  );
  const users = [];
  for (let i = 0; i < 15; i++) {
    const role = i === 0 ? "ADMIN" : i < 3 ? "TEACHER" : "STUDENT";
    const email =
      i === 0
        ? "admin@exam.local"
        : i < 3
          ? `teacher${i}@exam.local`
          : `student${i - 2}@exam.local`;
    const fullName =
      i === 0
        ? "Quản trị viên"
        : i === 1
          ? "Nguyễn Minh Đức"
          : i === 2
            ? "Trần Thu Hà"
            : i === 3
              ? "Nguyễn Hoàng Anh"
              : i === 4
                ? "Trần Thị Hương"
                : `Sinh viên ${i - 2}`;
    users.push(
      await db.user.upsert({
        where: { email },
        update: {},
        create: {
          id: id(i + 1),
          email,
          passwordHash,
          fullName,
          role,
          studentCode:
            role === "STUDENT"
              ? `SV${(i - 2).toString().padStart(3, "0")}`
              : null,
        },
      }),
    );
  }
  for (let c = 0; c < 2; c++) {
    await db.class.upsert({
      where: { id: id(100 + c) },
      update: {},
      create: {
        id: id(100 + c),
        teacherId: users[c + 1]!.id,
        name: c === 0 ? "Công nghệ Web · Nhóm 01" : "Cơ sở dữ liệu · Nhóm 02",
        code: `CNW0${c + 1}`,
        description: "Lớp học dữ liệu demo development",
      },
    });
    await db.questionBank.upsert({
      where: { id: id(200 + c) },
      update: {},
      create: {
        id: id(200 + c),
        ownerTeacherId: users[c + 1]!.id,
        title: c === 0 ? "Công nghệ Web căn bản" : "Cơ sở dữ liệu căn bản",
        subject: c === 0 ? "Web" : "Database",
      },
    });
    for (const user of users.slice(3 + c * 6, 9 + c * 6))
      await db.classMember.upsert({
        where: {
          classId_studentId: { classId: id(100 + c), studentId: user.id },
        },
        update: {},
        create: { classId: id(100 + c), studentId: user.id },
      });
  }
  for (let n = 0; n < 24; n++) {
    const type = (
      ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "ESSAY"] as const
    )[n % 4]!;
    const prompt =
      n === 0
        ? "Giá trị của $2^3$ bằng bao nhiêu?"
        : n === 1
          ? "Chọn các phương thức HTTP hợp lệ."
          : n === 2
            ? "HTTPS bảo vệ dữ liệu truyền bằng TLS."
            : n === 3
              ? "Giải thích vai trò của server-side Session trong xác thực."
              : n === 4
                ? "Kết quả đoạn code là gì?\n```js\nconsole.log(2 + 6);\n```"
                : `Câu ${n + 1}: ${type === "ESSAY" ? "Trình bày một nguyên tắc thiết kế ứng dụng web an toàn." : type === "TRUE_FALSE" ? "PostgreSQL hỗ trợ transaction." : type === "MULTIPLE_CHOICE" ? "Chọn các phương thức HTTP hợp lệ." : "Giá trị 4 + 4 bằng bao nhiêu?"}`;
    const options =
      type === "ESSAY"
        ? []
        : type === "TRUE_FALSE"
          ? [
              { contentMarkdown: "True", isCorrect: true },
              { contentMarkdown: "False", isCorrect: false },
            ]
          : type === "MULTIPLE_CHOICE"
            ? [
                { contentMarkdown: "GET", isCorrect: true },
                { contentMarkdown: "POST", isCorrect: true },
                { contentMarkdown: "DRAW", isCorrect: false },
              ]
            : [
                { contentMarkdown: "8", isCorrect: true },
                { contentMarkdown: "6", isCorrect: false },
                { contentMarkdown: "4", isCorrect: false },
              ];
    await db.question.upsert({
      where: { id: id(300 + n) },
      update: {},
      create: {
        id: id(300 + n),
        bankId: id(200 + Math.floor(n / 12)),
        type,
        promptMarkdown: prompt,
        explanationMarkdown:
          type === "ESSAY"
            ? "Đánh giá tính đúng, đầy đủ và ví dụ minh họa."
            : "Đối chiếu định nghĩa và tính toán theo nội dung đã học.",
        difficulty: n % 3 === 0 ? "EASY" : n % 3 === 1 ? "MEDIUM" : "HARD",
        tags: ["demo", type === "ESSAY" ? "tự-luận" : "khách-quan"],
        defaultPoints: 1,
        options: {
          create: options.map((o, orderIndex) => ({ ...o, orderIndex })),
        },
      },
    });
  }
  const schedule = {
    openAt: new Date(Date.now() - 3600000),
    closeAt: new Date(Date.now() + 7 * 86400000),
    durationMinutes: 45,
    maxAttempts: 3,
  };
  for (let n = 0; n < 3; n++) {
    await db.exam.upsert({
      where: { id: id(400 + n) },
      update: {},
      create: {
        id: id(400 + n),
        teacherId: users[1]!.id,
        title:
          n === 0
            ? "Bài kiểm tra nháp"
            : n === 1
              ? "Kiểm tra Công nghệ Web"
              : "Kết quả minh họa",
        status: n === 0 ? "DRAFT" : "PUBLISHED",
        ...schedule,
        resultReleaseMode: n === 1 ? "MANUAL" : "IMMEDIATE",
        shuffleQuestions: true,
        shuffleOptions: true,
        showCorrectAnswers: true,
        showExplanations: true,
        classes: { create: { classId: id(100) } },
        questions: {
          create: (n === 1 ? [0, 1, 2, 3] : [0, 2, 4]).map((q, orderIndex) => ({
            questionId: id(300 + q),
            orderIndex,
            points: q === 3 ? 3 : 1,
          })),
        },
        ...(n === 1
          ? {
              pools: {
                create: {
                  questionBankId: id(200),
                  pickCount: 2,
                  pointsEach: 1,
                  tagFilter: ["demo"],
                },
              },
            }
          : {}),
        publishedAt: n === 0 ? null : new Date(),
      },
    });
  }
  await db.liveQuiz.upsert({
    where: { id: id(500) },
    update: {},
    create: {
      id: id(500),
      teacherId: users[1]!.id,
      title: "Khởi động kiến thức Web",
      descriptionMarkdown: "Quiz mẫu cho hoạt động trên lớp.",
      questions: {
        create: [0, 1, 2, 4, 5, 6].map((q, orderIndex) => ({
          questionId: id(300 + q),
          orderIndex,
          timeLimitSeconds: 20,
          basePoints: 1000,
        })),
      },
    },
  });
  if (
    (await db.examAttempt.count({
      where: { examId: id(402), studentId: users[4]!.id },
    })) === 0
  ) {
    const a = await startAttempt(db, id(402), users[4]!.id);
    const questions = await db.attemptQuestion.findMany({
      where: { attemptId: a.id },
    });
    for (const q of questions) {
      const snap = snapshotSchema.parse(q.snapshotJson);
      await saveAnswer(db, a.id, q.id, users[4]!.id, {
        selectedOptionIds: snap.options
          .filter((o) => o.isCorrect)
          .map((o) => o.id),
      });
    }
    await submitAttempt(db, a.id, users[4]!.id);
  }
  return {
    users: 15,
    classes: 2,
    banks: 2,
    questions: 24,
    exams: 3,
    quizzes: 1,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const db = createDb(process.env.DATABASE_URL);
  try {
    console.info(await seedDemo(db));
  } finally {
    await db.$disconnect();
  }
}
