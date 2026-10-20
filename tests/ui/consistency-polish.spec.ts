import { test, expect, type Page, type Locator } from "@playwright/test";

const widths = [1440, 1024, 820, 390, 320];
const classPath = "/teacher/classes/00000000-0000-4000-8000-000000000100";

async function login(page: Page, role: "admin" | "teacher") {
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`${role === "admin" ? "admin" : "teacher1"}@exam.local`);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("DevOnly!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL(`/${role}`);
}

async function readableHover(control: Locator) {
  await control.hover();
  const contrast = await control.evaluate((el) => {
    const style = getComputedStyle(el);
    const luminance = (rgb: string) => {
      const channels = rgb
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map((v) => {
          const n = Number(v) / 255;
          return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
        });
      return (
        channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
      );
    };
    const fg = luminance(style.color),
      bg = luminance(style.backgroundColor);
    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
}

test("content hover contrast and confirmation keyboard preserve class form state", async ({
  page,
}) => {
  await login(page, "teacher");
  await page.goto(classPath);
  const name = page.getByLabel("Tên", { exact: true });
  await name.fill("Nội dung đang soạn — không được mất");
  const trigger = page.locator(".management-form-actions .danger");
  for (const width of widths) {
    await page.setViewportSize({ width, height: 850 });
    await readableHover(trigger);
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Xác nhận thao tác" });
    await expect(dialog).toBeVisible();
    const cancel = dialog.getByRole("button", { name: "Hủy", exact: true });
    await readableHover(cancel);
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await cancel.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(
      dialog.getByRole("button", { name: "Xác nhận", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(name).toHaveValue("Nội dung đang soạn — không được mất");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
  }
});

test("Admin metrics use readable labels and retain server totals at five widths", async ({
  page,
}) => {
  await login(page, "admin");
  const response = await page.request.get(
    "http://localhost:3000/api/v1/admin/stats",
  );
  expect(response.ok()).toBeTruthy();
  const { data } = await response.json();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 960 });
    for (const [key, label] of Object.entries({
      users: "Tài khoản",
      classes: "Lớp học",
      exams: "Bài thi",
      quizzes: "Live Quiz",
    })) {
      const card = page
        .locator("main .card")
        .filter({ has: page.getByText(label, { exact: true }) });
      await expect(card).toHaveCount(1);
      await expect(card.getByRole("heading")).toHaveText(String(data[key]));
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
  }
});

test("Admin classes distinguish empty search, initial empty, loading and API errors", async ({
  page,
}) => {
  await login(page, "admin");
  await page.goto("/admin/classes");
  const search = page.getByLabel("Tìm lớp", { exact: true });
  await expect(page.locator("main .card").first()).toBeVisible();
  await search.fill("khong-co-lop-polish");
  for (const width of widths) {
    await page.setViewportSize({ width, height: 850 });
    await expect(
      page.getByText("Không tìm thấy lớp học phù hợp. Thử từ khóa khác."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Trang trước", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Trang sau", exact: true }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
  }
  await search.fill("");
  await expect(page.locator("main .card").first()).toBeVisible();
  await expect(page.locator("main .empty")).toHaveCount(0);
  const endpoint = "**/api/v1/admin/classes?**";
  await page.route(endpoint, (route) =>
    route.fulfill({ json: { data: { items: [], total: 0 } } }),
  );
  await page.reload();
  await expect(
    page.getByText("Chưa có lớp học nào.", { exact: true }),
  ).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(endpoint, async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.reload();
    await expect(
      page.getByRole("status").filter({ hasText: "Đang tải" }),
    ).toBeVisible();
    await expect(page.locator("main .empty")).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.locator("main .card").first()).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  await page.route(endpoint, (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: {
          code: "TEST_UNAVAILABLE",
          message: "Không thể tải lớp học. Vui lòng thử lại.",
        },
      },
    }),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Không thể tải lớp học");
  await expect(page.locator("main .empty")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Thử lại", exact: true }),
  ).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.locator("main .card").first()).toBeVisible();
});
