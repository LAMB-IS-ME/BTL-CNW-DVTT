import { test, expect, type Page, type BrowserContext } from "@playwright/test";
const origin = "http://localhost:5173",
  base = "http://localhost:3000/api/v1";
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu (ít nhất 10 ký tự)").fill("DevOnly!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
}
async function mutation<T>(
  ctx: BrowserContext,
  path: string,
  data: unknown,
  method = "POST",
): Promise<T> {
  const csrf = await ctx.request.get(`${base}/auth/csrf`);
  const token = (await csrf.json()).data.token;
  const response = await ctx.request.fetch(`${base}${path}`, {
    method,
    data,
    headers: { Origin: origin, "X-CSRF-Token": token },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).data;
}
async function question(ctx: BrowserContext, type = "SINGLE_CHOICE") {
  const b = await mutation<{ id: string }>(ctx, "/teacher/question-banks", {
    title: `E2E ${Date.now()}`,
  });
  return mutation<{ id: string }>(
    ctx,
    `/teacher/question-banks/${b.id}/questions`,
    {
      type,
      promptMarkdown:
        type === "ESSAY"
          ? "Giải thích vai trò của Session."
          : "Giá trị $2^3$ là bao nhiêu?",
      defaultPoints: type === "ESSAY" ? 3 : 2,
      options:
        type === "ESSAY"
          ? []
          : [
              { contentMarkdown: "8", isCorrect: true },
              { contentMarkdown: "6", isCorrect: false },
            ],
    },
  );
}
test("Exam: login, start, autosave, refresh, realtime monitor, submit, essay grading, released result", async ({
  browser,
}) => {
  const teacher = await browser.newContext(),
    student = await browser.newContext();
  const tp = await teacher.newPage(),
    sp = await student.newPage();
  await login(tp, "teacher1@exam.local");
  const list = await teacher.request.get(
    `${base}/teacher/students?search=student1@exam.local`,
  );
  const students = (await list.json()).data;
  const c = await mutation<{ id: string }>(teacher, "/teacher/classes", {
    name: `E2E class ${Date.now()}`,
  });
  await mutation(teacher, `/teacher/classes/${c.id}/students`, {
    studentId: students[0].id,
  });
  const q = await question(teacher),
    essay = await question(teacher, "ESSAY");
  const exam = await mutation<{ id: string }>(teacher, "/teacher/exams", {
    title: `E2E Exam ${Date.now()}`,
    openAt: new Date(Date.now() - 60000).toISOString(),
    closeAt: new Date(Date.now() + 3600000).toISOString(),
    durationMinutes: 30,
    resultReleaseMode: "IMMEDIATE",
    showCorrectAnswers: true,
    showExplanations: true,
  });
  await mutation(
    teacher,
    `/teacher/exams/${exam.id}/classes`,
    { classIds: [c.id] },
    "PUT",
  );
  await mutation(
    teacher,
    `/teacher/exams/${exam.id}/questions`,
    {
      questions: [
        { questionId: q.id, points: 2 },
        { questionId: essay.id, points: 3 },
      ],
    },
    "PUT",
  );
  await mutation(teacher, `/teacher/exams/${exam.id}/publish`, {});
  await tp.goto(`/teacher/exams/${exam.id}/monitor`);
  await login(sp, "student1@exam.local");
  await sp.goto(`/student/exams/${exam.id}`);
  await sp.getByRole("button", { name: "Bắt đầu làm bài" }).click();
  await expect(sp.getByLabel("Thời gian còn lại")).toBeVisible();
  await sp.getByRole("radio", { name: "8", exact: true }).check();
  await expect(sp.getByRole("status")).toContainText("Đã lưu");
  await sp.reload();
  await expect(sp.getByRole("radio", { name: "8", exact: true })).toBeChecked();
  await expect(tp.getByText("Đang thi", { exact: true })).toBeVisible();
  await sp.getByRole("button", { name: "Câu tiếp", exact: true }).click();
  await sp
    .getByLabel("Bài làm tự luận")
    .fill(
      "Session lưu định danh trên server; cookie HttpOnly chỉ mang session ID.",
    );
  await expect(sp.getByRole("status")).toContainText("Đã lưu");
  await sp.getByRole("button", { name: "Nộp bài", exact: true }).click();
  await sp
    .getByRole("dialog")
    .getByRole("button", { name: "Xác nhận", exact: true })
    .click();
  await expect(sp.getByText("Đã nộp · Đang chờ chấm tự luận")).toBeVisible();
  await expect(tp.getByText("Đã nộp", { exact: true })).toBeVisible();
  await tp.goto(`/teacher/exams/${exam.id}/grading`);
  await tp.getByLabel("Điểm (0–3)").fill("2.5");
  await tp.getByLabel("Nhận xét").fill("Lập luận tốt, cần thêm ví dụ.");
  await tp.getByRole("button", { name: "Lưu điểm", exact: true }).click();
  await expect(tp.getByText("Đã lưu điểm", { exact: true })).toBeVisible();
  await sp.reload();
  await expect(sp.getByText("4.5/5 · 90.0%")).toBeVisible();
  await sp.screenshot({
    path:
      "docs/screenshots/" +
      (test.info().title.startsWith("Exam") ? "student-result" : "quiz-final") +
      ".png",
    fullPage: true,
    animations: "disabled",
  });
  await teacher.close();
  await student.close();
});
test("Live Quiz: authenticated join, realtime lobby, start, answer, reveal and final leaderboard", async ({
  browser,
}) => {
  const teacher = await browser.newContext(),
    student = await browser.newContext();
  const tp = await teacher.newPage(),
    sp = await student.newPage();
  await login(tp, "teacher1@exam.local");
  const q = await question(teacher);
  const quiz = await mutation<{ id: string }>(teacher, "/teacher/quizzes", {
    title: `E2E Quiz ${Date.now()}`,
  });
  await mutation(
    teacher,
    `/teacher/quizzes/${quiz.id}/questions`,
    {
      questions: [{ questionId: q.id, timeLimitSeconds: 30, basePoints: 1000 }],
    },
    "PUT",
  );
  const room = await mutation<{ id: string; code: string }>(
    teacher,
    `/teacher/quizzes/${quiz.id}/rooms`,
    {},
  );
  await tp.goto(`/teacher/quiz-rooms/${room.id}/host`);
  await login(sp, "student1@exam.local");
  await sp.goto("/student/quiz/join");
  await sp.getByLabel("Mã phòng").fill(room.code);
  await sp.getByRole("button", { name: "Vào phòng" }).click();
  await expect(
    tp.getByRole("heading", { name: "1 người tham gia" }),
  ).toBeVisible();
  await tp.getByRole("button", { name: "Bắt đầu Quiz" }).click();
  await expect(sp.getByRole("radio", { name: "8", exact: true })).toBeVisible();
  await sp.getByRole("radio", { name: "8", exact: true }).check();
  await sp.getByRole("button", { name: "Gửi câu trả lời" }).click();
  await expect(
    sp.getByRole("heading", { name: "Kết quả cuối cùng" }),
  ).toBeVisible();
  await expect(
    tp.getByRole("heading", { name: "Kết quả cuối cùng" }),
  ).toBeVisible();
  await sp.reload();
  await expect(
    sp.getByRole("heading", { name: "Kết quả cuối cùng" }),
  ).toBeVisible();
  await sp.screenshot({
    path:
      "docs/screenshots/" +
      (test.info().title.startsWith("Exam") ? "student-result" : "quiz-final") +
      ".png",
    fullPage: true,
    animations: "disabled",
  });
  await teacher.close();
  await student.close();
});
test("mobile login and server-backed role guard", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "student2@exam.local");
  await page.goto("/teacher/classes");
  await expect(
    page.getByRole("heading", { name: "Bạn không có quyền truy cập." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
