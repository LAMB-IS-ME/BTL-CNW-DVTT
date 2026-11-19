import { test, expect, type Page } from "@playwright/test";
const widths = [1440, 1024, 820, 390, 320];
const classId = "00000000-0000-4000-8000-000000000100";
async function login(page: Page, user: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(`${user}@exam.local`);
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill(process.env.DEMO_PASSWORD || "DevOnly!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL(user === "admin" ? "/admin" : "/teacher");
}
async function bounds(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
}

test("management forms: five widths, input retention, keyboard and confirmation", async ({
  page,
}) => {
  await login(page, "teacher1");
  for (const [name, path] of [
    ["teacher-classes", "/teacher/classes"],
    ["teacher-class-detail", `/teacher/classes/${classId}`],
  ]) {
    await page.goto(path!);
    if (name === "teacher-classes") {
      await page.getByLabel("Tìm lớp", { exact: true }).fill("Công nghệ Web");
      await expect(
        page.getByRole("link").filter({ hasText: "Công nghệ Web · Nhóm 01" }),
      ).toBeVisible();
    }
    const form = page.locator("main form").first();
    await expect(form).toBeVisible();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 960 });
      await bounds(page);
      const buttons = await form.locator("button").evaluateAll((es) =>
        es
          .filter((e) => e.getBoundingClientRect().width)
          .map((e) => ({
            label: e.textContent,
            height: e.getBoundingClientRect().height,
            width: e.getBoundingClientRect().width,
          })),
      );
      for (const b of buttons) {
        expect(b.height).toBeGreaterThanOrEqual(44);
        expect(b.height).toBeLessThan(64);
      }
    }
    const first = form.locator("input").first();
    await first.fill("Nội dung đang soạn — giữ nguyên khi đổi kích thước");
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.setViewportSize({ width: 320, height: 640 });
    await expect(first).toHaveValue(
      "Nội dung đang soạn — giữ nguyên khi đổi kích thước",
    );
    await first.focus();
    await page.keyboard.press("Tab");
    await expect(form.locator("input").nth(1)).toBeFocused();
    if (name === "teacher-class-detail") {
      const trigger = form.getByRole("button", {
        name: "Lưu trữ",
        exact: true,
      });
      await trigger.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog
        .getByRole("button", { name: "Xác nhận", exact: true })
        .focus();
      await page.keyboard.press("Tab");
      await expect(
        dialog.getByRole("button", { name: "Hủy", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(
        dialog.getByRole("button", { name: "Xác nhận", exact: true }),
      ).toBeFocused();
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press("Tab");
        expect(
          await dialog.evaluate(
            (d) =>
              document.activeElement === document.body ||
              d.contains(document.activeElement),
          ),
        ).toBeTruthy();
      }
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await expect(first).toHaveValue(
        "Nội dung đang soạn — giữ nguyên khi đổi kích thước",
      );
    }
  }
});

test("account table: responsive records, filters, focus, empty loading and error", async ({
  page,
}) => {
  await login(page, "admin");
  await page.goto("/admin/users");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await page.setViewportSize({ width: 320, height: 960 });
  const tableOverflow = await page
    .locator(".table-wrap")
    .evaluate((e) => e.scrollWidth - e.clientWidth);
  expect(tableOverflow).toBeLessThanOrEqual(1);
  await page.getByLabel("Lọc role").selectOption("TEACHER");
  // Other suites create accounts; inspect only the two seeded teachers.
  await page.getByLabel("Tìm user").fill("@exam.local");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 960 });
    await page.evaluate(() => scrollTo(0, 0));
    await bounds(page);
    const geometry = await page
      .locator(".table-wrap")
      .evaluate((e) => ({ width: e.clientWidth, scroll: e.scrollWidth }));

    expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
    if (width === 820 || width === 1024) {
      const fields = page.locator(".management-form-fields-account > .field");
      const rects = await fields.evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y };
        }),
      );
      expect(rects).toHaveLength(4);
      expect(rects[0]!.y).toBe(rects[1]!.y);
      expect(rects[2]!.y).toBe(rects[3]!.y);
      expect(rects[0]!.x).toBe(rects[2]!.x);
      expect(rects[2]!.y).toBeGreaterThan(rects[0]!.y);
    }
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("columnheader")).toHaveCount(5);
    await expect(page.getByRole("row")).toHaveCount(3);
    for (const row of await page.locator("tbody tr").all()) {
      await expect(row.getByRole("cell")).toHaveCount(5);
      const action = row.getByRole("button");
      const rect = await action.boundingBox();
      expect(rect!.x).toBeGreaterThanOrEqual(0);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
      expect(rect!.height).toBeGreaterThanOrEqual(44);
      expect(await row.locator("select").inputValue()).toBe("TEACHER");
    }
  }
  const roleSelect = page.locator("tbody select").first();
  await roleSelect.focus();
  await page.keyboard.press("Tab");
  const trigger = page.locator("tbody button").first();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.getByLabel("Tìm user").fill("khong-co-ket-qua-visual");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(
    page.getByText("Không tìm thấy tài khoản phù hợp."),
  ).toBeVisible();
  await page.route("**/api/v1/admin/users?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "AUDIT_ERROR",
          message: "Không thể tải danh sách tài khoản. Vui lòng thử lại sau.",
        },
      }),
    }),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/v1/admin/users?**", async (route) => {
    await gate;
    await route.continue();
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Quản lý tài khoản", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Đang tải" }),
  ).toBeVisible();
  release();
  await expect(page.locator("tbody tr").first()).toBeVisible();
});

test("class form: submit, error retention and saved values use the existing API", async ({
  page,
}) => {
  await login(page, "teacher1");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/teacher/classes");
  const title = `Lớp pilot ${Date.now()}`;
  await page.getByLabel("Tên lớp", { exact: true }).fill(title);
  await page.getByLabel("Mã lớp", { exact: true }).fill("PILOT-UI");
  await page
    .getByLabel("Mô tả", { exact: true })
    .fill("Dữ liệu local cho kiểm thử giao diện");
  const created = page.waitForResponse(
    (r) =>
      r.url().endsWith("/teacher/classes") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Tạo lớp học", exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  await expect(page.getByLabel("Tên lớp", { exact: true })).toHaveValue("");
  await page.getByLabel("Tìm lớp", { exact: true }).fill(title);
  await page.getByRole("link").filter({ hasText: title }).click();
  await expect(page.getByLabel("Tên", { exact: true })).toHaveValue(title);
  const edited = `${title} — đã chỉnh`;
  await page.getByLabel("Tên", { exact: true }).fill(edited);
  await page.route("**/api/v1/teacher/classes/*", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "AUDIT_ERROR", message: "Không thể lưu lúc này." },
      }),
    });
  });
  await page
    .getByRole("button", { name: "Lưu thông tin", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Không thể lưu lúc này.");
  await expect(page.getByLabel("Tên", { exact: true })).toHaveValue(edited);
  await page.unrouteAll({ behavior: "wait" });
  const saved = page.waitForResponse(
    (r) =>
      r.url().includes("/teacher/classes/") && r.request().method() === "PATCH",
  );
  await page
    .getByRole("button", { name: "Lưu thông tin", exact: true })
    .click();
  expect((await saved).ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByLabel("Tên", { exact: true })).toHaveValue(edited);
  await expect(page.getByLabel("Mô tả", { exact: true })).toHaveValue(
    "Dữ liệu local cho kiểm thử giao diện",
  );
});

test("class search empty states: clear feedback at four widths and in student picker", async ({
  page,
}) => {
  await login(page, "teacher1");
  for (const width of [1440, 820, 390, 320]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/teacher/classes");
    const search = page.getByLabel("Tìm lớp", { exact: true });
    await search.fill("zz-no-matching-class-recovery");
    await expect(page.locator(".catalog-pager")).toContainText("0 kết quả");
    await expect(
      page.getByText("Không tìm thấy lớp học phù hợp.", { exact: true }),
    ).toBeVisible();
    await bounds(page);
  }
  await page.goto(`/teacher/classes/${classId}`);
  await page
    .getByLabel("Tìm sinh viên để thêm", { exact: true })
    .fill("zz-no-matching-student-recovery");
  await expect(page.locator(".catalog-pager")).toContainText("0 kết quả");
  await expect(
    page.getByText("Không tìm thấy sinh viên phù hợp.", { exact: true }),
  ).toBeVisible();
  await bounds(page);
});

test("management searches: loading and API errors never become successful empty feedback", async ({
  page,
}) => {
  await login(page, "teacher1");
  await page.setViewportSize({ width: 320, height: 960 });
  for (const [path, label, endpoint, emptyText] of [
    [
      "/teacher/classes",
      "Tìm lớp",
      "/api/v1/teacher/classes?",
      "Không tìm thấy lớp học phù hợp.",
    ],
    [
      `/teacher/classes/${classId}`,
      "Tìm sinh viên để thêm",
      "/api/v1/teacher/students?",
      "Không tìm thấy sinh viên phù hợp.",
    ],
  ]) {
    await page.goto(path!);
    const search = page.getByLabel(label!, { exact: true });
    await expect(search).toBeVisible();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pattern = `**${endpoint}**`;
    await page.route(pattern, async (route) => {
      await gate;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "AUDIT_ERROR",
            message: "Không thể tải dữ liệu thử nghiệm.",
          },
        }),
      });
    });
    const requested = page.waitForRequest(
      (r) =>
        r.url().includes(endpoint!) &&
        r.url().includes("zz-pending-empty-guard"),
    );
    await search.fill("zz-pending-empty-guard");
    await requested;
    try {
      await expect(page.getByText(emptyText!, { exact: true })).toHaveCount(0);
      await bounds(page);
    } finally {
      release();
    }
    await expect(page.getByRole("alert")).toContainText(
      "Không thể tải dữ liệu thử nghiệm.",
    );
    await expect(page.getByText(emptyText!, { exact: true })).toHaveCount(0);
    await page.unrouteAll({ behavior: "wait" });
  }
});
