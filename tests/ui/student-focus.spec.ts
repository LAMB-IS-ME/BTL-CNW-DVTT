import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createDb } from "../../apps/api/src/db/client";
import {
  fixture,
  login,
  index,
  base,
  database,
} from "./student-focus-fixtures";

const before = process.env.FOCUS_PHASE === "before";
const root =
  process.env.FOCUS_SCREENSHOT_DIR ||
  `/tmp/focus-${before ? "before" : "after"}`;
const time = (s: string) =>
  s.split(":").reduce((a, n) => a * 60 + Number(n), 0);
for (const [device, width] of [
  ["desktop", 1440],
  ["tablet", 820],
  ["mobile", 390],
] as const) {
  test(`Focus Desk: real attempt, persistence and responsive ${device}`, async ({
    page,
  }) => {
    const exam = await fixture();
    await mkdir(root, { recursive: true });
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      // /auth/me intentionally returns 401 before login; retain every other error.
      if (
        m.type() === "error" &&
        !(m.location().url === `${base}/auth/me` && m.text().includes("401"))
      )
        errors.push(m.text());
    });
    const geometry: unknown[] = [];
    async function shot(name: string, modal = false) {
      await page.evaluate(() => document.fonts.ready);
      if (!modal) await page.evaluate(() => window.scrollTo(0, 0));
      await page.mouse.move(0, 0);
      const data = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        headerHeight: document.querySelector("header")?.getBoundingClientRect()
          .height,
        questionTop: document
          .querySelector(".focus-question, .attempt-layout > section")
          ?.getBoundingClientRect().top,
      }));
      geometry.push({ name, ...data });
      if (!before) expect(data.overflow, name).toBe(false);
      await page.screenshot({
        path: `${root}/${name}-${device}.png`,
        fullPage: !modal,
        animations: "disabled",
      });
    }
    await login(page);
    await page.goto(`/student/exams/${exam.id}`);
    await expect(
      page.getByRole("button", { name: "Bắt đầu làm bài" }),
    ).toBeVisible();
    await shot("entry");
    await page.getByRole("button", { name: "Bắt đầu làm bài" }).click();
    await expect(page.getByLabel("Thời gian còn lại")).toBeVisible();
    const attemptUrl = page.url();
    const timerBefore = time(
      (await page.getByLabel("Thời gian còn lại").innerText()).trim(),
    );
    await shot("question");
    await page.getByRole("radio").nth(1).check();
    await expect(page.getByRole("status")).toHaveText("Đã lưu");
    await page.getByRole("radio").first().focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("radio").first()).toBeChecked();
    if (!before)
      expect(
        await page
          .getByRole("radio")
          .first()
          .evaluate((el) => getComputedStyle(el).outlineWidth),
      ).toBe("3px");
    await expect(page.getByRole("status")).toHaveText("Đã lưu");
    await shot("selected");
    await page.reload();
    await expect(page.getByRole("radio").first()).toBeChecked();
    const timerAfter = time(
      (await page.getByLabel("Thời gian còn lại").innerText()).trim(),
    );
    expect(timerAfter).toBeLessThanOrEqual(timerBefore);
    expect(timerBefore - timerAfter).toBeLessThan(20);
    await page.getByRole("button", { name: "Câu tiếp", exact: true }).click();
    await page.getByRole("checkbox", { name: "GET", exact: true }).check();
    await page.getByRole("checkbox", { name: "PUT", exact: true }).check();
    await page.getByRole("checkbox", { name: "DELETE", exact: true }).check();
    await page.getByRole("checkbox", { name: "PUT", exact: true }).uncheck();
    await expect(page.getByRole("status")).toHaveText("Đã lưu");
    await shot("multiple");
    await page.getByRole("button", { name: "Câu tiếp", exact: true }).focus();
    await page.keyboard.press("Enter");
    await page
      .getByLabel("Bài làm tự luận")
      .fill(
        "HTTP là giao thức stateless. Server tạo một session sau khi xác thực thành công và gửi session ID qua cookie HttpOnly.\n\nỞ các request tiếp theo, trình duyệt gửi cookie; server tra cứu session để xác định người dùng. Thuộc tính Secure giúp cookie chỉ được gửi qua HTTPS.",
      );
    await expect(page.getByRole("status")).toHaveText("Đã lưu");
    await shot("essay");
    await page.reload();
    await index(page, 2);
    await expect(
      page.getByRole("checkbox", { name: "GET", exact: true }),
    ).toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: "PUT", exact: true }),
    ).not.toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: "DELETE", exact: true }),
    ).toBeChecked();
    await index(page, 3);
    await expect(page.getByLabel("Bài làm tự luận")).toHaveValue(
      /HTTP là giao thức stateless/,
    );
    await index(page, 4);
    await page.getByRole("radio", { name: "Đúng", exact: true }).check();
    await expect(page.getByRole("status")).toHaveText("Đã lưu");
    await index(page, 5);
    await shot("rich-content");
    if (!before) {
      await index(page, 1);
      const toggle = page.getByRole("button", { name: /Mục lục câu hỏi/ });
      if (await toggle.isVisible()) await toggle.click();
      await expect(
        page.getByRole("button", { name: "Câu 1", exact: true }),
      ).toHaveAttribute("data-answered", "true");
      await expect(
        page.getByRole("button", { name: "Câu 30", exact: true }),
      ).toHaveAttribute("data-answered", "false");
      await shot("navigation");
      const targets = await page
        .locator(
          ".focus-index button, .focus-paging button, .focus-submit > button",
        )
        .evaluateAll((els) =>
          els
            .filter((el) => el.getBoundingClientRect().height)
            .map((el) => ({
              width: el.getBoundingClientRect().width,
              height: el.getBoundingClientRect().height,
            })),
        );
      for (const target of targets) {
        expect(target.height).toBeGreaterThanOrEqual(44);
        expect(target.width).toBeGreaterThanOrEqual(44);
      }
    }
    await index(page, 30);
    await expect(
      page.getByRole("button", { name: "Câu tiếp", exact: true }),
    ).toBeDisabled();
    await index(page, 1);
    await page.getByRole("button", { name: "Nộp bài", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await shot("confirmation", true);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Nộp bài", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Hủy", exact: true })
      .click();
    await page.getByRole("button", { name: "Nộp bài", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Xác nhận", exact: true })
      .click();
    await expect(
      page.getByText("Đã nộp · Đang chờ chấm tự luận"),
    ).toBeVisible();
    await page.goto(attemptUrl);
    await expect(
      page.getByRole("heading", { name: "Đã nộp bài thành công" }),
    ).toBeVisible();
    await shot("submitted");
    expect(errors).toEqual([]);
    await writeFile(
      `${root}/geometry-${device}.json`,
      JSON.stringify(geometry, null, 2),
    );
  });
}

test("Focus Desk: save retry, real reconnect, pending flush and submit retry", async ({
  page,
  context,
}) => {
  test.skip(
    before,
    "Fault injection verification after the baseline inventory.",
  );
  const exam = await fixture();
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page);
  await page.goto(`/student/exams/${exam.id}`);
  await page.getByRole("button", { name: "Bắt đầu làm bài" }).click();
  await expect(page.getByLabel("Thời gian còn lại")).toBeVisible();
  const attemptUrl = page.url();
  const answerPath = "**/student/attempts/*/answers/*";
  let saves = 0;
  await page.route(answerPath, (route) => {
    saves++;
    return route.fulfill({
      status: 503,
      json: {
        error: {
          code: "UNAVAILABLE",
          message: "Không thể lưu đáp án. Kết nối tạm thời gián đoạn.",
        },
      },
    });
  });
  await page.getByRole("radio").first().check();
  await expect(page.getByRole("status")).toHaveText("Đang lưu…");
  await expect(page.getByRole("status")).toHaveText("Lỗi lưu");
  await expect(page.locator(".focus-save")).toContainText(
    "Thay đổi chưa được lưu.",
  );
  await expect(page.locator(".focus-save")).not.toContainText(
    "Đáp án được lưu tự động.",
  );
  expect(saves).toBe(3);
  await expect(page.getByRole("alert")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${root}/save-error-mobile.png`,
    fullPage: true,
  });
  await page.unroute(answerPath);
  await page.getByRole("button", { name: "Thử lưu lại" }).click();
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".focus-save")).toContainText(
    "Đáp án được lưu tự động.",
  );
  await expect(page.locator(".focus-save")).not.toContainText(
    "Thay đổi chưa được lưu.",
  );
  await page.reload();
  await expect(page.getByRole("radio").first()).toBeChecked();
  await context.setOffline(true);
  await page.getByRole("radio").nth(1).check();
  await expect(page.getByRole("status")).toHaveText("Lỗi lưu");
  await context.setOffline(false);
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  await page.reload();
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
  const submitPath = "**/student/attempts/*/submit";
  await page.route(submitPath, (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: {
          code: "UNAVAILABLE",
          message: "Không thể nộp bài. Hãy thử lại.",
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Nộp bài", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Hủy", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Xác nhận", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("alert")).toHaveText(
    "Không thể nộp bài. Hãy thử lại.",
  );
  await expect(
    dialog.getByRole("button", { name: "Xác nhận", exact: true }),
  ).toBeEnabled();
  await page.unroute(submitPath);
  await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
  await index(page, 3);
  // Submit immediately after editing: the existing flush must persist this text.
  await page
    .getByLabel("Bài làm tự luận")
    .fill("Đáp án cuối cùng trước khi nộp.");
  await page.getByRole("button", { name: "Nộp bài", exact: true }).click();
  let submits = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(submitPath, async (route) => {
    submits++;
    await gate;
    await route.continue();
  });
  await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Đang nộp…" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  release();
  await expect(page.getByText("Đã nộp · Đang chờ chấm tự luận")).toBeVisible();
  expect(submits).toBe(1);
  const response = await page.request.get(
    `${base}/student/attempts/${attemptUrl.split("/").at(-1)}`,
  );
  const attempt = (await response.json()).data;
  expect(attempt.questions[2].answer.answerText).toBe(
    "Đáp án cuối cùng trước khi nộp.",
  );
});

test("Focus Desk: real server deadline, warning and automatic submission", async ({
  page,
}) => {
  test.skip(before, "Expiry verification after baseline inventory.");
  const exam = await fixture();
  await login(page);
  await page.goto(`/student/exams/${exam.id}`);
  await page.getByRole("button", { name: "Bắt đầu làm bài" }).click();
  await expect(page.getByLabel("Thời gian còn lại")).toBeVisible();
  const attemptId = page.url().split("/").at(-1)!;
  const db = createDb(database);
  try {
    await db.examAttempt.update({
      where: { id: attemptId },
      data: { expiresAt: new Date(Date.now() + 7000) },
    });
  } finally {
    await db.$disconnect();
  }
  await page.reload();
  await expect(page.getByLabel("Thời gian còn lại")).toHaveClass("warning");
  await expect(
    page.getByRole("heading", { name: "Đã nộp bài thành công" }),
  ).toBeVisible({ timeout: 15000 });
  const state = (
    await (
      await page.request.get(`${base}/student/attempts/${attemptId}`)
    ).json()
  ).data;
  expect(state.status).toBe("PENDING_MANUAL_GRADING");
});

test("Focus Desk: entry/load errors, start retry, resume and pending edit ordering", async ({
  page,
}) => {
  test.skip(
    before,
    "Feedback and restore verification after baseline inventory.",
  );
  const exam = await fixture();
  await page.setViewportSize({ width: 820, height: 900 });
  await login(page);
  const entryPath = `${base}/student/exams/${exam.id}`;
  const failure = {
    error: { code: "UNAVAILABLE", message: "Không thể tải bài thi lúc này." },
  };
  let releaseLoad!: () => void;
  const loading = new Promise<void>((resolve) => {
    releaseLoad = resolve;
  });
  await page.route(entryPath, async (route) => {
    await loading;
    await route.fulfill({ status: 503, json: failure });
  });
  await page.goto(`/student/exams/${exam.id}`);
  await expect(page.getByRole("status")).toHaveText("Đang tải…");
  releaseLoad();
  await expect(page.getByRole("alert")).toHaveText(failure.error.message);
  await page.unroute(entryPath);
  await page.reload();
  const startPath = `**/student/exams/${exam.id}/attempts`;
  await page.route(startPath, (route) =>
    route.fulfill({ status: 503, json: failure }),
  );
  await page.getByRole("button", { name: "Bắt đầu làm bài" }).click();
  await expect(page.getByRole("alert")).toHaveText(failure.error.message);
  await expect(
    page.getByRole("button", { name: "Bắt đầu làm bài" }),
  ).toBeEnabled();
  await page.unroute(startPath);
  await page.getByRole("button", { name: "Bắt đầu làm bài" }).click();
  await expect(page.getByLabel("Thời gian còn lại")).toBeVisible();
  const attemptUrl = page.url();
  const attemptId = attemptUrl.split("/").at(-1)!;
  let releaseSave!: () => void;
  const saveGate = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  let saveCount = 0;
  await page.route("**/student/attempts/*/answers/*", async (route) => {
    saveCount++;
    if (saveCount === 1) await saveGate;
    await route.continue();
  });
  await page.getByRole("radio").first().check();
  await expect.poll(() => saveCount).toBe(1);
  await page.getByRole("radio").nth(1).check();
  releaseSave();
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  expect(saveCount).toBe(2);
  await page.reload();
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
  await page.goto(`/student/exams/${exam.id}`);
  await page
    .getByRole("button", { name: "Tiếp tục làm bài", exact: true })
    .click();
  await expect(page).toHaveURL(attemptUrl);
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
  const state = (
    await (
      await page.request.get(`${base}/student/attempts/${attemptId}`)
    ).json()
  ).data;
  expect(state.attemptNo).toBe(1);
  const attemptPath = `${base}/student/attempts/${attemptId}`;
  await page.route(attemptPath, (route) =>
    route.fulfill({ status: 503, json: failure }),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toHaveText(failure.error.message);
  await page.unroute(attemptPath);
  await page.reload();
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .getByRole("button", { name: "Câu tiếp", exact: true })
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
});

test("Focus Desk: long title, image, Markdown, math and code stay within mobile reading width", async ({
  page,
}) => {
  test.skip(before, "Rich-content bounds on the new reading surface.");
  const exam = await fixture();
  const db = createDb(database);
  try {
    const source = await db.examQuestion.findFirstOrThrow({
      where: { examId: exam.id, orderIndex: 4 },
      include: { question: true },
    });
    await db.exam.update({
      where: { id: exam.id },
      data: {
        title:
          "Bài kiểm tra giữa kỳ Công nghệ Web — Xác thực, phân quyền và bảo mật ứng dụng trong môi trường phân tán",
      },
    });
    await db.question.update({
      where: { id: source.questionId },
      data: {
        promptMarkdown: `${source.question.promptMarkdown}\n\n![Sơ đồ request từ trình duyệt đến server](/focus-media.svg)`,
      },
    });
  } finally {
    await db.$disconnect();
  }
  await page.route("**/focus-media.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="400" viewBox="0 0 1600 400"><rect width="1600" height="400" fill="#edf2eb"/><text x="100" y="220" font-size="72" fill="#24574e">Browser → HTTP request → Server</text></svg>',
    }),
  );
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page);
  await page.goto(`/student/exams/${exam.id}`);
  await page.getByRole("button", { name: "Bắt đầu làm bài" }).click();
  await index(page, 5);
  const img = page.getByRole("img", {
    name: "Sơ đồ request từ trình duyệt đến server",
  });
  await expect(img).toBeVisible();
  const imageNode = await img.elementHandle();
  const timer = page.getByLabel("Thời gian còn lại");
  const initialTime = await timer.innerText();
  await expect(timer).not.toHaveText(initialTime);
  expect(await imageNode!.evaluate((el) => el.isConnected)).toBe(true);
  await img.scrollIntoViewIfNeeded();
  await expect
    .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBe(1600);
  const bounds = await img.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(350);
  expect(bounds!.height / bounds!.width).toBeCloseTo(0.25);
  await expect(page.locator(".focus-prompt table")).toBeVisible();
  await expect(page.locator(".katex-display")).toBeVisible();
  const code = page.locator(".focus-prompt pre");
  await expect(code.locator("code.hljs .hljs-keyword").first()).toBeVisible();
  expect(
    await code.locator("code").evaluate((el) => getComputedStyle(el).overflowX),
  ).toBe("visible");
  expect(await code.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(
    true,
  );
  await code.evaluate((el) => {
    el.scrollLeft = 250;
  });
  expect(await code.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  const scrolledAt = await timer.innerText();
  await expect(timer).not.toHaveText(scrolledAt);
  expect(await code.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: `${root}/rich-media-mobile.png`,
    fullPage: true,
  });
  await writeFile(
    `${root}/rich-media.json`,
    JSON.stringify(
      {
        viewport: 390,
        imageWidth: bounds!.width,
        imageAspectRatio: bounds!.height / bounds!.width,
        imageSurvivesTimerTick: await imageNode!.evaluate(
          (el) => el.isConnected,
        ),
        code: await code.evaluate((el) => ({
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
          scrollLeft: el.scrollLeft,
          nestedOverflowX: getComputedStyle(el.querySelector("code")!)
            .overflowX,
        })),
        pageOverflow: await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      },
      null,
      2,
    ),
  );
});
