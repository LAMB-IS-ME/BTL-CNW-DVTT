import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { createDb } from "../../apps/api/src/db/client";
const base = "http://localhost:3000/api/v1";
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("DevOnly!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
}
async function mutate(
  ctx: BrowserContext,
  path: string,
  data: unknown,
  method = "POST",
) {
  const csrf = (await (await ctx.request.get(`${base}/auth/csrf`)).json()).data
    .token;
  return ctx.request.fetch(`${base}${path}`, {
    method,
    data,
    headers: { Origin: "http://localhost:5173", "X-CSRF-Token": csrf },
  });
}
async function search(page: Page, email: string) {
  await page.getByRole("textbox", { name: "Tìm user" }).fill(email);
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: email, exact: true }) });
  await expect(row).toBeVisible();
  return row;
}
test("Admin creates, locks/unlocks and changes role with persisted state and pending/error recovery", async ({
  page,
  context,
}, info) => {
  await login(page, "admin@exam.local");
  await page.goto("/admin/users");
  const email = `admin-e2e-${Date.now()}@test.local`;
  await page.getByLabel("Họ tên", { exact: true }).fill("Admin E2E Student");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("DevOnly!2026");
  await page.locator("form").getByRole("combobox").selectOption("STUDENT");
  await page
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  const row = await search(page, email);
  await expect(
    row.getByRole("cell", { name: "ACTIVE", exact: true }),
  ).toBeVisible();
  const users = (
    await (
      await context.request.get(`${base}/admin/users?search=${email}`)
    ).json()
  ).data.items;
  const id = users[0].id;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const statusUrl = `${base}/admin/users/${id}/status`;
  await page.route(statusUrl, async (route) => {
    await held;
    await route.continue();
  });
  await row
    .getByRole("button", { name: "Khóa tài khoản", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Xác nhận thao tác" });
  await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
  try {
    await expect(
      dialog.getByRole("button", { name: "Xác nhận", exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Hủy", exact: true }),
    ).toBeDisabled();
  } finally {
    release();
  }
  await expect(dialog).not.toBeVisible();
  await page.unroute(statusUrl);
  await expect(
    row.getByRole("cell", { name: "LOCKED", exact: true }),
  ).toBeVisible();
  await page.reload();
  const locked = await search(page, email);
  await expect(
    locked.getByRole("cell", { name: "LOCKED", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("admin-locked.png"),
    fullPage: true,
  });
  // One failed response verifies retry without changing DB state or the real retry.
  await page.route(
    statusUrl,
    (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "INTERNAL_ERROR",
            message: "Có lỗi hệ thống. Vui lòng thử lại.",
          },
        }),
      }),
    { times: 1 },
  );
  await locked.getByRole("button", { name: "Mở khóa", exact: true }).click();
  await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(
    dialog.getByText("Có lỗi hệ thống. Vui lòng thử lại."),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Xác nhận", exact: true }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    locked.getByRole("cell", { name: "ACTIVE", exact: true }),
  ).toBeVisible();
  await locked.getByRole("combobox").selectOption("TEACHER");
  await expect(locked.getByRole("combobox")).toHaveValue("TEACHER");
  await page.reload();
  const teacher = await search(page, email);
  await expect(teacher.getByRole("combobox")).toHaveValue("TEACHER");
  await expect(
    teacher.getByRole("cell", { name: "ACTIVE", exact: true }),
  ).toBeVisible();
  await teacher.getByRole("combobox").selectOption("STUDENT");
  await expect(teacher.getByRole("combobox")).toHaveValue("STUDENT");
  await page.reload();
  await expect((await search(page, email)).getByRole("combobox")).toHaveValue(
    "STUDENT",
  );
  await page.screenshot({
    path: info.outputPath("admin-restored.png"),
    fullPage: true,
  });
  const self = await search(page, "admin@exam.local");
  await self
    .getByRole("button", { name: "Khóa tài khoản", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(
    dialog.getByText("Không thể khóa hoặc đổi role của chính mình."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
  await self.getByRole("combobox").selectOption("STUDENT");
  await expect(page.getByRole("alert")).toContainText(
    "Không thể khóa hoặc đổi role của chính mình.",
  );
  await expect(self.getByRole("combobox")).toHaveValue("ADMIN");
});
test("Admin role dependency error keeps the original role and clears after successful retry", async ({
  page,
  context,
}) => {
  await login(page, "admin@exam.local");
  const email = `admin-retry-${Date.now()}@test.local`;
  const created = await mutate(context, "/admin/users", {
    email,
    password: "DevOnly!2026",
    fullName: "Admin retry",
    role: "STUDENT",
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).data.id;
  await page.goto("/admin/users");
  const row = await search(page, email);
  await page.route(
    `${base}/admin/users/${id}/role`,
    (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "ROLE_HAS_DEPENDENCIES",
            message:
              "Không thể đổi role khi tài khoản đã có dữ liệu nghiệp vụ.",
          },
        }),
      }),
    { times: 1 },
  );
  await row.getByRole("combobox").selectOption("TEACHER");
  await expect(page.getByRole("alert")).toContainText(
    "Không thể đổi role khi tài khoản đã có dữ liệu nghiệp vụ.",
  );
  await expect(row.getByRole("combobox")).toHaveValue("STUDENT");
  const response = page.waitForResponse(
    (r) => r.url().endsWith(`/admin/users/${id}/role`) && r.status() === 200,
  );
  await row.getByRole("combobox").selectOption("TEACHER");
  await response;
  await expect(row.getByRole("combobox")).toHaveValue("TEACHER");
  await expect(page.getByRole("alert")).toHaveCount(0);
  const db = createDb(process.env.TEST_DATABASE_URL!);
  try {
    expect(await db.user.findUnique({ where: { id } })).toMatchObject({
      role: "TEACHER",
      status: "ACTIVE",
    });
  } finally {
    await db.$disconnect();
  }
  await page.reload();
  await expect((await search(page, email)).getByRole("combobox")).toHaveValue(
    "TEACHER",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
});
test("Teacher and Student cannot enter Admin or mutate accounts through direct APIs", async ({
  browser,
}) => {
  for (const email of ["teacher2@exam.local", "student2@exam.local"]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, email);
    await page.goto("/admin/users");
    await expect(
      page.getByRole("heading", { name: "Bạn không có quyền truy cập." }),
    ).toBeVisible();
    expect((await context.request.get(`${base}/admin/users`)).status()).toBe(
      403,
    );
    const me = (await (await context.request.get(`${base}/auth/me`)).json())
      .data;
    for (const [action, value] of [
      ["role", "ADMIN"],
      ["status", "LOCKED"],
      ["status", "ACTIVE"],
    ] as const) {
      expect(
        (
          await mutate(
            context,
            `/admin/users/${me.id}/${action}`,
            { [action]: value },
            "PATCH",
          )
        ).status(),
      ).toBe(403);
    }
    await context.close();
  }
});
