import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import {
  gradingFixture,
  gradingPassword,
  signIn,
  assertNoOverflow,
} from "./grading-results-fixtures";
import { resultHistoryFixture } from "./grading-results-rollout-fixtures";
const root = process.env.GRADING_SCREENSHOT_DIR || "/tmp/grading-rollout/after";
const failure = {
  status: 503,
  contentType: "application/json",
  body: '{"error":{"message":"Tạm thời không tải được dữ liệu."}}',
};

test("grading, lookahead, exam context, results and analytics retry the failed request", async ({
  page,
}) => {
  const f = await gradingFixture(30);
  await signIn(page, "teacher");
  await page.route("**/grading?page=1&pageSize=20", (r) => r.fulfill(failure));
  await page.goto(`/teacher/exams/${f.exam.id}/grading`);
  await expect(page.getByRole("alert")).toHaveText(
    "Tạm thời không tải được dữ liệu.",
  );
  await page.unroute("**/grading?page=1&pageSize=20");
  await page.route("**/grading?page=2&pageSize=20", (r) => r.fulfill(failure));
  await page.getByRole("button", { name: "Thử lại" }).click();
  await expect(page.locator(".marking-submission")).toHaveCount(20);
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("spinbutton").first().fill("2");
  await page.unroute("**/grading?page=2&pageSize=20");
  await page.getByRole("button", { name: "Thử lại" }).click();
  await expect(page.getByRole("button", { name: "Trang sau" })).toBeEnabled();
  await page.getByRole("button", { name: "Trang sau" }).click();
  await expect(page.locator(".marking-submission")).toHaveCount(10);
  await page.getByRole("button", { name: "Trang trước" }).click();
  await expect(page.getByRole("spinbutton").first()).toHaveValue("2");
  await page.getByRole("spinbutton").first().fill("");
  for (const [suffix, region] of [
    [f.exam.id, "context"],
    ["results?page=1", "results"],
    ["analytics", "analytics"],
  ] as const) {
    const pattern =
      region === "context"
        ? `**/teacher/exams/${f.exam.id}`
        : `**/teacher/exams/${f.exam.id}/${suffix}`;
    await page.route(pattern, (r) => r.fulfill(failure));
    await page.goto(`/teacher/exams/${f.exam.id}/results`);
    if (region === "analytics")
      await page.locator(".record-analysis > summary").click();
    await expect(page.getByRole("alert")).toBeVisible();
    await mkdir(root, { recursive: true });
    await page.screenshot({ path: `${root}/retry-${region}.png` });
    await page.unroute(pattern);
    await page.getByRole("button", { name: "Thử lại" }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    if (region === "context")
      await expect(
        page.getByRole("heading", { name: f.exam.title }),
      ).toBeVisible();
    if (region === "results")
      await expect(page.locator("tbody tr")).toHaveCount(20);
    if (region === "analytics")
      await expect(
        page.getByRole("heading", { name: "Phân bố điểm" }),
      ).toBeVisible();
  }
  await page.goto(`/teacher/exams/${f.exam.id}/grading?page=9`);
  await expect(page.getByText("Chưa có bài đã nộp để chấm.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Trang sau" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Trang trước" })).toBeEnabled();
});

test("student history and detail loading/error recover without exposing cached protected details", async ({
  page,
}) => {
  const f = await resultHistoryFixture(25);
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(f.user.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(gradingPassword());
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL("/student");
  await page.route("**/student/exams?page=1&pageSize=20", (r) =>
    r.fulfill(failure),
  );
  await page.goto("/student/results");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.unroute("**/student/exams?page=1&pageSize=20");
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/student/exams?page=1&pageSize=20", async (r) => {
    await held;
    await r.continue();
  });
  await page.getByRole("button", { name: "Thử lại" }).click();
  await expect(page.getByText("Đang tải…", { exact: true })).toBeVisible();
  release();
  await expect(page.locator(".student-result-link")).toHaveCount(20);
  await page.unroute("**/student/exams?page=1&pageSize=20");
  await page.getByRole("button", { name: "Trang sau" }).click();
  await page.locator(".student-result-link").last().click();
  await expect(page.getByText("Nhận xét đã công bố")).toBeVisible();
  await page
    .getByRole("link", { name: "Kết quả của tôi", exact: true })
    .click();
  const path = `**/student/exams/${f.exams[24]!.id}/results`;
  await page.route(path, (r) => r.fulfill(failure));
  await page.locator(".student-result-link").last().click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".student-score-line")).toHaveCount(0);
  await expect(page.getByText("Nhận xét đã công bố")).toHaveCount(0);
  await assertNoOverflow(page);
  await mkdir(root, { recursive: true });
  await page.screenshot({ path: `${root}/student-retry-320.png` });
  await page.unroute(path);
  await page.getByRole("button", { name: "Thử lại" }).click();
  await expect(page.getByText("Nhận xét đã công bố")).toBeVisible();
});

for (const width of [1440, 1024, 820, 390, 320]) {
  test(`dirty dialog keyboard, focus restoration and overflow ${width}`, async ({
    page,
  }) => {
    const f = await gradingFixture(1);
    await page.setViewportSize({ width, height: 1000 });
    await signIn(page, "teacher");
    await page.goto(`/teacher/exams/${f.exam.id}/grading`);
    const score = page.getByRole("spinbutton");
    await score.fill("2");
    const link = page.getByRole("link", { name: "Kết quả & công bố →" });
    await link.click();
    const dialog = page.getByRole("dialog");
    const stay = dialog.getByRole("button", { name: "Ở lại chấm bài" });
    const leave = dialog.getByRole("button", {
      name: "Rời trang, bỏ thay đổi",
    });
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(16);
    expect(bounds.y).toBeGreaterThanOrEqual(16);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(984);
    await expect(stay).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(leave).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(stay).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(leave).toBeFocused();
    await assertNoOverflow(page);
    await mkdir(root, { recursive: true });
    await page.screenshot({ path: `${root}/dirty-dialog-${width}.png` });
    await page.keyboard.press("Escape");
    await expect(link).toBeFocused();
    await expect(score).toHaveValue("2");
    await score.fill("");
    await expect(page.locator(".record-draft-summary")).toHaveCount(0);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/exams/${f.exam.id}/results$`));
  });
}

import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

test("exports retry, have correct filenames and MIME, and retain full exam scope on page two", async ({
  page,
}) => {
  const f = await gradingFixture();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, "teacher");
  await page.goto(`/teacher/exams/${f.exam.id}/results`);
  await page.getByRole("button", { name: "Sau", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await mkdir(root, { recursive: true });
  await page.screenshot({ path: `${root}/results-page2-1440.png` });
  const studentName = await page
    .locator("tbody tr th strong")
    .first()
    .innerText();
  for (const format of ["xlsx", "pdf"] as const) {
    const pattern = format === "xlsx" ? "**/export.xlsx" : "**/result.pdf";
    const action =
      format === "xlsx"
        ? page.getByRole("button", { name: "Xuất Excel" })
        : page.getByRole("button", { name: /^Tải PDF/ }).first();
    await page.route(pattern, (r) => r.fulfill(failure), { times: 1 });
    await action.click();
    await expect(page.getByRole("alert")).toHaveText("Không thể xuất báo cáo.");
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith(format === "xlsx" ? "/export.xlsx" : "/result.pdf") &&
        r.status() === 200,
    );
    const downloading = page.waitForEvent("download");
    await action.click();
    const file = await downloading;
    expect(file.suggestedFilename()).toBe(
      format === "xlsx" ? "ket-qua.xlsx" : "phieu-ket-qua.pdf",
    );
    expect(await file.failure()).toBeNull();
    const headers = (await response).headers();
    expect(headers["content-type"]).toContain(
      format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/pdf",
    );
    const bytes = await readFile((await file.path())!);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    if (format === "xlsx") {
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);
      const sheet = book.getWorksheet("Results")!;
      expect(sheet.rowCount).toBe(25); // all 24 assigned students, not just the current four
      expect(sheet.getColumn("C").values).toContain(f.student.fullName);
      expect(sheet.getColumn("C").values).toContain(studentName);
      expect(book.getWorksheet("Attempts")!.rowCount).toBe(23);
    } else {
      const text = execFileSync("pdftotext", [(await file.path())!, "-"], {
        encoding: "utf8",
      });
      expect(text).toContain(studentName);
      expect(text).toContain(f.exam.title);
      expect(text).toContain("Lượt được tính:");
    }
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
});

test("empty grading uses the real endpoint and has no false next page", async ({
  page,
}) => {
  const f = await gradingFixture(0);
  await signIn(page, "teacher");
  await page.goto(`/teacher/exams/${f.exam.id}/grading`);
  await expect(page.getByText("Chưa có bài đã nộp để chấm.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Trang trước" }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Trang sau" })).toBeDisabled();
});
