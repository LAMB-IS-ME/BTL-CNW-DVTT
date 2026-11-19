import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type WebSocketRoute,
} from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createDb } from "../../apps/api/src/db/client";
import {
  database,
  login,
  mutate,
  fixture,
  snapshot,
  join,
  answerCount,
} from "./live-quiz-fixtures";

const root =
  process.env.LIVE_QUIZ_SCREENSHOT_DIR || "test-results/live-quiz-rollout/after";
async function capture(page: Page, dir: string, name: string) {
  await mkdir(dir, { recursive: true });
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: `${dir}/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page
    .locator(".lq")
    .screenshot({ path: `${dir}/${name}-surface.png`, animations: "disabled" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
}
async function syntheticUser(role: "TEACHER" | "STUDENT", fullName?: string) {
  const db = createDb(database);
  try {
    const seed = await db.user.findUniqueOrThrow({
      where: {
        email:
          role === "TEACHER" ? "teacher1@exam.local" : "student1@exam.local",
      },
    });
    const user = await db.user.create({
      data: {
        email: `lq-rollout-${crypto.randomUUID()}@test.local`,
        fullName: fullName || seed.fullName,
        role,
        passwordHash: seed.passwordHash,
      },
    });
    return user.email;
  } finally {
    await db.$disconnect();
  }
}

// Drop only one real server ACK. Both Engine.IO transports are forwarded to the
// real server; no state, answer, score, or protocol response is fabricated.
async function loseAck(
  context: BrowserContext,
  event: "quiz:room:join" | "quiz:answer",
) {
  let ackId: string | undefined;
  let dropped = 0;
  let released = false;
  const holds: (() => void)[] = [];
  function client(message: string) {
    for (const frame of message.split("\x1e")) {
      const match = frame.match(/^42(\d+)\[/);
      if (!released && !dropped && match && frame.includes(`"${event}"`))
        ackId = match[1];
    }
  }
  function server(message: string) {
    return message
      .split("\x1e")
      .filter((frame) => {
        if (
          !released &&
          !dropped &&
          ackId !== undefined &&
          frame.startsWith(`43${ackId}[`)
        ) {
          dropped++;
          return false;
        }
        return true;
      })
      .join("\x1e");
  }
  await context.route("**/socket.io/**", async (route) => {
    if (route.request().method() !== "GET") {
      client(route.request().postData() || "");
      return route.continue();
    }
    const response = await route.fetch();
    const original = await response.text();
    const body = server(original);
    if (original && !body) {
      await new Promise<void>((resolve) => holds.push(resolve));
      // Preserve the original response when the held long poll is released.
      await route.fulfill({ response, body: original }).catch(() => {});
    } else await route.fulfill({ response, body });
  });
  await context.routeWebSocket(/\/socket\.io\//, (route) => {
    const upstream = route.connectToServer();
    route.onMessage((message) => {
      client(String(message));
      upstream.send(message);
    });
    upstream.onMessage((message) => {
      const body = server(String(message));
      if (body) route.send(body);
    });
  });
  return {
    count: () => dropped,
    release: () => {
      released = true;
      holds.splice(0).forEach((resolve) => resolve());
    },
  };
}

test("missing real join ACK times out honestly, then explicit retry recovers without a duplicate participant", async ({
  browser,
}, info) => {
  const teacher = await browser.newContext();
  const student = await browser.newContext({
    viewport: { width: 390, height: 960 },
  });
  const fault = await loseAck(student, "quiz:room:join");
  try {
    await login(teacher, "teacher1@exam.local");
    await login(student, "student1@exam.local");
    const quiz = await fixture(teacher);
    const room = await mutate<{ id: string; code: string }>(
      teacher,
      `/teacher/quizzes/${quiz.id}/rooms`,
      {},
    );
    const p = await student.newPage();
    await p.goto(`/student/quiz/${room.id}/lobby`);
    await expect.poll(fault.count).toBe(1);
    await expect(
      p.getByText("Đang xác nhận vào phòng…", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      p.getByText("Trực tuyến · Đã vào phòng", { exact: true }),
    ).toHaveCount(0);
    const dir = `${root}/${info.project.name}/hardening`;
    await capture(p, dir, "join-pending");
    await expect(p.getByRole("alert")).toContainText(
      "Chưa nhận được xác nhận vào phòng",
      { timeout: 12000 },
    );
    await expect(
      p.getByRole("heading", { name: "Chưa thể vào phòng" }),
    ).toBeVisible();
    await expect(
      p.getByText("Đang xác nhận tham gia", { exact: true }),
    ).toHaveCount(0);
    await expect(
      p.getByRole("heading", { name: "Chờ xác nhận vào phòng…" }),
    ).toHaveCount(0);
    await expect(p.getByText("Bạn đã vào phòng", { exact: true })).toHaveCount(
      0,
    );
    await capture(p, dir, "join-timeout");
    fault.release();
    await p.getByRole("button", { name: "Kết nối lại", exact: true }).click();
    await expect(
      p.getByText("Trực tuyến · Đã vào phòng", { exact: true }),
    ).toBeVisible();
    await expect(p.getByRole("alert")).toHaveCount(0);
    expect((await snapshot(teacher, room.id)).participants).toHaveLength(1);
    await capture(p, dir, "join-recovered");
    await writeFile(
      `${dir}/join-fault.json`,
      JSON.stringify({
        droppedRealAcknowledgements: fault.count(),
        recovered: true,
        participants: 1,
        timeoutPendingCopyAbsent: true,
        joinedOnlyAfterValidAck: true,
      }),
    );
  } finally {
    fault.release();
    await Promise.all([teacher.close(), student.close()]);
  }
});

test("answer committed before a lost ACK survives reload and host recovery; next question focus and state remain usable", async ({
  browser,
}, info) => {
  const teacher = await browser.newContext();
  const a = await browser.newContext();
  const b = await browser.newContext();
  const fault = await loseAck(a, "quiz:answer");
  let hostBlocked = false;
  const hostWires = new Set<WebSocketRoute>();
  await teacher.route("**/socket.io/**", (route) =>
    hostBlocked ? route.abort() : route.continue(),
  );
  await teacher.routeWebSocket(/\/socket\.io\//, (route) => {
    if (hostBlocked) {
      void route.close();
      return;
    }
    const server = route.connectToServer();
    hostWires.add(route);
    hostWires.add(server);
  });
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
    const host = await teacher.newPage(),
      player = await a.newPage(),
      other = await b.newPage();
    await host.goto(`/teacher/quiz-rooms/${room.id}/host`);
    await join(player, room.code);
    await join(other, room.code);
    await host.getByRole("button", { name: "Bắt đầu Quiz" }).click();
    await player.getByRole("radio").first().check();
    await player.getByRole("button", { name: "Gửi câu trả lời" }).click();
    await expect.poll(fault.count).toBe(1);
    await expect.poll(() => answerCount(room.id)).toBe(1);
    // Server persistence is proven before the client receives any answer ACK.
    fault.release();
    await player.reload();
    await expect(player.getByRole("radio").first()).toBeChecked();
    await expect(player.getByRole("radio").first()).toBeDisabled();
    await expect(
      player.getByText("Đã nhận câu trả lời. Chờ công bố đáp án.", {
        exact: true,
      }),
    ).toBeVisible();
    await host.reload();
    await expect(
      host.getByText("Trực tuyến · Đã vào phòng", { exact: true }),
    ).toBeVisible();
    const deadline = (await snapshot(teacher, room.id)).closesAt;
    hostBlocked = true;
    await teacher.setOffline(true);
    await Promise.all([...hostWires].map((wire) => wire.close()));
    await expect(
      host.getByText("Mất kết nối · Đang kết nối lại…", { exact: true }),
    ).toBeVisible();
    await capture(
      host,
      `${root}/${info.project.name}/hardening`,
      "host-disconnected",
    );
    hostBlocked = false;
    await teacher.setOffline(false);
    await expect(
      host.getByText("Trực tuyến · Đã vào phòng", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    expect((await snapshot(teacher, room.id)).closesAt).toBe(deadline);
    await other.getByRole("radio").first().check();
    await other.getByRole("button", { name: "Gửi câu trả lời" }).click();
    await expect(
      host.getByRole("button", { name: "Câu tiếp theo" }),
    ).toBeVisible();
    await player.locator(".lq-prompt").focus();
    await host.getByRole("button", { name: "Câu tiếp theo" }).click();
    await expect(player.getByRole("checkbox")).toHaveCount(4);
    await expect(player.locator(".lq-prompt")).toBeFocused();
    await expect(player.getByRole("checkbox").first()).toBeEnabled();
    await expect(player.getByRole("checkbox").first()).not.toBeChecked();
    expect(await answerCount(room.id)).toBe(2);
    const dir = `${root}/${info.project.name}/hardening`;
    await mkdir(dir, { recursive: true });
    await writeFile(
      `${dir}/answer-fault.json`,
      JSON.stringify({
        lostRealAcknowledgements: fault.count(),
        committedBeforeReload: true,
        recoveredOwnAnswer: true,
        nextQuestionFocus: true,
        hostTransportRecovered: true,
        deadlineUnchanged: true,
        answers: 2,
      }),
    );
  } finally {
    fault.release();
    await Promise.all([teacher.close(), a.close(), b.close()]);
  }
});

test("library empty, loading, failed fetch, retry, long title and existing API pagination", async ({
  browser,
}, info) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 960 },
  });
  try {
    await login(context, await syntheticUser("TEACHER"));
    const p = await context.newPage();
    const dir = `${root}/${info.project.name}/hardening`;
    await p.goto("/teacher/quizzes");
    await expect(
      p.getByRole("heading", { name: "Bắt đầu với một Quiz" }),
    ).toBeVisible();
    await capture(p, dir, "library-empty");
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    await p.route("**/api/v1/teacher/quizzes?*", async (route) => {
      await wait;
      await route.continue();
    });
    await p.reload({ waitUntil: "domcontentloaded" });
    await expect(
      p.locator(".lq-index").getByText("Đang tải…", { exact: true }),
    ).toBeVisible();
    await capture(p, dir, "library-loading");
    release();
    await expect(
      p.getByRole("heading", { name: "Bắt đầu với một Quiz" }),
    ).toBeVisible();
    await p.unrouteAll({ behavior: "wait" });
    await p.route("**/api/v1/teacher/quizzes?*", (route) =>
      route.abort("failed"),
    );
    await p.reload();
    await expect(p.getByRole("button", { name: "Thử tải lại" })).toBeVisible({
      timeout: 15000,
    });
    await expect(p.getByRole("alert")).toContainText(
      "Không tải được danh sách Quiz. Kiểm tra kết nối rồi thử lại.",
    );
    await capture(p, dir, "library-error");
    await p.unrouteAll({ behavior: "wait" });
    await p.getByRole("button", { name: "Thử tải lại" }).click();
    await expect(
      p.getByRole("heading", { name: "Bắt đầu với một Quiz" }),
    ).toBeVisible();
    for (let i = 0; i < 21; i++)
      await mutate(context, "/teacher/quizzes", {
        title: i === 20 ? "Q".repeat(200) : `Phiên ôn tập ${i + 1}`,
      });
    await p.reload();
    await expect(p.locator(".lq-quiz-row")).toHaveCount(20);
    for (const width of [1440, 1024, 820, 390, 320]) {
      await p.setViewportSize({ width, height: 960 });
      expect(
        await p.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
    }
    await p.getByRole("button", { name: "Trang sau" }).click();
    await expect(p.locator(".lq-quiz-row")).toHaveCount(1);
    await expect(p.getByRole("button", { name: "Trang sau" })).toBeDisabled();
    await p.getByRole("button", { name: "Trang trước" }).click();
    await expect(p.locator(".lq-quiz-row")).toHaveCount(20);
    await writeFile(
      `${dir}/library.json`,
      JSON.stringify({
        empty: true,
        failedRequestRetry: true,
        pages: [20, 1],
        longTitleLength: 200,
        widths: [1440, 1024, 820, 390, 320],
      }),
    );
  } finally {
    await context.close();
  }
});

test("long participant names, rich question content and landscape reflow preserve answer controls", async ({
  browser,
}, info) => {
  const teacher = await browser.newContext();
  const student = await browser.newContext();
  try {
    await login(teacher, "teacher1@exam.local");
    await login(
      student,
      await syntheticUser("STUDENT", "Nguyễn Thị Minh Châu ".repeat(8).trim()),
    );
    const prompt =
      "Phân tích tính đúng đắn của yêu cầu HTTP trong hệ thống phân tán. ".repeat(
        5,
      ) +
      "\n\n```http\nGET /" +
      "long-path/".repeat(40) +
      " HTTP/1.1\n```\n\nVới $a^2+b^2=c^2$, chọn đáp án phù hợp.\n\n| Phương thức | Tài nguyên |\n|---|---|\n| GET | /sessions |\n| PUT | /sessions/123 |";
    const quiz = await fixture(teacher, { title: "H".repeat(200), prompt });
    const room = await mutate<{ id: string; code: string }>(
      teacher,
      `/teacher/quizzes/${quiz.id}/rooms`,
      {},
    );
    const host = await teacher.newPage(),
      player = await student.newPage();
    await host.goto(`/teacher/quiz-rooms/${room.id}/host`);
    await join(player, room.code);
    const dir = `${root}/${info.project.name}/hardening`;
    for (const width of [1440, 1024, 820, 390, 320]) {
      await host.setViewportSize({ width, height: 960 });
      await capture(host, dir, `long-lobby-${width}`);
    }
    await host.getByRole("button", { name: "Bắt đầu Quiz" }).click();
    await expect(player.getByRole("radio").first()).toBeVisible();
    for (const [width, height] of [
      [1440, 960],
      [1024, 960],
      [820, 960],
      [390, 960],
      [320, 960],
      [844, 390],
    ]) {
      await player.setViewportSize({ width: width!, height: height! });
      await capture(player, dir, `rich-question-${width}`);
      await expect(player.locator(".katex").first()).toBeVisible();
    }
    await player.getByRole("radio").first().check();
    await player.getByRole("button", { name: "Gửi câu trả lời" }).click();
    await expect(
      player.getByText("Đã nhận câu trả lời.", { exact: true }),
    ).toBeVisible();
    expect(await answerCount(room.id)).toBe(1);
    for (const width of [1440, 1024, 820, 390, 320]) {
      await host.setViewportSize({ width, height: 960 });
      await player.setViewportSize({ width, height: 960 });
      await expect(
        player.getByRole("heading", { name: "Bảng xếp hạng" }),
      ).toBeVisible();
      await capture(player, dir, `long-leaderboard-${width}`);
      await capture(host, dir, `long-host-reveal-${width}`);
      const next = host.getByRole("button", { name: "Câu tiếp theo" });
      await expect(next).toBeVisible();
      const bounds = await next.boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      if (width <= 390) {
        const control = await host.locator(".lq-control").boundingBox();
        const question = await host.locator(".lq-question").boundingBox();
        expect(control!.y + control!.height).toBeLessThanOrEqual(question!.y);
      }
    }
    await writeFile(
      `${dir}/rich-content.json`,
      JSON.stringify({
        titleLength: 200,
        longName: true,
        markdown: ["paragraph", "code", "math", "table"],
        landscape: true,
        answered: true,
        longLeaderboardAndHostControls: [1440, 1024, 820, 390, 320],
      }),
    );
  } finally {
    await Promise.all([teacher.close(), student.close()]);
  }
});

// Replay an obsolete leave immediately before the real initial join. Both
// transports still talk to the real API; no state/answer/ACK is fabricated.
async function leaveBeforeJoin(context: BrowserContext) {
  let injected = 0;
  let blocked = false;
  const wires = new Set<WebSocketRoute>();
  const states: string[] = [];
  function incoming(message: string) {
    for (const frame of message.split("\x1e"))
      if (frame.includes('"quiz:state"')) states.push(frame);
  }
  function outgoing(message: string) {
    return message.split("\x1e").flatMap((frame) => {
      if (!injected && /^42\d*\["quiz:room:join",/.test(frame)) {
        const [, payload] = JSON.parse(frame.slice(frame.indexOf("["))) as [
          string,
          { roomId: string },
        ];
        injected++;
        return [
          `42${JSON.stringify(["quiz:room:leave", { roomId: payload.roomId }])}`,
          frame,
        ];
      }
      return [frame];
    });
  }
  await context.route("**/socket.io/**", async (route) => {
    if (blocked) return route.abort();
    if (route.request().method() === "POST")
      return route.continue({
        postData: outgoing(route.request().postData() || "").join("\x1e"),
      });
    // Reconnect can deliver its snapshot over polling before the WS upgrade.
    // Record and forward that real response as well as WebSocket frames.
    const response = await route.fetch();
    const body = await response.text();
    incoming(body);
    return route.fulfill({ response, body });
  });
  await context.routeWebSocket(/\/socket\.io\//, (route) => {
    if (blocked) {
      void route.close();
      return;
    }
    const upstream = route.connectToServer();
    wires.add(route);
    wires.add(upstream);
    route.onMessage((message) => {
      for (const frame of outgoing(String(message))) upstream.send(frame);
    });
    upstream.onMessage((message) => {
      incoming(String(message));
      route.send(message);
    });
  });
  return {
    count: () => injected,
    states,
    async disconnect() {
      blocked = true;
      await context.setOffline(true);
      await Promise.all([...wires].map((wire) => wire.close()));
      wires.clear();
    },
    async reconnect() {
      blocked = false;
      await context.setOffline(false);
    },
  };
}

test("ordered membership delivers host reveal without reload and recovers a reveal missed offline", async ({
  browser,
}) => {
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext()));
  const [teacher, a, b] = contexts as [
    BrowserContext,
    BrowserContext,
    BrowserContext,
  ];
  const fault = await leaveBeforeJoin(teacher);
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
    const [host, player, other] = (await Promise.all(
      contexts.map((c) => c.newPage()),
    )) as [Page, Page, Page];
    await join(player, room.code);
    await join(other, room.code);
    await host.goto(`/teacher/quiz-rooms/${room.id}/host`);
    await expect(host.locator('.lq[data-membership="joined"]')).toBeVisible();
    expect(fault.count()).toBe(1);
    await expect(
      host.getByRole("heading", { name: "2 người tham gia", exact: true }),
    ).toBeVisible();
    await host.getByRole("button", { name: "Bắt đầu Quiz" }).click();
    for (const p of [player, other]) {
      await p.getByRole("radio").first().check();
      await p
        .getByRole("button", { name: "Gửi câu trả lời", exact: true })
        .click();
    }
    // No reload/rejoin between Start and this reveal assertion.
    await expect(
      host.getByRole("heading", { name: "Bảng xếp hạng", exact: true }),
    ).toBeVisible();
    expect(
      fault.states.some((frame) => frame.includes('"answerCount":2')),
    ).toBe(true);
    expect(await answerCount(room.id)).toBe(2);
    await host.getByRole("button", { name: "Câu tiếp theo" }).click();
    await expect(player.getByRole("checkbox")).toHaveCount(4);
    const deadline = (await snapshot(teacher, room.id)).closesAt;
    for (const name of ["GET", "PUT", "DELETE"])
      await player.getByRole("checkbox", { name, exact: true }).check();
    await player
      .getByRole("button", { name: "Gửi câu trả lời", exact: true })
      .click();
    await fault.disconnect();
    await expect(host.locator('.lq[data-membership="joined"]')).toHaveCount(0);
    await expect(
      player.getByRole("heading", { name: "Bảng xếp hạng", exact: true }),
    ).toBeVisible({ timeout: 12000 });
    const receivedBeforeReconnect = fault.states.length;
    await fault.reconnect();
    await expect(host.locator('.lq[data-membership="joined"]')).toBeVisible({
      timeout: 15000,
    });
    await expect(
      host.getByRole("button", { name: "Câu tiếp theo" }),
    ).toBeVisible();
    expect(fault.states.length).toBeGreaterThan(receivedBeforeReconnect);
    const recovered = await snapshot(teacher, room.id);
    expect(recovered.closesAt).toBe(deadline);
    expect(recovered.reveal.answerCount).toBe(1);
    expect(recovered.participants).toHaveLength(2);
    await host.getByRole("button", { name: "Câu tiếp theo" }).click();
    for (const p of [player, other]) {
      await p.getByRole("radio", { name: "True", exact: true }).check();
      await p
        .getByRole("button", { name: "Gửi câu trả lời", exact: true })
        .click();
    }
    for (const p of [host, player, other])
      await expect(
        p.getByRole("heading", { name: "Kết quả cuối cùng", exact: true }),
      ).toBeVisible();
    expect(await answerCount(room.id)).toBe(5);
    const final = await snapshot(teacher, room.id);
    expect(final.status).toBe("FINISHED");
    expect(final.leaderboard).toHaveLength(2);
    expect(final.leaderboard[0].score).toBeGreaterThan(
      final.leaderboard[1].score,
    );
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
