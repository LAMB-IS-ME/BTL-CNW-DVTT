import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const root =
  process.env.FOLIO_SCREENSHOT_DIR || "docs/screenshots/exam-folio-prototype";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
for (const width of [1440, 820, 390]) {
  test(`Exam Folio composition ${width}`, async ({ page }) => {
    await mkdir(root, { recursive: true });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill("teacher1@exam.local");
    await page.getByLabel("Mật khẩu", { exact: true }).fill("DevOnly!2026");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.waitForURL("/teacher");
    const evidence: unknown[] = [];
    async function shot(name: string) {
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => window.scrollTo(0, 0));
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      expect(overflow, name).toBe(false);
      evidence.push({
        name,
        width,
        overflow,
        route: new URL(page.url()).pathname,
      });
      await page.screenshot({
        path: `${root}/${name}-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
    }
    await page.goto("/teacher/exams");
    await expect(page.getByRole("article").first()).toBeVisible();
    await shot("list");
    await page.goto(`/teacher/exams/${id(400)}/edit`);
    await expect(page.getByLabel("Tên bài thi", { exact: true })).toHaveValue(
      "Bài kiểm tra nháp",
    );
    await expect(
      page
        .getByRole("navigation", { name: "Các bước thiết lập bài thi" })
        .getByRole("button"),
    ).toHaveCount(5);
    await shot("editor-shell");
    await page.getByRole("button", { name: /3\. Câu hỏi/ }).click();
    await expect(
      page.getByRole("button", { name: /3\. Câu hỏi/ }),
    ).toHaveAttribute("aria-current", "step");
    await page.getByLabel("Ngân hàng", { exact: true }).selectOption(id(200));
    await expect(page.getByRole("checkbox", { name: /^Chọn / })).toHaveCount(
      12,
    );
    await expect(page.locator(".exam-selected-row")).toHaveCount(3);
    await shot("questions");
    // A real filtered source keeps the built exam visible alongside a pool rule.
    await page.getByLabel("Tìm câu hỏi", { exact: true }).fill("HTTPS");
    await expect(page.getByRole("checkbox", { name: /^Chọn / })).toHaveCount(1);
    await page
      .getByRole("button", { name: "Thêm nhóm ngẫu nhiên", exact: true })
      .click();
    await page
      .getByLabel("Ngân hàng pool", { exact: true })
      .selectOption(id(200));
    await page.getByLabel("Số câu", { exact: true }).fill("2");
    await page.getByLabel("Điểm mỗi câu", { exact: true }).fill("1.5");
    await page.getByLabel("Tags", { exact: true }).fill("demo");
    await expect(page.getByRole("status")).toContainText(
      "3 câu cố định · 2 câu ngẫu nhiên · 6 điểm",
    );
    await shot("selected-pool");
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
    const check = page.getByRole("checkbox", { name: /^Chọn / });
    await check.focus();
    expect(
      await check.evaluate((el) => getComputedStyle(el).outlineWidth),
    ).toBe("3px");
    await page.keyboard.press("Space");
    await expect(page.locator(".exam-selected-row")).toHaveCount(2);
    await expect(page.locator(".exam-question-order")).toHaveText(["01", "02"]);
    await page.getByRole("button", { name: /1\. Thông tin/ }).click();
    await expect(page.getByLabel("Tên bài thi", { exact: true })).toHaveValue(
      "Bài kiểm tra nháp",
    );
    await page.goto("/teacher/question-banks");
    await expect(page.locator(".qb-shell")).toHaveCount(1);
    await expect(page.locator(".exam-folio-shell")).toHaveCount(0);
    await writeFile(
      `${root}/checks-${width}.json`,
      JSON.stringify(evidence, null, 2),
    );
  });
}
