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

// P2 exercises accepted reload/close, not just canceling beforeunload.
async function browserDrafts(page: import("@playwright/test").Page) {
  return page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith("examspace.student-draft.v1:"))
      .map((k) => JSON.parse(localStorage.getItem(k)!)),
  );
}
async function reloadWithConsent(page: import("@playwright/test").Page) {
  page.once("dialog", (d) => d.accept());
  await page.reload();
}
async function seedBrowserDraft(
  page: import("@playwright/test").Page,
  id: string,
  text: string,
  baseSavedAt: string | null = null,
) {
  const state = (
    await (await page.request.get(`${apiBase}/student/attempts/${id}`)).json()
  ).data;
  const user = (await (await page.request.get(`${apiBase}/auth/me`)).json())
    .data;
  const r = {
    schemaVersion: 1,
    userId: user.id,
    examId: state.examId,
    attemptId: id,
    questionId: state.questions[2].id,
    writerId: crypto.randomUUID(),
    recordId: crypto.randomUUID(),
    editId: crypto.randomUUID(),
    logoutEpoch: await page.evaluate(
      (id: string) =>
        localStorage.getItem(
          "examspace.student-draft.logout:" + encodeURIComponent(id),
        ),
      user.id,
    ),
    baseSavedAt,
    answer: { selectedOptionIds: [], answerText: text },
    editedAt: Date.parse(state.serverNow),
    recordedAt: Date.parse(state.serverNow),
  };
  await page.evaluate((r) => {
    const k =
      "examspace.student-draft.v1:" +
      [r.userId, r.examId, r.attemptId, r.questionId, r.writerId, r.recordId]
        .map(encodeURIComponent)
        .join(":");
    localStorage.setItem(k, JSON.stringify(r));
  }, r);
  return r;
}

test("P2: reload in the input event before debounce offers keyboard recovery and preserves the revision contract", async ({
  page,
}) => {
  const id = await openAttempt(page);
  await page.getByRole("button", { name: "Câu 3", exact: true }).click();
  const writes: { expectedSavedAt: string | null; answerText: string }[] = [];
  page.on("request", (r) => {
    if (r.method() === "PUT") writes.push(r.postDataJSON());
  });
  const loaded = page.waitForEvent("load");
  page.once("dialog", (d) => d.accept());
  await page.getByLabel("Bài làm tự luận").evaluate((node) => {
    const input = node as HTMLTextAreaElement;
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(input, "BEFORE_DEBOUNCE");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (
      !Object.keys(localStorage).some((k) =>
        k.startsWith("examspace.student-draft.v1:"),
      )
    )
      throw new Error("No synchronous draft");
    window.location.reload();
  });
  await loaded;
  const heading = page.getByRole("heading", {
    name: "Kiểm tra bản nháp trên thiết bị",
  });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await page.screenshot({
    path: test.info().outputPath("p2-recovery-desktop.png"),
    fullPage: true,
  });
  await expect(
    page.getByRole("button", { name: "Nộp bài", exact: true }),
  ).toBeDisabled();
  expect(writes).toHaveLength(0);
  expect((await storedAttempt(id)).questions[2]!.answer).toBeNull();
  const restore = page.getByRole("button", {
    name: "Phục hồi bản nháp 1 của câu 3",
  });
  await restore.focus();
  const saved = page.waitForResponse(
    (r) => r.request().method() === "PUT" && r.url().includes("/answers/"),
  );
  await page.keyboard.press("Enter");
  expect((await saved).status()).toBe(200);
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  expect(writes).toEqual([
    {
      selectedOptionIds: [],
      answerText: "BEFORE_DEBOUNCE",
      expectedSavedAt: null,
    },
  ]);
  expect((await storedAttempt(id)).questions[2]!.answer!.answerText).toBe(
    "BEFORE_DEBOUNCE",
  );
  expect(await browserDrafts(page)).toHaveLength(0);
});

test("P2: reload during a pending PUT retains the unsent draft and explicitly recovers it", async ({
  page,
}) => {
  const id = await openAttempt(page);
  const held = gate();
  let waiting = false;
  await page.route("**/student/attempts/*/answers/*", async (r) => {
    waiting = true;
    await held.promise;
    await r.abort("failed").catch(() => {});
  });
  await page.getByRole("button", { name: "Câu 3", exact: true }).click();
  await page.getByLabel("Bài làm tự luận").fill("PENDING_RELOAD");
  await expect.poll(() => waiting).toBe(true);
  expect((await browserDrafts(page))[0].answer.answerText).toBe(
    "PENDING_RELOAD",
  );
  await reloadWithConsent(page);
  await expect(
    page.getByRole("heading", { name: "Kiểm tra bản nháp trên thiết bị" }),
  ).toBeVisible();
  expect((await storedAttempt(id)).questions[2]!.answer).toBeNull();
  held.release();
  await page.unroute("**/student/attempts/*/answers/*");
  await page
    .getByRole("button", { name: "Phục hồi bản nháp 1 của câu 3" })
    .click();
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  expect((await storedAttempt(id)).questions[2]!.answer!.answerText).toBe(
    "PENDING_RELOAD",
  );
});

test("P2: close and reopen a tab retains the draft without automatically writing it", async ({
  page,
  context,
}) => {
  const id = await openAttempt(page),
    url = page.url();
  await page.route("**/student/attempts/*/answers/*", (r) => r.abort("failed"));
  await page.getByRole("button", { name: "Câu 3", exact: true }).click();
  await page.getByLabel("Bài làm tự luận").fill("CLOSED_TAB_DRAFT");
  page.once("dialog", (d) => d.accept());
  await page.close({ runBeforeUnload: true });
  const reopened = await context.newPage();
  let writes = 0;
  reopened.on("request", (r) => {
    if (r.method() === "PUT") writes++;
  });
  await reopened.goto(url);
  await expect(reopened.getByLabel(/Bản nháp 1 — Câu 3/)).toHaveValue(
    "CLOSED_TAB_DRAFT",
  );
  expect(writes).toBe(0);
  expect((await storedAttempt(id)).questions[2]!.answer).toBeNull();
  await reopened
    .getByRole("button", { name: "Phục hồi bản nháp 1 của câu 3" })
    .click();
  await expect(reopened.getByRole("status")).toHaveText("Đã lưu");
  expect(writes).toBe(1);
  expect((await storedAttempt(id)).questions[2]!.answer!.answerText).toBe(
    "CLOSED_TAB_DRAFT",
  );
});

test("P2: offline API editing and reload preserve local content until authoritative reconnect", async ({
  page,
  context,
}) => {
  const id = await openAttempt(page);
  await page.getByRole("button", { name: "Câu 3", exact: true }).click();
  // Keep the static app shell reachable while the API is offline, including auth.
  // This deterministically exercises a fresh document with no accepted answer PUT.
  await context.route("**/api/v1/**", (r) => r.abort("internetdisconnected"));
  await page.getByLabel("Bài làm tự luận").fill("OFFLINE_RELOAD");
  await expect(page.getByRole("status")).toHaveText("Lỗi lưu");
  expect((await browserDrafts(page))[0].answer.answerText).toBe(
    "OFFLINE_RELOAD",
  );
  await reloadWithConsent(page);
  await expect(
    page.getByRole("button", { name: "Thử lại", exact: true }),
  ).toBeVisible();
  expect((await browserDrafts(page))[0].answer.answerText).toBe(
    "OFFLINE_RELOAD",
  );
  expect((await storedAttempt(id)).questions[2]!.answer).toBeNull();
  await context.unroute("**/api/v1/**");
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.getByLabel(/Bản nháp 1 — Câu 3/)).toHaveValue(
    "OFFLINE_RELOAD",
  );
  expect((await storedAttempt(id)).questions[2]!.answer).toBeNull();
  await page
    .getByRole("button", { name: "Phục hồi bản nháp 1 của câu 3" })
    .click();
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  expect((await storedAttempt(id)).questions[2]!.answer!.answerText).toBe(
    "OFFLINE_RELOAD",
  );
});

test("P2: server commit with missing ACK reloads as synchronized without a duplicate PUT", async ({
  page,
}) => {
  const id = await openAttempt(page);
  const held = gate();
  let committed = false,
    writes = 0;
  await page.route("**/student/attempts/*/answers/*", async (r) => {
    writes++;
    await r.fetch();
    committed = true;
    await held.promise;
    await r.abort("failed").catch(() => {});
  });
  await page.getByRole("button", { name: "Câu 3", exact: true }).click();
  await page.getByLabel("Bài làm tự luận").fill("COMMITTED_WITHOUT_ACK");
  await expect.poll(() => committed).toBe(true);
  const before = (await storedAttempt(id)).questions[2]!.answer!;
  await reloadWithConsent(page);
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  expect(await browserDrafts(page)).toHaveLength(0);
  expect(writes).toBe(1);
  expect((await storedAttempt(id)).questions[2]!.answer!.savedAt).toEqual(
    before.savedAt,
  );
  held.release();
});

test("P2: divergent tab writers require a choice; cleanup cannot delete a subsequent unseen edit", async ({
  page,
  context,
}) => {
  const id = await openAttempt(page),
    url = page.url();
  const other = await context.newPage();
  await other.goto(url);
  await expect(other.getByRole("radio").first()).toBeVisible();
  for (const tab of [page, other]) {
    await tab.route("**/student/attempts/*/answers/*", (r) =>
      r.abort("failed"),
    );
    await tab.getByRole("button", { name: "Câu 3", exact: true }).click();
  }
  await page.getByLabel("Bài làm tự luận").fill("WRITER_A");
  await other.getByLabel("Bài làm tự luận").fill("WRITER_B");
  const reviewer = await context.newPage();
  await reviewer.goto(url);
  await expect(
    reviewer.getByRole("button", { name: "Phục hồi bản nháp 2 của câu 3" }),
  ).toBeVisible();
  await expect(
    reviewer.getByRole("button", { name: "Nộp bài", exact: true }),
  ).toBeDisabled();
  expect((await storedAttempt(id)).questions[2]!.answer).toBeNull();
  await page.getByLabel("Bài làm tự luận").fill("WRITER_A_UNSEEN_NEW_EDIT");
  const previews = reviewer.getByLabel(/Bản nháp \d+ — Câu 3/);
  let selected = -1;
  for (let n = 0; n < (await previews.count()); n++) {
    if ((await previews.nth(n).inputValue()) === "WRITER_B") selected = n + 1;
  }
  expect(selected).toBeGreaterThan(0);
  await reviewer
    .getByRole("button", { name: `Phục hồi bản nháp ${selected} của câu 3` })
    .click();
  await expect(reviewer.getByRole("status")).toHaveText("Đã lưu");
  expect((await storedAttempt(id)).questions[2]!.answer!.answerText).toBe(
    "WRITER_B",
  );
  const remaining = await browserDrafts(reviewer);
  expect(remaining.map((r) => r.answer.answerText)).toEqual([
    "WRITER_A_UNSEEN_NEW_EDIT",
  ]);
});

test("P2: a stale local revision is copyable but cannot overwrite the server", async ({
  page,
}) => {
  const id = await openAttempt(page);
  await page.getByRole("button", { name: "Câu 3", exact: true }).click();
  await page.getByLabel("Bài làm tự luận").fill("AUTHORITATIVE_SERVER");
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  const before = (await storedAttempt(id)).questions[2]!.answer!;
  await seedBrowserDraft(page, id, "STALE_LOCAL", null);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Phục hồi bản nháp 1 của câu 3" }),
  ).toBeDisabled();
  await expect(page.getByLabel(/Đáp án trên máy chủ — Câu 3/)).toHaveValue(
    "AUTHORITATIVE_SERVER",
  );
  await expect(page.getByLabel(/Bản nháp 1 — Câu 3/)).toHaveValue(
    "STALE_LOCAL",
  );
  await page
    .getByRole("button", { name: "Dùng đáp án máy chủ cho câu 3" })
    .click();
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  expect((await storedAttempt(id)).questions[2]!.answer).toEqual(before);
  expect(await browserDrafts(page)).toHaveLength(0);
});

test("P2: partial save preserves every other dirty question through reload and review", async ({
  page,
}) => {
  const id = await openAttempt(page);
  await page.getByRole("radio").first().check();
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  const first = (await storedAttempt(id)).questions[0]!.answer!;
  await page.route("**/student/attempts/*/answers/*", (r) =>
    r.fulfill({
      status: 503,
      json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
    }),
  );
  await page.getByRole("button", { name: "Câu 2", exact: true }).click();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Câu 3", exact: true }).click();
  await page.getByLabel("Bài làm tự luận").fill("OTHER_DIRTY_QUESTION");
  await expect(page.getByRole("status")).toHaveText("Lỗi lưu");
  expect(await browserDrafts(page)).toHaveLength(2);
  await reloadWithConsent(page);
  await expect(
    page.getByRole("button", { name: "Phục hồi bản nháp 1 của câu 2" }),
  ).toBeVisible();
  await page.unroute("**/student/attempts/*/answers/*");
  let writes = 0;
  page.on("request", (r) => {
    if (r.method() === "PUT") writes++;
  });
  await page
    .getByRole("button", { name: "Phục hồi bản nháp 1 của câu 2" })
    .click();
  expect(writes).toBe(0);
  await page
    .getByRole("button", { name: "Phục hồi bản nháp 1 của câu 3" })
    .click();
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  const after = await storedAttempt(id);
  expect(after.questions[0]!.answer).toEqual(first);
  expect(after.questions[1]!.answer!.answerJson).toHaveLength(1);
  expect(after.questions[2]!.answer!.answerText).toBe("OTHER_DIRTY_QUESTION");
  expect(writes).toBe(2);
  expect(await browserDrafts(page)).toHaveLength(0);
});

test("P2: deadline reached during review locks recovery and leaves a read-only copy", async ({
  page,
}) => {
  const id = await openAttempt(page);
  await seedBrowserDraft(page, id, "UNACCEPTED_AFTER_DEADLINE");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Phục hồi bản nháp 1 của câu 3" }),
  ).toBeVisible();
  await db.examAttempt.update({
    where: { id },
    data: {
      startedAt: new Date(Date.now() - 60000),
      expiresAt: new Date(Date.now() - 1000),
    },
  });
  let writes = 0;
  page.on("request", (r) => {
    if (r.method() === "PUT" || r.url().endsWith("/submit")) writes++;
  });
  await page
    .getByRole("button", { name: "Phục hồi bản nháp 1 của câu 3" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bản nháp của lượt thi đã khóa" }),
  ).toBeVisible();
  await expect(page.getByLabel(/Bản nháp 1 — Câu 3/)).toHaveValue(
    "UNACCEPTED_AFTER_DEADLINE",
  );
  expect(writes).toBe(0);
  expect((await storedAttempt(id)).autoSubmitted).toBe(true);
  expect((await storedAttempt(id)).questions[2]!.answer!.answerText).toBeNull();
  await page
    .getByRole("button", { name: "Đã xem, xóa bản nháp trên thiết bị" })
    .click();
  expect(await browserDrafts(page)).toHaveLength(0);
});

test("P2: session expiry preserves a draft for explicit recovery after reauthentication", async ({
  page,
  context,
}) => {
  const id = await openAttempt(page),
    url = page.url();
  const held = gate();
  let waiting = false;
  await page.route("**/student/attempts/*/answers/*", async (r) => {
    waiting = true;
    await held.promise;
    await r.continue().catch(() => {});
  });
  await page.getByRole("button", { name: "Câu 3", exact: true }).click();
  await page.getByLabel("Bài làm tự luận").fill("SESSION_RECOVERY_ONLY");
  await expect.poll(() => waiting).toBe(true);
  const csrf = (
    await (await context.request.get(`${apiBase}/auth/csrf`)).json()
  ).data.token;
  expect(
    (
      await context.request.post(`${apiBase}/auth/logout`, {
        headers: { Origin: "http://localhost:5173", "X-CSRF-Token": csrf },
      })
    ).status(),
  ).toBe(204);
  held.release();
  await expect(
    page.getByRole("heading", { name: "Phiên đăng nhập đã kết thúc" }),
  ).toBeVisible();
  expect((await browserDrafts(page))[0].answer.answerText).toBe(
    "SESSION_RECOVERY_ONLY",
  );
  await login(page);
  await page.goto(url);
  await expect(page.getByLabel(/Bản nháp 1 — Câu 3/)).toHaveValue(
    "SESSION_RECOVERY_ONLY",
  );
  expect((await storedAttempt(id)).questions[2]!.answer).toBeNull();
  await page
    .getByRole("button", { name: "Phục hồi bản nháp 1 của câu 3" })
    .click();
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  expect((await storedAttempt(id)).questions[2]!.answer!.answerText).toBe(
    "SESSION_RECOVERY_ONLY",
  );
});

test("P2: explicit logout purges the user's drafts and a late ACK cannot recreate them", async ({
  page,
  context,
}) => {
  const id = await openAttempt(page);
  const held = gate();
  let committed = false;
  await page.route("**/student/attempts/*/answers/*", async (r) => {
    const response = await r.fetch();
    committed = true;
    await held.promise;
    await r.fulfill({ response }).catch(() => {});
  });
  await page.getByRole("button", { name: "Câu 3", exact: true }).click();
  await page.getByLabel("Bài làm tự luận").fill("COMMITTED_BEFORE_LOGOUT");
  await expect.poll(() => committed).toBe(true);
  await page.getByLabel("Bài làm tự luận").fill("NEWER_UNSENT_BEFORE_LOGOUT");
  const other = await context.newPage();
  await other.goto("/student");
  await other.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(other.getByLabel("Email", { exact: true })).toBeVisible();
  expect(await browserDrafts(other)).toHaveLength(0);
  const response = page.waitForResponse(
    (r) => r.request().method() === "PUT" && r.url().includes("/answers/"),
  );
  held.release();
  await response;
  await expect.poll(() => browserDrafts(other)).toHaveLength(0);
  expect((await storedAttempt(id)).questions[2]!.answer!.answerText).toBe(
    "COMMITTED_BEFORE_LOGOUT",
  );
  await login(other);
  await other.goto(`/student/attempts/${id}`);
  await expect(other.getByRole("status")).toHaveText("Đã lưu");
  expect(await browserDrafts(other)).toHaveLength(0);
});

test("P2: mobile recovery stays within the viewport and supports keyboard confirmation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await openAttempt(page);
  await seedBrowserDraft(page, id, "Bản nháp trên điện thoại. ".repeat(80));
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Kiểm tra bản nháp trên thiết bị" }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("p2-recovery-mobile.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Phục hồi bản nháp 1 của câu 3" })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Đã lưu");
  expect((await storedAttempt(id)).questions[2]!.answer!.answerText).toBe(
    "Bản nháp trên điện thoại. ".repeat(80),
  );
});

test("P2: account B cannot display or restore account A's retained drafts", async ({
  page,
}) => {
  const a = await openAttempt(page);
  const record = await seedBrowserDraft(page, a, "ACCOUNT_A_PRIVATE_DRAFT");
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("student2@exam.local");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("DevOnly!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL("/student");
  await page.goto(`/student/exams/${record.examId}`);
  await page
    .getByRole("button", { name: "Bắt đầu làm bài", exact: true })
    .click();
  await expect(page.getByRole("radio").first()).toBeVisible();
  expect(page.url().split("/").at(-1)).not.toBe(a);
  await expect(
    page.getByRole("heading", { name: "Kiểm tra bản nháp trên thiết bị" }),
  ).toHaveCount(0);
  await expect(page.getByText("ACCOUNT_A_PRIVATE_DRAFT")).toHaveCount(0);
  expect(
    (await browserDrafts(page)).some((r) => r.recordId === record.recordId),
  ).toBe(true);
  expect((await storedAttempt(a)).questions[2]!.answer).toBeNull();
});
