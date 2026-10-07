import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("teacher1@exam.local");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("DevOnly!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL("/teacher");
  await expect(
    page.getByRole("heading", { name: "Không gian giảng viên" }),
  ).toBeVisible();
}
const output =
  process.env.UI_SCREENSHOT_DIR || "docs/screenshots/ui-redesign/after";
test("Pilot shell: current route, keyboard, touch targets, sticky controls and rollout boundary", async ({
  page,
}) => {
  await login(page);
  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const nav = page.getByRole("navigation", { name: "Điều hướng giảng viên" });
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(nav.locator('[aria-current="page"]')).toHaveText("Tổng quan");
    for (const link of await nav.getByRole("link").all()) {
      const rect = await link.boundingBox();
      expect(rect).toBeTruthy();
      expect(rect!.x).toBeGreaterThanOrEqual(0);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
      expect(rect!.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole("link", { name: "Đến nội dung chính" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();
    await nav.getByRole("link", { name: "Câu hỏi", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Ngân hàng câu hỏi", exact: true }),
    ).toBeVisible();
    await expect(nav.locator('[aria-current="page"]')).toHaveText("Câu hỏi");
    const row = page
      .getByRole("row")
      .filter({ hasText: "Công nghệ Web căn bản" });
    await row
      .getByLabel("Thao tác Công nghệ Web căn bản", { exact: true })
      .click();
    const edit = row.getByRole("button", { name: "Chỉnh sửa", exact: true });
    await expect(edit).toBeVisible();
    const rect = await edit.boundingBox();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press("Escape");
    await row.getByRole("link", { name: "Mở ngân hàng" }).click();
    const questions = page.locator(".qb-question-table tbody tr");
    await expect(questions).toHaveCount(12);
    for (const question of await questions.all()) {
      await expect(question.locator(".qb-prompt-summary")).not.toBeEmpty();
      await expect(question.locator(".qb-question-meta")).not.toBeEmpty();
      await expect(question.locator(".qb-question-points")).not.toBeEmpty();
      const status = await question.locator(".qb-badge").boundingBox();
      const editLink = question.getByRole("link", {
        name: "Chỉnh sửa",
        exact: true,
      });
      const archive = question.getByRole("button", {
        name: "Lưu trữ",
        exact: true,
      });
      if (width <= 960) {
        const editBounds = await editLink.boundingBox();
        expect(
          Math.abs(
            status!.y +
              status!.height / 2 -
              (editBounds!.y + editBounds!.height / 2),
          ),
        ).toBeLessThan(2);
      }
      for (const control of [editLink, archive]) {
        const bounds = await control.boundingBox();
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        const overlapsStatus =
          bounds!.x < status!.x + status!.width &&
          bounds!.x + bounds!.width > status!.x &&
          bounds!.y < status!.y + status!.height &&
          bounds!.y + bounds!.height > status!.y;
        expect(overlapsStatus).toBe(false);
      }
    }
    await page
      .getByRole("row")
      .filter({ hasText: "Giá trị của $2^3$" })
      .getByRole("link", { name: "Chỉnh sửa", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Chỉnh sửa câu hỏi", exact: true }),
    ).toBeVisible();
    await expect(nav.locator('[aria-current="page"]')).toHaveText("Câu hỏi");
    const field = page.getByLabel("Lời giải", { exact: true });
    await field.scrollIntoViewIfNeeded();
    await field.focus();
    const fieldRect = await field.boundingBox();
    const save = page.getByRole("button", { name: "Lưu câu hỏi", exact: true });
    const saveRect = await save.boundingBox();
    expect(fieldRect!.y + fieldRect!.height).toBeLessThan(saveRect!.y);
    expect(saveRect!.y + saveRect!.height).toBeLessThanOrEqual(900);
    expect(
      await field.evaluate((el) => getComputedStyle(el).outlineStyle),
    ).toBe("solid");
    if (width === 390)
      await page.screenshot({
        path: `${output}/question-bank-sticky-focus-mobile.png`,
        animations: "disabled",
      });
    await page
      .getByRole("button", { name: "Lưu trữ câu hỏi", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    const modal = await dialog.boundingBox();
    expect(modal!.x).toBeGreaterThanOrEqual(0);
    expect(modal!.y).toBeGreaterThanOrEqual(0);
    expect(modal!.y + modal!.height).toBeLessThanOrEqual(900);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press(i % 2 ? "Shift+Tab" : "Tab");
      expect(
        await dialog.evaluate((el) => el.contains(document.activeElement)),
      ).toBe(true);
    }
    await page.keyboard.press("Escape");
    await nav.getByRole("link", { name: "Tổng quan", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Không gian giảng viên" }),
    ).toBeVisible();
  }
  // Shared CSS/components must not restyle routes outside the approved pilot.
  for (const path of [
    "/teacher/classes",
    "/teacher/quizzes",
    "/teacher/exams/00000000-0000-4000-8000-000000000401/monitor",
    "/teacher/exams/00000000-0000-4000-8000-000000000401/grading",
    "/teacher/exams/00000000-0000-4000-8000-000000000401/results",
  ]) {
    await page.goto(path);
    await expect(page.locator(".qb-shell")).toHaveCount(0);
    await expect(page.locator("main h1")).toBeVisible();
  }
});

for (const [device, width] of [
  ["desktop", 1440],
  ["mobile", 390],
] as const) {
  test(`Feedback and visual states: ${device}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await login(page);
    let fail = true;
    await page.route("**/question-banks?view=manage*", async (route) => {
      if (fail)
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "UNAVAILABLE", message: "Temporarily unavailable" },
          }),
        });
      else await route.continue();
    });
    await page.reload();
    await expect(page.getByRole("alert")).toContainText(
      "Không thể tải thư viện",
    );
    await page.screenshot({
      path: `${output}/teacher-dashboard-error-${device}.png`,
      fullPage: true,
    });
    fail = false;
    await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await expect(
      page.getByRole("link").filter({ hasText: "Công nghệ Web căn bản" }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    fail = true;
    await page.getByRole("link", { name: "Câu hỏi", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Không thể hoàn tất");
    await page.screenshot({
      path: `${output}/question-bank-error-${device}.png`,
      fullPage: true,
    });
    fail = false;
    await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await expect(
      page.getByRole("row").filter({ hasText: "Công nghệ Web căn bản" }),
    ).toBeVisible();
    await page.unrouteAll({ behavior: "wait" });
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/question-banks?view=manage*", async (route) => {
      await hold;
      await route.continue();
    });
    await page.getByLabel("Tìm ngân hàng", { exact: true }).fill("Công nghệ");
    await expect(page.getByRole("status")).toContainText("Đang tải ngân hàng");
    // Request is deliberately held so screenshot is a reproducible loading state.
    await page.screenshot({
      path: `${output}/question-bank-loading-${device}.png`,
      fullPage: true,
    });
    release();
    await expect(
      page.getByRole("row").filter({ hasText: "Công nghệ Web căn bản" }),
    ).toBeVisible();
    await page.screenshot({
      path: `${output}/question-bank-search-${device}.png`,
      fullPage: true,
    });
    await page.unrouteAll({ behavior: "wait" });
    const create = page.getByRole("button", {
      name: "Tạo ngân hàng",
      exact: true,
    });
    const normal = await create.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    await create.hover();
    await expect
      .poll(() => create.evaluate((el) => getComputedStyle(el).backgroundColor))
      .not.toBe(normal);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await create.evaluate((el) => getComputedStyle(el).transitionDuration),
    ).toBe("0s");
    await expect(
      page.getByRole("button", { name: "Trước", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Sau", exact: true }),
    ).toBeDisabled();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}
