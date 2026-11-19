import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createDb } from "../../apps/api/src/db/client";
import { database, login, mutate, fixture } from "./live-quiz-fixtures";

async function appearance(page: Page) {
  return page
    .locator("main h1, main button, main input, main select")
    .evaluateAll((elements) =>
      elements.map((el) => {
        const s = getComputedStyle(el);
        return {
          tag: el.tagName,
          text: el.tagName === "BUTTON" ? el.textContent : "",
          color: s.color,
          background: s.backgroundColor,
          font: s.font,
          radius: s.borderRadius,
          padding: s.padding,
        };
      }),
    );
}

test("Live Quiz CSS stays inside its boundary; representative library captures", async ({
  browser,
}) => {
  const teacher = await browser.newContext();
  const student = await browser.newContext();
  const db = createDb(database);
  try {
    const seed = await db.user.findUniqueOrThrow({
      where: { email: "teacher1@exam.local" },
    });
    const email = `live-library-${crypto.randomUUID()}@test.local`;
    await db.user.create({
      data: {
        email,
        fullName: seed.fullName,
        passwordHash: seed.passwordHash,
        role: "TEACHER",
      },
    });
    await login(teacher, email);
    await login(student, "student1@exam.local");
    const tp = await teacher.newPage();
    const sp = await student.newPage();
    await tp.goto("/teacher/exams/new");
    await expect(tp.locator("main h1")).toBeVisible();
    await expect(tp.locator("main input").first()).toBeVisible();
    const teacherBefore = await appearance(tp);
    const archived = await mutate<{ id: string }>(teacher, "/teacher/quizzes", {
      title: "HTML · Biểu mẫu và kiểm tra dữ liệu",
    });
    const csrf = await teacher.request.get(
      "http://localhost:3000/api/v1/auth/csrf",
    );
    const archive = await teacher.request.delete(
      `http://localhost:3000/api/v1/teacher/quizzes/${archived.id}`,
      {
        headers: {
          Origin: "http://localhost:5173",
          "X-CSRF-Token": (await csrf.json()).data.token,
        },
      },
    );
    expect(archive.status()).toBe(204);
    await mutate(teacher, "/teacher/quizzes", {
      title: "HTTP · Phương thức và mã trạng thái",
    });
    await fixture(teacher);
    await tp
      .getByRole("link", { name: "Live Quiz", exact: true })
      .first()
      .click();
    await expect(tp.locator(".lq-quiz-row")).toHaveCount(3);
    const dir = `${process.env.LIVE_QUIZ_SCREENSHOT_DIR || "test-results/live-quiz-audit/after"}/chromium`;
    for (const width of [1440, 1024, 820, 390, 320]) {
      await tp.setViewportSize({ width, height: 960 });
      await mkdir(`${dir}/${width}`, { recursive: true });
      await tp.screenshot({
        path: `${dir}/${width}/teacher-entry.png`,
        fullPage: true,
      });
      await tp
        .locator(".lq")
        .screenshot({ path: `${dir}/${width}/teacher-entry-surface.png` });
      expect(
        await tp.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
    }
    await tp.setViewportSize({ width: 1280, height: 720 });
    // SPA navigation intentionally retains the loaded Quiz CSS.
    await tp.goBack();
    await expect(tp.locator("main input").first()).toBeVisible();
    expect(await appearance(tp)).toEqual(teacherBefore);
    await sp.goto("/student/exams");
    await expect(sp.locator("main h1")).toBeVisible();
    const studentBefore = await appearance(sp);
    await sp
      .getByRole("link", { name: "Live Quiz", exact: true })
      .first()
      .click();
    await expect(sp.getByLabel("Mã phòng")).toBeVisible();
    await sp.goBack();
    await expect(sp.locator("main h1")).toBeVisible();
    expect(await appearance(sp)).toEqual(studentBefore);
    await writeFile(
      `${dir}/compatibility.json`,
      JSON.stringify(
        {
          teacherExamStylesUnchanged: true,
          studentCatalogStylesUnchanged: true,
          libraryItems: 3,
        },
        null,
        2,
      ),
    );
  } finally {
    await Promise.all([teacher.close(), student.close(), db.$disconnect()]);
  }
});
