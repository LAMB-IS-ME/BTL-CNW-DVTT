import { test, expect, type Page } from "@playwright/test";

const widths = [1440, 1024, 820, 768, 390, 375, 320];
const cases = [
  {
    user: "admin",
    role: "admin",
    home: "/admin/users",
    links: [
      ["/admin", "Tổng quan"],
      ["/admin/users", "Tài khoản"],
      ["/admin/classes", "Lớp học"],
    ],
  },
  {
    user: "teacher1",
    role: "teacher",
    home: "/teacher",
    links: [
      ["/teacher", "Tổng quan"],
      ["/teacher/classes", "Lớp học"],
      ["/teacher/question-banks", "Câu hỏi"],
      ["/teacher/exams", "Bài thi"],
      ["/teacher/quizzes", "Live Quiz"],
    ],
  },
  {
    user: "student1",
    role: "student",
    home: "/student/exams",
    links: [
      ["/student", "Tổng quan"],
      ["/student/exams", "Bài thi"],
      ["/student/results", "Kết quả"],
      ["/student/quiz/join", "Live Quiz"],
    ],
  },
];
async function login(page: Page, user: string, role: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(`${user}@exam.local`);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("DevOnly!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL(`/${role}`);
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
}
for (const entry of cases) {
  test(`${entry.role}: responsive disclosure, keyboard, routes, history and logout`, async ({
    page,
  }) => {
    await login(page, entry.user, entry.role);
    await page.goto(entry.home);
    const menu = page.getByRole("button", { name: /^(Menu|Đóng)$/ });
    const panel = page.locator("#mobile-navigation-panel");
    const links = panel.getByRole("link");
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page);
      if (width > 700) {
        await expect(menu).toBeHidden();
        continue;
      }
      await expect(menu).toBeVisible();
      await expect(menu).toHaveAttribute(
        "aria-controls",
        "mobile-navigation-panel",
      );
      await expect(menu).toHaveAccessibleName("Menu");
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await expect(panel).toBeHidden();
      await menu.click();
      await expect(menu).toHaveAccessibleName("Đóng");
      await expect(menu).toHaveAttribute("aria-expanded", "true");
      if (entry.role === "admin") {
        await expect(
          panel
            .locator(".app-mobile-account")
            .getByText("Quản trị viên", { exact: true }),
        ).toHaveCount(1);
      }
      await expect(panel.getByRole("navigation")).toBeVisible();
      await expect(links).toHaveCount(entry.links.length);
      await expect(panel.locator('[aria-current="page"]')).toHaveCount(1);
      for (const control of [
        menu,
        ...(await links.all()),
        panel.getByRole("button", { name: "Đăng xuất" }),
      ]) {
        const r = (await control.boundingBox())!;
        expect(r.height).toBeGreaterThanOrEqual(44);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.x + r.width).toBeLessThanOrEqual(width);
      }
      // The panel participates in layout, never overlays the page's content.
      const panelBox = (await panel.boundingBox())!;
      expect(
        (await page.locator("main").boundingBox())!.y,
      ).toBeGreaterThanOrEqual(panelBox.y + panelBox.height);
      await noOverflow(page);
      await page.keyboard.press("Escape");
      await expect(menu).toBeFocused();
      await expect(panel).toBeHidden();
      await menu.click();
      await menu.click();
      await expect(menu).toHaveAccessibleName("Menu");
      await expect(menu).toHaveAttribute("aria-expanded", "false");
    }
    await menu.focus();
    expect(
      await menu.evaluate((e) => getComputedStyle(e).outlineStyle),
    ).not.toBe("none");
    await page.keyboard.press("Space");
    await expect(menu).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(links.first()).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(menu).toBeFocused();
    await links.last().focus();
    await page.keyboard.press("Tab");
    await expect(
      panel.getByRole("button", { name: "Đăng xuất" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(panel).toBeHidden();
    expect(
      await panel.evaluate((e) => e.contains(document.activeElement)),
    ).toBe(false);
    await menu.focus();
    await page.keyboard.press("Tab");
    expect(
      await panel.evaluate((e) => e.contains(document.activeElement)),
    ).toBe(false);
    await menu.click();
    await page.locator("main h1").click();
    await expect(panel).toBeHidden();
    for (const [path, label] of entry.links) {
      await menu.click();
      await panel.getByRole("link", { name: label!, exact: true }).click();
      await expect(page).toHaveURL(path!);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(panel).toBeHidden();
      await expect(menu).toHaveAccessibleName("Menu");
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator("main")).toBeFocused();
      await menu.click();
      await expect(panel.locator('[aria-current="page"]')).toHaveText(label!);
      await page.keyboard.press("Escape");
    }
    await menu.click();
    await page.goBack();
    await expect(panel).toBeHidden();
    await menu.click();
    await page.goForward();
    await expect(panel).toBeHidden();
    await menu.click();
    await page.reload();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await menu.click();
    await links.first().focus();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(menu).toBeHidden();
    await expect(page.locator("main")).toBeFocused();
    await page.setViewportSize({ width: 320, height: 900 });
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await noOverflow(page);
    if (entry.role === "admin") {
      await page.route(
        "**/api/v1/auth/logout",
        (route) =>
          route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              error: {
                code: "TEST_ERROR",
                message: "Không thể đăng xuất lúc này.",
              },
            }),
          }),
        { times: 1 },
      );
      await menu.click();
      await panel.getByRole("button", { name: "Đăng xuất" }).click();
      await expect(page.getByRole("alert")).toContainText(
        "Không thể đăng xuất lúc này.",
      );
      await expect(panel).toBeHidden();
      await expect(menu).toBeFocused();
    }
    await menu.click();
    const logout = page.waitForResponse(
      (r) =>
        r.url().endsWith("/auth/logout") && r.request().method() === "POST",
    );
    await panel.getByRole("button", { name: "Đăng xuất" }).click();
    expect((await logout).ok()).toBe(true);
    await expect(page).toHaveURL("/login");
    await expect(
      page.getByRole("button", { name: "Đăng nhập", exact: true }),
    ).toBeVisible();
    await expect(menu).toHaveCount(0);
  });
}

test("tablet collapses only crowded legacy headers; long account text wraps at 320px", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/me", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    if (body.data)
      body.data.fullName =
        "Nguyễn Thị Hoàng Anh — Giảng viên Công nghệ thông tin và Truyền thông";
    await route.fulfill({ response, json: body });
  });
  await login(page, "teacher1", "teacher");
  const menu = page.getByRole("button", { name: /^(Menu|Đóng)$/ });
  for (const width of [1024, 820, 768, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/teacher/classes");
    if (width === 1024) await expect(menu).toBeHidden();
    else {
      await expect(menu).toBeVisible();
      await menu.click();
      await expect(page.locator(".app-mobile-account strong")).toContainText(
        "Truyền thông",
      );
      await noOverflow(page);
      await page.keyboard.press("Escape");
    }
    if (width === 1024) {
      await page.goto("/teacher/question-banks");
    } else {
      await menu.click();
      await page
        .locator("#mobile-navigation-panel")
        .getByRole("link", { name: "Câu hỏi", exact: true })
        .click();
      await expect(page).toHaveURL("/teacher/question-banks");
      await expect(page.locator("main")).toBeFocused();
    }
    if (width > 700) await expect(menu).toBeHidden();
    else await expect(menu).toHaveAttribute("aria-expanded", "false");
  }
  await page.unrouteAll({ behavior: "wait" });
  await menu.click();
  await page
    .locator("#mobile-navigation-panel")
    .getByRole("button", { name: "Đăng xuất" })
    .click();
  await expect(page).toHaveURL("/login");
  await login(page, "student1", "student");
  for (const width of [1024, 820, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/student/results");
    if (width === 1024) await expect(menu).toBeHidden();
    else await expect(menu).toBeVisible();
    await page.goto("/student/exams");
    await expect(menu).toBeHidden();
  }
});

test("mobile links respect editor dirty guard and preserve focus when navigation is cancelled", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await login(page, "teacher1", "teacher");
  await page.goto(
    "/teacher/question-banks/00000000-0000-4000-8000-000000000200",
  );
  await page
    .getByRole("link", { name: "Chỉnh sửa", exact: true })
    .first()
    .click();
  const field = page.getByLabel("Lời giải", { exact: true });
  await field.fill("Nội dung chưa lưu trong kiểm thử navigation");
  const menu = page.getByRole("button", { name: /^(Menu|Đóng)$/ });
  const panel = page.locator("#mobile-navigation-panel");
  await menu.click();
  const leave = panel.getByRole("link", { name: "Lớp học", exact: true });
  await leave.click();
  const dialog = page.getByRole("dialog", { name: "Rời trang soạn thảo?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Tiếp tục soạn" }).click();
  await expect(dialog).toBeHidden();
  await expect(leave).toBeFocused();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(field).toHaveValue(
    "Nội dung chưa lưu trong kiểm thử navigation",
  );
  await leave.click();
  await dialog.getByRole("button", { name: "Bỏ thay đổi" }).click();
  await expect(page).toHaveURL("/teacher/classes");
  await expect(panel).toBeHidden();
});

test("student exam entry keeps the exam navigation item active", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page, "student1", "student");
  await page.goto("/student/exams");
  await page
    .getByRole("link", { name: /Xem bài thi/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/student\/exams\/[^/]+$/);
  const menu = page.getByRole("button", { name: /^(Menu|Đóng)$/ });
  const panel = page.locator("#mobile-navigation-panel");
  await menu.click();
  await expect(panel.locator('[aria-current="page"]')).toHaveText("Bài thi");
  await noOverflow(page);
  await panel.getByRole("link", { name: "Bài thi", exact: true }).click();
  await expect(page).toHaveURL("/student/exams");
  await expect(panel).toBeHidden();
});
