import { test, expect } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createDb } from "../../apps/api/src/db/client";
import {
  gradingFixture,
  signIn,
  setRelease,
  assertNoOverflow,
  base,
  database,
} from "./grading-results-fixtures";

const root = process.env.GRADING_SCREENSHOT_DIR || "/tmp/grading-results-after";
for (const width of [1440, 1024, 820, 390, 320]) {
  test(`grading/results real workflow and responsive ${width}`, async ({
    page,
  }) => {
    await mkdir(root, { recursive: true });
    const f = await gradingFixture();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 1000 });
    await signIn(page, "teacher");
    const evidence: unknown[] = [];
    async function shot(name: string) {
      await page.evaluate(() => document.fonts.ready);
      await assertNoOverflow(page);
      evidence.push({
        name,
        width,
        route: new URL(page.url()).pathname,
        ...(await page.evaluate(() => ({
          pageWidth: document.documentElement.scrollWidth,
          tableTop: document.querySelector("table")?.getBoundingClientRect()
            .top,
        }))),
      });
      await page.screenshot({
        path: `${root}/${name}-${width}.png`,
        animations: "disabled",
      });
    }
    await page.goto(`/teacher/exams/${f.exam.id}/grading`);
    await expect(
      page.getByRole("heading", { name: f.exam.title }),
    ).toBeVisible();
    const submission = page.locator(".marking-submission").first();
    const form = submission.locator("form");
    await expect(form.getByRole("spinbutton")).toBeVisible();
    await submission.locator("summary").click();
    await expect(form).not.toBeVisible();
    await shot("grading-entry");
    await submission.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(form).toBeVisible();
    await expect(form).toContainText("HTTP không tự ghi nhớ người dùng");
    await shot("grading-workspace");
    await submission.screenshot({
      path: `${root}/grading-detail-${width}.png`,
      animations: "disabled",
    });
    const score = form.getByRole("spinbutton");
    for (const value of ["4", "-1", "2.555", ""]) {
      await score.fill(value);
      expect(
        await score.evaluate((el: HTMLInputElement) => el.checkValidity()),
      ).toBe(false);
    }
    await score.fill("2.5");
    await score.focus();
    expect(await score.evaluate((e) => getComputedStyle(e).outlineWidth)).toBe(
      "3px",
    );
    await page.keyboard.press("Tab");
    await expect(
      form.getByRole("textbox", { name: "Nhận xét", exact: true }),
    ).toBeFocused();
    await form
      .getByRole("textbox", { name: "Nhận xét", exact: true })
      .fill("Lập luận rõ; bổ sung cơ chế hết hạn phiên.");
    await expect(form.getByRole("status")).toHaveText("Có thay đổi chưa lưu");
    // Hold the real PUT to verify pending state, duplicate prevention and disabled fields.
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      "**/teacher/answers/*/grade",
      async (route) => {
        await held;
        await route.continue();
      },
      { times: 1 },
    );
    await form.getByRole("button", { name: "Lưu điểm" }).click();
    await expect(score).toBeDisabled();
    await expect(form.getByRole("status")).toHaveText("Đang lưu điểm…");
    release();
    await expect(form.getByRole("status")).toHaveText("Đã lưu điểm");
    await expect(submission.locator("summary")).toContainText("Đã chấm");
    // Regression: baseline kept its success message after editing a saved score.
    await score.fill("2");
    await expect(form.getByRole("status")).toHaveText("Có thay đổi chưa lưu");
    await page.route(
      "**/teacher/answers/*/grade",
      (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "TEST_SAVE_FAILURE",
              message: "Không thể lưu điểm lúc này.",
            },
          }),
        }),
      { times: 1 },
    );
    await form.getByRole("button", { name: "Lưu điểm" }).click();
    await expect(form.getByRole("alert")).toHaveText(
      "Không thể lưu điểm lúc này.",
    );
    await expect(form.getByRole("status")).toHaveText(
      "Chưa lưu được. Vui lòng thử lại.",
    );
    await form.locator(".marking-score").scrollIntoViewIfNeeded();
    await shot("grading-error");
    await form.getByRole("button", { name: "Lưu điểm" }).click();
    await expect(form.getByRole("status")).toHaveText("Đã lưu điểm");
    await expect(form.getByRole("alert")).toHaveCount(0);
    await shot("grading-saved");
    await form
      .locator(".marking-score")
      .screenshot({ path: `${root}/score-panel-${width}.png` });
    await page.reload();
    await expect(page.getByRole("spinbutton").first()).toHaveValue("2");
    await expect(
      page.getByRole("textbox", { name: "Nhận xét", exact: true }).first(),
    ).toHaveValue("Lập luận rõ; bổ sung cơ chế hết hạn phiên.");
    // A second record retains its own persisted score after opening/closing the first.
    const second = page.locator(".marking-submission").nth(1);
    await second.locator("summary").click();
    await expect(second.getByRole("spinbutton")).toHaveValue("0.5");
    await expect(page.getByRole("spinbutton").first()).toHaveValue("2");
    await page.goto(`/teacher/exams/${f.exam.id}/results`);
    await expect(
      page.getByRole("heading", { name: "Danh sách kết quả" }),
    ).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(20);
    await expect(page.locator(".record-release")).toContainText("Chưa công bố");
    await shot("teacher-results");
    if (width === 390) {
      await expect(
        page.getByRole("list", { name: "Kết quả từng sinh viên" }),
      ).toBeVisible();
      await page.locator(".record-mobile-results").scrollIntoViewIfNeeded();
      await shot("results-records");
    }
    const tableRegion = page.getByRole("region", { name: /Bảng kết quả/ });
    if (width > 600 && width < 1000) {
      await tableRegion.focus();
      await page.keyboard.press("End");
      await tableRegion.evaluate((e) => {
        e.scrollLeft = e.scrollWidth;
      });
      expect(await tableRegion.evaluate((e) => e.scrollLeft)).toBeGreaterThan(
        0,
      );
      await shot("results-scroll");
      await tableRegion.evaluate((e) => {
        e.scrollLeft = 0;
      });
    }
    await page.getByRole("button", { name: "Sau", exact: true }).click();
    await expect(page.locator("tbody tr")).toHaveCount(4);
    await expect(page.locator("tbody")).toContainText("Chưa thi");
    await page.getByRole("button", { name: "Trước", exact: true }).click();
    await expect(page.locator("tbody tr")).toHaveCount(20);
    for (const [name, signature] of [
      ["Xuất Excel", "PK"],
      ["Tải PDF", "%PDF"],
    ] as const) {
      const event = page.waitForEvent("download");
      await page
        .getByRole("button", { name: new RegExp(`^${name}`) })
        .first()
        .click();
      const file = await event;
      expect(await file.failure()).toBeNull();
      const bytes = await readFile((await file.path())!);
      expect(bytes.subarray(0, signature.length).toString()).toBe(signature);
    }
    await page.locator(".record-analysis > summary").click();
    await expect(
      page.getByRole("heading", { name: "Phân bố điểm" }),
    ).toBeVisible();
    await page.locator(".record-analysis").scrollIntoViewIfNeeded();
    await shot("analytics");
    await page
      .getByRole("button", { name: "Công bố kết quả", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Công bố kết quả", exact: true }),
    ).toBeFocused();
    // Pending student state uses a real pending attempt from DB, not a fabricated response.
    await page.getByRole("button", { name: "Đăng xuất" }).click();
    await signIn(page, "student");
    const db = createDb(database);
    try {
      const a = f.attempts[0]!;
      const essayAnswer = a.questions.find((q) => q.answer?.answerText)?.answer;
      await db.attemptAnswer.update({
        where: { id: essayAnswer!.id },
        data: { manualScore: null, feedback: null },
      });
      await db.examAttempt.update({
        where: { id: a.id },
        data: {
          status: "PENDING_MANUAL_GRADING",
          manualScore: 0,
          totalScore: null,
        },
      });
      await page.goto(`/student/results/${f.exam.id}`);
      await expect(
        page.getByText("Đã nộp · Đang chờ chấm tự luận"),
      ).toBeVisible();
      await expect(page.locator(".student-score-line")).toHaveCount(0);
      await shot("student-pending");
      await db.attemptAnswer.update({
        where: { id: essayAnswer!.id },
        data: {
          manualScore: 2,
          feedback: "Lập luận rõ; bổ sung cơ chế hết hạn phiên.",
        },
      });
      await db.examAttempt.update({
        where: { id: a.id },
        data: { status: "GRADED", manualScore: 2, totalScore: 4 },
      });
    } finally {
      await db.$disconnect();
    }
    await page.reload();
    await expect(page.getByText("Đã nộp · Kết quả chưa công bố")).toBeVisible();
    await expect(page.locator(".student-question-record")).toHaveCount(0);
    await expect(page.locator(".student-score-line")).toHaveCount(0);
    const hidden = await (
      await page.request.get(`${base}/student/exams/${f.exam.id}/results`)
    ).json();
    expect(hidden.data.attempts[0]).not.toHaveProperty("totalScore");
    expect(hidden.data.attempts[0]).not.toHaveProperty("questions");
    await shot("student-hidden");
    await setRelease(f.exam.id, true);
    await page.reload();
    await expect(page.locator(".student-score-line")).toContainText("4 / 6");
    await expect(page.locator(".student-question-record")).toHaveCount(4);
    await expect(
      page.getByText("Lập luận rõ; bổ sung cơ chế hết hạn phiên."),
    ).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot("student-released");
    await page
      .locator(".student-question-record")
      .nth(2)
      .scrollIntoViewIfNeeded();
    await shot("student-feedback");
    await page.goto("/student/results");
    await expect(
      page.getByRole("heading", { name: "Kết quả của tôi" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("link", {
          name: new RegExp(f.exam.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        })
        .first(),
    ).toBeVisible();
    await shot("student-entry");
    expect(errors).toEqual([]);
    await writeFile(
      `${root}/evidence-${width}.json`,
      JSON.stringify({ evidence, pageErrors: errors }, null, 2),
    );
  });
}

test("release action, export errors, data errors, empty and loading states", async ({
  page,
}) => {
  const f = await gradingFixture();
  await signIn(page, "teacher");
  await page.goto(`/teacher/exams/${f.exam.id}/results`);
  await page
    .getByRole("button", { name: "Công bố kết quả", exact: true })
    .click();
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Đã công bố kết quả cho các lượt đã chấm xong.",
  );
  await expect(page.locator(".record-release")).toContainText("Đã công bố");
  await page.route(
    "**/export.xlsx",
    (r) => r.fulfill({ status: 500, body: "test failure" }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Xuất Excel" }).click();
  await expect(page.getByRole("alert")).toHaveText("Không thể xuất báo cáo.");
  await page.route("**/grading?page=1&pageSize=20", (r) =>
    r.fulfill({ contentType: "application/json", body: '{"data":[]}' }),
  );
  await page.goto(`/teacher/exams/${f.exam.id}/grading`);
  await expect(page.getByText("Chưa có bài đã nộp để chấm.")).toBeVisible();
  await page.unroute("**/grading?page=1&pageSize=20");
  await page.route("**/grading?page=1&pageSize=20", (r) =>
    r.fulfill({
      status: 500,
      contentType: "application/json",
      body: '{"error":{"message":"Không tải được bài nộp."}}',
    }),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toHaveText("Không tải được bài nộp.");
  await page.unroute("**/grading?page=1&pageSize=20");
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/grading?page=1&pageSize=20", async (r) => {
    await held;
    await r.continue();
  });
  await page.reload();
  await expect(page.getByRole("status")).toHaveText("Đang tải…");
  release();
  await expect(page.getByRole("spinbutton").first()).toBeVisible();
  await page.unroute("**/grading?page=1&pageSize=20");
  await page.route("**/results?page=1", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: '{"data":{"items":[],"total":0}}',
    }),
  );
  await page.goto(`/teacher/exams/${f.exam.id}/results`);
  await expect(
    page.getByText("Chưa có sinh viên trong danh sách kết quả."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await signIn(page, "student");
  await page.route("**/student/exams?page=1&pageSize=20", (r) =>
    r.fulfill({ contentType: "application/json", body: '{"data":[]}' }),
  );
  await page.goto("/student/results");
  await expect(
    page.getByText("Chưa có bài thi trong danh sách kết quả."),
  ).toBeVisible();
  await page.route(`**/student/exams/${f.exam.id}/results`, (r) =>
    r.fulfill({
      status: 403,
      contentType: "application/json",
      body: '{"error":{"message":"Bạn không có quyền xem kết quả này."}}',
    }),
  );
  await page.goto(`/student/results/${f.exam.id}`);
  await expect(page.getByRole("alert")).toHaveText(
    "Bạn không có quyền xem kết quả này.",
  );
  await expect(page.locator(".student-score-line")).toHaveCount(0);
});

test("long content, touch targets, contrast and role guards", async ({
  page,
}) => {
  const f = await gradingFixture();
  const db = createDb(database);
  const title =
    "Công nghệ Web và Dịch vụ trực tuyến · Bài đánh giá giữa học kỳ về quản lý phiên đăng nhập, phân quyền và bảo vệ dữ liệu người dùng";
  try {
    await db.exam.update({ where: { id: f.exam.id }, data: { title } });
    const essay = f.attempts[0]!.questions.find((q) => q.answer?.answerText)!;
    await db.attemptQuestion.update({
      where: { id: essay.id },
      data: {
        snapshotJson: {
          ...(essay.snapshotJson as object),
          promptMarkdown:
            "Phân tích đoạn mã và công thức sau.\n\n```js\nconst sessionIdentifier = 'Một chuỗi rất dài để kiểm tra rằng vùng code sở hữu cuộn ngang riêng và không kéo giãn toàn bộ trang chấm điểm trên điện thoại';\n```\n\n$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$\n\n| Thành phần | Vai trò |\n| --- | --- |\n| Cookie | Truyền định danh phiên |",
        },
      },
    });
    await db.attemptAnswer.update({
      where: { id: essay.answer!.id },
      data: {
        answerText:
          "Nội dung bài làm có xuống dòng.\n\n" +
          "Một đoạn trả lời dài giúp kiểm tra độ rộng đọc và điều khiển chấm điểm. ".repeat(
            100,
          ),
      },
    });
  } finally {
    await db.$disconnect();
  }
  await signIn(page, "teacher");
  for (const width of [1440, 1024, 820, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/teacher/exams/${f.exam.id}/grading`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.locator(".marking-prompt pre").first()).toBeVisible();
    await assertNoOverflow(page);
    await mkdir(root, { recursive: true });
    await page.screenshot({ path: `${root}/long-grading-${width}.png` });
    const pre = page.locator(".marking-prompt pre").first();
    await pre.evaluate((e) => {
      e.scrollLeft = 200;
    });
    expect(await pre.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
    for (const control of await page
      .locator(
        ".record-page button:visible, .record-page input:visible, .record-page textarea:visible",
      )
      .all()) {
      const box = (await control.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    if (width === 390) {
      await page
        .locator(".record-answer")
        .first()
        .evaluate((el) =>
          window.scrollTo(
            0,
            window.scrollY + el.getBoundingClientRect().top - 80,
          ),
        );
      await page.screenshot({ path: `${root}/long-answer-${width}.png` });
    }
    await page.getByRole("spinbutton").first().focus();
    expect(
      await page
        .getByRole("spinbutton")
        .first()
        .evaluate((e) => getComputedStyle(e).outlineWidth),
    ).toBe("3px");
  }
  const styles = await page
    .locator(".marking-score button")
    .first()
    .evaluate((e) => ({
      color: getComputedStyle(e).color,
      background: getComputedStyle(e).backgroundColor,
    }));
  const luminance = (color: string) =>
    color
      .match(/\d+/g)!
      .slice(0, 3)
      .map(Number)
      .map((n) => {
        const c = n / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i]!, 0);
  const a = luminance(styles.color),
    b = luminance(styles.background);
  expect(
    (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
  ).toBeGreaterThanOrEqual(4.5);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".marking-score button")
      .first()
      .evaluate((e) => getComputedStyle(e).transitionDuration),
  ).toBe("0s");
  await page.goto(`/student/results/${f.exam.id}`);
  await page.waitForURL("/403");
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await signIn(page, "student");
  await page.goto(`/teacher/exams/${f.exam.id}/grading`);
  await page.waitForURL("/403");
});
