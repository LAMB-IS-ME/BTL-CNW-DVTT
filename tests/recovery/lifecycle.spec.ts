import { test, expect, type BrowserContext } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { fixture as examFixture } from "../ui/student-focus-fixtures";
import { gradingFixture } from "../ui/grading-results-fixtures";
import { createDb } from "../../apps/api/src/db/client";
import {
  base,
  database,
  fixture,
  join,
  login,
  mutate,
  snapshot,
} from "../ui/live-quiz-fixtures";
const before = process.env.RECOVERY_BASELINE === "1";
const evidence = "docs/remediation/session-realtime-recovery-evidence";
const db = createDb(database);
let apiProcess: ChildProcess;
async function start() {
  apiProcess = spawn(
    process.execPath,
    ["--import", "tsx", "apps/api/src/server.ts"],
    {
      env: {
        ...process.env,
        DOTENV_CONFIG_PATH: "/dev/null",
        NODE_ENV: "test",
        PORT: "3000",
        DATABASE_URL: database,
        SESSION_SECRET: "recovery-local-only-secret-32-characters",
        CLIENT_ORIGIN: "http://localhost:5173",
        COOKIE_SECURE: "false",
        SUPABASE_URL: "",
        SUPABASE_SERVICE_ROLE_KEY: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  // Do not persist HTTP headers, session cookies, tokens or raw browser traces.
  await expect
    .poll(async () => {
      try {
        return (await fetch("http://localhost:3000/api/health")).ok;
      } catch {
        return false;
      }
    })
    .toBe(true);
}
async function stop(signal: NodeJS.Signals = "SIGTERM") {
  if (apiProcess.exitCode === null && apiProcess.signalCode === null) {
    const exited = once(apiProcess, "exit");
    apiProcess.kill(signal);
    await exited;
  }
}
async function expire(email: string, revoke = false) {
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  if (revoke)
    await db.$executeRaw`DELETE FROM session WHERE sess::jsonb->>'userId' = ${user.id}`;
  else
    await db.$executeRaw`UPDATE session SET expire = NOW() - INTERVAL '1 second' WHERE sess::jsonb->>'userId' = ${user.id}`;
}
test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
  await start();
});
test.afterAll(async () => {
  await stop();
  await db.$disconnect();
});

test("session expiry before SPA navigation clears protected identity", async ({
  browser,
}) => {
  const context = await browser.newContext();
  try {
    await login(context, "teacher1@exam.local");
    const page = await context.newPage();
    await page.goto("/teacher/classes");
    await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
    await expire("teacher1@exam.local");
    await page.getByRole("link", { name: "Live Quiz", exact: true }).click();
    if (before) {
      await expect(
        page.getByText("Vui lòng đăng nhập.", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Đăng xuất" }),
      ).toBeVisible();
      await writeFile(
        `${evidence}/session-before.json`,
        JSON.stringify(
          {
            actual:
              "401 enforced but cached identity and protected route remain",
            confirmed: true,
            expiry: "real PostgreSQL session expiration",
            url: new URL(page.url()).pathname,
          },
          null,
          2,
        ),
      );
    } else {
      await expect(
        page.getByRole("heading", { name: "Phiên đăng nhập đã kết thúc" }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Đăng xuất" })).toHaveCount(
        0,
      );
    }
  } finally {
    await context.close();
  }
});

test("SIGKILL restart preserves answers and deadline, reconciles offline membership", async ({
  browser,
}) => {
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext()));
  const [teacher, a, b] = contexts as [
    BrowserContext,
    BrowserContext,
    BrowserContext,
  ];
  try {
    await login(teacher, "teacher1@exam.local");
    await login(a, "student1@exam.local");
    await login(b, "student2@exam.local");
    const quiz = await fixture(teacher);
    const room = await mutate<{ id: string; code: string }>(
      teacher,
      `/teacher/quizzes/${quiz.id}/rooms`,
      {},
    );
    const [tp, ap, bp] = await Promise.all(contexts.map((c) => c.newPage()));
    await tp!.goto(`/teacher/quiz-rooms/${room.id}/host`);
    await join(ap!, room.code);
    await join(bp!, room.code);
    await expect(tp!.locator('.lq-roster li[data-online="true"]')).toHaveCount(
      2,
    );
    await tp!.getByRole("button", { name: "Bắt đầu Quiz" }).click();
    await ap!.getByRole("radio").first().check();
    await ap!.getByRole("button", { name: "Gửi câu trả lời" }).click();
    await expect(
      ap!.getByText("Đã nhận câu trả lời. Chờ công bố đáp án.", {
        exact: true,
      }),
    ).toBeVisible();
    const live = await snapshot(teacher, room.id);
    const answers = await db.quizAnswer.findMany({
      where: { question: { roomId: room.id } },
    });
    const participants = await db.quizParticipant.findMany({
      where: { roomId: room.id },
      orderBy: { id: "asc" },
    });
    expect(answers).toHaveLength(1);
    const crashAt = new Date().toISOString();
    await stop("SIGKILL");
    expect(
      await db.quizParticipant.count({
        where: { roomId: room.id, isConnected: true },
      }),
    ).toBe(2);
    // Close B while the server is dead: it cannot send a clean leave.
    await b.close();
    if (!before) {
      await teacher.setOffline(true);
      await a.setOffline(true);
    }
    await start();
    if (!before) {
      expect(
        await db.quizParticipant.count({
          where: { roomId: room.id, isConnected: true },
        }),
      ).toBe(0);
      const reconciled = await db.quizParticipant.findMany({
        where: { roomId: room.id },
        orderBy: { id: "asc" },
      });
      expect(reconciled.map((p) => p.lastSeenAt)).toEqual(
        participants.map((p) => p.lastSeenAt),
      );
      await teacher.setOffline(false);
      await expect(
        tp!.getByText("Trực tuyến · Đã vào phòng", { exact: true }),
      ).toBeVisible();
      await expect(
        tp!.locator('.lq-roster li[data-online="false"]'),
      ).toHaveCount(2);
      await a.setOffline(false);
    }
    await expect(
      tp!.getByText("Trực tuyến · Đã vào phòng", { exact: true }),
    ).toBeVisible();
    await expect(
      ap!.getByText("Trực tuyến · Đã vào phòng", { exact: true }),
    ).toBeVisible();
    await expect(
      ap!.getByText("Đã nhận câu trả lời. Chờ công bố đáp án.", {
        exact: true,
      }),
    ).toBeVisible();
    const restored = await snapshot(teacher, room.id);
    expect(restored.closesAt).toBe(live.closesAt);
    expect(restored.question.id).toBe(live.question.id);
    expect(restored.currentIndex).toBe(live.currentIndex);
    expect(
      await db.quizAnswer.findMany({
        where: { question: { roomId: room.id } },
      }),
    ).toEqual(answers);
    const count = before ? 2 : 1;
    await expect
      .poll(() =>
        db.quizParticipant.count({
          where: { roomId: room.id, isConnected: true },
        }),
      )
      .toBe(count);
    await expect(tp!.locator('.lq-roster li[data-online="true"]')).toHaveCount(
      count,
    );
    const afterParticipants = await db.quizParticipant.findMany({
      where: { roomId: room.id },
      orderBy: { id: "asc" },
    });
    expect(
      afterParticipants.map((p) => [p.id, p.studentId, p.score, p.joinedAt]),
    ).toEqual(
      participants.map((p) => [p.id, p.studentId, p.score, p.joinedAt]),
    );
    // Expire each persisted deadline on disposable fixtures; only server advances/reveals.
    for (let index = 0; index < 3; index++) {
      await expect
        .poll(async () => (await snapshot(teacher, room.id)).currentIndex)
        .toBe(index);
      if (!before && index === 2) await stop("SIGKILL");
      await db.quizRoom.update({
        where: { id: room.id },
        data: { questionClosesAt: new Date(Date.now() - 1) },
      });
      if (!before && index === 2) await start();
      await expect
        .poll(async () => (await snapshot(teacher, room.id)).reveal !== null)
        .toBe(true);
      if (index < 2)
        await tp!.getByRole("button", { name: "Câu tiếp theo" }).click();
    }
    await expect(
      tp!.getByRole("heading", { name: "Kết quả cuối cùng" }),
    ).toBeVisible();
    const final = await snapshot(teacher, room.id);
    expect(final.status).toBe("FINISHED");
    expect(final.leaderboard[0].score).toBe(answers[0]!.pointsAwarded);
    await writeFile(
      `${evidence}/quiz-${before ? "before" : "after"}.json`,
      JSON.stringify(
        {
          crashAt,
          restoredAt: new Date().toISOString(),
          transport:
            "real Socket.IO, Teacher + Student A rejoined, B closed during outage",
          connected: count,
          participants: restored.participants.length,
          deadlinePreserved: restored.closesAt === live.closesAt,
          answersPreserved: true,
          membershipAndScoresPreserved: true,
          automaticFinish: final.status,
          expiredWhileServerDown: !before,
          startupBeforeReconnect: before
            ? "NOT TESTED"
            : "all offline before teacher reconnect, lastSeenAt unchanged",
          leaderboardScores: final.leaderboard.map(
            (p: { score: number }) => p.score,
          ),
        },
        null,
        2,
      ),
    );
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

for (const [role, email, route] of [
  ["Admin", "admin@exam.local", "/admin/users"],
  ["Student", "student3@exam.local", "/student/exams"],
])
  test(`${role}: expired reload and protected route remain signed out`, async ({
    browser,
  }) => {
    test.skip(before);
    const context = await browser.newContext();
    try {
      await login(context, email!);
      const page = await context.newPage();
      await page.goto(route!);
      await expect(
        page.getByRole("button", { name: "Đăng xuất" }),
      ).toBeVisible();
      await expire(email!);
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Đăng nhập vào ExamSpace" }),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/login$/);
      expect((await context.request.get(`${base}/auth/me`)).status()).toBe(401);
    } finally {
      await context.close();
    }
  });

test("idle expiry is detected without navigation; recovery is responsive and keyboard accessible", async ({
  browser,
}) => {
  test.skip(before);
  const context = await browser.newContext();
  try {
    await login(context, "teacher2@exam.local");
    const page = await context.newPage();
    await page.goto("/teacher/exams");
    await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expire("teacher2@exam.local");
    const heading = page.getByRole("heading", {
      name: "Phiên đăng nhập đã kết thúc",
    });
    await expect(heading).toBeVisible({ timeout: 35000 });
    await expect(heading).toBeFocused();
    const observations = [];
    await mkdir("docs/screenshots/session-realtime-recovery", {
      recursive: true,
    });
    for (const width of [1440, 1024, 820, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: `docs/screenshots/session-realtime-recovery/expired-${width}.png`,
        fullPage: true,
      });
      observations.push({ width, overflow });
    }
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Đăng nhập lại" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Đăng nhập vào ExamSpace" }),
    ).toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill("student3@exam.local");
    await page
      .getByLabel("Mật khẩu", { exact: true })
      .fill(process.env.DEMO_PASSWORD!);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page).toHaveURL(/\/student$/);
    await page.goto("/teacher/exams");
    await expect(page).toHaveURL(/\/403$/);
    await writeFile(
      `${evidence}/geometry.json`,
      JSON.stringify(observations, null, 2),
    );
  } finally {
    await context.close();
  }
});

test("Teacher draft mutation: expired CSRF confirms auth, does not create or replay the draft", async ({
  browser,
}) => {
  test.skip(before);
  const context = await browser.newContext();
  try {
    await login(context, "teacher1@exam.local");
    const page = await context.newPage();
    await page.goto("/teacher/exams/new");
    const title = `Unsaved recovery ${crypto.randomUUID()}`;
    await page.getByLabel("Tên bài thi", { exact: true }).fill(title);
    await expire("teacher1@exam.local");
    let mutations = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().endsWith("/teacher/exams"))
        mutations++;
    });
    await page
      .getByRole("button", { name: "Lưu bài thi", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Phiên đăng nhập đã kết thúc" }),
    ).toBeVisible();
    await expect(page.getByText(/Các thay đổi chưa lưu/)).toBeVisible();
    expect(await db.exam.count({ where: { title } })).toBe(0);
    expect(mutations).toBe(1);
    await page.getByRole("link", { name: "Đăng nhập lại" }).click();
    await page.getByLabel("Email", { exact: true }).fill("teacher1@exam.local");
    await page
      .getByLabel("Mật khẩu", { exact: true })
      .fill(process.env.DEMO_PASSWORD!);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page).toHaveURL(/\/teacher$/);
    expect(await db.exam.count({ where: { title } })).toBe(0);
    expect(mutations).toBe(1);
  } finally {
    await context.close();
  }
});

test("network failure and valid-session RBAC/CSRF rejection do not become expiry", async ({
  browser,
}) => {
  test.skip(before);
  const context = await browser.newContext();
  try {
    await login(context, "teacher1@exam.local");
    const page = await context.newPage();
    await page.route("**/api/v1/teacher/quizzes?*", (route) => route.abort());
    await page.goto("/teacher/quizzes");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Phiên đăng nhập đã kết thúc" }),
    ).toHaveCount(0);
    await page.unroute("**/api/v1/teacher/quizzes?*");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Live Quiz", exact: true }),
    ).toBeVisible();
    expect((await context.request.get(`${base}/admin/users`)).status()).toBe(
      403,
    );
    // Alter only the outgoing CSRF header: the actual middleware rejects it.
    await page.route("**/api/v1/teacher/exams", (route) =>
      route.continue({
        headers: {
          ...route.request().headers(),
          "x-csrf-token": "invalid-test-token",
        },
      }),
    );
    await page.goto("/teacher/exams/new");
    await page
      .getByLabel("Tên bài thi", { exact: true })
      .fill("CSRF rejected draft");
    await page
      .getByRole("button", { name: "Lưu bài thi", exact: true })
      .click();
    await expect(
      page.getByText("Phiên biểu mẫu hết hạn. Vui lòng tải lại.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByLabel("Tên bài thi", { exact: true })).toHaveValue(
      "CSRF rejected draft",
    );
    expect((await context.request.get(`${base}/auth/me`)).status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: "Phiên đăng nhập đã kết thúc" }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("logout in another tab revokes the shared session", async ({
  browser,
}) => {
  test.skip(before);
  const context = await browser.newContext();
  try {
    await login(context, "student4@exam.local");
    const page = await context.newPage();
    await page.goto("/student/exams");
    await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
    const other = await context.newPage();
    await other.goto("/student/exams");
    await other.getByRole("button", { name: "Đăng xuất" }).click();
    await expect(other).toHaveURL(/\/login$/);
    // Bringing the old tab to the foreground can invalidate it before a link
    // click. Wait for that recovery instead of targeting a disappearing link.
    await page.bringToFront();
    await expect(
      page.getByRole("heading", { name: "Phiên đăng nhập đã kết thúc" }),
    ).toBeVisible({ timeout: 35000 });
    expect((await context.request.get(`${base}/student/exams`)).status()).toBe(
      401,
    );
  } finally {
    await context.close();
  }
});

test("Question Bank editor expiry leaves stored question intact and does not bypass its leave guard", async ({
  browser,
}) => {
  test.skip(before);
  const context = await browser.newContext();
  try {
    await login(context, "teacher1@exam.local");
    const bank = await mutate<{ id: string }>(
      context,
      "/teacher/question-banks",
      { title: "Recovery editor" },
    );
    const question = await mutate<{ id: string }>(
      context,
      `/teacher/question-banks/${bank.id}/questions`,
      {
        type: "ESSAY",
        promptMarkdown: "Stored prompt",
        defaultPoints: 1,
        options: [],
      },
    );
    const page = await context.newPage();
    await page.goto(`/teacher/questions/${question.id}/edit`);
    await page
      .getByLabel("Nội dung câu hỏi", { exact: true })
      .fill("Unsaved changed prompt");
    await expire("teacher1@exam.local", true);
    await page
      .getByRole("button", { name: "Lưu câu hỏi", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Phiên đăng nhập đã kết thúc" }),
    ).toBeVisible();
    expect(
      (await db.question.findUniqueOrThrow({ where: { id: question.id } }))
        .promptMarkdown,
    ).toBe("Stored prompt");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("Grading expiry preserves submitted status, grade and result release policy", async ({
  browser,
}) => {
  test.skip(before);
  const f = await gradingFixture(1);
  const stored = await db.examAttempt.findUniqueOrThrow({
    where: { id: f.attempts[0]!.id },
    include: { questions: { include: { answer: true } } },
  });
  const context = await browser.newContext();
  try {
    await login(context, "teacher1@exam.local");
    const page = await context.newPage();
    await page.goto(`/teacher/exams/${f.exam.id}/grading`);
    await page.getByRole("spinbutton").first().fill("2");
    await page
      .getByLabel("Nhận xét", { exact: true })
      .first()
      .fill("Unsaved feedback");
    await expire("teacher1@exam.local");
    await page
      .getByRole("button", { name: "Lưu điểm", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Phiên đăng nhập đã kết thúc" }),
    ).toBeVisible();
    expect(
      await db.examAttempt.findUniqueOrThrow({
        where: { id: stored.id },
        include: { questions: { include: { answer: true } } },
      }),
    ).toEqual(stored);
    expect(
      (await db.exam.findUniqueOrThrow({ where: { id: f.exam.id } }))
        .manualResultsReleasedAt,
    ).toBeNull();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("Student autosave expiry retains accepted answer and does not submit or replay unsaved answer", async ({
  browser,
}) => {
  test.skip(before);
  const exam = await examFixture(1);
  const context = await browser.newContext();
  try {
    await login(context, "student1@exam.local");
    const attempt = await mutate<{ id: string }>(
      context,
      `/student/exams/${exam.id}/attempts`,
      {},
    );
    const page = await context.newPage();
    await page.goto(`/student/attempts/${attempt.id}`);
    await page.getByRole("radio").first().check();
    await expect
      .poll(() =>
        db.attemptAnswer.count({
          where: { question: { attemptId: attempt.id } },
        }),
      )
      .toBe(1);
    const saved = await db.attemptAnswer.findFirstOrThrow({
      where: { question: { attemptId: attempt.id } },
    });
    await expire("student1@exam.local");
    await page.getByRole("radio").nth(1).check();
    await expect(
      page.getByRole("heading", { name: "Phiên đăng nhập đã kết thúc" }),
    ).toBeVisible();
    expect(
      await db.attemptAnswer.findUniqueOrThrow({ where: { id: saved.id } }),
    ).toEqual(saved);
    expect(
      (await db.examAttempt.findUniqueOrThrow({ where: { id: attempt.id } }))
        .status,
    ).toBe("IN_PROGRESS");
    await page.getByRole("link", { name: "Đăng nhập lại" }).click();
    await page.getByLabel("Email", { exact: true }).fill("student1@exam.local");
    await page
      .getByLabel("Mật khẩu", { exact: true })
      .fill(process.env.DEMO_PASSWORD!);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page).toHaveURL(/\/student$/);
    await page.goto(`/student/attempts/${attempt.id}`);
    await expect(page.getByRole("radio").first()).toBeChecked();
    expect(
      await db.attemptAnswer.findUniqueOrThrow({ where: { id: saved.id } }),
    ).toEqual(saved);
  } finally {
    await context.close();
  }
});

test("clicking logout after expiration recovers instead of retaining a stale header", async ({
  browser,
}) => {
  test.skip(before);
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill("teacher1@exam.local");
    await page
      .getByLabel("Mật khẩu", { exact: true })
      .fill(process.env.DEMO_PASSWORD!);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page).toHaveURL(/\/teacher$/);
    // Stay in this SPA document so the login CSRF token remains cached.
    await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expire("teacher1@exam.local");
    await page.getByRole("button", { name: "Đăng xuất" }).click();
    await expect(
      page.getByRole("heading", { name: "Phiên đăng nhập đã kết thúc" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Đăng xuất" })).toHaveCount(
      0,
    );
  } finally {
    await context.close();
  }
});

test("reconnect attempts during a blocked startup cannot race presence reconciliation", async ({
  browser,
}) => {
  test.skip(before);
  const teacher = await browser.newContext(),
    student = await browser.newContext();
  let release: (() => void) | undefined;
  try {
    await login(teacher, "teacher1@exam.local");
    await login(student, "student2@exam.local");
    const quiz = await fixture(teacher);
    const room = await mutate<{ id: string; code: string }>(
      teacher,
      `/teacher/quizzes/${quiz.id}/rooms`,
      {},
    );
    const tp = await teacher.newPage(),
      sp = await student.newPage();
    await tp.goto(`/teacher/quiz-rooms/${room.id}/host`);
    await join(sp, room.code);
    await expect(tp.locator('.lq-roster li[data-online="true"]')).toHaveCount(
      1,
    );
    await stop("SIGKILL");
    let locked!: () => void;
    const ready = new Promise<void>((r) => {
      locked = r;
    });
    const held = new Promise<void>((r) => {
      release = r;
    });
    const transaction = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "QuizParticipant" WHERE "roomId"=${room.id}::uuid FOR UPDATE`;
        locked();
        await held;
      },
      { timeout: 15000 },
    );
    await ready;
    const starting = start();
    try {
      await expect
        .poll(async () => {
          const rows = await db.$queryRaw<
            { count: bigint }[]
          >`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%QuizParticipant%'`;
          return Number(rows[0]!.count);
        })
        .toBeGreaterThan(0);
      await expect(
        tp.getByText("Trực tuyến · Đã vào phòng", { exact: true }),
      ).toHaveCount(0);
      await expect(
        sp.getByText("Trực tuyến · Đã vào phòng", { exact: true }),
      ).toHaveCount(0);
      expect(
        await fetch("http://localhost:3000/api/health").then(
          () => true,
          () => false,
        ),
      ).toBe(false);
    } finally {
      release!();
      await transaction;
      await starting;
    }
    await expect(
      tp.getByText("Trực tuyến · Đã vào phòng", { exact: true }),
    ).toBeVisible();
    await expect(
      sp.getByText("Trực tuyến · Đã vào phòng", { exact: true }),
    ).toBeVisible();
    await expect(tp.locator('.lq-roster li[data-online="true"]')).toHaveCount(
      1,
    );
    expect(
      await db.quizParticipant.count({
        where: { roomId: room.id, isConnected: true },
      }),
    ).toBe(1);
    expect((await snapshot(teacher, room.id)).participants).toHaveLength(1);
    await writeFile(
      `${evidence}/startup-barrier.json`,
      JSON.stringify(
        {
          reconciliationBlockedOnDatabaseLock: true,
          listeningWhileBlocked: false,
          browsersAttemptedReconnectDuringStartup: true,
          connectedAfterReady: 1,
          duplicateMembership: false,
        },
        null,
        2,
      ),
    );
  } finally {
    release?.();
    await teacher.close();
    await student.close();
  }
});
