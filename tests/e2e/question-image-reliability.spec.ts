import { test, expect } from "@playwright/test";
import { createDb } from "../../apps/api/src/db/client";
import { base, database, fixture, login } from "../ui/student-focus-fixtures";

for (const failure of ["signing", "download"] as const) {
  test(`Question image: ${failure} failure can retry without changing the real attempt/answer`, async ({
    page,
    browser,
  }) => {
    const db = createDb(database);
    const teacher = await browser.newContext();
    try {
      const exam = await fixture(1);
      const { question: source } = await db.examQuestion.findFirstOrThrow({
        where: { examId: exam.id },
        include: {
          question: {
            include: { options: { orderBy: { orderIndex: "asc" } } },
          },
        },
      });
      const csrf = async () =>
        (await (await teacher.request.get(`${base}/auth/csrf`)).json()).data
          .token;
      const logged = await teacher.request.post(`${base}/auth/login`, {
        headers: {
          Origin: "http://localhost:5173",
          "X-CSRF-Token": await csrf(),
        },
        data: { email: "teacher1@exam.local", password: "DevOnly!2026" },
      });
      expect(logged.status()).toBe(200);
      const uploaded = await teacher.request.post(
        `${base}/teacher/questions/${source.id}/assets`,
        {
          headers: {
            Origin: "http://localhost:5173",
            "X-CSRF-Token": await csrf(),
          },
          multipart: {
            file: {
              name: "figure.png",
              mimeType: "image/png",
              buffer: Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=",
                "base64",
              ),
            },
          },
        },
      );
      expect(uploaded.status()).toBe(201);
      const asset = (await uploaded.json()).data;
      const image = `![Dữ kiện cần đọc](asset:${asset.id})`;
      const edited = await teacher.request.patch(
        `${base}/teacher/questions/${source.id}`,
        {
          headers: {
            Origin: "http://localhost:5173",
            "X-CSRF-Token": await csrf(),
          },
          data: {
            type: source.type,
            defaultPoints: Number(source.defaultPoints),
            tags: source.tags,
            difficulty: source.difficulty,
            promptMarkdown:
              source.promptMarkdown +
              (failure === "signing" ? `\n\n${image}` : ""),
            options: source.options.map((o, i) => ({
              contentMarkdown:
                o.contentMarkdown +
                (failure === "download" && i === 1 ? `\n\n${image}` : ""),
              isCorrect: o.isCorrect,
            })),
          },
        },
      );
      expect(edited.status()).toBe(200);
      await page.setViewportSize(
        failure === "signing"
          ? { width: 390, height: 844 }
          : { width: 1280, height: 900 },
      );
      let signs = 0,
        answerWrites = 0,
        submits = 0;
      page.on("request", (r) => {
        if (r.url().endsWith(`/assets/${asset.id}`)) signs++;
        if (r.method() === "PUT" && r.url().includes("/answers/"))
          answerWrites++;
        if (r.method() === "POST" && r.url().endsWith("/submit")) submits++;
      });
      await page.route(
        failure === "signing"
          ? `**/api/v1/assets/${asset.id}`
          : "http://127.0.0.1:54329/storage/v1/object/sign/**",
        (r) =>
          r.fulfill({
            status: failure === "signing" ? 503 : 403,
            json: {
              error: {
                code: "LOCAL_IMAGE_FAILURE",
                message: "Controlled local image failure",
              },
            },
          }),
        { times: 1 },
      );
      await login(page);
      await page.goto(`/student/exams/${exam.id}`);
      await page
        .getByRole("button", { name: "Bắt đầu làm bài", exact: true })
        .click();
      await expect(page.getByRole("alert")).toContainText(
        "Không thể tải ảnh: Dữ kiện cần đọc",
      );
      const attemptId = page.url().split("/").at(-1)!;
      await page.getByRole("radio").first().check();
      await expect(
        page.getByRole("status").filter({ hasText: /^Đã lưu$/ }),
      ).toBeVisible();
      const attemptBefore = await db.examAttempt.findUniqueOrThrow({
        where: { id: attemptId },
      });
      const answerBefore = await db.attemptAnswer.findFirstOrThrow({
        where: { question: { attemptId } },
      });
      const writesBefore = answerWrites;
      const retry = page.getByRole("button", {
        name: "Thử tải lại ảnh: Dữ kiện cần đọc",
      });
      await retry.focus();
      await page.keyboard.press("Space");
      const img = page.getByRole("img", {
        name: "Dữ kiện cần đọc",
        exact: true,
      });
      await expect
        .poll(() => img.evaluate((node: HTMLImageElement) => node.naturalWidth))
        .toBeGreaterThan(0);
      await expect(page.getByRole("alert")).toHaveCount(0);
      await expect(page.getByRole("radio").first()).toBeChecked();
      expect(page.url()).toContain(`/student/attempts/${attemptId}`);
      expect(signs).toBe(2);
      expect(answerWrites).toBe(writesBefore);
      expect(submits).toBe(0);
      expect(
        await db.attemptAnswer.findUniqueOrThrow({
          where: { id: answerBefore.id },
        }),
      ).toEqual(answerBefore);
      expect(
        await db.examAttempt.findUniqueOrThrow({ where: { id: attemptId } }),
      ).toEqual(attemptBefore);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.getByRole("button", { name: "Nộp bài", exact: true }).click();
      await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
      await expect(page).toHaveURL(/\/student\/results\//);
      const completed = await db.examAttempt.findUniqueOrThrow({
        where: { id: attemptId },
      });
      expect(completed.status).toBe("GRADED");
      expect(Number(completed.totalScore)).toBe(1);
    } finally {
      await teacher.close();
      await db.$disconnect();
    }
  });
}
