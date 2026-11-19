import { expect, test, type Page, type BrowserContext } from "@playwright/test";

const base = "http://localhost:3000/api/v1";
const expired = "Phiên đăng nhập đã kết thúc";
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("student1@exam.local");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("DevOnly!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Bài thi được giao", exact: true }),
  ).toBeVisible();
}
async function revoke(context: BrowserContext) {
  const token = (await (await context.request.get(`${base}/auth/csrf`)).json())
    .data.token;
  expect(
    (
      await context.request.post(`${base}/auth/logout`, {
        headers: { Origin: "http://localhost:5173", "X-CSRF-Token": token },
      })
    ).status(),
  ).toBe(204);
  // This proves server revocation, not delivery of an auth signal to the tab.
  expect((await context.request.get(`${base}/auth/me`)).status()).toBe(401);
}
async function navigateInto401(page: Page) {
  const received = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname.startsWith("/api/v1/") && r.status() === 401,
  );
  await page.getByRole("link", { name: "Kết quả", exact: true }).click();
  await received;
  await expect(page.getByRole("heading", { name: expired })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Bài thi được giao", exact: true }),
  ).toHaveCount(0);
}

test("Cookie expiry, relogin and revoke reconcile on a browser 401; reload and another login recover", async ({
  page,
  context,
}) => {
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(new URL(r.url()).pathname);
  });
  await login(page);
  await context.clearCookies();
  await navigateInto401(page);
  await login(page);
  await revoke(context);
  await navigateInto401(page);
  await page.reload();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await login(page);
  expect(posts.filter((p) => p.endsWith("/auth/login"))).toHaveLength(3);
  expect(
    posts.filter(
      (p) => !p.endsWith("/auth/login") && !p.endsWith("/auth/logout"),
    ),
  ).toEqual([]);
});

test("Revocation with a failed browser probe preserves identity until visibility revalidation receives 401", async ({
  page,
  context,
}) => {
  await page.clock.install();
  await login(page);
  await revoke(context);
  // Advance beyond the existing 10s stale time, without triggering the 30s interval.
  await page.clock.fastForward(11000);
  await page.route("**/api/v1/**", (r) => r.abort("connectionclosed"));
  const failed = page.waitForEvent("requestfailed", (r) =>
    new URL(r.url()).pathname.endsWith("/auth/me"),
  );
  await page.evaluate(() =>
    window.dispatchEvent(new Event("visibilitychange")),
  );
  await failed;
  await page.clock.runFor(1500);
  await expect(page.getByRole("heading", { name: expired })).toHaveCount(0);
  // Network failure must preserve identity, even while other queries revalidate.
  await expect(
    page.getByRole("button", { name: "Đăng xuất", exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/v1/**");
  const received = page.waitForResponse(
    (r) => new URL(r.url()).pathname.endsWith("/auth/me") && r.status() === 401,
  );
  await page.evaluate(() =>
    window.dispatchEvent(new Event("visibilitychange")),
  );
  await received;
  await expect(page.getByRole("heading", { name: expired })).toBeVisible();
});

test("Logout in another tab is reconciled by the next protected SPA request", async ({
  page,
  context,
}) => {
  await login(page);
  const other = await context.newPage();
  await other.goto("/student");
  await expect(
    other.getByRole("heading", { name: "Bài thi được giao", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await navigateInto401(other);
  await login(other);
  await expect(
    other.getByRole("button", { name: "Đăng xuất", exact: true }),
  ).toBeVisible();
});
