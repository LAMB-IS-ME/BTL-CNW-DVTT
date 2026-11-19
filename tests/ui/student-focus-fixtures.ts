import { expect, type Page } from "@playwright/test";
import { createDb } from "../../apps/api/src/db/client";
export const base = "http://localhost:3000/api/v1";
export const database = process.env.TEST_DATABASE_URL!;
if (
  !database ||
  !new URL(database).pathname.includes("test") ||
  !["127.0.0.1", "localhost"].includes(new URL(database).hostname)
)
  throw new Error(
    "Student fixtures require an isolated loopback test database",
  );

export async function fixture(count = 30) {
  const db = createDb(database);
  try {
    const teacher = await db.user.findUniqueOrThrow({
      where: { email: "teacher1@exam.local" },
    });
    const classroom = await db.class.findFirstOrThrow({
      where: { teacherId: teacher.id },
    });
    const bank = await db.questionBank.create({
      data: { title: "Focus Desk browser fixture", ownerTeacherId: teacher.id },
    });
    const questions = [];
    for (let i = 0; i < count; i++) {
      const type =
        i === 1
          ? "MULTIPLE_CHOICE"
          : i === 2
            ? "ESSAY"
            : i === 3
              ? "TRUE_FALSE"
              : "SINGLE_CHOICE";
      const promptMarkdown =
        i === 0
          ? "Trong một ứng dụng web sử dụng session, thông tin nào nên được lưu trong cookie của trình duyệt?"
          : i === 1
            ? "Chọn các phương thức HTTP có tính idempotent theo ngữ nghĩa của giao thức."
            : i === 2
              ? "Giải thích cách server-side session duy trì trạng thái đăng nhập qua nhiều HTTP request.\n\nTrong bài làm, hãy đề cập đến:\n- Vai trò của cookie và session ID.\n- Cách server kiểm tra phiên đăng nhập.\n- Một biện pháp bảo vệ session."
              : i === 3
                ? "HTTPS bảo vệ dữ liệu truyền bằng TLS."
                : i === 4
                  ? "Đọc đoạn mã sau và xác định kết quả.\n\n```js\nconst message = 'Một chuỗi dài để kiểm tra vùng code cuộn riêng mà không kéo giãn toàn bộ trang thi trên điện thoại';\nconsole.log(2 ** 3);\n```\n\n$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$\n\n| HTTP | Ý nghĩa |\n| --- | --- |\n| GET | Đọc tài nguyên |\n| PUT | Thay thế tài nguyên |"
                  : `Câu hỏi ôn tập ${i + 1}: Đâu là cách phù hợp để bảo vệ thông tin phiên đăng nhập?`;
      const options =
        type === "ESSAY"
          ? []
          : type === "TRUE_FALSE"
            ? ["Đúng", "Sai"]
            : i === 1
              ? ["GET", "PUT", "POST", "DELETE"]
              : i === 4
                ? ["8", "6", "16", "Lỗi cú pháp"]
                : [
                    "Một session ID ngẫu nhiên, không chứa thông tin nhạy cảm.",
                    "Mật khẩu của người dùng ở dạng văn bản thuần.",
                    "Toàn bộ hồ sơ người dùng và quyền truy cập.",
                    "Khóa bí mật dùng để ký dữ liệu trên server.",
                  ];
      questions.push(
        await db.question.create({
          data: {
            bankId: bank.id,
            type,
            promptMarkdown,
            tags: [],
            options: {
              create: options.map((contentMarkdown, orderIndex) => ({
                contentMarkdown,
                orderIndex,
                isCorrect:
                  i === 1 ? [0, 1, 3].includes(orderIndex) : orderIndex === 0,
              })),
            },
          },
        }),
      );
    }
    return await db.exam.create({
      data: {
        teacherId: teacher.id,
        title: "Công nghệ Web · Kiểm tra giữa kỳ",
        descriptionMarkdown:
          "Vận dụng kiến thức về HTTP, phiên đăng nhập và bảo mật ứng dụng web. Đọc kỹ yêu cầu của từng câu trước khi trả lời.",
        status: "PUBLISHED",
        openAt: new Date(Date.now() - 60000),
        closeAt: new Date(Date.now() + 86400000),
        durationMinutes: 45,
        maxAttempts: 1,
        resultReleaseMode: "IMMEDIATE",
        classes: { create: { classId: classroom.id } },
        questions: {
          create: questions.map((q, orderIndex) => ({
            questionId: q.id,
            orderIndex,
            points: orderIndex === 2 ? 3 : 1,
          })),
        },
      },
    });
  } finally {
    await db.$disconnect();
  }
}
export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("student1@exam.local");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("DevOnly!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL("/student");
}
export async function index(page: Page, n: number) {
  await expect(page.getByLabel("Thời gian còn lại")).toBeVisible();
  {
    const toggle = page.getByRole("button", { name: /Mục lục câu hỏi/ });
    if (
      (await toggle.isVisible()) &&
      (await toggle.getAttribute("aria-expanded")) === "false"
    )
      await toggle.click();
  }
  await page.getByRole("button", { name: `Câu ${n}`, exact: true }).click();
}
