import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createDb } from "../../apps/api/src/db/client";
import {
  fixture,
  login,
  index,
  base,
  database,
} from "./student-focus-fixtures";

const root = process.env.FOCUS_ROLLOUT_DIR || "/tmp/focus-rollout";
async function start(page: Page, count = 30) {
  const exam = await fixture(count);
  await login(page);
  await page.goto(`/student/exams/${exam.id}`);
  await page.getByRole("button", { name: "Bắt đầu làm bài" }).click();
  await expect(
    page.getByLabel("Thời gian còn lại", { exact: true }),
  ).toBeVisible();
  return { exam, attemptId: page.url().split("/").at(-1)!, url: page.url() };
}
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function snapshot(page: Page, name: string, fullPage = true) {
  await mkdir(root, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `${root}/${name}.png`,
    fullPage,
    animations: "disabled",
  });
}

test("rollout: unsaved SPA leave is blocked, save-and-leave retries and resume is fresh", async ({
  page,
}) => {
  const { exam, url, attemptId } = await start(page);
  await index(page, 3);
  await page.route("**/student/attempts/*/answers/*", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: { code: "UNAVAILABLE", message: "Chưa lưu được bài làm." },
      },
    }),
  );
  await page
    .getByLabel("Bài làm tự luận")
    .fill("Bài làm chưa gửi — cần giữ lại.");
  await page.getByRole("link", { name: "← Danh sách bài thi" }).click();
  const dialog = page.getByRole("dialog", { name: "Đáp án chưa được lưu" });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(url);
  await expect(
    dialog.getByRole("button", { name: "Tiếp tục làm bài" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Lưu và rời trang" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Tiếp tục làm bài" }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Lưu và rời trang" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Chưa lưu được bài làm.");
  await expect(page).toHaveURL(url);
  await snapshot(page, "unsaved-desktop", false);
  await page.unroute("**/student/attempts/*/answers/*");
  await dialog.getByRole("button", { name: "Lưu và rời trang" }).click();
  await expect(page).toHaveURL(/\/student\/exams$/);
  // SPA history return must not reuse the initial (empty) query snapshot.
  await page.goBack();
  await expect(page).toHaveURL(url);
  await index(page, 3);
  await expect(page.getByLabel("Bài làm tự luận")).toHaveValue(
    "Bài làm chưa gửi — cần giữ lại.",
  );
  const state = (
    await (
      await page.request.get(`${base}/student/attempts/${attemptId}`)
    ).json()
  ).data;
  expect(state.questions[2].answer.answerText).toBe(
    "Bài làm chưa gửi — cần giữ lại.",
  );
  await page.getByRole("link", { name: "← Danh sách bài thi" }).click();
  await expect(page).toHaveURL(/\/student\/exams$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goBack();
  await index(page, 3);
  await expect(page.getByLabel("Bài làm tự luận")).toHaveValue(
    "Bài làm chưa gửi — cần giữ lại.",
  );
  await page.goForward();
  await expect(page).toHaveURL(/\/student\/exams$/);
  await page.goBack();
  await index(page, 3);
  await expect(page.getByLabel("Bài làm tự luận")).toHaveValue(
    "Bài làm chưa gửi — cần giữ lại.",
  );
  expect(exam.id).toBeTruthy();
});

test("rollout: delayed reconnect snapshot cannot overwrite a newer saved answer", async ({
  page,
}) => {
  const { attemptId } = await start(page);
  const held = gate();
  let fetched = false;
  await page.route(`${base}/student/attempts/${attemptId}`, async (route) => {
    const response = await route.fetch();
    fetched = true;
    await held.promise;
    await route.fulfill({ response });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => fetched).toBe(true);
  await page.getByRole("radio").nth(1).check();
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  const response = page.waitForResponse(
    `${base}/student/attempts/${attemptId}`,
  );
  held.release();
  await response;
  await page.waitForTimeout(200);
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
  await page.reload();
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
});

test("rollout: index keeps the current question visible after sequential navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page, 100);
  await index(page, 32);
  for (let n = 33; n <= 40; n++)
    await page.getByRole("button", { name: "Câu tiếp", exact: true }).click();
  const bounds = await page.locator(".focus-index-grid").evaluate((el) => {
    const box = el.getBoundingClientRect();
    const active = el.querySelector("[aria-current]")!.getBoundingClientRect();
    return {
      visible: active.top >= box.top && active.bottom <= box.bottom,
      height: box.height,
    };
  });
  expect(bounds.height).toBeLessThanOrEqual(420);
  expect(bounds.visible).toBe(true);
});

test("rollout: early essay reload and browser close warn; cancel, history back and saved reload preserve data", async ({
  page,
}) => {
  const { url } = await start(page, 4);
  await index(page, 3);
  const held = gate();
  await page.route("**/student/attempts/*/answers/*", async (route) => {
    await held.promise;
    await route.continue();
  });
  await page
    .getByLabel("Bài làm tự luận")
    .fill("Nội dung chưa kịp gửi trước khi reload.");
  const warning = page.waitForEvent("dialog");
  // A canceled reload has no load event; trigger it without awaiting navigation.
  await page.evaluate(() => {
    setTimeout(() => window.location.reload(), 0);
  });
  const dialog = await warning;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  await expect(page.getByLabel("Bài làm tự luận")).toHaveValue(
    "Nội dung chưa kịp gửi trước khi reload.",
  );
  const closeWarning = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  const closing = await closeWarning;
  expect(closing.type()).toBe("beforeunload");
  await closing.dismiss();
  expect(page.isClosed()).toBe(false);
  await page.goBack();
  const leave = page.getByRole("dialog", { name: "Đáp án chưa được lưu" });
  await expect(leave).toBeVisible();
  await expect(page).toHaveURL(url);
  await page.keyboard.press("Escape");
  await expect(leave).toHaveCount(0);
  await expect(page.getByLabel("Bài làm tự luận")).toHaveValue(
    "Nội dung chưa kịp gửi trước khi reload.",
  );
  held.release();
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  const unexpected: string[] = [];
  page.on("dialog", async (dialog) => {
    unexpected.push(dialog.type());
    await dialog.dismiss();
  });
  await page.reload();
  await index(page, 3);
  await expect(page.getByLabel("Bài làm tự luận")).toHaveValue(
    "Nội dung chưa kịp gửi trước khi reload.",
  );
  expect(unexpected).toEqual([]);
});

test("rollout: all four types, immediate navigation, serialized saves and long/empty essay", async ({
  page,
}) => {
  const { attemptId } = await start(page, 4);
  const held = gate();
  let requests = 0;
  await page.route("**/student/attempts/*/answers/*", async (route) => {
    requests++;
    if (requests === 1) await held.promise;
    await route.continue();
  });
  await page.getByRole("radio").first().focus();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Câu tiếp", exact: true }).click();
  await page.getByRole("checkbox", { name: "GET", exact: true }).check();
  await page.getByRole("checkbox", { name: "PUT", exact: true }).check();
  await page.getByRole("checkbox", { name: "GET", exact: true }).uncheck();
  await expect.poll(() => requests).toBe(1);
  // The second PUT must not be sent before the first response. Reordering is prevented.
  await page.waitForTimeout(900);
  expect(requests).toBe(1);
  held.release();
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  expect(requests).toBe(2);
  await index(page, 4);
  await page.getByRole("radio", { name: "Sai", exact: true }).focus();
  await page.keyboard.press("Space");
  await index(page, 3);
  const essay = "Session lưu trạng thái trên máy chủ. ".repeat(300);
  await page.getByLabel("Bài làm tự luận").fill(essay);
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  await page.reload();
  await index(page, 3);
  await expect(page.getByLabel("Bài làm tự luận")).toHaveValue(essay);
  await page.getByLabel("Bài làm tự luận").fill("");
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  const state = (
    await (
      await page.request.get(`${base}/student/attempts/${attemptId}`)
    ).json()
  ).data;
  expect(state.questions[0].answer.selectedOptionIds).toEqual([
    state.questions[0].options[0].id,
  ]);
  expect(state.questions[1].answer.selectedOptionIds).toEqual([
    state.questions[1].options[1].id,
  ]);
  expect(state.questions[2].answer.answerText).toBe("");
  expect(state.questions[3].answer.selectedOptionIds).toEqual([
    state.questions[3].options[1].id,
  ]);
  await page.getByRole("button", { name: "Nộp bài", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page).toHaveURL(/\/student\/results\//);
  await page.goto(`/student/attempts/${attemptId}`);
  await expect(
    page.getByRole("heading", { name: "Đã nộp bài thành công" }),
  ).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
});

for (const [width, count] of [
  [1440, 100],
  [1024, 60],
  [820, 100],
  [390, 60],
  [320, 4],
] as const) {
  test(`rollout: long content, compact timer and ${count} questions at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const exam = await fixture(count);
    const db = createDb(database);
    try {
      const q = await db.examQuestion.findFirstOrThrow({
        where: { examId: exam.id, orderIndex: 3 },
      });
      await db.question.update({
        where: { id: q.questionId },
        data: {
          promptMarkdown:
            "**Phân tích giao thức** — giá trị inline $x^2 + y^2$.\n\n" +
            "![Sơ đồ request và response](/focus-rollout-diagram.svg)\n\n" +
            "```js\nconst session = '" +
            "session-token-".repeat(25) +
            "';\n" +
            Array.from(
              { length: 12 },
              (_, n) => `console.log(session, ${n});`,
            ).join("\n") +
            "\n```\n\n" +
            "$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$\n\n" +
            "| HTTP | Mô tả |\n| --- | --- |\n| GET | Đọc dữ liệu |\n\n" +
            "Đọc kỹ dữ liệu đầu vào và giải thích cách máy chủ kiểm tra quyền truy cập. ".repeat(
              40,
            ),
        },
      });
    } finally {
      await db.$disconnect();
    }
    await page.route("**/focus-rollout-diagram.svg", (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="400"><rect width="1600" height="400" fill="#edf2eb"/><text x="100" y="225" font-size="64" fill="#24574e">Client → HTTP → Server</text></svg>',
      }),
    );
    await login(page);
    await page.goto(`/student/exams/${exam.id}`);
    await expect(
      page.getByRole("button", { name: "Bắt đầu làm bài" }),
    ).toBeEnabled();
    await snapshot(page, `entry-${width}`);
    await page.getByRole("button", { name: "Bắt đầu làm bài" }).click();
    await expect(page.getByRole("radio").first()).toBeVisible();
    await page.getByRole("radio").first().check();
    await expect(page.getByRole("status")).toHaveText("Đã lưu");
    await snapshot(page, `single-${width}`);
    await index(page, 2);
    await page.getByRole("checkbox", { name: "GET", exact: true }).check();
    await page.getByRole("checkbox", { name: "PUT", exact: true }).check();
    await expect(page.getByRole("status")).toHaveText("Đã lưu");
    await snapshot(page, `multiple-${width}`);
    await index(page, count);
    const toggle = page.getByRole("button", { name: /Mục lục câu hỏi/ });
    if (await toggle.isVisible()) await toggle.click();
    await expect(
      page.getByRole("button", { name: `Câu ${count}`, exact: true }),
    ).toHaveAttribute("aria-current", "step");
    const geometry = await page.locator(".focus-index-grid").evaluate((el) => {
      const box = el.getBoundingClientRect(),
        active = el.querySelector("[aria-current]")!.getBoundingClientRect();
      return {
        height: box.height,
        activeVisible: active.top >= box.top && active.bottom <= box.bottom,
        width: innerWidth,
      };
    });
    expect(geometry.activeVisible).toBe(true);
    expect(geometry.height).toBeLessThanOrEqual(width > 1000 ? 410 : 240);
    if (width === 1440 || width === 390) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await snapshot(page, `navigation-${width}`);
    }
    const began = Date.now();
    await index(page, 4);
    await expect(page.locator(".focus-prompt pre code.hljs")).toBeVisible();
    const navigationMs = Date.now() - began;
    expect(navigationMs).toBeLessThan(3000);
    await expect(page.locator(".focus-prompt .katex-display")).toHaveCount(1);
    await expect(page.locator(".focus-prompt .katex")).toHaveCount(2);
    await expect(page.locator(".focus-prompt table")).toBeVisible();
    const img = page.getByRole("img", { name: "Sơ đồ request và response" });
    const handle = await img.elementHandle();
    await expect
      .poll(() =>
        img.evaluate(
          (el: HTMLImageElement) => el.complete && el.naturalWidth === 1600,
        ),
      )
      .toBe(true);
    expect(
      await img.evaluate((el) => el.getBoundingClientRect().width),
    ).toBeLessThanOrEqual(width - 40);
    const pre = page.locator(".focus-prompt pre");
    const code = await pre.evaluate((el) => {
      el.scrollLeft = 250;
      return {
        region: getComputedStyle(el).overflowX,
        child: getComputedStyle(el.querySelector("code")!).overflowX,
        scrollLeft: el.scrollLeft,
        client: el.clientWidth,
        content: el.scrollWidth,
      };
    });
    expect(code.child).toBe("visible");
    expect(code.scrollLeft).toBe(250);
    expect(code.content).toBeGreaterThan(code.client);
    // Deliberately read further down: on desktop this code already fits without scrolling.
    await pre.evaluate((el) =>
      window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 60),
    );
    expect(
      await page
        .locator(".focus-session")
        .evaluate((el) => el.getBoundingClientRect().bottom),
    ).toBeLessThan(0);
    await expect(page.locator(".focus-compact-clock")).toBeVisible();
    await page.waitForTimeout(1100);
    expect(await handle!.evaluate((el) => el.isConnected)).toBe(true);
    expect(await pre.evaluate((el) => el.scrollLeft)).toBe(250);
    const dock = await page.locator(".focus-compact-clock").boundingBox();
    expect(dock!.y).toBe(0);
    expect(dock!.height).toBe(44);
    // Return to the beginning after verifying retained horizontal scroll, so the review image shows readable code.
    await pre.evaluate((el) => {
      el.scrollLeft = 0;
    });
    await snapshot(page, `rich-timer-${width}`, false);
    await page.getByRole("radio", { name: "Đúng", exact: true }).focus();
    expect(
      (await page
        .getByRole("radio", { name: "Đúng", exact: true })
        .boundingBox())!.y,
    ).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Space");
    await expect(page.getByRole("status")).toHaveText("Đã lưu");
    await index(page, 3);
    await page
      .getByLabel("Bài làm tự luận")
      .fill("Bài tự luận dài. ".repeat(180));
    await page.getByLabel("Bài làm tự luận").focus();
    await page.keyboard.press("Control+End");
    await expect(page.getByRole("status")).toHaveText("Đã lưu");
    expect(
      (await page.getByLabel("Bài làm tự luận").boundingBox())!.width,
    ).toBeLessThanOrEqual(width - 40);
    await page.getByRole("button", { name: "Nộp bài", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "Nộp bài thi?" });
    await expect(
      modal.getByRole("button", { name: "Hủy", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(
      modal.getByRole("button", { name: "Xác nhận", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      modal.getByRole("button", { name: "Hủy", exact: true }),
    ).toBeFocused();
    await snapshot(page, `dialog-${width}`, false);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Nộp bài", exact: true }),
    ).toBeFocused();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator(".focus-compact-clock")).toHaveCount(0);
    await writeFile(
      `${root}/geometry-${width}.json`,
      JSON.stringify({ ...geometry, navigationMs, code, dock }, null, 2),
    );
  });
}

test("rollout: list pagination, loading/empty/error recovery and real availability states", async ({
  page,
}) => {
  const exam = await fixture(4);
  const db = createDb(database);
  const titles = [
    "HTTP và giao thức Web",
    "Session và bảo mật ứng dụng",
    "Ôn tập kiến thức nền tảng",
  ];
  const ids: string[] = [];
  try {
    const assigned = await db.examClass.findFirstOrThrow({
      where: { examId: exam.id },
    });
    const questions = await db.examQuestion.findMany({
      where: { examId: exam.id },
    });
    for (let n = 0; n < 21; n++) {
      const added = await db.exam.create({
        data: {
          teacherId: exam.teacherId,
          title: titles[n % titles.length]! + ` · Đề ${n + 1}`,
          status: "PUBLISHED",
          durationMinutes: 45,
          maxAttempts: 1,
          openAt: new Date(Date.now() - n * 100),
          closeAt: new Date(Date.now() + 86400000),
          classes: { create: { classId: assigned.classId } },
          questions: {
            create: questions.map((q) => ({
              questionId: q.questionId,
              orderIndex: q.orderIndex,
              points: q.points,
            })),
          },
        },
      });
      ids.push(added.id);
    }
  } finally {
    await db.$disconnect();
  }
  await login(page);
  await expect(page.locator(".focus-exam-list article")).toHaveCount(20);
  await snapshot(page, "list-desktop", false);
  await page.getByRole("button", { name: "Trang tiếp", exact: true }).click();
  await expect(page.getByText("Trang 2", { exact: true })).toBeVisible();
  await expect(
    page
      .locator(`.focus-exam-list a[href='/student/exams/${ids[20]}']`)
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Trang trước", exact: true }).click();
  await expect(page.getByText("Trang 1", { exact: true })).toBeVisible();
  const listPath = `${base}/student/exams?**`;
  const load = gate();
  await page.route(listPath, async (route) => {
    await load.promise;
    await route.fulfill({
      status: 503,
      json: {
        error: {
          code: "UNAVAILABLE",
          message: "Không thể tải danh sách bài thi.",
        },
      },
    });
  });
  await page.reload();
  await expect(page.getByRole("status")).toHaveText("Đang tải…");
  load.release();
  await expect(page.getByRole("alert")).toHaveText(
    "Không thể tải danh sách bài thi.",
  );
  await page.unroute(listPath);
  await page.route(listPath, (route) => route.fulfill({ json: { data: [] } }));
  await page.getByRole("button", { name: "Thử tải lại" }).click();
  await expect(page.getByText("Bạn chưa được giao bài thi.")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.unroute(listPath);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.reload();
  await expect(page.locator(".focus-exam-list article")).toHaveCount(20);
  await snapshot(page, "list-320", false);
  const edits = createDb(database);
  try {
    for (const [label, data] of [
      ["Chưa mở bài", { openAt: new Date(Date.now() + 3600000) }],
      [
        "Đã đóng bài",
        {
          openAt: new Date(Date.now() - 3600000),
          closeAt: new Date(Date.now() - 1000),
        },
      ],
      ["Đã lưu trữ", { status: "ARCHIVED" as const }],
    ] as const) {
      await edits.exam.update({ where: { id: exam.id }, data });
      await page.goto(`/student/exams/${exam.id}`);
      await expect(
        page.getByRole("button", { name: label, exact: true }),
      ).toBeDisabled();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  } finally {
    await edits.$disconnect();
  }
});

test("rollout: server expiry rejection locks answers, explains unsaved edits and releases navigation", async ({
  page,
}) => {
  const { attemptId } = await start(page, 4);
  await page.getByRole("radio").first().check();
  const statePath = `${base}/student/attempts/${attemptId}`;
  await page.route(statePath, (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: {
          code: "UNAVAILABLE",
          message: "Không thể xác nhận trạng thái lượt thi.",
        },
      },
    }),
  );
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  const db = createDb(database);
  try {
    await db.examAttempt.update({
      where: { id: attemptId },
      data: {
        startedAt: new Date(Date.now() - 60000),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
  } finally {
    await db.$disconnect();
  }
  await index(page, 2);
  await page.getByRole("checkbox").first().check();
  await expect(page.getByRole("alert")).toHaveText(
    "Không thể xác nhận trạng thái lượt thi.",
  );
  const failedRead = page.waitForResponse(statePath);
  await page.getByRole("button", { name: "Thử lưu lại" }).click();
  await failedRead;
  await expect(page.getByRole("status")).toHaveText("Lỗi lưu");
  await page.unroute(statePath);
  await page.getByRole("button", { name: "Thử lưu lại" }).click();
  await expect(
    page.getByRole("heading", { name: "Đã nộp bài thành công" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Một số thay đổi chưa kịp lưu",
  );
  const resultLink = page.getByRole("link", { name: "Xem trạng thái kết quả" });
  const contrast = await resultLink.evaluate((el) => {
    const style = getComputedStyle(el);
    const luminance = (color: string) => {
      const rgb = color
        .match(/\d+/g)!
        .slice(0, 3)
        .map(Number)
        .map((v) => {
          const c = v / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
      return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
    };
    const fg = luminance(style.color),
      bg = luminance(style.backgroundColor);
    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await snapshot(page, "locked-desktop", false);
  const state = (
    await (
      await page.request.get(`${base}/student/attempts/${attemptId}`)
    ).json()
  ).data;
  expect(state.status).not.toBe("IN_PROGRESS");
  expect(state.questions[0].answer.selectedOptionIds).toHaveLength(1);
  expect(state.questions[1].answer.selectedOptionIds).toHaveLength(0);
  await page.getByRole("link", { name: "← Danh sách bài thi" }).click();
  await expect(page).toHaveURL(/\/student\/exams$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("rollout: offline at deadline recovers the locked server state without claiming unsaved text was saved", async ({
  page,
  context,
}) => {
  const { attemptId } = await start(page, 4);
  const db = createDb(database);
  try {
    await db.examAttempt.update({
      where: { id: attemptId },
      data: { expiresAt: new Date(Date.now() + 12000) },
    });
  } finally {
    await db.$disconnect();
  }
  await page.reload();
  await index(page, 3);
  await context.setOffline(true);
  await page
    .getByLabel("Bài làm tự luận")
    .fill("Bài chưa được gửi khi mất kết nối.");
  await expect(page.getByRole("status")).toHaveText("Lỗi lưu");
  await expect(
    page.getByLabel("Thời gian còn lại", { exact: true }),
  ).toHaveText("00:00:00", { timeout: 20000 });
  await expect(page.getByLabel("Bài làm tự luận")).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("Đã hết thời gian");
  await context.setOffline(false);
  await expect(
    page.getByRole("heading", { name: "Đã nộp bài thành công" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Một số thay đổi chưa kịp lưu",
  );
  const unexpected: string[] = [];
  page.on("dialog", async (dialog) => {
    unexpected.push(dialog.type());
    await dialog.dismiss();
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Đã nộp bài thành công" }),
  ).toBeVisible();
  expect(unexpected).toEqual([]);
});

test("rollout: entry and long-option images retain their DOM across timer ticks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const exam = await fixture(4);
  const db = createDb(database);
  try {
    await db.exam.update({
      where: { id: exam.id },
      data: {
        descriptionMarkdown:
          "Nội dung bài thi.\n\n![Sơ đồ bài thi](/focus-option.svg)",
      },
    });
    const q = await db.examQuestion.findFirstOrThrow({
      where: { examId: exam.id, orderIndex: 0 },
    });
    const option = await db.questionOption.findFirstOrThrow({
      where: { questionId: q.questionId, orderIndex: 3 },
    });
    await db.questionOption.update({
      where: { id: option.id },
      data: {
        contentMarkdown:
          "![Minh họa đáp án](/focus-option.svg)\n\n" +
          "Đối chiếu nội dung phản hồi với trạng thái phiên trên máy chủ. ".repeat(
            15,
          ),
      },
    });
  } finally {
    await db.$disconnect();
  }
  await page.route("**/focus-option.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200"><rect width="800" height="200" fill="#edf2eb"/></svg>',
    }),
  );
  await login(page);
  await page.goto(`/student/exams/${exam.id}`);
  const image = page.getByRole("img", { name: "Sơ đồ bài thi" });
  await expect(image).toBeVisible();
  const entryNode = await image.elementHandle();
  await page.waitForTimeout(1200);
  expect(await entryNode!.evaluate((el) => el.isConnected)).toBe(true);
  await page.getByRole("button", { name: "Bắt đầu làm bài" }).click();
  const answerImage = page.getByRole("img", { name: "Minh họa đáp án" });
  await expect(answerImage).toBeVisible();
  const answerNode = await answerImage.elementHandle();
  await page.waitForTimeout(1200);
  expect(await answerNode!.evaluate((el) => el.isConnected)).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
