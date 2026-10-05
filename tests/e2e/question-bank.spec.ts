import { test, expect, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=",
  "base64",
);
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("teacher1@exam.local");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("DevOnly!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Không gian giảng viên" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Câu hỏi", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ngân hàng câu hỏi", exact: true }),
  ).toBeVisible();
}
async function bank(page: Page, name: string) {
  await page
    .getByRole("button", { name: "Tạo ngân hàng", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tên ngân hàng", { exact: true }).fill(name);
  await dialog.getByLabel("Môn học", { exact: true }).fill("Kiểm thử Web");
  await dialog
    .getByRole("button", { name: "Tạo ngân hàng", exact: true })
    .click();
  await page.getByLabel("Tìm ngân hàng", { exact: true }).fill(name);
  const row = page.getByRole("row").filter({ hasText: name });
  await row.getByRole("link", { name: "Mở ngân hàng" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}
async function newQuestion(page: Page, type: string, prompt: string) {
  await page
    .getByRole("link", { name: "＋ Thêm câu hỏi", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tạo câu hỏi", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Loại câu hỏi", { exact: true }).selectOption(type);
  await page.getByLabel("Nội dung câu hỏi", { exact: true }).fill(prompt);
  if (type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE") {
    await page.getByLabel("Lựa chọn 1", { exact: true }).fill("Phương án A");
    await page.getByLabel("Lựa chọn 2", { exact: true }).fill("Phương án B");
    if (type === "MULTIPLE_CHOICE")
      await page.getByLabel("Đáp án đúng 2", { exact: true }).check();
  }
}
async function saved(page: Page) {
  await page.getByRole("button", { name: "Lưu câu hỏi", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Chỉnh sửa câu hỏi", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".qb-savebar")).toContainText("Đã lưu");
}
test("Question Bank discoverability: four types, reload/edit/cancel, archive/restore, bank filters and lifecycle", async ({
  page,
}) => {
  await login(page);
  const name = `TEST_QB_${Date.now()}`;
  await bank(page, name);
  await expect(
    page.getByText("Ngân hàng chưa có câu hỏi đang dùng", { exact: true }),
  ).toBeVisible();
  for (const type of [
    "SINGLE_CHOICE",
    "MULTIPLE_CHOICE",
    "TRUE_FALSE",
    "ESSAY",
  ]) {
    await newQuestion(
      page,
      type,
      `TEST_${type} **Markdown** $x^2$\n\n\`\`\`js\nconst x = 2;\n\`\`\``,
    );
    await page.getByLabel("Điểm", { exact: true }).fill("2.5");
    await page
      .getByLabel("Thẻ phân loại", { exact: true })
      .fill("HTTP, Session");
    await page
      .getByLabel("Lời giải", { exact: true })
      .fill("Giải thích **chi tiết**.");
    await saved(page);
    await page.reload();
    await expect(page.getByLabel("Loại câu hỏi", { exact: true })).toHaveValue(
      type,
    );
    await expect(page.getByLabel("Điểm", { exact: true })).toHaveValue("2.5");
    await expect(page.getByLabel("Thẻ phân loại", { exact: true })).toHaveValue(
      "HTTP, Session",
    );
    await page
      .getByLabel("Nội dung câu hỏi", { exact: true })
      .fill(`Edited ${type}`);
    await page
      .getByRole("button", { name: "Lưu câu hỏi", exact: true })
      .click();
    await expect(page.locator(".qb-savebar")).toContainText("Đã lưu câu hỏi");
    await page.reload();
    await expect(
      page.getByLabel("Nội dung câu hỏi", { exact: true }),
    ).toHaveValue(`Edited ${type}`);
    await page
      .getByLabel("Nội dung câu hỏi", { exact: true })
      .fill("Unsaved cancellation");
    await page.getByRole("link", { name: "Hủy", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Tiếp tục soạn", exact: true })
      .click();
    await expect(
      page.getByLabel("Nội dung câu hỏi", { exact: true }),
    ).toHaveValue("Unsaved cancellation");
    await page.getByRole("link", { name: "Hủy", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Bỏ thay đổi", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: `Edited ${type}` });
    await row.getByRole("button", { name: "Lưu trữ", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Hủy", exact: true })
      .click();
    await expect(
      row.getByRole("button", { name: "Lưu trữ", exact: true }),
    ).toBeFocused();
    await row.getByRole("button", { name: "Lưu trữ", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Xác nhận", exact: true })
      .click();
    await expect(row).toHaveCount(0);
    await page
      .getByLabel("Trạng thái", { exact: true })
      .selectOption("archived");
    await page.reload();
    const archived = page
      .getByRole("row")
      .filter({ hasText: `Edited ${type}` });
    await archived
      .getByRole("button", { name: "Khôi phục", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Xác nhận", exact: true })
      .click();
    await expect(archived).toHaveCount(0);
    await page.getByLabel("Trạng thái", { exact: true }).selectOption("active");
    await expect(row).toBeVisible();
  }
  await page
    .getByRole("button", { name: "Chỉnh sửa ngân hàng", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Môn học", { exact: true })
    .fill("Đã chỉnh sửa");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Lưu thông tin", exact: true })
    .click();
  await page.getByRole("link", { name: "Câu hỏi", exact: true }).click();
  await page.getByLabel("Tìm ngân hàng", { exact: true }).fill(name);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("Đã chỉnh sửa");
  await row.getByLabel(`Thao tác ${name}`, { exact: true }).click();
  await row.getByRole("button", { name: "Lưu trữ", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Xác nhận", exact: true })
    .click();
  await page.getByLabel("Trạng thái", { exact: true }).selectOption("archived");
  await expect(row).toContainText("Đã lưu trữ");
  await row.getByLabel(`Thao tác ${name}`, { exact: true }).click();
  await row.getByRole("button", { name: "Khôi phục", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Xác nhận", exact: true })
    .click();
  await page.getByLabel("Trạng thái", { exact: true }).selectOption("active");
  await expect(row).toContainText("Đang dùng");
});

test("Images through API/DB and local Storage boundary: stage/upload/reload/replace/remove, validation and retry", async ({
  page,
}) => {
  await login(page);
  await bank(page, `TEST_IMG_${Date.now()}`);
  await newQuestion(page, "ESSAY", "Câu hỏi với ảnh");
  await page.getByLabel("Chọn ảnh", { exact: true }).setInputFiles({
    name: "bad.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("bad"),
  });
  await expect(page.getByRole("alert")).toContainText("Chỉ nhận ảnh PNG");
  await page.getByLabel("Chọn ảnh", { exact: true }).setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole("alert")).toContainText("5 MB");
  await page
    .getByLabel("Chọn ảnh", { exact: true })
    .setInputFiles({ name: "valid.png", mimeType: "image/png", buffer: png });
  await expect(page.getByAltText("Ảnh đã chọn, chưa lưu")).toBeVisible();
  let creates = 0;
  page.on("request", (r) => {
    if (
      r.method() === "POST" &&
      /question-banks\/[^/]+\/questions$/.test(r.url())
    )
      creates++;
  });
  await page.route(
    "**/teacher/questions/*/assets",
    (route) =>
      route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "STORAGE_UPLOAD_FAILED",
            message: "provider secret must not leak",
          },
        }),
      }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Lưu câu hỏi", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Kiểm tra kết nối");
  await expect(page.locator(".qb-savebar")).toContainText("ảnh chưa hoàn tất");
  await expect(
    page.getByLabel("Nội dung câu hỏi", { exact: true }),
  ).toHaveValue("Câu hỏi với ảnh");
  await saved(page);
  expect(creates).toBe(1);
  await page.reload();
  await expect(page.locator(".qb-preview img")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".qb-preview img")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  const original = await page
    .getByLabel("Nội dung câu hỏi", { exact: true })
    .inputValue();
  expect(original).toContain("asset:");
  await page.getByLabel("Chọn ảnh", { exact: true }).setInputFiles({
    name: "replacement.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.getByRole("button", { name: "Gỡ ảnh 1", exact: true }).click();
  await page.getByRole("button", { name: "Lưu câu hỏi", exact: true }).click();
  await expect(page.locator(".qb-savebar")).toContainText(
    "Đã lưu câu hỏi và ảnh",
  );
  await page.reload();
  const replaced = await page
    .getByLabel("Nội dung câu hỏi", { exact: true })
    .inputValue();
  expect(replaced).not.toEqual(original);
  expect(replaced.match(/asset:/g)).toHaveLength(1);
  await page.getByRole("button", { name: "Gỡ ảnh 1", exact: true }).click();
  await page.getByRole("button", { name: "Lưu câu hỏi", exact: true }).click();
  await expect(page.locator(".qb-savebar")).toContainText("Đã lưu câu hỏi");
  await page.reload();
  await expect(page.locator(".qb-preview img")).toHaveCount(0);
});

test("Pilot UI: keyboard/dialog focus, slow/loading, validation, network error, mobile/reduced motion and dirty Back", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const create = page.getByRole("button", {
    name: "Tạo ngân hàng",
    exact: true,
  });
  await create.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog").getByLabel("Tên ngân hàng", { exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(create).toBeFocused();
  await bank(page, `TEST_UI_${Date.now()}`);
  await newQuestion(page, "SINGLE_CHOICE", "");
  await page.getByRole("button", { name: "Lưu câu hỏi", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Kiểm tra");
  await expect(
    page.getByLabel("Nội dung câu hỏi", { exact: true }),
  ).toBeFocused();
  await page
    .getByLabel("Nội dung câu hỏi", { exact: true })
    .fill("TEST_UI question");
  await page.getByRole("tab", { name: "Xem trước", exact: true }).click();
  await expect(page.locator(".qb-preview")).toContainText("TEST_UI question");
  await page.getByRole("tab", { name: "Soạn thảo", exact: true }).click();
  await page.goBack();
  await expect(
    page.getByRole("dialog", { name: "Rời trang soạn thảo?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Tiếp tục soạn", exact: true })
    .click();
  await page.route("**/question-banks/*/questions", async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((r) => setTimeout(r, 700));
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "SQL internal failure", code: "INTERNAL_ERROR" },
        }),
      });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Lưu câu hỏi", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Đang lưu…", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("Không thể hoàn tất");
  await expect(
    page.getByLabel("Nội dung câu hỏi", { exact: true }),
  ).toHaveValue("TEST_UI question");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .getByRole("button", { name: "Lưu câu hỏi", exact: true })
      .evaluate((e) => getComputedStyle(e).transitionDuration),
  ).toBe("0s");
  await page.getByRole("link", { name: "Hủy", exact: true }).click();
  await page.getByRole("button", { name: "Bỏ thay đổi", exact: true }).click();
  await page.route("**/question-banks?view=manage*", async (route) => {
    await new Promise((r) => setTimeout(r, 700));
    await route.continue();
  });
  await page.getByRole("link", { name: "Câu hỏi", exact: true }).click();
  await page
    .getByLabel("Tìm ngân hàng", { exact: true })
    .fill("missing_unique_bank");
  await expect(
    page
      .getByRole("status", { name: "" })
      .filter({ hasText: "Đang tải ngân hàng" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Không tìm thấy ngân hàng phù hợp" }),
  ).toBeVisible();
});

async function encodedImage(page: Page, mime: string) {
  const data = await page.evaluate((type) => {
    const canvas = document.createElement("canvas");
    canvas.width = 40;
    canvas.height = 24;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#3157d5";
    ctx.fillRect(0, 0, 40, 24);
    return canvas.toDataURL(type).split(",")[1]!;
  }, mime);
  return {
    name: `fixture.${mime.split("/")[1]}`,
    mimeType: mime,
    buffer: Buffer.from(data, "base64"),
  };
}

test("JPEG/WebP persist, actual replace control, invalid signature, interrupted linking resumes without duplicate upload", async ({
  page,
}) => {
  await login(page);
  await bank(page, `TEST_FORMAT_${Date.now()}`);
  await newQuestion(page, "ESSAY", "Ảnh JPEG và WebP");
  await page.getByLabel("Chọn ảnh", { exact: true }).setInputFiles({
    name: "forged.png",
    mimeType: "image/png",
    buffer: Buffer.from("not a real image"),
  });
  await page.getByRole("button", { name: "Lưu câu hỏi", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("hợp lệ");
  await page
    .getByLabel("Chọn ảnh", { exact: true })
    .setInputFiles(await encodedImage(page, "image/jpeg"));
  let uploads = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/assets$/.test(r.url())) uploads++;
  });
  await page.route("**/teacher/questions/*", async (route) => {
    if (
      route.request().method() === "PATCH" &&
      route.request().postData()?.includes("asset:")
    ) {
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: "INTERNAL_ERROR",
            message: "private internal details",
          },
        },
      });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Lưu câu hỏi", exact: true }).click();
  await expect(page.locator(".qb-savebar")).toContainText("ảnh chưa hoàn tất");
  await page.unroute("**/teacher/questions/*");
  await saved(page);
  expect(uploads).toBe(1);
  await page.reload();
  await expect
    .poll(() =>
      page
        .locator(".qb-preview img")
        .evaluate((el: HTMLImageElement) => el.naturalWidth),
    )
    .toBe(40);
  const original = await page
    .getByLabel("Nội dung câu hỏi", { exact: true })
    .inputValue();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Thay ảnh 1", exact: true }).click();
  await (await chooser).setFiles(await encodedImage(page, "image/webp"));
  await expect(
    page.getByText("Sẽ thay ảnh hiện tại khi lưu.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lưu câu hỏi", exact: true }).click();
  await expect(page.locator(".qb-savebar")).toContainText(
    "Đã lưu câu hỏi và ảnh",
  );
  await page.reload();
  await expect
    .poll(() =>
      page
        .locator(".qb-preview img")
        .evaluate((el: HTMLImageElement) => el.naturalWidth),
    )
    .toBe(40);
  const replaced = await page
    .getByLabel("Nội dung câu hỏi", { exact: true })
    .inputValue();
  expect(replaced).not.toBe(original);
  expect(replaced.match(/asset:/g)).toHaveLength(1);
});

test("Search debounces eight keys, final query wins over late response, filters persist on reload", async ({
  page,
}) => {
  await login(page);
  await bank(page, `TEST_SEARCH_${Date.now()}`);
  await newQuestion(page, "ESSAY", "question newest match");
  await saved(page);
  await page.getByRole("link", { name: "Hủy", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "question newest match" }),
  ).toBeVisible();
  const queries: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/questions?"))
      queries.push(new URL(r.url()).searchParams.get("search") || "");
  });
  await page
    .getByLabel("Tìm câu hỏi", { exact: true })
    .pressSequentially("question", { delay: 60 });
  await expect(
    page.getByRole("row").filter({ hasText: "question newest match" }),
  ).toBeVisible();
  expect(queries).toEqual(["question"]);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/questions?*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("search") === "older") {
      await held;
      await route.fulfill({ json: { data: { items: [], total: 0 } } });
    } else await route.continue();
  });
  const oldRequest = page.waitForRequest((r) =>
    r.url().includes("search=older"),
  );
  await page.getByLabel("Tìm câu hỏi", { exact: true }).fill("older");
  await oldRequest;
  await page.getByLabel("Tìm câu hỏi", { exact: true }).fill("newest");
  await expect(
    page.getByRole("row").filter({ hasText: "question newest match" }),
  ).toBeVisible();
  const late = page.waitForResponse((r) => r.url().includes("search=older"));
  release();
  await late;
  await expect(
    page.getByRole("row").filter({ hasText: "question newest match" }),
  ).toBeVisible();
  await page.getByLabel("Loại câu hỏi", { exact: true }).selectOption("ESSAY");
  await page.reload();
  await expect(page.getByLabel("Tìm câu hỏi", { exact: true })).toHaveValue(
    "newest",
  );
  await expect(page.getByLabel("Loại câu hỏi", { exact: true })).toHaveValue(
    "ESSAY",
  );
});

test("List/detail failures retry; archive and restore errors preserve state and dialogs allow retry", async ({
  page,
}) => {
  await login(page);
  const name = `TEST_ERROR_${Date.now()}`;
  await bank(page, name);
  await newQuestion(page, "ESSAY", "Archive error question");
  await saved(page);
  await page.getByRole("link", { name: "Hủy", exact: true }).click();
  const fail = {
    status: 500,
    json: { error: { code: "INTERNAL_ERROR", message: "SQL stack PRIVATE" } },
  };
  await page.route("**/questions?*", (r) => r.fulfill(fail));
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Kiểm tra kết nối");
  await expect(page.locator("body")).not.toContainText("SQL stack PRIVATE");
  await page.unroute("**/questions?*");
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  const row = page
    .getByRole("row")
    .filter({ hasText: "Archive error question" });
  for (const action of ["Lưu trữ", "Khôi phục"]) {
    await page.route("**/teacher/questions/**", async (r) => {
      if (["DELETE", "POST"].includes(r.request().method())) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        await r.fulfill(fail);
      } else await r.continue();
    });
    await row.getByRole("button", { name: action, exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Xác nhận", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Đang xử lý…", exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "Không thể hoàn tất",
    );
    await expect(row).toBeVisible();
    await page.unroute("**/teacher/questions/**");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Xác nhận", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByLabel("Trạng thái", { exact: true })
      .selectOption(action === "Lưu trữ" ? "archived" : "active");
    await expect(row).toBeVisible();
  }
  await page.route("**/question-banks?view=manage*", (r) => r.fulfill(fail));
  await page.getByRole("link", { name: "Câu hỏi", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Kiểm tra kết nối");
  await page.unroute("**/question-banks?view=manage*");
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Mở ngân hàng" }).first(),
  ).toBeVisible();
});

test("Dirty editor protects sidebar navigation and reload; saved editor has no false warning", async ({
  page,
}) => {
  await login(page);
  await bank(page, `TEST_DIRTY_${Date.now()}`);
  await newQuestion(page, "ESSAY", "Original saved question");
  await saved(page);
  await page
    .getByLabel("Nội dung câu hỏi", { exact: true })
    .fill("Unsaved edit");
  await page.getByRole("link", { name: "Câu hỏi", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Rời trang soạn thảo?" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByLabel("Nội dung câu hỏi", { exact: true }),
  ).toHaveValue("Unsaved edit");
  let warned = false;
  const dismissed = new Promise<void>((resolve) => {
    page.once("dialog", async (d) => {
      warned = d.type() === "beforeunload";
      await d.dismiss();
      resolve();
    });
  });
  await page.evaluate(() => {
    setTimeout(() => window.location.reload(), 0);
  });
  await dismissed;
  expect(warned).toBe(true);
  await expect(
    page.getByLabel("Nội dung câu hỏi", { exact: true }),
  ).toHaveValue("Unsaved edit");
  await page.getByRole("button", { name: "Lưu câu hỏi", exact: true }).click();
  await expect(page.locator(".qb-savebar")).toContainText("Đã lưu câu hỏi");
  let falseWarning = false;
  page.on("dialog", async (d) => {
    falseWarning = true;
    await d.accept();
  });
  await page.reload();
  expect(falseWarning).toBe(false);
  await expect(
    page.getByLabel("Nội dung câu hỏi", { exact: true }),
  ).toHaveValue("Unsaved edit");
  await page.getByRole("link", { name: "Hủy", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

for (const width of [1440, 820, 390]) {
  test(`Responsive real controls ${width}px: navigation, menu, keyboard, editor preview and dialogs`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page);
    const name = `TEST_RESP_${width}_${Date.now()}`;
    await bank(page, name);
    await newQuestion(
      page,
      "TRUE_FALSE",
      "Kiểm tra giao diện tiếng Việt ở kích thước màn hình khác nhau",
    );
    if (width <= 960) {
      await page.getByRole("tab", { name: "Soạn thảo", exact: true }).focus();
      await page.keyboard.press("ArrowRight");
      await expect(
        page.getByRole("tab", { name: "Xem trước", exact: true }),
      ).toBeFocused();
      await expect(page.locator(".qb-preview")).toBeVisible();
      await page.keyboard.press("Home");
      await expect(
        page.getByLabel("Nội dung câu hỏi", { exact: true }),
      ).toBeVisible();
    }
    await saved(page);
    await page
      .getByRole("button", { name: "Lưu trữ câu hỏi", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("button", { name: "Hủy", exact: true }),
    ).toBeFocused();
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press("Tab");
      expect(
        await dialog.evaluate((el) => el.contains(document.activeElement)),
      ).toBe(true);
    }
    const focused = page.locator(":focus");
    expect(
      await focused.evaluate((el) => getComputedStyle(el).outlineStyle),
    ).toBe("solid");
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Lưu trữ câu hỏi", exact: true }),
    ).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("link", { name: "Câu hỏi", exact: true }).click();
    await page.getByLabel("Tìm ngân hàng", { exact: true }).fill(name);
    const row = page.getByRole("row").filter({ hasText: name });
    await row.getByLabel(`Thao tác ${name}`, { exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(
      row.getByRole("button", { name: "Chỉnh sửa", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(
      row.getByLabel(`Thao tác ${name}`, { exact: true }),
    ).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390)
      await page.screenshot({
        path: "docs/screenshots/question-bank/after-mobile.png",
        fullPage: true,
      });
    await row.getByRole("link", { name: "Mở ngân hàng" }).click();
    await expect(
      page.getByRole("row").filter({ hasText: "Kiểm tra giao diện" }),
    ).toBeVisible();
  });
}

test("Pilot evidence: desktop screenshots and warm local performance samples", async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const name = `TEST_EVIDENCE_${Date.now()}`;
  await bank(page, name);
  await newQuestion(
    page,
    "SINGLE_CHOICE",
    "HTTP và Session: cookie HttpOnly bảo vệ thông tin nào?\n\nCho biểu thức $2^3 = 8$. Hãy chọn đáp án đúng.",
  );
  await page
    .getByLabel("Lựa chọn 1", { exact: true })
    .fill(
      "Session ID được trình duyệt gửi, JavaScript không đọc trực tiếp được.",
    );
  await page
    .getByLabel("Lựa chọn 2", { exact: true })
    .fill("Mọi dữ liệu trên server đều được mã hóa tự động.");
  await page
    .getByLabel("Thẻ phân loại", { exact: true })
    .fill("HTTP, Session, Bảo mật");
  await page
    .getByLabel("Lời giải", { exact: true })
    .fill(
      "**HttpOnly** giới hạn truy cập cookie từ JavaScript. Server vẫn kiểm tra session và quyền của người dùng.",
    );
  const samples: Record<
    "list" | "detail" | "search" | "save" | "uploadWorkflow",
    number[]
  > = {
    list: [],
    detail: [],
    search: [],
    save: [],
    uploadWorkflow: [],
  };
  const searchDom: number[] = [];
  const apiSamples: Record<string, number[]> = {
    list: [],
    detail: [],
    search: [],
    save: [],
    upload: [],
  };
  page.on("requestfinished", (req) => {
    const url = new URL(req.url()),
      timing = req.timing();
    if (timing.responseEnd < 0) return;
    let kind = "";
    if (
      /\/question-banks$/.test(url.pathname) &&
      url.searchParams.get("view") === "manage"
    )
      kind = "list";
    else if (/\/questions$/.test(url.pathname) && req.method() === "GET")
      kind = url.searchParams.get("search") ? "search" : "detail";
    else if (
      req.method() === "PATCH" &&
      /\/questions\/[^/]+$/.test(url.pathname)
    )
      kind = "save";
    else if (req.method() === "POST" && /\/assets$/.test(url.pathname))
      kind = "upload";
    if (kind) apiSamples[kind]!.push(Math.round(timing.responseEnd * 10) / 10);
  });
  await saved(page);
  const prompt = await page
    .getByLabel("Nội dung câu hỏi", { exact: true })
    .inputValue();
  for (let i = 0; i < 10; i++) {
    await page
      .getByLabel("Nội dung câu hỏi", { exact: true })
      .fill(`${prompt}\nMẫu ${i + 1}`);
    const t = performance.now();
    await page
      .getByRole("button", { name: "Lưu câu hỏi", exact: true })
      .click();
    await expect(page.locator(".qb-savebar")).toContainText("Đã lưu câu hỏi");
    samples.save.push(Math.round(performance.now() - t));
  }
  for (let i = 0; i < 5; i++) {
    if (i)
      await page.getByRole("button", { name: "Gỡ ảnh 1", exact: true }).click();
    await page
      .getByLabel("Chọn ảnh", { exact: true })
      .setInputFiles(await encodedImage(page, "image/png"));
    const t = performance.now();
    await page
      .getByRole("button", { name: "Lưu câu hỏi", exact: true })
      .click();
    await expect(page.locator(".qb-savebar")).toContainText(
      "Đã lưu câu hỏi và ảnh",
    );
    await expect
      .poll(() =>
        page
          .locator(".qb-preview img")
          .evaluate((el: HTMLImageElement) => el.naturalWidth),
      )
      .toBe(40);
    samples.uploadWorkflow.push(Math.round(performance.now() - t));
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/screenshots/question-bank/after-editor.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Hủy", exact: true }).click();
  await page.screenshot({
    path: "docs/screenshots/question-bank/after-detail.png",
    fullPage: true,
  });
  for (let i = 0; i < 10; i++) {
    let t = performance.now();
    await page.getByRole("link", { name: "Câu hỏi", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Mở ngân hàng" }).first(),
    ).toBeVisible();
    samples.list.push(Math.round(performance.now() - t));
    t = performance.now();
    await page
      .getByRole("row")
      .filter({ hasText: name })
      .getByRole("link", { name: "Mở ngân hàng" })
      .click();
    await expect(
      page.getByRole("row").filter({ hasText: "HTTP và Session" }),
    ).toBeVisible();
    samples.detail.push(Math.round(performance.now() - t));
    await page.evaluate(() => {
      const state = window as typeof window & {
        searchMeasure?: Promise<number>;
      };
      state.searchMeasure = new Promise((resolve) => {
        document.querySelector('input[type="search"]')!.addEventListener(
          "input",
          () => {
            const started = performance.now();
            const observer = new MutationObserver(() => {
              if (
                !document.querySelector(".qb-loading") &&
                document
                  .querySelector("tbody")
                  ?.textContent?.includes("HTTP và Session")
              ) {
                observer.disconnect();
                requestAnimationFrame(() =>
                  resolve(Math.round(performance.now() - started)),
                );
              }
            });
            observer.observe(document.querySelector("main")!, {
              childList: true,
              subtree: true,
            });
          },
          { once: true },
        );
      });
    });
    t = performance.now();
    await page
      .getByLabel("Tìm câu hỏi", { exact: true })
      .fill(i % 2 ? "Session" : "HTTP");
    await expect(
      page.getByRole("row").filter({ hasText: "HTTP và Session" }),
    ).toBeVisible();
    samples.search.push(Math.round(performance.now() - t));
    searchDom.push(
      await page.evaluate(
        () =>
          (window as typeof window & { searchMeasure: Promise<number> })
            .searchMeasure,
      ),
    );
  }
  await page.getByRole("button", { name: "Lưu trữ", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Xác nhận", exact: true })
    .click();
  await page.getByLabel("Trạng thái", { exact: true }).selectOption("archived");
  await expect(
    page.getByRole("button", { name: "Khôi phục", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/question-bank/after-archived.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Câu hỏi", exact: true }).click();
  await page.getByLabel("Tìm ngân hàng", { exact: true }).fill("Công nghệ");
  await expect(
    page.getByRole("link", { name: "Mở ngân hàng" }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/question-bank/after-list-desktop.png",
    fullPage: true,
  });
  const summary = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b),
      n = sorted.length;
    return {
      n,
      min: sorted[0],
      median: n
        ? (sorted[Math.floor((n - 1) / 2)]! + sorted[Math.floor(n / 2)]!) / 2
        : null,
      max: sorted[n - 1],
    };
  };
  await writeFile(
    "docs/ux/question-bank-performance.json",
    JSON.stringify(
      {
        environment:
          "Vite dev + isolated loopback PostgreSQL 16 + local Storage HTTP double; warm Query cache; action/assertion overhead included; no Supabase timing",
        browser: browserName,
        viewport: "1440x1000",
        samples,
        searchDom,
        searchDomSummary: summary(searchDom),
        summary: Object.fromEntries(
          Object.entries(samples).map(([k, v]) => [k, summary(v)]),
        ),
        apiSamples,
        apiSummary: Object.fromEntries(
          Object.entries(apiSamples).map(([k, v]) => [k, summary(v)]),
        ),
      },
      null,
      2,
    ) + "\n",
  );
});
