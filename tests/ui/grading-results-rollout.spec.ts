import { test, expect } from "@playwright/test";
import {
  gradingFixture,
  signIn,
  gradingPassword,
} from "./grading-results-fixtures";

test("dirty route navigation requires confirmation and cancel keeps the draft", async ({
  page,
}) => {
  const f = await gradingFixture();
  await signIn(page, "teacher");
  await page.goto(`/teacher/exams/${f.exam.id}/grading`);
  const form = page.locator(".marking-submission").first().locator("form");
  await form.getByRole("spinbutton").fill("2.5");
  await form
    .getByRole("textbox", { name: "Nhận xét", exact: true })
    .fill("Bản nhận xét chưa lưu");
  await page.getByRole("link", { name: "Kết quả & công bố →" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Điểm và nhận xét chưa lưu",
  });
  await expect(dialog).toBeVisible({ timeout: 3000 });
  await dialog.getByRole("button", { name: "Ở lại chấm bài" }).click();
  await expect(form.getByRole("spinbutton")).toHaveValue("2.5");
  await expect(
    form.getByRole("textbox", { name: "Nhận xét", exact: true }),
  ).toHaveValue("Bản nhận xét chưa lưu");
});

test("saving grading invalidates an already visited Results Register", async ({
  page,
}) => {
  const f = await gradingFixture();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, "teacher");
  await page.goto(`/teacher/exams/${f.exam.id}/results`);
  const row = page.getByRole("row").filter({ hasText: f.student.fullName });
  await expect(row).toContainText("Chờ chấm tự luận");
  await page.getByRole("link", { name: /Chấm tự luận/ }).click();
  const form = page.locator(".marking-submission").first().locator("form");
  await form.getByRole("spinbutton").fill("2.5");
  await form.getByRole("button", { name: "Lưu điểm" }).click();
  await expect(form.getByRole("status")).toHaveText("Đã lưu điểm");
  await page.getByRole("link", { name: "Kết quả & công bố →" }).click();
  await expect(row).toContainText("4.5", { timeout: 2000 });
  await expect(row).toContainText("Đã chấm");
});

import { mkdir } from "node:fs/promises";
import { createDb } from "../../apps/api/src/db/client";
import { assertNoOverflow, base, database } from "./grading-results-fixtures";
import { resultHistoryFixture } from "./grading-results-rollout-fixtures";
const root = process.env.GRADING_SCREENSHOT_DIR || "/tmp/grading-rollout/after";

for (const count of [1, 20, 21, 30, 100, 105]) {
  test(`all ${count} grading submissions are reachable without losing drafts`, async ({
    page,
  }) => {
    const f = await gradingFixture(count);
    await page.setViewportSize({
      width: count === 105 ? 320 : 1024,
      height: 1000,
    });
    await signIn(page, "teacher");
    await page.goto(`/teacher/exams/${f.exam.id}/grading`);
    const records = page.locator(".marking-submission");
    const first = records.first();
    await first.getByRole("spinbutton").fill("0");
    await first
      .getByRole("textbox", { name: "Nhận xét", exact: true })
      .fill("Bản nháp trang đầu");
    const seen: string[] = [];
    for (let n = 1; n <= Math.ceil(count / 20); n++) {
      await expect(records).toHaveCount(Math.min(20, count - (n - 1) * 20));
      await expect(records.first().locator(".record-index")).toHaveText(
        String((n - 1) * 20 + 1).padStart(2, "0"),
      );
      seen.push(
        ...(await records.locator(".marking-student").allTextContents()),
      );
      await assertNoOverflow(page);
      if (n < Math.ceil(count / 20)) {
        await expect(
          page.getByRole("button", { name: "Trang sau" }),
        ).toBeEnabled();
        await page.getByRole("button", { name: "Trang sau" }).click();
      }
    }
    await expect(
      page.getByRole("button", { name: "Trang sau" }),
    ).toBeDisabled();
    expect(seen).toHaveLength(count);
    expect(new Set(seen).size).toBe(count);
    if (count > 20) {
      await mkdir(root, { recursive: true });
      await page.screenshot({ path: `${root}/grading-page-${count}.png` });
      for (let n = Math.ceil(count / 20); n > 1; n--) {
        await page.getByRole("button", { name: "Trang trước" }).click();
        await expect(page).toHaveURL(new RegExp(`page=${n - 1}$`));
        await expect(records.first().locator(".record-index")).toHaveText(
          String((n - 2) * 20 + 1).padStart(2, "0"),
        );
      }
      await expect(first.getByRole("spinbutton")).toHaveValue("0");
      await expect(
        first.getByRole("textbox", { name: "Nhận xét", exact: true }),
      ).toHaveValue("Bản nháp trang đầu");
    }
    if (count === 105) {
      const p1 = await page.request.get(
        `${base}/teacher/exams/${f.exam.id}/grading?page=1&pageSize=100`,
      );
      const p2 = await page.request.get(
        `${base}/teacher/exams/${f.exam.id}/grading?page=2&pageSize=100`,
      );
      expect((await p1.json()).data).toHaveLength(100);
      expect((await p2.json()).data).toHaveLength(5);
    }
  });
}

test("reload, close, Back and Forward cancel preserve drafts; confirmed leave never autosaves", async ({
  page,
}) => {
  const f = await gradingFixture(1);
  await signIn(page, "teacher");
  await page.goto(`/teacher/exams/${f.exam.id}/results`);
  await page.getByRole("link", { name: /Chấm tự luận/ }).click();
  const score = page.getByRole("spinbutton");
  const feedback = page.getByRole("textbox", { name: "Nhận xét", exact: true });
  await score.fill("2");
  await feedback.fill("Chưa gửi đến server");
  let puts = 0;
  page.on("request", (r) => {
    if (r.method() === "PUT") puts++;
  });
  const native = page.waitForEvent("dialog");
  await page.evaluate(() => {
    setTimeout(() => location.reload(), 0);
  });
  const warning = await native;
  expect(warning.type()).toBe("beforeunload");
  await warning.dismiss();
  await expect(score).toHaveValue("2");
  const closing = page.waitForEvent("dialog");
  await page.close({ runBeforeUnload: true });
  await (await closing).dismiss();
  expect(page.isClosed()).toBe(false);
  await expect(feedback).toHaveValue("Chưa gửi đến server");
  await page.evaluate(() => history.back());
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Ở lại chấm bài" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(score).toHaveValue("2");
  await page.evaluate(() => history.back());
  await dialog.getByRole("button", { name: "Rời trang, bỏ thay đổi" }).click();
  await expect(page).toHaveURL(new RegExp(`/exams/${f.exam.id}/results$`));
  expect(puts).toBe(0);
  await page.evaluate(() => history.forward());
  await expect(score).toHaveValue("");
  // Establish a forward entry, return to grading, and protect a forward departure.
  await page.getByRole("link", { name: "Kết quả & công bố →" }).click();
  await page.evaluate(() => history.back());
  await feedback.fill("Feedback only");
  await page.evaluate(() => history.forward());
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Ở lại chấm bài" }).click();
  await expect(feedback).toHaveValue("Feedback only");
  await expect(dialog).not.toBeVisible();
  await page.getByRole("link", { name: "Kết quả & công bố →" }).focus();
  await feedback.fill("");
  await expect(feedback).toHaveValue("");
  await expect(page.locator(".record-draft-summary")).toHaveCount(0);
  await page.getByRole("link", { name: "Kết quả & công bố →" }).click();
  await expect(dialog).not.toBeVisible();
});

test("pending save, independent students, failure and retry preserve exact drafts", async ({
  page,
}) => {
  const f = await gradingFixture();
  await signIn(page, "teacher");
  await page.goto(`/teacher/exams/${f.exam.id}/grading`);
  const first = page.locator(".marking-submission").first();
  const second = page.locator(".marking-submission").nth(1);
  await first.getByRole("spinbutton").fill("2.5");
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let puts = 0;
  await page.route(
    "**/teacher/answers/*/grade",
    async (route) => {
      puts++;
      await held;
      await route.continue();
    },
    { times: 1 },
  );
  await first.getByRole("button", { name: "Lưu điểm" }).click();
  await expect(first.getByRole("spinbutton")).toBeDisabled();
  await first.locator("summary").click();
  await second.locator("summary").click();
  await second.getByRole("spinbutton").fill("0");
  await second.getByRole("textbox", { name: "Nhận xét", exact: true }).fill("");
  await page.getByRole("link", { name: "Kết quả & công bố →" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Rời trang, bỏ thay đổi" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Ở lại chấm bài" }).click();
  release();
  await first.locator("summary").click();
  await expect(first.getByRole("status")).toHaveText("Đã lưu điểm");
  await expect(second.getByRole("spinbutton")).toHaveValue("0");
  await expect(
    second.getByRole("textbox", { name: "Nhận xét", exact: true }),
  ).toHaveValue("");
  expect(puts).toBe(1);
  await page.route(
    "**/teacher/answers/*/grade",
    (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { message: "Lỗi lưu thử nghiệm" } }),
      }),
    { times: 1 },
  );
  await second.getByRole("button", { name: "Lưu điểm" }).click();
  await expect(second.getByRole("alert")).toHaveText("Lỗi lưu thử nghiệm");
  await second.locator("summary").click();
  await page.getByRole("button", { name: "Trang sau" }).click();
  await page.getByRole("button", { name: "Trang trước" }).click();
  await second.locator("summary").click();
  await expect(second.getByRole("spinbutton")).toHaveValue("0");
  await expect(second.getByRole("alert")).toHaveText("Lỗi lưu thử nghiệm");
  await second.getByRole("button", { name: "Lưu điểm" }).click();
  await expect(second.getByRole("status")).toHaveText("Đã lưu điểm");
  await page.reload();
  await expect(first.getByRole("spinbutton")).toHaveValue("2.5");
  await second.locator("summary").click();
  await expect(second.getByRole("spinbutton")).toHaveValue("0");
  await expect(
    second.getByRole("textbox", { name: "Nhận xét", exact: true }),
  ).toHaveValue("");
  const persisted = await page.request.get(
    `${base}/teacher/exams/${f.exam.id}/grading?pageSize=20`,
  );
  const rows = (await persisted.json()).data;
  expect(rows[0].totalScore).toBe("4.5");
  expect(rows[1].totalScore).toBe("2");
});

for (const count of [0, 1, 20, 25]) {
  test(`student history has ${count} isolated records and preserves return page`, async ({
    page,
  }) => {
    const f = await resultHistoryFixture(count);
    await page.setViewportSize({ width: 320, height: 1000 });
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(f.user.email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(gradingPassword());
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.waitForURL("/student");
    await page.goto("/student/results");
    await expect(page.locator(".student-result-link")).toHaveCount(
      Math.min(count, 20),
    );
    if (!count) {
      await expect(
        page.getByText("Chưa có bài thi trong danh sách kết quả."),
      ).toBeVisible();
      return;
    }
    if (count > 20) {
      await page.getByRole("button", { name: "Trang sau" }).click();
      await expect(page.locator(".student-result-link")).toHaveCount(5);
      await expect(
        page.getByRole("button", { name: "Trang sau" }),
      ).toBeDisabled();
      await mkdir(root, { recursive: true });
      await page.screenshot({ path: `${root}/student-history-page2-320.png` });
    }
    const title = await page.locator(".student-result-link").last().innerText();
    expect(title).toContain(`Hồ sơ học tập ${String(count).padStart(2, "0")}`);
    await page.locator(".student-result-link").last().click();
    await expect(page.getByText("Nhận xét đã công bố")).toBeVisible();
    await expect(page.getByText("Lượt được chọn tính kết quả")).toBeVisible();
    await assertNoOverflow(page);
    await page
      .getByRole("link", { name: "Kết quả của tôi", exact: true })
      .click();
    await expect(page.locator(".student-result-link")).toHaveCount(
      count > 20 ? 5 : count,
    );
    if (count > 20) await expect(page).toHaveURL(/page=2$/);
  });
}

test("two essays remain partial until both saved; retry recovers each results region", async ({
  page,
}) => {
  const f = await gradingFixture(1);
  const db = createDb(database);
  try {
    const original = f.attempts[0]!.questions.find(
      (q) => (q.snapshotJson as { type: string }).type === "ESSAY",
    )!;
    const source = await db.question.findUniqueOrThrow({
      where: { id: original.originalQuestionId! },
    });
    const extra = await db.question.create({
      data: {
        bankId: source.bankId,
        type: "ESSAY",
        promptMarkdown: "Câu tự luận thứ hai",
        tags: [],
      },
    });
    await db.examQuestion.create({
      data: {
        examId: f.exam.id,
        questionId: extra.id,
        orderIndex: 4,
        points: 2,
      },
    });
    await db.attemptQuestion.create({
      data: {
        attemptId: f.attempts[0]!.id,
        originalQuestionId: extra.id,
        sourceType: "FIXED",
        orderIndex: 4,
        points: 2,
        snapshotJson: {
          ...(original.snapshotJson as object),
          id: extra.id,
          promptMarkdown: extra.promptMarkdown,
        },
        answer: { create: { answerText: "Câu trả lời thứ hai" } },
      },
    });
    await db.examAttempt.update({
      where: { id: f.attempts[0]!.id },
      data: { maxScore: 8 },
    });
  } finally {
    await db.$disconnect();
  }
  await signIn(page, "teacher");
  await page.goto(`/teacher/exams/${f.exam.id}/grading`);
  const forms = page.locator(".marking-question");
  await expect(
    forms.nth(0).getByRole("heading", { name: /^Câu 3/ }),
  ).toBeVisible();
  await expect(
    forms.nth(1).getByRole("heading", { name: /^Câu 5/ }),
  ).toBeVisible();
  await forms.nth(0).getByRole("spinbutton").fill("2.5");
  await forms.nth(0).getByRole("button", { name: "Lưu điểm" }).click();
  await expect(forms.nth(0).getByRole("status")).toHaveText("Đã lưu điểm");
  await expect(page.locator("summary .record-state")).toHaveText(
    "Chờ chấm tự luận",
  );
  await forms.nth(1).getByRole("spinbutton").fill("0");
  await forms.nth(1).getByRole("button", { name: "Lưu điểm" }).click();
  await expect(page.locator("summary .record-state")).toHaveText("Đã chấm");
  await mkdir(root, { recursive: true });
  await page.screenshot({ path: `${root}/multiple-essays.png` });
  await page.getByRole("link", { name: "Kết quả & công bố →" }).click();
  await expect(page.locator("tbody")).toContainText("4.5");
});

test("a completed save finishes a blocked navigation when no other draft remains", async ({
  page,
}) => {
  const f = await gradingFixture(1);
  await signIn(page, "teacher");
  await page.goto(`/teacher/exams/${f.exam.id}/grading`);
  await page.getByRole("spinbutton").fill("2.5");
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/teacher/answers/*/grade", async (r) => {
    await held;
    await r.continue();
  });
  await page.getByRole("button", { name: "Lưu điểm" }).click();
  await page.getByRole("link", { name: "Kết quả & công bố →" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Rời trang, bỏ thay đổi" }),
  ).toBeDisabled();
  release();
  await expect(page).toHaveURL(new RegExp(`/exams/${f.exam.id}/results$`));
  await expect(page.locator("tbody")).toContainText("4.5");
  await page.getByRole("link", { name: /Chấm tự luận/ }).click();
  await expect(page.getByRole("spinbutton")).toHaveValue("2.5");
  await page.getByRole("spinbutton").fill("0");
  await page.getByRole("button", { name: "Lưu điểm" }).click();
  await expect(page.locator(".marking-save-state")).toHaveText("Đã lưu điểm");
  await page.getByRole("link", { name: "Kết quả & công bố →" }).click();
  await expect(page.locator("tbody .record-numeric")).toContainText("2 / 6");
  await page.reload();
  await expect(page.locator("tbody .record-numeric")).toContainText("2 / 6");
});
