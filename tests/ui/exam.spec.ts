import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const before = process.env.EXAM_UI_PHASE === "before";
const root =
  process.env.EXAM_SCREENSHOT_DIR ||
  `docs/screenshots/exam-redesign/${before ? "before" : "after"}`;
const base = "http://localhost:3000/api/v1";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("teacher1@exam.local");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("DevOnly!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL("/teacher");
}
async function mutate(page: Page, path: string, data = {}, method = "POST") {
  const csrf = (await (await page.request.get(`${base}/auth/csrf`)).json()).data
    .token;
  const response = await page.request.fetch(`${base}${path}`, {
    method,
    data,
    headers: { Origin: "http://localhost:5173", "X-CSRF-Token": csrf },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).data;
}
for (const [device, width] of [
  ["desktop", 1440],
  ["tablet", 820],
  ["mobile", 390],
] as const) {
  test(`Exam inventory ${device}`, async ({ page }) => {
    await mkdir(root, { recursive: true });
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    const existing = (
      await (await page.request.get(`${base}/teacher/exams`)).json()
    ).data as { id: string; title: string }[];
    const archived =
      existing.find((e) => e.title === "Đề ôn tập đã lưu trữ") ||
      (await mutate(page, "/teacher/exams", {
        title: "Đề ôn tập đã lưu trữ",
        openAt: new Date().toISOString(),
        closeAt: new Date(Date.now() + 86400000).toISOString(),
        durationMinutes: 30,
      }));
    await mutate(page, `/teacher/exams/${archived.id}/archive`);
    const records: unknown[] = [];
    async function shot(name: string) {
      await page.evaluate(() => document.fonts.ready);
      if (name !== "archive-dialog")
        await page.evaluate(() => window.scrollTo(0, 0));
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      records.push({
        name,
        width,
        overflow,
        route: new URL(page.url()).pathname,
      });
      if (!before) expect(overflow, name).toBe(false);
      await page.screenshot({
        path: `${root}/${name}-${device}.png`,
        fullPage: name !== "archive-dialog",
        animations: "disabled",
      });
    }
    await page.goto("/teacher/exams");
    await expect(
      page.getByRole("heading", { name: "Bài thi của tôi" }),
    ).toBeVisible();
    await expect(
      page.getByText("Bài kiểm tra nháp", { exact: true }),
    ).toBeVisible();
    await shot("list");
    await page
      .getByRole("link", { name: "Tạo bài thi", exact: true })
      .first()
      .click();
    await expect(page.getByLabel("Tên bài thi", { exact: true })).toBeVisible();
    await shot("create");
    await page.goto(`/teacher/exams/${id(400)}/edit`);
    await expect(page.getByLabel("Tên bài thi", { exact: true })).toHaveValue(
      "Bài kiểm tra nháp",
    );
    await shot("identity");
    await page.getByRole("button", { name: /2\. Lớp/ }).click();
    await expect(
      page.getByLabel("Thời lượng (phút)", { exact: true }),
    ).toBeVisible();
    await shot("schedule");
    await page.getByRole("button", { name: /3\. Câu hỏi/ }).click();
    await page
      .getByRole("combobox", { name: /^Ngân hàng/ })
      .first()
      .selectOption(id(200));
    await expect(
      page.getByRole("checkbox", { name: /^Chọn / }).first(),
    ).toBeVisible();
    await shot("questions");
    await page.getByLabel("Tìm câu hỏi", { exact: true }).fill("zzzz-no-match");
    await expect(page.getByRole("checkbox", { name: /^Chọn / })).toHaveCount(0);
    await shot("questions-empty");
    await page.getByRole("button", { name: /4\. Cài đặt/ }).click();
    await shot("settings");
    await page.getByRole("button", { name: /5\. Kiểm tra/ }).click();
    await shot("review");
    await page
      .getByRole("button", { name: "Lưu trữ bài thi", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await shot("archive-dialog");
    if (!before) {
      const bounds = await dialog.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press(i % 2 ? "Shift+Tab" : "Tab");
        expect(
          await dialog.evaluate((el) => el.contains(document.activeElement)),
        ).toBe(true);
      }
    }
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Lưu trữ bài thi", exact: true }),
    ).toBeFocused();
    await page.goto(`/teacher/exams/${id(401)}/edit`);
    await expect(page.getByLabel("Tên bài thi", { exact: true })).toHaveValue(
      "Kiểm tra Công nghệ Web",
    );
    await shot("published");
    await expect(
      page.getByRole("button", { name: "Lưu & công bố", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: /3\. Câu hỏi/ }).click();
    await shot("pools");
    await page.goto(`/teacher/exams/${id(401)}/preview`);
    await expect(
      page
        .getByRole("heading", { name: "Kiểm tra Công nghệ Web", exact: true })
        .first(),
    ).toBeVisible();
    await shot("preview");
    await page.goto(`/teacher/exams/${id(401)}/monitor`);
    await expect(
      page.getByRole("heading", { name: "Giám sát bài thi" }),
    ).toBeVisible();
    await expect(
      page.getByText("Chưa bắt đầu", { exact: true }).first(),
    ).toBeVisible();
    await shot("monitor-entry");
    await page.goto(`/teacher/exams/${archived.id}/edit`);
    await expect(page.getByLabel("Tên bài thi", { exact: true })).toBeVisible();
    await shot("archived");
    await page.route("**/api/v1/teacher/exams", (route) =>
      route.fulfill({ json: { data: [] } }),
    );
    await page.goto("/teacher/exams");
    await expect(
      page.getByRole("heading", { name: "Bài thi của tôi" }),
    ).toBeVisible();
    await expect(page.locator("main article")).toHaveCount(0);
    await shot("empty");
    await page.unrouteAll({ behavior: "wait" });
    await page.route("**/api/v1/teacher/exams", (route) =>
      route.fulfill({
        status: 503,
        json: {
          error: { message: "Không thể tải bài thi", code: "UNAVAILABLE" },
        },
      }),
    );
    await page.reload();
    await expect(page.getByRole("alert")).toBeVisible();
    await shot("error");
    await page.unrouteAll({ behavior: "wait" });
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/v1/teacher/exams", async (route) => {
      await hold;
      await route.continue();
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("status")).toBeVisible();
    await shot("loading");
    release();
    await page.unrouteAll({ behavior: "wait" });
    await writeFile(
      `${root}/inventory-${device}.json`,
      JSON.stringify(records, null, 2),
    );
  });
}

for (const [device, width] of [
  ["desktop", 1440],
  ["tablet", 820],
  ["mobile", 390],
] as const) {
  test(`Exam authoring and persistence ${device}`, async ({ page }) => {
    test.skip(before, "Authoring verification runs against the redesigned UI.");
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.goto("/teacher/exams/new");
    await expect(page.locator(".qb-shell")).toHaveCount(1);
    await expect(
      page.getByRole("link", { name: "Bài thi", exact: true }).first(),
    ).toHaveAttribute("aria-current", "page");
    await page
      .getByRole("button", { name: "Lưu bài thi", exact: true })
      .click();
    await expect(page.getByRole("alert")).toBeVisible();
    const title = `E2E Thiết lập bài thi ${device} ${Date.now()}`;
    await page.getByLabel("Tên bài thi", { exact: true }).fill(title);
    await page
      .getByLabel("Mô tả Markdown", { exact: true })
      .fill("Kiểm tra kiến thức **HTTP** và bảo mật ứng dụng.");
    await page
      .getByRole("button", { name: "Lưu bài thi", exact: true })
      .click();
    await page.waitForURL("/teacher/exams");
    const row = page.getByRole("article").filter({ hasText: title });
    await expect(row).toContainText("Bản nháp");
    await row.getByRole("link", { name: "Chỉnh sửa", exact: true }).click();
    const editUrl = page.url();
    const examId = new URL(editUrl).pathname.split("/")[3]!;
    await expect(page.getByLabel("Tên bài thi", { exact: true })).toHaveValue(
      title,
    );
    await page
      .getByRole("button", { name: "Lưu & công bố", exact: true })
      .click();
    await expect(page.getByRole("alert")).toBeVisible();
    expect(page.url()).toBe(editUrl);
    await page.getByRole("button", { name: /2\. Lớp/ }).click();
    await page
      .getByRole("checkbox", { name: "Công nghệ Web · Nhóm 01", exact: true })
      .check();
    await page.getByLabel("Thời lượng (phút)", { exact: true }).fill("35");
    await page.getByLabel("Số lần thi", { exact: true }).fill("2");
    await page.getByRole("button", { name: /3\. Câu hỏi/ }).click();
    await page.getByLabel("Ngân hàng", { exact: true }).selectOption(id(200));
    const chosen = page.getByRole("checkbox", {
      name: "Chọn HTTPS bảo vệ dữ liệu truyền bằng TLS.",
      exact: true,
    });
    await chosen.scrollIntoViewIfNeeded();
    await chosen.focus();
    await page.keyboard.press("Space");
    await expect(chosen).toBeChecked();
    await expect(
      page.getByRole("heading", { name: "Đã chọn (1)", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Điểm câu 1", { exact: true }).fill("2");
    await page.getByRole("button", { name: "Bỏ câu 1", exact: true }).click();
    await expect(chosen).not.toBeChecked();
    await chosen.check();
    await page.getByLabel("Điểm câu 1", { exact: true }).fill("2");
    await page
      .getByRole("button", { name: "Thêm nhóm ngẫu nhiên", exact: true })
      .click();
    await page
      .getByLabel("Ngân hàng pool", { exact: true })
      .selectOption(id(200));
    await page.getByLabel("Số câu", { exact: true }).fill("2");
    await page.getByLabel("Điểm mỗi câu", { exact: true }).fill("1.5");
    await page.getByLabel("Độ khó", { exact: true }).selectOption("EASY");
    await page.getByLabel("Tags", { exact: true }).fill("demo");
    await expect(page.getByRole("status")).toContainText(
      "1 câu cố định · 2 câu ngẫu nhiên · 5 điểm",
    );
    for (const control of await page
      .locator(
        ".exam-page button:visible, .exam-page select:visible, .exam-page input:not([type=checkbox]):visible",
      )
      .all()) {
      const box = await control.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    await page.getByRole("button", { name: /4\. Cài đặt/ }).click();
    await page
      .getByLabel("Chiến lược kết quả", { exact: true })
      .selectOption("LATEST_ATTEMPT");
    await page
      .getByLabel("Công bố kết quả", { exact: true })
      .selectOption("AFTER_CLOSE");
    await page.getByLabel("Ngưỡng đạt (%)", { exact: true }).fill("60");
    await page
      .getByRole("checkbox", { name: "Xáo trộn câu hỏi", exact: true })
      .check();
    await page
      .getByRole("checkbox", { name: "Xáo trộn lựa chọn", exact: true })
      .check();
    await page
      .getByRole("checkbox", { name: "Cho xem đáp án đúng", exact: true })
      .check();
    await page
      .getByRole("checkbox", { name: "Cho xem giải thích", exact: true })
      .check();
    await page
      .getByRole("button", { name: "Lưu bài thi", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Đã lưu cấu hình");
    await page.reload();
    await expect(page.getByLabel("Tên bài thi", { exact: true })).toHaveValue(
      title,
    );
    const data = (
      await (await page.request.get(`${base}/teacher/exams/${examId}`)).json()
    ).data;
    expect(data).toMatchObject({
      title,
      durationMinutes: 35,
      maxAttempts: 2,
      resultStrategy: "LATEST_ATTEMPT",
      resultReleaseMode: "AFTER_CLOSE",
      shuffleQuestions: true,
      shuffleOptions: true,
      showCorrectAnswers: true,
      showExplanations: true,
    });
    expect(Number(data.passScorePercent)).toBe(60);
    expect(data.classes).toHaveLength(1);
    expect(data.questions).toHaveLength(1);
    expect(Number(data.questions[0].points)).toBe(2);
    expect(data.pools[0]).toMatchObject({
      pickCount: 2,
      difficultyFilter: "EASY",
      tagFilter: ["demo"],
    });
    expect(Number(data.pools[0].pointsEach)).toBe(1.5);
    await page.getByRole("button", { name: /3\. Câu hỏi/ }).click();
    await expect(page.getByLabel("Điểm câu 1", { exact: true })).toHaveValue(
      "2",
    );
    await expect(page.getByLabel("Số câu", { exact: true })).toHaveValue("2");
    await page.getByRole("button", { name: /5\. Kiểm tra/ }).click();
    await page
      .getByRole("button", { name: "Lưu & công bố", exact: true })
      .click();
    await page.waitForURL("/teacher/exams");
    await expect(row).toContainText("Đã công bố");
    await row.getByRole("link", { name: "Xem trước", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Lưu bài thi", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("link", { name: "← Về danh sách bài thi", exact: true })
      .click();
    await row.getByRole("link", { name: "Giám sát", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Giám sát bài thi" }),
    ).toBeVisible();
    await expect(page.locator(".qb-shell")).toHaveCount(0);
    await page.goto(editUrl);
    await page
      .getByRole("button", { name: "Lưu trữ bài thi", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Hủy", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Lưu trữ bài thi", exact: true }),
    ).toBeFocused();
    await page
      .getByRole("button", { name: "Lưu trữ bài thi", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Xác nhận", exact: true })
      .click();
    await page.waitForURL("/teacher/exams");
    await expect(row).toContainText("Đã lưu trữ");
    await row.getByRole("link", { name: "Chỉnh sửa", exact: true }).click();
    await expect(
      page.getByLabel("Tên bài thi", { exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Lưu bài thi", exact: true }),
    ).toBeDisabled();
    await page.reload();
    await expect(
      page.getByLabel("Tên bài thi", { exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Lưu bài thi", exact: true }),
    ).toBeDisabled();
    await expect(page.locator(".exam-status").first()).toHaveText("Đã lưu trữ");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await page
        .getByRole("button", { name: /2\. Lớp/ })
        .evaluate((el) => getComputedStyle(el).transitionDuration),
    ).toBe("0s");
  });
}

test("Exam feedback: query retries, retained input, save failure and keyboard", async ({
  page,
}) => {
  test.skip(before, "Redesigned feedback states.");
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page);
  const failure = {
    error: { message: "Kết nối tạm thời gián đoạn", code: "UNAVAILABLE" },
  };
  await page.route(`**/teacher/exams/${id(400)}`, (route) =>
    route.fulfill({ status: 503, json: failure }),
  );
  await page.goto(`/teacher/exams/${id(400)}/edit`);
  await expect(page.getByRole("alert")).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.getByLabel("Tên bài thi", { exact: true })).toHaveValue(
    "Bài kiểm tra nháp",
  );
  await page
    .getByLabel("Tên bài thi", { exact: true })
    .fill("Nội dung được giữ khi mất kết nối");
  await page.route(`**/teacher/exams/${id(400)}`, (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 503, json: failure })
      : route.continue(),
  );
  await page.getByRole("button", { name: "Lưu bài thi", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Tên bài thi", { exact: true })).toHaveValue(
    "Nội dung được giữ khi mất kết nối",
  );
  await page.screenshot({
    path: `${root}/save-error-mobile.png`,
    fullPage: true,
  });
  await page.unrouteAll({ behavior: "wait" });
  await page
    .getByLabel("Tên bài thi", { exact: true })
    .fill("Bài kiểm tra nháp");
  await page.getByRole("button", { name: "Lưu bài thi", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu cấu hình");
  await page.getByRole("button", { name: /3\. Câu hỏi/ }).click();
  await page.route("**/question-banks/*/questions?*", (route) =>
    route.fulfill({ status: 503, json: failure }),
  );
  await page.getByLabel("Ngân hàng", { exact: true }).selectOption(id(200));
  await expect(page.getByRole("alert")).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /^Chọn / })).toHaveCount(12);
  const last = page.getByRole("checkbox", { name: /^Chọn / }).last();
  await last.focus();
  const ring = await last.evaluate((el) => getComputedStyle(el).outlineWidth);
  expect(ring).toBe("3px");
  await expect(last).toBeInViewport();
  await page.screenshot({
    path: `${root}/question-keyboard-mobile.png`,
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "← Về danh sách bài thi", exact: true })
    .click();
  await page.waitForURL("/teacher/exams");
  await page.goBack();
  await page.waitForURL(`/teacher/exams/${id(400)}/edit`);
  await page.getByRole("button", { name: /1\. Thông tin/ }).click();
  await expect(page.getByLabel("Tên bài thi", { exact: true })).toHaveValue(
    "Bài kiểm tra nháp",
  );
  await page.route("**/api/v1/teacher/exams", (route) =>
    route.fulfill({ status: 503, json: failure }),
  );
  await page.goto("/teacher/exams");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.getByRole("article").first()).toBeVisible();
});
