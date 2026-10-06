import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const phase = process.env.UI_PHASE === "before" ? "before" : "after";
const root =
  process.env.UI_SCREENSHOT_DIR || `docs/screenshots/ui-redesign/${phase}`;
const base = "http://localhost:3000/api/v1";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function login(page: Page, email = "teacher1@exam.local") {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("DevOnly!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL(
    `/${email.startsWith("admin") ? "admin" : email.startsWith("teacher") ? "teacher" : "student"}`,
  );
  await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
}
async function mutate<T>(
  page: Page,
  path: string,
  data = {},
  method = "POST",
): Promise<T> {
  const csrf = (await (await page.request.get(`${base}/auth/csrf`)).json()).data
    .token;
  const response = await page.request.fetch(`${base}${path}`, {
    method,
    data,
    headers: { Origin: "http://localhost:5173", "X-CSRF-Token": csrf },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (
    response.status() === 204 ? undefined : (await response.json()).data
  ) as T;
}
async function fixtures(page: Page) {
  const existing = (
    await (
      await page.request.get(
        `${base}/teacher/question-banks?view=manage&pageSize=100`,
      )
    ).json()
  ).data.items as { id: string; title: string; isArchived: boolean }[];
  for (const [title, subject, description, archived] of [
    [
      "HTTP & bảo mật ứng dụng",
      "Công nghệ Web",
      "Giao thức, xác thực và an toàn thông tin.",
      false,
    ],
    [
      "JavaScript thực hành",
      "Lập trình",
      "Tư duy lập trình qua những tình huống thực tế.",
      false,
    ],
    [
      "Ôn tập học kỳ trước",
      "Công nghệ Web",
      "Tài liệu được giữ lại để tham khảo và tái sử dụng.",
      true,
    ],
  ] as const) {
    if (existing.some((b) => b.title === title)) continue;
    const bank = await mutate<{ id: string }>(page, "/teacher/question-banks", {
      title,
      subject,
      description,
    });
    await mutate(page, `/teacher/question-banks/${bank.id}/questions`, {
      type: "ESSAY",
      promptMarkdown: "Vì sao nên kiểm tra dữ liệu đầu vào ở phía server?",
      tags: ["bảo-mật"],
      defaultPoints: 2,
    });
    if (archived)
      await mutate(page, `/teacher/question-banks/${bank.id}`, {}, "DELETE");
  }
}

for (const [device, width] of [
  ["desktop", 1440],
  ["tablet", 820],
  ["mobile", 390],
] as const) {
  test(`UI inventory and responsive review: ${device}`, async ({
    page,
    browser,
  }) => {
    await mkdir(root, { recursive: true });
    await page.setViewportSize({ width, height: 1000 });
    const records: object[] = [];
    async function shot(
      p: Page,
      name: string,
      route?: string,
      pilot = true,
      fullPage = true,
    ) {
      if (route) {
        await p.goto(route);
        await expect(p).toHaveURL(
          new RegExp(`${route.replace(/[?]/g, "\\?")}$`),
        );
      }
      const headings: Record<string, string> = {
        "question-bank-list": "Ngân hàng câu hỏi",
        "question-bank-detail": "Công nghệ Web căn bản",
        "question-bank-editor": "Chỉnh sửa câu hỏi",
        "question-bank-editor-viewport": "Chỉnh sửa câu hỏi",
        "teacher-dashboard": "Không gian giảng viên",
        "admin-dashboard": "Tổng quan hệ thống",
        "admin-users": "Quản lý tài khoản",
        "admin-classes": "Tổng quan lớp học",
      };
      if (headings[name])
        await expect(
          p.getByRole("heading", { name: headings[name], exact: true }),
        ).toBeVisible();
      if (name === "student-submitted")
        await expect(
          p.getByText("Đã nộp · Đang chờ chấm tự luận"),
        ).toBeVisible();
      await p.waitForLoadState("networkidle");
      await expect(
        p.getByRole("status").filter({ hasText: /^Đang (tải|mở)/ }),
      ).toHaveCount(0);
      await p.evaluate(() => document.fonts.ready);
      await p.evaluate(
        () =>
          new Promise<void>((resolve) => {
            scrollTo(0, 0);
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      );
      await expect(p.locator("main")).toBeVisible();
      const overflow = await p.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      if (phase === "after" && pilot) {
        expect(overflow.document, name).toBeLessThanOrEqual(width);
        await expect(p.getByRole("alert")).toHaveCount(0);
      }
      const path = `${root}/${name}-${device}.png`;
      await p.screenshot({ path, fullPage, animations: "disabled" });
      records.push({
        name,
        path,
        route: new URL(p.url()).pathname,
        ...overflow,
      });
    }
    if (phase === "before") await shot(page, "login", "/login", false);
    await login(page);
    await fixtures(page);
    await shot(page, "teacher-dashboard", "/teacher");
    await page.getByRole("link", { name: "Câu hỏi", exact: true }).click();
    await shot(page, "question-bank-list");
    await page
      .getByRole("button", { name: "Tạo ngân hàng", exact: true })
      .click();
    await expect(
      page.getByRole("dialog").getByLabel("Tên ngân hàng", { exact: true }),
    ).toBeFocused();
    await shot(page, "question-bank-dialog", undefined, true, false);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Tạo ngân hàng", exact: true }),
    ).toBeFocused();
    await page
      .getByLabel("Trạng thái", { exact: true })
      .selectOption("archived");
    await shot(page, "question-bank-archived");
    await page.getByLabel("Trạng thái", { exact: true }).selectOption("all");
    const row = page
      .getByRole("row")
      .filter({ hasText: "Công nghệ Web căn bản" });
    await row.getByRole("link", { name: "Mở ngân hàng" }).click();
    await shot(page, "question-bank-detail");
    const question = page
      .getByRole("row")
      .filter({ hasText: "Giá trị của $2^3$" });
    await question
      .getByRole("link", { name: "Chỉnh sửa", exact: true })
      .click();
    await shot(page, "question-bank-editor");
    await shot(page, "question-bank-editor-viewport", undefined, true, false);
    if (width < 961) {
      await page.getByRole("tab", { name: "Xem trước", exact: true }).click();
      await shot(page, "question-bank-preview");
      await page.getByRole("tab", { name: "Soạn thảo", exact: true }).click();
    }
    await page
      .getByRole("button", { name: "Lưu trữ câu hỏi", exact: true })
      .click();
    await shot(page, "question-bank-confirmation", undefined, true, false);
    await page.keyboard.press("Escape");
    await page.goto("/teacher/question-banks?search=khong-co-ket-qua-ui");
    await expect(
      page.getByRole("heading", { name: "Không tìm thấy ngân hàng phù hợp" }),
    ).toBeVisible();
    await shot(page, "question-bank-empty");

    if (phase === "before") {
      const studentContext = await browser.newContext({
        viewport: { width, height: 1000 },
        locale: "vi-VN",
        timezoneId: "Asia/Bangkok",
      });
      const sp = await studentContext.newPage();
      // Isolated exam per audit run; existing API contracts and seed questions.
      const exam = await mutate<{ id: string }>(page, "/teacher/exams", {
        title: "Ôn tập kiến thức Web",
        openAt: new Date(Date.now() - 60000).toISOString(),
        closeAt: new Date(Date.now() + 86400000).toISOString(),
        durationMinutes: 45,
        resultReleaseMode: "IMMEDIATE",
        showCorrectAnswers: true,
        showExplanations: true,
      });
      await mutate(
        page,
        `/teacher/exams/${exam.id}/classes`,
        { classIds: [id(100)] },
        "PUT",
      );
      await mutate(
        page,
        `/teacher/exams/${exam.id}/questions`,
        {
          questions: [
            { questionId: id(300), points: 1 },
            { questionId: id(303), points: 3 },
          ],
        },
        "PUT",
      );
      await mutate(page, `/teacher/exams/${exam.id}/publish`);
      await login(sp, "student1@exam.local");
      await shot(sp, "student-dashboard", "/student", false);
      await shot(sp, "student-exam-list", "/student/exams", false);
      await shot(sp, "student-exam-start", `/student/exams/${exam.id}`, false);
      await sp.getByRole("button", { name: "Bắt đầu làm bài" }).click();
      await expect(sp.getByLabel("Thời gian còn lại")).toBeVisible();
      await shot(sp, "student-exam-taking", undefined, false);
      await sp.getByRole("radio", { name: "8", exact: true }).check();
      await expect(sp.getByRole("status")).toContainText("Đã lưu");
      await sp.getByRole("button", { name: "Câu tiếp", exact: true }).click();
      await sp
        .getByLabel("Bài làm tự luận")
        .fill(
          "Session lưu thông tin xác thực trên server, cookie mang session ID.",
        );
      await expect(sp.getByRole("status")).toContainText("Đã lưu");
      await sp.getByRole("button", { name: "Nộp bài", exact: true }).click();
      await shot(sp, "student-submit-dialog", undefined, false, false);
      await sp
        .getByRole("dialog")
        .getByRole("button", { name: "Xác nhận", exact: true })
        .click();
      await shot(sp, "student-submitted", undefined, false);
      await shot(sp, "student-result", `/student/results/${exam.id}`, false);
      await shot(sp, "student-live-quiz", "/student/quiz/join", false);
      await studentContext.close();
      for (const [name, route] of [
        ["teacher-classes", "/teacher/classes"],
        ["teacher-class-detail", `/teacher/classes/${id(100)}`],
        ["teacher-exam-list", "/teacher/exams"],
        ["teacher-exam-create", "/teacher/exams/new"],
        ["teacher-exam-editor", `/teacher/exams/${id(400)}/edit`],
        ["teacher-grading", `/teacher/exams/${exam.id}/grading`],
        ["teacher-results", `/teacher/exams/${id(402)}/results`],
        ["teacher-live-quiz", "/teacher/quizzes"],
        ["teacher-quiz-editor", `/teacher/quizzes/${id(500)}/edit`],
      ])
        await shot(page, name!, route!, false);
      await page.getByRole("button", { name: "Đăng xuất" }).click();
      await page.waitForURL("/login");
      await login(page, "admin@exam.local");
      for (const [name, route] of [
        ["admin-dashboard", "/admin"],
        ["admin-users", "/admin/users"],
        ["admin-classes", "/admin/classes"],
      ])
        await shot(page, name!, route!, false);
    }
    await writeFile(
      `${root}/inventory-${device}.json`,
      JSON.stringify(records, null, 2),
    );
  });
}
