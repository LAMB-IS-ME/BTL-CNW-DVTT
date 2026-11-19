import { test, expect, type Page, type Locator } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createDb } from "../../apps/api/src/db/client";

const widths = [1440, 820, 390, 320];
const id = (n: number) =>
  `00000000-0000-4000-9000-${String(n).padStart(12, "0")}`;
const classId = id(1);
const database = process.env.TEST_DATABASE_URL!;
const db = createDb(database);
test.beforeAll(async () => {
  const url = new URL(database);
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !url.pathname.includes("test")
  )
    throw new Error("Isolated local test database required");
  const teacher = await db.user.findUniqueOrThrow({
    where: { email: "teacher1@exam.local" },
  });
  await db.user.createMany({
    data: Array.from({ length: 26 }, (_, i) => ({
      id: id(100 + i),
      email: `roster-pilot-${String(i + 1).padStart(2, "0")}@test.local`,
      fullName: `Nguyễn Minh Anh ${String(i + 1).padStart(2, "0")}`,
      role: "STUDENT" as const,
      passwordHash: teacher.passwordHash,
    })),
  });
  await db.class.createMany({
    data: Array.from({ length: 22 }, (_, i) => ({
      id: id(i + 1),
      teacherId: teacher.id,
      name: `Lớp thực hành UI ${String(i + 1).padStart(2, "0")}`,
      description: "Công nghệ Web · Học kỳ 1",
    })),
  });
  await db.classMember.createMany({
    data: Array.from({ length: 23 }, (_, i) => ({
      classId,
      studentId: id(101 + i),
    })),
  });
});
test.afterAll(async () => {
  await db.class.deleteMany({
    where: { id: { in: Array.from({ length: 22 }, (_, i) => id(i + 1)) } },
  });
  await db.user.deleteMany({
    where: { id: { in: Array.from({ length: 26 }, (_, i) => id(100 + i)) } },
  });
  await db.$disconnect();
});
async function login(page: Page, user: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(`${user}@exam.local`);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("DevOnly!2026");
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
const adminPager = (page: Page) => page.locator("main > .actions").last();
async function touch(locator: Locator) {
  for (const button of await locator.getByRole("button").all()) {
    const r = await button.boundingBox();
    expect(r!.height).toBeGreaterThanOrEqual(44);
    expect(r!.width).toBeGreaterThanOrEqual(44);
  }
}
test("responsive audit captures", async ({ page }) => {
  const capture = process.env.PILOT_CAPTURE;
  const out = `test-results/roster-pagination-pilot/${capture || "verification"}`;
  if (capture) await mkdir(out, { recursive: true });
  const metrics = [];
  for (const user of ["admin", "teacher1"]) {
    await login(page, user);
    for (const path of user === "admin"
      ? ["/admin/users"]
      : ["/teacher/classes", `/teacher/classes/${classId}`]) {
      await page.goto(path);
      const detail = path.includes(classId);
      const search = page.getByLabel(
        user === "admin"
          ? "Tìm user"
          : detail
            ? "Tìm sinh viên để thêm"
            : "Tìm lớp",
        { exact: true },
      );
      await search.fill(
        user === "admin" || detail ? "roster-pilot-" : "Lớp thực hành UI",
      );
      const pager =
        user === "admin" ? adminPager(page) : page.locator(".catalog-pager");
      await expect(pager).toContainText(
        user === "admin" || detail ? "26 kết quả" : "22 kết quả",
      );
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await bounds(page);
        const name = user === "admin" ? "admin" : detail ? "roster" : "classes";
        await pager.scrollIntoViewIfNeeded();
        metrics.push({
          name,
          width,
          pager: await pager.evaluate((e) => ({
            height: e.getBoundingClientRect().height,
            children: [...e.children].map((c) => ({
              text: c.textContent,
              x: c.getBoundingClientRect().x,
              y: c.getBoundingClientRect().y,
              width: c.getBoundingClientRect().width,
              height: c.getBoundingClientRect().height,
            })),
          })),
        });
        if (capture)
          await page.screenshot({ path: `${out}/${name}-pager-${width}.png` });
        if (detail) {
          await page
            .getByRole("heading", { name: "Thêm sinh viên", exact: true })
            .evaluate((e) => e.scrollIntoView());
          if (capture)
            await page.screenshot({ path: `${out}/picker-${width}.png` });
          const heading = page.getByRole("heading", {
            name: "Danh sách lớp (23)",
            exact: true,
          });
          await heading.evaluate((e) => e.scrollIntoView());
          if (capture)
            await page.screenshot({ path: `${out}/members-${width}.png` });
          metrics.push({
            name: "members",
            width,
            height: await page.evaluate(() => {
              const heads = [...document.querySelectorAll("main h2")];
              const start = heads.find((e) =>
                e.textContent?.startsWith("Danh sách lớp"),
              )!;
              const end = heads.find(
                (e) => e.textContent === "Bài thi đã giao",
              )!;
              return (
                end.getBoundingClientRect().y - start.getBoundingClientRect().y
              );
            }),
          });
        }
      }
    }
    await page.context().clearCookies();
  }
  if (capture)
    await writeFile(`${out}/metrics.json`, JSON.stringify(metrics, null, 2));
});

test("pagination: boundaries, server requests, search/filter and keyboard at four widths", async ({
  page,
}) => {
  for (const user of ["admin", "teacher1"]) {
    await login(page, user);
    for (const path of user === "admin"
      ? ["/admin/users"]
      : ["/teacher/classes", `/teacher/classes/${classId}`]) {
      const detail = path.includes(classId);
      const admin = user === "admin";
      const total = admin || detail ? 26 : 22;
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const search = page.getByLabel(
          admin ? "Tìm user" : detail ? "Tìm sinh viên để thêm" : "Tìm lớp",
          { exact: true },
        );
        const filter = admin || detail ? "roster-pilot-" : "Lớp thực hành UI";
        await search.fill(filter);
        const pager = admin ? adminPager(page) : page.locator(".catalog-pager");
        const prev = pager.getByRole("button").first(),
          next = pager.getByRole("button").last();
        const rows = admin
          ? page.locator("tbody tr")
          : detail
            ? page
                .getByRole("list", { name: "Sinh viên có thể thêm" })
                .getByRole("listitem")
            : page.locator('main a[href^="/teacher/classes/"]');
        await expect(pager).toContainText(`${total} kết quả`);
        await expect(rows).toHaveCount(20);
        await expect(prev).toBeDisabled();
        await expect(next).toBeEnabled();
        await pager.scrollIntoViewIfNeeded();
        await touch(pager);
        if (width <= 700) {
          const a = (await prev.boundingBox())!,
            b = (await next.boundingBox())!;
          expect(a.y).toBe(b.y);
          expect(Math.abs(a.width - b.width)).toBeLessThan(1);
          expect((await pager.locator("span").boundingBox())!.y).toBeLessThan(
            a.y,
          );
        }
        expect(
          await prev.evaluate((e) => Number(getComputedStyle(e).opacity)),
        ).toBeLessThan(1);
        await next.focus();
        expect(
          await next.evaluate((e) => getComputedStyle(e).outlineStyle),
        ).not.toBe("none");
        const response = page.waitForResponse((r) => {
          const url = new URL(r.url());
          return (
            url.pathname.endsWith(
              admin
                ? "/admin/users"
                : detail
                  ? "/teacher/students"
                  : "/teacher/classes",
            ) &&
            url.searchParams.get("page") === "2" &&
            url.searchParams.get("search") === filter &&
            r.ok()
          );
        });
        await page.keyboard.press("Enter");
        await response;
        await expect(pager).toContainText("Trang 2");
        await expect(rows).toHaveCount(total - 20);
        await expect(next).toBeDisabled();
        await expect(prev).toBeEnabled();
        await expect(search).toHaveValue(filter);
        await prev.click();
        await expect(pager).toContainText("Trang 1");
        await expect(rows).toHaveCount(20);
        await next.click();
        await expect(pager).toContainText("Trang 2");
        await search.fill(
          admin || detail ? "roster-pilot-26" : "Lớp thực hành UI 22",
        );
        await expect(pager).toContainText("1 kết quả");
        await expect(pager).toContainText("Trang 1");
        await expect(rows).toHaveCount(1);
        await expect(prev).toBeDisabled();
        await expect(next).toBeDisabled();
        if (admin) {
          await page.getByLabel("Lọc role").selectOption("TEACHER");
          await expect(pager).toContainText("0 kết quả");
          await expect(next).toBeDisabled();
          await page.getByLabel("Lọc role").selectOption("STUDENT");
          await expect(pager).toContainText("1 kết quả");
          await expect(search).toHaveValue("roster-pilot-26");
        }
        await bounds(page);
      }
    }
    await page.context().clearCookies();
  }
});

test("roster: long identities, add/remove, retained page/search, confirmation and errors", async ({
  page,
}) => {
  await login(page, "teacher1");
  await db.user.update({
    where: { id: id(125) },
    data: {
      fullName: "Nguyễn Thị Hoàng Minh Anh — sinh viên thực hành Công nghệ Web",
      email: "roster-pilot-26-ten-sinh-vien-rat-dai-de-kiem-tra@test.local",
    },
  });
  await page.goto(`/teacher/classes/${classId}`);
  const search = page.getByLabel("Tìm sinh viên để thêm");
  await search.fill("roster-pilot-");
  const picker = page.getByRole("list", { name: "Sinh viên có thể thêm" });
  const roster = page.getByRole("list", { name: "Sinh viên trong lớp" });
  const pager = page.locator(".catalog-pager");
  await expect(pager).toContainText("26 kết quả");
  await pager.getByRole("button", { name: "Trang sau", exact: true }).click();
  await expect(pager).toContainText("Trang 2");
  const candidate = picker
    .getByRole("listitem")
    .filter({ hasText: "roster-pilot-26-" });
  await expect(candidate).toBeVisible();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await candidate.scrollIntoViewIfNeeded();
    await touch(candidate);
    await bounds(page);
    const r = (await candidate.boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(width);
    const identity = candidate.locator(".class-student-identity");
    expect(
      await identity.evaluate((e) => e.scrollWidth - e.clientWidth),
    ).toBeLessThanOrEqual(1);
  }
  const add = candidate.getByRole("button", { name: "Thêm vào lớp" });
  await page.route(`**/api/v1/teacher/classes/${classId}/students`, (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: {
          code: "TEST",
          message: "Không thể thêm sinh viên thử nghiệm.",
        },
      },
    }),
  );
  await add.click();
  await expect(page.getByRole("alert")).toContainText(
    "Không thể thêm sinh viên thử nghiệm.",
  );
  await expect(roster.getByRole("listitem")).toHaveCount(23);
  await expect(search).toHaveValue("roster-pilot-");
  await page.unrouteAll({ behavior: "wait" });
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(roster.getByRole("listitem")).toHaveCount(24);
  await expect(
    candidate.getByRole("button", { name: "Đã trong lớp" }),
  ).toBeDisabled();
  await expect(pager).toContainText("Trang 2");
  await expect(search).toHaveValue("roster-pilot-");
  const member = roster
    .getByRole("listitem")
    .filter({ hasText: "roster-pilot-26-" });
  const remove = member.getByRole("button", { name: "Xóa khỏi lớp" });
  await remove.click();
  const dialog = page.getByRole("dialog", { name: "Xác nhận thao tác" });
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "Xác nhận", exact: true });
  const cancel = dialog.getByRole("button", { name: "Hủy", exact: true });
  await confirm.focus();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(remove).toBeFocused();
  await expect(roster.getByRole("listitem")).toHaveCount(24);
  await remove.click();
  await cancel.click();
  await expect(remove).toBeFocused();
  await page.route(
    `**/api/v1/teacher/classes/${classId}/students/${id(125)}`,
    (route) =>
      route.fulfill({
        status: 503,
        json: {
          error: {
            code: "TEST",
            message: "Không thể xóa sinh viên thử nghiệm.",
          },
        },
      }),
  );
  await remove.click();
  await confirm.click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Không thể xóa sinh viên thử nghiệm.",
  );
  await expect(roster.getByRole("listitem")).toHaveCount(24);
  await page.unrouteAll({ behavior: "wait" });
  await confirm.click();
  await expect(dialog).toBeHidden();
  await expect(roster.getByRole("listitem")).toHaveCount(23);
  await expect(
    candidate.getByRole("button", { name: "Thêm vào lớp" }),
  ).toBeEnabled();
  await expect(pager).toContainText("Trang 2");
  await expect(search).toHaveValue("roster-pilot-");
  await page.reload();
  await expect(roster.getByRole("listitem")).toHaveCount(23);
  await page.goto(`/teacher/classes/${id(22)}`);
  await expect(
    page.getByText("Chưa có sinh viên trong lớp.", { exact: true }),
  ).toBeVisible();
  await bounds(page);
});
