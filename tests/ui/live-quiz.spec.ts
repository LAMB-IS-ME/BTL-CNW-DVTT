import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import {
  base,
  login,
  mutate,
  fixture,
  snapshot,
  join,
  answerCount,
} from "./live-quiz-fixtures";

const phase = process.env.LIVE_QUIZ_PHASE || "after";
const root =
  process.env.LIVE_QUIZ_SCREENSHOT_DIR || `test-results/live-quiz-audit/${phase}`;
const widths = process.env.LIVE_QUIZ_WIDTHS
  ? process.env.LIVE_QUIZ_WIDTHS.split(",").map(Number)
  : [1440, 820, 390];
for (const width of widths) {
  test(`${width}: real three-context lifecycle, recovery, deadline and results`, async ({
    browser,
  }, info) => {
    const dir = `${root}/${info.project.name}/${width}`;
    await mkdir(dir, { recursive: true });
    const contexts = await Promise.all(
      [0, 1, 2].map(() =>
        browser.newContext({
          viewport: { width, height: 960 },
          reducedMotion: "reduce",
        }),
      ),
    );
    const [teacher, a, b] = contexts;
    let transportBlocked = false;
    const wires = new Set<WebSocketRoute>();
    await b!.route("**/socket.io/**", (route) =>
      transportBlocked ? route.abort() : route.continue(),
    );
    await b!.routeWebSocket(/\/socket\.io\//, (route) => {
      if (transportBlocked) {
        void route.close();
        return;
      }
      // Transparent connection to the real server: no mocked protocol frames.
      const server = route.connectToServer();
      wires.add(route);
      wires.add(server);
    });
    const [tp, ap, bp] = await Promise.all(contexts.map((c) => c.newPage()));
    const errors: string[] = [];
    const snapshots: string[] = [];
    ap!.on("websocket", (socket) =>
      socket.on("framereceived", (frame) => {
        const payload = String(frame.payload);
        if (payload.includes('"quiz:state"')) snapshots.push(payload);
      }),
    );
    for (const p of [tp!, ap!, bp!])
      p.on("pageerror", (e) => errors.push(e.message));
    const captures: object[] = [];
    async function capture(p: Page, name: string) {
      await p.evaluate(() => document.fonts.ready);
      await p.mouse.move(0, 0);
      await p.screenshot({
        path: `${dir}/${name}.png`,
        fullPage: true,
        animations: "disabled",
      });
      await p.locator(".lq").screenshot({
        path: `${dir}/${name}-surface.png`,
        animations: "disabled",
      });
      const regions = await p.locator(".lq").evaluate((el) => {
        const root = el.getBoundingClientRect();
        const selectors = [
          ".lq-heading",
          ".lq-control",
          ".lq-ranking",
          ".lq-question",
          ".lq-roster",
        ];
        return Object.fromEntries(
          selectors.map((selector) => {
            const r = el.querySelector(selector)?.getBoundingClientRect();
            return [
              selector,
              r
                ? {
                    x: r.x - root.x,
                    y: r.y - root.y,
                    width: r.width,
                    height: r.height,
                  }
                : null,
            ];
          }),
        );
      });
      const overflow = await p.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      );
      captures.push({ name, overflow, regions });
      if (phase !== "before") expect(overflow, name).toBeLessThanOrEqual(1);
    }
    try {
      await login(teacher!, "teacher1@exam.local");
      await login(a!, "student1@exam.local");
      await login(b!, "student2@exam.local");
      const quiz = await fixture(teacher!);
      await tp!.goto("/teacher/quizzes");
      await expect(
        tp!.getByRole("heading", { name: "Live Quiz", exact: true }),
      ).toBeVisible();
      await expect(
        tp!
          .getByRole("link", { name: /Công nghệ Web · Session & HTTP/ })
          .first(),
      ).toBeVisible();
      await capture(tp!, "teacher-entry");
      await tp!.goto(`/teacher/quizzes/${quiz.id}/edit`);
      await expect(
        tp!.getByRole("button", { name: "Lưu & tạo phòng" }),
      ).toBeVisible();
      await capture(tp!, "teacher-builder");
      await tp!.getByRole("button", { name: "Lưu & tạo phòng" }).click();
      await tp!.waitForURL(/quiz-rooms\/.*\/host/);
      const roomId = tp!.url().split("/").at(-2)!;
      await expect(
        tp!.getByRole("button", { name: "Bắt đầu Quiz" }),
      ).toBeDisabled();
      const room = await snapshot(teacher!, roomId);
      await capture(tp!, "teacher-lobby-empty");
      await ap!.goto("/student/quiz/join");
      await expect(ap!.getByLabel("Mã phòng")).toBeVisible();
      await capture(ap!, "student-join");
      await ap!.getByLabel("Mã phòng").fill("000000");
      await ap!.getByRole("button", { name: "Vào phòng", exact: true }).click();
      await expect(ap!.getByRole("alert")).toBeVisible();
      await capture(ap!, "student-invalid-code");
      await join(ap!, room.code);
      await join(bp!, room.code);
      await expect(
        tp!.getByRole("heading", { name: "2 người tham gia", exact: true }),
      ).toBeVisible();
      await capture(tp!, "teacher-lobby");
      await capture(ap!, "student-waiting");
      await tp!.getByRole("button", { name: "Bắt đầu Quiz" }).click();
      for (const p of [ap!, bp!])
        await expect(p.getByRole("radio").first()).toBeVisible();
      await capture(tp!, "teacher-active");
      await capture(ap!, "student-question");
      const live = await snapshot(teacher!, roomId);
      expect(live.status).toBe("LIVE");
      expect(live.reveal).toBeNull();
      expect(live.leaderboard).toEqual([]);
      expect(JSON.stringify(live)).not.toContain("isCorrect");
      await ap!.getByRole("radio").first().focus();
      await ap!.keyboard.press("Space");
      await expect(ap!.getByRole("radio").first()).toBeChecked();
      // A participant reload produces real left/joined snapshots while A edits.
      const beforeReload = snapshots.length;
      await bp!.reload();
      await expect(bp!.getByRole("radio").first()).toBeVisible();
      await expect.poll(() => snapshots.length).toBeGreaterThan(beforeReload);
      await expect(ap!.getByRole("radio").first()).toBeChecked();
      await ap!.getByRole("radio").nth(1).check();
      await tp!.reload();
      await expect(
        tp!.getByText(live.question.promptMarkdown, { exact: true }),
      ).toBeVisible();
      await expect(ap!.getByRole("radio").nth(1)).toBeChecked();
      await ap!.getByRole("radio").first().check();
      await capture(ap!, "student-selected");
      await ap!.getByRole("button", { name: "Gửi câu trả lời" }).click();
      await expect(
        ap!.getByText("Đã nhận câu trả lời. Chờ công bố đáp án.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(ap!.getByRole("radio").first()).toBeDisabled();
      await capture(ap!, "student-submitted");
      await ap!.reload();
      await expect(ap!.getByRole("radio").first()).toBeChecked();
      await expect(ap!.getByRole("radio").first()).toBeDisabled();
      expect((await snapshot(teacher!, roomId)).closesAt).toBe(live.closesAt);
      await tp!.reload();
      await expect(
        tp!.getByText(live.question.promptMarkdown, { exact: true }),
      ).toBeVisible();
      await expect
        .poll(
          async () => (await snapshot(teacher!, roomId)).participants.length,
        )
        .toBe(2);
      // Firefox offline emulation alone keeps existing WebSockets alive.
      // Close both ends of the real routed connection and block fallback polling.
      transportBlocked = true;
      await b!.setOffline(true);
      await Promise.all([...wires].map((wire) => wire.close()));
      wires.clear();
      await expect(
        bp!.getByText(/Đang kết nối lại|Mất kết nối/).first(),
      ).toBeVisible({ timeout: 45000 });
      await capture(bp!, "student-disconnected");
      transportBlocked = false;
      await b!.setOffline(false);
      await expect(bp!.getByText(/Trực tuyến/).first()).toBeVisible({
        timeout: 15000,
      });
      await expect(bp!.getByRole("radio").first()).toBeEnabled();
      await capture(bp!, "student-reconnected");
      await bp!.getByRole("radio").nth(1).check();
      await bp!.getByRole("button", { name: "Gửi câu trả lời" }).click();
      for (const p of [tp!, ap!, bp!])
        await expect(
          p.getByRole("heading", { name: "Bảng xếp hạng", exact: true }),
        ).toBeVisible();
      await capture(tp!, "teacher-leaderboard");
      await capture(ap!, "student-leaderboard");
      const revealed = await snapshot(teacher!, roomId);
      expect(revealed.reveal.answerCount).toBe(2);
      expect(
        revealed.leaderboard.map((p: { fullName: string }) => p.fullName),
      ).toEqual(["Nguyễn Hoàng Anh", "Trần Thị Hương"]);
      expect(revealed.leaderboard[0].score).toBeGreaterThanOrEqual(1000);
      expect(revealed.leaderboard[1].score).toBe(0);
      await tp!.getByRole("button", { name: "Câu tiếp theo" }).click();
      await expect(ap!.getByRole("checkbox")).toHaveCount(4);
      await expect(ap!.getByRole("checkbox").first()).not.toBeChecked();
      await ap!.getByRole("checkbox", { name: "GET", exact: true }).check();
      await ap!.getByRole("checkbox", { name: "PUT", exact: true }).check();
      await ap!.getByRole("checkbox", { name: "DELETE", exact: true }).check();
      await ap!.getByRole("button", { name: "Gửi câu trả lời" }).click();
      // Student B does not answer; the real server deadline worker closes question 2.
      await expect(
        tp!.getByRole("button", { name: "Câu tiếp theo" }),
      ).toBeVisible({ timeout: 12000 });
      expect((await snapshot(teacher!, roomId)).reveal.answerCount).toBe(1);
      await capture(bp!, "student-deadline");
      await tp!.getByRole("button", { name: "Câu tiếp theo" }).click();
      for (const p of [ap!, bp!]) {
        await p.getByRole("radio", { name: "True", exact: true }).check();
        await p.getByRole("button", { name: "Gửi câu trả lời" }).click();
      }
      for (const p of [tp!, ap!, bp!])
        await expect(
          p.getByRole("heading", { name: "Kết quả cuối cùng" }),
        ).toBeVisible();
      await capture(tp!, "teacher-finished");
      await capture(ap!, "student-finished");
      await ap!.reload();
      await expect(
        ap!.getByRole("heading", { name: "Kết quả cuối cùng" }),
      ).toBeVisible();
      const final = await snapshot(teacher!, roomId);
      expect(final.status).toBe("FINISHED");
      expect(final.currentIndex).toBe(2);
      expect(final.participants).toHaveLength(2);
      expect(await answerCount(roomId)).toBe(5);
      expect(
        (await a!.request.get(`${base}/teacher/quiz-rooms/${roomId}`)).status(),
      ).toBe(403);
      expect(errors).toEqual([]);
      await writeFile(
        `${dir}/evidence.json`,
        JSON.stringify(
          {
            phase,
            browser: info.project.name,
            width,
            roomId,
            captures,
            errors,
            final,
          },
          null,
          2,
        ),
      );
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
    }
  });
}

test("rejected join is not presented as room membership", async ({
  browser,
}, info) => {
  const teacher = await browser.newContext();
  const student = await browser.newContext();
  const outsider = await browser.newContext();
  try {
    await login(teacher, "teacher1@exam.local");
    await login(student, "student1@exam.local");
    await login(outsider, "student3@exam.local");
    const quiz = await fixture(teacher);
    const room = await mutate<{ id: string; code: string }>(
      teacher,
      `/teacher/quizzes/${quiz.id}/rooms`,
      {},
    );
    const host = await teacher.newPage();
    const player = await student.newPage();
    for (const width of [1440, 820, 390]) {
      const directory = `${root}/${info.project.name}/${width}`;
      await mkdir(directory, { recursive: true });
      await player.setViewportSize({ width, height: 960 });
      await player.goto("/student/quiz/join");
      await expect(player.getByLabel("Mã phòng")).toBeVisible();
      await player.screenshot({
        path: `${directory}/student-join.png`,
        fullPage: true,
      });
      await host.setViewportSize({ width, height: 960 });
      await host.goto("/teacher/quizzes");
      await expect(
        host
          .getByRole("link", { name: /Công nghệ Web · Session & HTTP/ })
          .first(),
      ).toBeVisible();
      await host.screenshot({
        path: `${directory}/teacher-entry.png`,
        fullPage: true,
      });
    }
    await host.goto(`/teacher/quiz-rooms/${room.id}/host`);
    await join(player, room.code);
    await host.getByRole("button", { name: "Bắt đầu Quiz" }).click();
    await expect(player.getByRole("radio").first()).toBeVisible();
    const rejected = await outsider.newPage();
    await rejected.setViewportSize({ width: 1440, height: 960 });
    await rejected.goto(`/student/quiz/${room.id}/lobby`);
    await expect(rejected.getByRole("alert")).toBeVisible();
    const directory = `${root}/${info.project.name}/1440`;
    await mkdir(directory, { recursive: true });
    await rejected.screenshot({
      path: `${directory}/student-join-rejected.png`,
      fullPage: true,
    });
    if (phase === "before") {
      // Historical defect evidence; the final expectation below is the regression gate.
      await expect(rejected.getByText(/Trực tuyến/)).toBeVisible();
    } else {
      await expect(rejected.getByText(/Trực tuyến/)).toHaveCount(0);
      await expect(
        rejected.getByText("Chưa vào phòng", { exact: true }),
      ).toBeVisible();
      await expect(
        rejected.getByText("Đang tải…", { exact: true }),
      ).toHaveCount(0);
      await expect(
        rejected.getByText("Đang xác nhận tham gia", { exact: true }),
      ).toHaveCount(0);
      await expect(
        rejected.getByText("Chờ xác nhận vào phòng…", { exact: true }),
      ).toHaveCount(0);
    }
    expect((await snapshot(teacher, room.id)).participants).toHaveLength(1);
  } finally {
    await Promise.all([teacher.close(), student.close(), outsider.close()]);
  }
});

test("keyboard, timer, touch targets, contrast and reduced motion at five widths", async ({
  browser,
}, info) => {
  const teacher = await browser.newContext();
  const student = await browser.newContext({ reducedMotion: "reduce" });
  try {
    await login(teacher, "teacher1@exam.local");
    await login(student, "student1@exam.local");
    const quiz = await fixture(teacher);
    const room = await mutate<{ id: string; code: string }>(
      teacher,
      `/teacher/quizzes/${quiz.id}/rooms`,
      {},
    );
    const host = await teacher.newPage();
    const player = await student.newPage();
    await host.goto(`/teacher/quiz-rooms/${room.id}/host`);
    await player.goto("/student/quiz/join");
    await player.getByLabel("Mã phòng").focus();
    await player.keyboard.type(room.code);
    await player.keyboard.press("Tab");
    await expect(
      player.getByRole("button", { name: "Vào phòng", exact: true }),
    ).toBeFocused();
    await player.keyboard.press("Enter");
    await expect(
      player.getByText("Chờ giảng viên bắt đầu…", { exact: true }),
    ).toBeVisible();
    await host.getByRole("button", { name: "Bắt đầu Quiz" }).focus();
    await host.keyboard.press("Enter");
    const choices = player.getByRole("radio");
    await expect(choices.first()).toBeVisible();
    const choiceBefore = await player
      .locator(".lq-answers .choice")
      .first()
      .boundingBox();
    await choices.first().focus();
    await player.keyboard.press("Space");
    await expect(choices.first()).toBeChecked();
    const choiceAfter = await player
      .locator(".lq-answers .choice")
      .first()
      .boundingBox();
    expect(choiceAfter).toEqual(choiceBefore);
    const ring = await choices
      .first()
      .evaluate((el) => getComputedStyle(el.closest("label")!).outlineStyle);
    expect(ring).toBe("solid");
    const prompt = await player.locator(".lq-prompt").elementHandle();
    const initial = await snapshot(teacher, room.id);
    const metrics = [];
    for (const width of [1440, 1024, 820, 390, 320]) {
      await player.setViewportSize({ width, height: 960 });
      await host.setViewportSize({ width, height: 960 });
      for (const p of [player, host])
        expect(
          await p.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          ),
        ).toBeLessThanOrEqual(1);
      const targets = await player
        .locator(".lq-answers label, .lq button")
        .evaluateAll((elements) =>
          elements.map((el) => ({
            height: el.getBoundingClientRect().height,
            width: el.getBoundingClientRect().width,
          })),
        );
      expect(targets.every((r) => r.height >= 44 && r.width >= 44)).toBe(true);
      const timer = await player.getByRole("timer").textContent();
      const seconds = timer!
        .split(":")
        .reduce((total, value) => total * 60 + Number(value), 0);
      const current = await snapshot(teacher, room.id);
      const expected = Math.ceil(
        (Date.parse(current.closesAt) - Date.parse(current.serverNow)) / 1000,
      );
      expect(Math.abs(seconds - expected)).toBeLessThanOrEqual(2);
      expect(current.closesAt).toBe(initial.closesAt);
      expect(await player.getByRole("timer").getAttribute("aria-live")).toBe(
        "off",
      );
      expect(
        await player
          .getByRole("timer")
          .evaluate((el) => el.closest('[role="status"]')),
      ).toBeNull();
      expect(
        await player
          .locator(".lq-question")
          .evaluate((el) => getComputedStyle(el).animationName),
      ).toBe("none");
      metrics.push({
        width,
        targets,
        timerErrorSeconds: Math.abs(seconds - expected),
      });
    }
    expect(await prompt!.evaluate((el) => el.isConnected)).toBe(true);
    const colors = await player
      .getByRole("button", { name: "Gửi câu trả lời" })
      .evaluate((el) => ({
        fg: getComputedStyle(el).color,
        bg: getComputedStyle(el).backgroundColor,
      }));
    const luminance = (color: string) => {
      const c = color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
        .map((n) => {
          const v = n / 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
      return c[0]! * 0.2126 + c[1]! * 0.7152 + c[2]! * 0.0722;
    };
    const l = [luminance(colors.fg), luminance(colors.bg)].sort(
      (a, b) => b - a,
    );
    const contrast = (l[0]! + 0.05) / (l[1]! + 0.05);
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    await player.keyboard.press("Tab");
    await expect(
      player.getByRole("button", { name: "Gửi câu trả lời" }),
    ).toBeFocused();
    await player.keyboard.press("Enter");
    await expect(
      player.getByText("Đã nhận câu trả lời.", { exact: true }),
    ).toBeVisible();
    expect(await answerCount(room.id)).toBe(1);
    await expect(
      host.getByRole("button", { name: "Câu tiếp theo" }),
    ).toBeVisible();
    const polishColors = await host.locator(".lq-control").evaluate((el) => {
      const panel = getComputedStyle(el);
      const pairs = ["h2", ".lq-label", "button"].map((selector) => {
        const style = getComputedStyle(el.querySelector(selector)!);
        return {
          label: `control ${selector}`,
          fg: style.color,
          bg:
            selector === "button"
              ? style.backgroundColor
              : panel.backgroundColor,
        };
      });
      const leader = document.querySelector(
        '.lq-ranking tr[data-leading="true"]',
      )!;
      const rank = getComputedStyle(leader.querySelector(".lq-rank-number")!);
      const name = getComputedStyle(leader.querySelector("th")!);
      return [
        ...pairs,
        { label: "leading rank", fg: rank.color, bg: rank.backgroundColor },
        { label: "leading name", fg: name.color, bg: name.backgroundColor },
      ];
    });
    const polishContrast = polishColors.map((pair) => {
      const values = [luminance(pair.fg), luminance(pair.bg)].sort(
        (a, b) => b - a,
      );
      const ratio = (values[0]! + 0.05) / (values[1]! + 0.05);
      expect(ratio, pair.label).toBeGreaterThanOrEqual(4.5);
      return { ...pair, ratio };
    });
    const dir = `${root}/${info.project.name}`;
    await mkdir(dir, { recursive: true });
    await writeFile(
      `${dir}/accessibility.json`,
      JSON.stringify(
        {
          metrics,
          colors,
          contrast,
          polishContrast,
          selectionBoundsUnchanged: true,
          keyboard: true,
          promptRetained: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await Promise.all([teacher.close(), student.close()]);
  }
});
