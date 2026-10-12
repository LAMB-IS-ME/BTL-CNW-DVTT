import { expect, type BrowserContext, type Page } from "@playwright/test";
import { createDb } from "../../apps/api/src/db/client";

export const base = "http://localhost:3000/api/v1";
export const database = process.env.TEST_DATABASE_URL!;
if (
  !database ||
  !new URL(database).pathname.includes("test") ||
  !["localhost", "127.0.0.1"].includes(new URL(database).hostname)
)
  throw new Error(
    "Live Quiz fixtures require isolated loopback test PostgreSQL",
  );

export async function login(context: BrowserContext, email: string) {
  if (!process.env.DEMO_PASSWORD)
    throw new Error("Set DEMO_PASSWORD to the test seed password");
  await mutate(context, "/auth/login", {
    email,
    password: process.env.DEMO_PASSWORD,
  });
}
export async function mutate<T>(
  context: BrowserContext,
  path: string,
  data: unknown,
  method = "POST",
): Promise<T> {
  const csrf = await context.request.get(`${base}/auth/csrf`);
  const response = await context.request.fetch(`${base}${path}`, {
    method,
    data,
    headers: {
      Origin: "http://localhost:5173",
      "X-CSRF-Token": (await csrf.json()).data.token,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).data;
}
export async function fixture(
  context: BrowserContext,
  content?: { title?: string; prompt?: string },
) {
  const bank = await mutate<{ id: string }>(
    context,
    "/teacher/question-banks",
    { title: `Live Quiz audit ${crypto.randomUUID()}` },
  );
  const questions = [];
  for (const [index, type] of [
    "SINGLE_CHOICE",
    "MULTIPLE_CHOICE",
    "TRUE_FALSE",
  ].entries()) {
    questions.push(
      await mutate<{ id: string }>(
        context,
        `/teacher/question-banks/${bank.id}/questions`,
        {
          type,
          defaultPoints: 1,
          promptMarkdown:
            index === 0 && content?.prompt
              ? content.prompt
              : [
                  "Trong ứng dụng web sử dụng session, thông tin nào nên được lưu trong cookie của trình duyệt?",
                  "Chọn các phương thức HTTP có tính idempotent.",
                  "HTTPS bảo vệ dữ liệu truyền giữa trình duyệt và máy chủ bằng TLS.",
                ][index],
          explanationMarkdown: [
            "Session ID giúp máy chủ nhận diện phiên. Dữ liệu nhạy cảm được lưu ở phía máy chủ.",
            "GET, PUT và DELETE có tính idempotent: lặp lại yêu cầu có cùng tác động dự kiến lên trạng thái tài nguyên.",
            "TLS mã hóa dữ liệu trên đường truyền và xác thực máy chủ trong kết nối HTTPS.",
          ][index],
          options: (index === 0
            ? [
                "Một session ID ngẫu nhiên.",
                "Mật khẩu ở dạng văn bản thuần.",
                "Toàn bộ hồ sơ và quyền truy cập.",
                "Khóa bí mật của máy chủ.",
              ]
            : index === 1
              ? ["GET", "PUT", "POST", "DELETE"]
              : ["True", "False"]
          ).map((contentMarkdown, i) => ({
            contentMarkdown,
            isCorrect: index === 1 ? [0, 1, 3].includes(i) : i === 0,
          })),
        },
      ),
    );
  }
  const quiz = await mutate<{ id: string }>(context, "/teacher/quizzes", {
    title: content?.title || "Công nghệ Web · Session & HTTP",
  });
  await mutate(
    context,
    `/teacher/quizzes/${quiz.id}/questions`,
    {
      questions: questions.map((q, i) => ({
        questionId: q.id,
        timeLimitSeconds: i === 1 ? 8 : 120,
        basePoints: 1000,
      })),
    },
    "PUT",
  );
  return quiz;
}
export async function snapshot(context: BrowserContext, id: string) {
  const response = await context.request.get(
    `${base}/teacher/quiz-rooms/${id}`,
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data;
}
export async function join(page: Page, code: string) {
  await page.goto("/student/quiz/join");
  await page.getByLabel("Mã phòng").fill(code);
  await page.getByRole("button", { name: "Vào phòng", exact: true }).click();
  await expect(
    page.getByText("Chờ giảng viên bắt đầu…", { exact: true }),
  ).toBeVisible();
}
export async function answerCount(roomId: string) {
  const db = createDb(database);
  try {
    return await db.quizAnswer.count({ where: { question: { roomId } } });
  } finally {
    await db.$disconnect();
  }
}
