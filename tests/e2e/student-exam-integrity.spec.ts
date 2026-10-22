import { test, expect } from "@playwright/test";
import { fixture, login, database } from "../ui/student-focus-fixtures";
import { createDb } from "../../apps/api/src/db/client";

const db = createDb(database);
test.afterAll(() => db.$disconnect());

test("P1: stale tab PUT is rejected and UI requires explicit conflict resolution", async ({
  page,
  context,
}) => {
  const exam = await fixture(4);
  await login(page);
  await page.goto(`/student/exams/${exam.id}`);
  await page
    .getByRole("button", { name: "Bắt đầu làm bài", exact: true })
    .click();
  await expect(page.getByRole("radio").first()).toBeVisible();
  const id = page.url().split("/").at(-1)!;
  const second = await context.newPage();
  await second.goto(page.url());
  await expect(second.getByRole("radio").first()).toBeVisible();
  let release!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  let waiting = false;
  await page.route("**/student/attempts/*/answers/*", async (route) => {
    waiting = true;
    await held;
    await route.continue();
  });
  await page.getByRole("radio").first().check();
  await expect.poll(() => waiting).toBe(true);
  await second.getByRole("radio").nth(1).check();
  await expect(second.getByRole("status")).toHaveText("Đã lưu");
  const saved = await db.attemptAnswer.findFirstOrThrow({
    where: { question: { attemptId: id, orderIndex: 0 } },
  });
  const response = page.waitForResponse(
    (r) => r.request().method() === "PUT" && r.url().includes("/answers/"),
  );
  release();
  expect((await response).status()).toBe(409);
  await expect(page.getByText(/Đáp án đã thay đổi ở tab khác/)).toBeVisible();
  await expect(page.getByRole("radio").first()).toBeChecked();
  await expect(page.getByRole("status")).not.toHaveText("Đã lưu");
  await expect(
    page.getByRole("button", { name: "Nộp bài", exact: true }),
  ).toBeDisabled();
  expect(
    (await db.attemptAnswer.findUniqueOrThrow({ where: { id: saved.id } }))
      .answerJson,
  ).toEqual(saved.answerJson);
  await page
    .getByRole("button", { name: "Dùng đáp án trên máy chủ", exact: true })
    .click();
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  await page.getByRole("button", { name: "Nộp bài", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page).toHaveURL(/\/student\/results\//);
  expect(
    (await db.attemptAnswer.findUniqueOrThrow({ where: { id: saved.id } }))
      .answerJson,
  ).toEqual(saved.answerJson);
});

test("P1: forward wall-clock jump cannot submit an attempt before the server deadline", async ({
  page,
}) => {
  const exam = await fixture(4);
  await login(page);
  await page.goto(`/student/exams/${exam.id}`);
  await page
    .getByRole("button", { name: "Bắt đầu làm bài", exact: true })
    .click();
  await expect(page.getByRole("radio").first()).toBeVisible();
  const id = page.url().split("/").at(-1)!;
  let submissions = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/submit")) submissions++;
  });
  await page.evaluate(() => {
    const now = Date.now;
    Date.now = () => now() + 3600000;
  });
  // Observe several real timer ticks; this is not a timeout/retry workaround.
  await page.waitForTimeout(1600);
  expect(
    (await db.examAttempt.findUniqueOrThrow({ where: { id } })).status,
  ).toBe("IN_PROGRESS");
  expect(submissions).toBe(0);
  await expect(
    page.getByLabel("Thời gian còn lại", { exact: true }),
  ).toHaveText(/00:44:\d{2}/);
});

async function openAttempt(page: import("@playwright/test").Page) {
  const exam = await fixture(4);
  await login(page);
  await page.goto(`/student/exams/${exam.id}`);
  await page
    .getByRole("button", { name: "Bắt đầu làm bài", exact: true })
    .click();
  await expect(page.getByRole("radio").first()).toBeVisible();
  return page.url().split("/").at(-1)!;
}
async function storedAttempt(id: string) {
  return db.examAttempt.findUniqueOrThrow({
    where: { id },
    include: {
      questions: { orderBy: { orderIndex: "asc" }, include: { answer: true } },
    },
  });
}
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((r) => {
    release = r;
  });
  return { promise, release };
}
const apiBase = "http://localhost:3000/api/v1";

test("P1: stale manual submit is rejected before finalization and needs a second explicit confirmation", async ({
  page,
  context,
}) => {
  const id = await openAttempt(page);
  await page.getByRole("radio").first().check();
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  const snapshot = (
    await (await page.request.get(`${apiBase}/student/attempts/${id}`)).json()
  ).data;
  // Keep this tab's reads on its old snapshot until its submit is rejected.
  await page.route(`${apiBase}/student/attempts/${id}`, (r) =>
    r.fulfill({ json: { data: snapshot } }),
  );
  const other = await context.newPage();
  await other.goto(page.url());
  await other.getByRole("radio").nth(1).check();
  await expect(other.getByRole("status")).toHaveText("Đã lưu");
  const latest = (await storedAttempt(id)).questions[0]!.answer!;
  const submission = page.waitForResponse((r) => r.url().endsWith("/submit"));
  await page.getByRole("button", { name: "Nộp bài", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  expect((await submission).status()).toBe(409);
  await expect(page.getByText(/Đáp án đã thay đổi ở tab khác/)).toBeVisible();
  await expect(page.getByRole("radio").first()).toBeChecked();
  expect((await storedAttempt(id)).status).toBe("IN_PROGRESS");
  await page.unroute(`${apiBase}/student/attempts/${id}`);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("radio").first()).toBeChecked();
  await page
    .getByRole("button", { name: "Dùng đáp án trên máy chủ", exact: true })
    .click();
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
  expect((await storedAttempt(id)).status).toBe("IN_PROGRESS");
  await page.reload();
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
  await page.getByRole("button", { name: "Nộp bài", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page).toHaveURL(/\/student\/results\//);
  expect((await storedAttempt(id)).questions[0]!.answer!.answerJson).toEqual(
    latest.answerJson,
  );
});

test("P1: lost save response retries the old revision, exposes conflict and preserves other pending answers", async ({
  page,
}) => {
  const id = await openAttempt(page);
  const held = gate();
  let writes = 0;
  let committed = false;
  await page.route("**/student/attempts/*/answers/*", async (r) => {
    writes++;
    if (writes === 1) {
      const saved = await r.fetch();
      expect(saved.status()).toBe(200);
      committed = true;
      await held.promise;
      await r.abort("failed");
    } else await r.continue();
  });
  await page.getByRole("radio").first().check();
  await expect.poll(() => committed).toBe(true);
  const first = (await storedAttempt(id)).questions[0]!.answer!;
  await page.getByRole("button", { name: "Câu 3", exact: true }).click();
  await page.getByLabel("Bài làm tự luận").fill("OTHER_PENDING_ANSWER");
  held.release();
  await expect(page.getByText(/Đáp án đã thay đổi ở tab khác/)).toBeVisible();
  expect(writes).toBe(2);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("status")).not.toHaveText("Đã lưu");
  expect((await storedAttempt(id)).questions[0]!.answer!.savedAt).toEqual(
    first.savedAt,
  );
  await expect(page.getByLabel("Bài làm tự luận")).toHaveValue(
    "OTHER_PENDING_ANSWER",
  );
  await page
    .getByRole("button", { name: "Dùng đáp án trên máy chủ", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  expect(writes).toBe(3);
  const stored = await storedAttempt(id);
  expect(stored.questions[0]!.answer!.savedAt).toEqual(first.savedAt);
  expect(stored.questions[2]!.answer!.answerText).toBe("OTHER_PENDING_ANSWER");
});

test("P1: submit drains pending save and repeats cannot change the submitted DB snapshot", async ({
  page,
}) => {
  const id = await openAttempt(page);
  const held = gate();
  let waiting = false;
  let submits = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/submit")) submits++;
  });
  await page.route("**/student/attempts/*/answers/*", async (r) => {
    waiting = true;
    await held.promise;
    await r.continue();
  });
  await page.getByRole("radio").nth(1).check();
  await expect.poll(() => waiting).toBe(true);
  await page.getByRole("button", { name: "Nộp bài", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Đang nộp…", exact: true }),
  ).toBeDisabled();
  expect(submits).toBe(0);
  held.release();
  await expect(page).toHaveURL(/\/student\/results\//);
  expect(submits).toBe(1);
  const stored = await storedAttempt(id);
  const options = (
    stored.questions[0]!.snapshotJson as { options: { id: string }[] }
  ).options;
  expect(stored.questions[0]!.answer!.answerJson).toEqual([options[1]!.id]);
  const csrf = (await (await page.request.get(`${apiBase}/auth/csrf`)).json())
    .data.token;
  const repeats = await Promise.all(
    [1, 2].map(() =>
      page.request.post(`${apiBase}/student/attempts/${id}/submit`, {
        data: {},
        headers: { Origin: "http://localhost:5173", "X-CSRF-Token": csrf },
      }),
    ),
  );
  expect(repeats.map((r) => r.status())).toEqual([200, 200]);
  expect(await storedAttempt(id)).toEqual(stored);
});

test("P1: backward wall-clock jump keeps normal countdown and manual early submit", async ({
  page,
}) => {
  const id = await openAttempt(page);
  await page.evaluate(() => {
    const original = Date.now;
    Date.now = () => original() - 3600000;
  });
  await page.waitForTimeout(1600);
  await expect(
    page.getByLabel("Thời gian còn lại", { exact: true }),
  ).toHaveText(/00:44:\d{2}/);
  expect((await storedAttempt(id)).status).toBe("IN_PROGRESS");
  await page.getByRole("button", { name: "Nộp bài", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page).toHaveURL(/\/student\/results\//);
  const stored = await storedAttempt(id);
  expect(stored.autoSubmitted).toBe(false);
  expect(stored.submittedAt!.getTime()).toBeLessThan(
    stored.expiresAt.getTime(),
  );
});

test("P1: a premature countdown estimate is corrected by the server without losing pending text", async ({
  page,
}) => {
  let reads = 0,
    submits = 0;
  await page.route(/\/student\/attempts\/[^/]+$/, async (r) => {
    if (r.request().method() !== "GET") return r.continue();
    const response = await r.fetch();
    const body = await response.json();
    reads++;
    if (reads === 1)
      body.data.expiresAt = new Date(
        Date.parse(body.data.serverNow) + 3000,
      ).toISOString();
    await r.fulfill({ response, json: body });
  });
  const id = await openAttempt(page);
  page.on("request", (r) => {
    if (r.url().endsWith("/submit")) submits++;
  });
  const held = gate();
  let saving = false;
  await page.route("**/student/attempts/*/answers/*", async (r) => {
    saving = true;
    await held.promise;
    await r.continue();
  });
  await page.getByRole("button", { name: "Câu 3", exact: true }).click();
  await page.getByLabel("Bài làm tự luận").fill("KEEP_PENDING_AFTER_RESYNC");
  await expect.poll(() => saving).toBe(true);
  await expect.poll(() => reads).toBeGreaterThanOrEqual(2);
  await expect(
    page.getByLabel("Thời gian còn lại", { exact: true }),
  ).toHaveText(/00:44:\d{2}/);
  await expect(page.getByLabel("Bài làm tự luận")).toHaveValue(
    "KEEP_PENDING_AFTER_RESYNC",
  );
  expect((await storedAttempt(id)).status).toBe("IN_PROGRESS");
  expect(submits).toBe(0);
  held.release();
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  expect((await storedAttempt(id)).questions[2]!.answer!.answerText).toBe(
    "KEEP_PENDING_AFTER_RESYNC",
  );
});

test("P1: offline zero countdown uses bounded deadline reads and reconnect finalizes without a submit POST", async ({
  page,
  context,
}) => {
  const id = await openAttempt(page);
  await db.examAttempt.update({
    where: { id },
    data: { expiresAt: new Date(Date.now() + 5000) },
  });
  await page.reload();
  await page.getByRole("button", { name: "Câu 3", exact: true }).click();
  let submits = 0,
    deadlineReads = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/submit")) submits++;
    if (r.url() === `${apiBase}/student/attempts/${id}`) deadlineReads++;
  });
  await context.setOffline(true);
  await page.getByLabel("Bài làm tự luận").fill("OFFLINE_UNACCEPTED");
  await expect(page.getByRole("status")).toHaveText("Lỗi lưu");
  await expect(
    page.getByLabel("Thời gian còn lại", { exact: true }),
  ).toHaveText("00:00:00");
  await page.waitForTimeout(3100);
  expect(deadlineReads).toBeLessThanOrEqual(4);
  expect(submits).toBe(0);
  await expect(page.getByLabel("Bài làm tự luận")).toHaveValue(
    "OFFLINE_UNACCEPTED",
  );
  await context.setOffline(false);
  await expect(
    page.getByRole("heading", { name: "Đã nộp bài thành công" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Một số thay đổi chưa kịp lưu",
  );
  const final = await storedAttempt(id);
  expect(final.autoSubmitted).toBe(true);
  expect(final.questions[2]!.answer!.answerText).toBeNull();
  expect(submits).toBe(0);
});

test("P1: reconnect three seconds before deadline saves pending text and auto-finalizes once", async ({
  page,
  context,
}) => {
  const id = await openAttempt(page);
  const expires = new Date(Date.now() + 10000);
  await db.examAttempt.update({ where: { id }, data: { expiresAt: expires } });
  await page.reload();
  await page.getByRole("button", { name: "Câu 3", exact: true }).click();
  let submits = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/submit")) submits++;
  });
  await context.setOffline(true);
  await page.getByLabel("Bài làm tự luận").fill("LATEST_BEFORE_DEADLINE");
  await expect(page.getByRole("status")).toHaveText("Lỗi lưu");
  await page.waitForTimeout(Math.max(0, expires.getTime() - Date.now() - 3000));
  await context.setOffline(false);
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  expect((await storedAttempt(id)).questions[2]!.answer!.answerText).toBe(
    "LATEST_BEFORE_DEADLINE",
  );
  await expect(
    page.getByRole("heading", { name: "Đã nộp bài thành công" }),
  ).toBeVisible();
  const final = await storedAttempt(id);
  expect(final.autoSubmitted).toBe(true);
  expect(final.questions[2]!.answer!.answerText).toBe("LATEST_BEFORE_DEADLINE");
  expect(submits).toBe(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Đã nộp bài thành công" }),
  ).toBeVisible();
  expect((await storedAttempt(id)).submittedAt).toEqual(final.submittedAt);
});

test("P1: visibility resume verifies the real server deadline", async ({
  page,
}) => {
  const id = await openAttempt(page);
  await db.examAttempt.update({
    where: { id },
    data: {
      startedAt: new Date(Date.now() - 60000),
      expiresAt: new Date(Date.now() - 1000),
    },
  });
  let submits = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/submit")) submits++;
  });
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(
    page.getByRole("heading", { name: "Đã nộp bài thành công" }),
  ).toBeVisible();
  expect((await storedAttempt(id)).autoSubmitted).toBe(true);
  expect(submits).toBe(0);
});

test("P1: an older save acknowledgement cannot clear a newer pending edit", async ({
  page,
}) => {
  const id = await openAttempt(page);
  const held = gate();
  let writes = 0;
  let committed = false;
  await page.route("**/student/attempts/*/answers/*", async (r) => {
    writes++;
    if (writes === 1) {
      const response = await r.fetch();
      committed = true;
      await held.promise;
      await r.fulfill({ response });
    } else await r.continue();
  });
  await page.getByRole("radio").first().check();
  await expect.poll(() => committed).toBe(true);
  await page.getByRole("radio").nth(1).check();
  await expect(page.getByRole("status")).not.toHaveText("Đã lưu");
  expect(writes).toBe(1);
  held.release();
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
  expect(writes).toBe(2);
  const stored = await storedAttempt(id);
  const options = (
    stored.questions[0]!.snapshotJson as { options: { id: string }[] }
  ).options;
  expect(stored.questions[0]!.answer!.answerJson).toEqual([options[1]!.id]);
  await page.reload();
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
});

test("P1: a save accepted before deadline persists before server finalization while its DB write is pending", async ({
  page,
}) => {
  const { Client } = await import("pg");
  const id = await openAttempt(page);
  await page.getByRole("radio").first().check();
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  const original = await storedAttempt(id),
    q = original.questions[0]!;
  const expires = new Date(Date.now() + 5000);
  await db.examAttempt.update({ where: { id }, data: { expiresAt: expires } });
  await page.reload();
  await expect(page.getByRole("radio").first()).toBeChecked();
  const blocker = new Client({ connectionString: database });
  await blocker.connect();
  await blocker.query("BEGIN");
  await blocker.query(
    'SELECT id FROM "AttemptAnswer" WHERE "attemptQuestionId"=$1 FOR UPDATE',
    [q.id],
  );
  let released = false,
    submits = 0;
  const acknowledgement = gate();
  await page.route("**/student/attempts/*/answers/*", async (route) => {
    const response = await route.fetch();
    await acknowledgement.promise;
    await route.fulfill({ response });
  });
  page.on("request", (r) => {
    if (r.url().endsWith("/submit")) submits++;
  });
  try {
    await page.getByRole("radio").nth(1).check();
    await expect
      .poll(async () =>
        Number(
          (
            await db.$queryRaw<
              { count: bigint }[]
            >`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%AttemptAnswer%'`
          )[0]!.count,
        ),
      )
      .toBeGreaterThan(0);
    await expect(
      page.getByLabel("Thời gian còn lại", { exact: true }),
    ).toHaveText("00:00:00");
    await blocker.query("COMMIT");
    released = true;
    await expect(
      page.getByRole("heading", { name: "Đã nộp bài thành công" }),
    ).toBeVisible();
    const final = await storedAttempt(id);
    const options = (q.snapshotJson as { options: { id: string }[] }).options;
    expect(final.questions[0]!.answer!.answerJson).toEqual([options[1]!.id]);
    expect(final.questions[0]!.answer!.savedAt.getTime()).toBeLessThan(
      expires.getTime(),
    );
    expect(final.submittedAt!.getTime()).toBeGreaterThanOrEqual(
      expires.getTime(),
    );
    expect(final.autoSubmitted).toBe(true);
    expect(submits).toBe(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
  } finally {
    acknowledgement.release();
    if (!released) await blocker.query("ROLLBACK");
    await blocker.end();
  }
});
