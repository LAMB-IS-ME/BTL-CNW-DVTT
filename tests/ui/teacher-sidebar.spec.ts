import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const output =
  process.env.EXAM_SCREENSHOT_DIR || "docs/screenshots/exam-folio-final";
const draft = "/teacher/exams/00000000-0000-4000-8000-000000000400/edit";
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("teacher1@exam.local");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("DevOnly!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL("/teacher");
}
async function geometry(page: Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const { x, y, width, height } = document
        .querySelector(selector)!
        .getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      main: rect("main"),
      workspace: rect(".exam-workspace"),
      source: rect(".exam-question-source"),
      selected: rect(".exam-selected"),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}
async function checkStep(page: Page, index: number, width: number) {
  const steps = page
    .getByRole("navigation", { name: "Các bước thiết lập bài thi" })
    .getByRole("button");
  await steps.nth(index).click();
  await expect(steps.nth(index)).toHaveAttribute("aria-current", "step");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  for (const control of await page
    .locator(
      ".exam-page button:visible, .exam-page select:visible, .exam-page input:not([type=checkbox]):visible",
    )
    .all()) {
    const box = (await control.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
}
for (const width of [1440, 820]) {
  test(`Teacher sidebar reflows workspace and persists ${width}`, async ({
    page,
  }) => {
    await mkdir(output, { recursive: true });
    await page.setViewportSize({ width, height: 1000 });
    await login(page);
    await page.goto(draft);
    await page
      .getByLabel("Tên bài thi", { exact: true })
      .fill("Kiểm tra giữa kỳ · Công nghệ Web");
    const nav = page.getByRole("navigation", { name: "Điều hướng giảng viên" });
    await expect(nav).toBeVisible();
    await page.getByRole("button", { name: /3\. Câu hỏi/ }).click();
    await page
      .getByLabel("Ngân hàng", { exact: true })
      .selectOption("00000000-0000-4000-8000-000000000200");
    await expect(page.getByRole("checkbox", { name: /^Chọn / })).toHaveCount(
      12,
    );
    const opened = await geometry(page);
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `${output}/sidebar-open-${width}.png`,
      fullPage: true,
    });
    const toggle = page.getByRole("button", {
      name: "Thu gọn thanh điều hướng",
      exact: true,
    });
    await toggle.focus();
    expect(
      await toggle.evaluate((el) => getComputedStyle(el).outlineWidth),
    ).toBe("3px");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Enter");
    const reopen = page.getByRole("button", {
      name: "Mở thanh điều hướng",
      exact: true,
    });
    await expect(reopen).toBeVisible();
    await expect(reopen).toBeFocused();
    await expect(reopen).toHaveAttribute("aria-expanded", "false");
    await expect(nav).toBeHidden();
    const collapsed = await geometry(page);
    expect(collapsed.main.x).toBe(0);
    expect(collapsed.main.width).toBe(width);
    expect(collapsed.main.width - opened.main.width).toBe(
      width === 1440 ? 232 : 184,
    );
    expect(collapsed.workspace.width - opened.workspace.width).toBe(
      width === 1440 ? 232 : 184,
    );
    expect(collapsed.overflow).toBe(false);
    // At tablet width the newly available space changes source/selected to columns.
    expect(Math.abs(collapsed.source.y - collapsed.selected.y)).toBeLessThan(2);
    if (width === 820)
      expect(opened.selected.y).toBeGreaterThan(opened.source.y + 100);
    else
      expect(collapsed.selected.width).toBeGreaterThan(opened.selected.width);
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `${output}/sidebar-collapsed-${width}.png`,
      fullPage: true,
    });
    for (let step = 0; step < 5; step++) await checkStep(page, step, width);
    await page.getByRole("button", { name: /1\. Thông tin/ }).click();
    await expect(page.getByLabel("Tên bài thi", { exact: true })).toHaveValue(
      "Kiểm tra giữa kỳ · Công nghệ Web",
    );
    await page.reload();
    await expect(reopen).toBeVisible();
    await expect(nav).toBeHidden();
    expect(
      await page.locator("main").evaluate((el) => el.getBoundingClientRect().x),
    ).toBe(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await page
        .locator("main")
        .evaluate((el) => getComputedStyle(el).transitionDuration),
    ).toBe("0s");
    await reopen.focus();
    await page.keyboard.press("Space");
    await expect(nav).toBeVisible();
    await expect(toggle).toBeFocused();
    await page.reload();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    for (let step = 0; step < 5; step++) await checkStep(page, step, width);
    // Shared preference works on the approved pilots without applying the Folio theme.
    for (const route of ["/teacher", "/teacher/question-banks"]) {
      await page.goto(route);
      await expect(page.locator(".exam-folio-shell")).toHaveCount(0);
      await expect(page.locator("main h1")).toBeVisible();
      const before = (await page.locator("main").boundingBox())!;
      await toggle.click();
      const after = (await page.locator("main").boundingBox())!;
      expect(after.width).toBeGreaterThan(before.width);
      expect(after.x).toBe(0);
      await reopen.click();
      await expect(nav).toBeVisible();
    }
    await writeFile(
      `${output}/sidebar-geometry-${width}.json`,
      JSON.stringify({ width, opened, collapsed }, null, 2),
    );
  });
}
test("Teacher mobile menu stays available with a collapsed desktop preference", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("examspace.teacher.sidebar", "collapsed"),
  );
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page);
  await page.goto(draft);
  const nav = page.getByRole("navigation", { name: "Điều hướng giảng viên" });
  const menu = page.getByRole("button", { name: /^(Menu|Đóng)$/ });
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(nav).toBeHidden();
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link")).toHaveCount(5);
  await expect(
    page.getByRole("button", { name: "Mở thanh điều hướng" }),
  ).toBeHidden();
  expect((await page.locator("main").boundingBox())!.x).toBe(0);
  for (const link of await nav.getByRole("link").all()) {
    const box = (await link.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await expect(nav).toBeHidden();
  for (let step = 0; step < 5; step++) await checkStep(page, step, 390);
});

test("Exam outline distinguishes missing prerequisites from configured steps", async ({
  page,
}) => {
  await mkdir(output, { recursive: true });
  await login(page);
  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/teacher/exams/new");
    const steps = page
      .getByRole("navigation", { name: "Các bước thiết lập bài thi" })
      .getByRole("button");
    for (const index of [0, 1, 2, 4])
      await expect(steps.nth(index)).toHaveAttribute("data-complete", "false");
    await expect(steps.nth(3)).toHaveAttribute("data-complete", "true");
    await steps.nth(4).click();
    const missing = page.locator(".exam-review-missing");
    await expect(missing).toContainText("Tên bài thi");
    await expect(missing).toContainText("Lớp được giao");
    await expect(missing).toContainText("Nguồn câu hỏi");
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `${output}/readiness-missing-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Lưu & công bố", exact: true })
      .click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL("/teacher/exams/new");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `${output}/publish-validation-${width}.png`,
      fullPage: true,
    });
    await steps.nth(0).click();
    await page
      .getByLabel("Tên bài thi", { exact: true })
      .fill("Kiểm tra kiến thức Web");
    await expect(steps.nth(0)).toHaveAttribute("data-complete", "true");
    await steps.nth(4).click();
    await expect(missing).not.toContainText("Tên bài thi");
    await expect(missing).toContainText("Lớp được giao");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  }
});
