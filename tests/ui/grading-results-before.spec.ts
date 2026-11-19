import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import {
  gradingFixture,
  signIn,
  base,
  setRelease,
} from "./grading-results-fixtures";

test("before audit and baseline grading, results, release, downloads", async ({
  page,
}) => {
  test.skip(
    process.env.GRADING_BEFORE !== "1",
    "Explicit pre-change audit only",
  );
  const root = "/tmp/grading-results-before";
  await mkdir(root, { recursive: true });
  const f = await gradingFixture();
  const geometry = [];
  await signIn(page, "teacher");
  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ["grading", "results"]) {
      await page.goto(`/teacher/exams/${f.exam.id}/${route}`);
      await expect(
        page.getByRole("heading", {
          name: route === "grading" ? "Chấm tự luận" : "Kết quả & phân tích",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        route === "grading"
          ? page.getByLabel("Điểm (0–3)").first()
          : page.getByRole("button", { name: "Tải PDF" }).first(),
      ).toBeVisible();
      geometry.push({
        route,
        width,
        ...(await page.evaluate(() => ({
          pageWidth: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
          tableTop: document.querySelector("table")?.getBoundingClientRect()
            .top,
        }))),
      });
      await page.screenshot({ path: `${root}/${route}-${width}.png` });
    }
  }
  await page.goto(`/teacher/exams/${f.exam.id}/grading`);
  const form = page.locator("form").first();
  await form.getByRole("spinbutton").fill("4");
  expect(
    await form
      .getByRole("spinbutton")
      .evaluate((e: HTMLInputElement) => e.checkValidity()),
  ).toBe(false);
  await form.getByRole("spinbutton").fill("2.5");
  await form
    .getByLabel("Nhận xét")
    .fill("Lập luận rõ; bổ sung cơ chế hết hạn phiên.");
  await form.getByRole("button", { name: "Lưu điểm" }).click();
  await expect(form.getByRole("status")).toHaveText("Đã lưu điểm");
  await form.getByRole("spinbutton").fill("2");
  // Record the existing stale success bug without calling it a passing behavior.
  const staleSavedMessage = await form.getByRole("status").textContent();
  await page.reload();
  await expect(page.getByRole("spinbutton").first()).toHaveValue("2.5");
  await page.goto(`/teacher/exams/${f.exam.id}/results`);
  for (const name of ["Xuất Excel", "Tải PDF"]) {
    const event = page.waitForEvent("download");
    await page.getByRole("button", { name }).first().click();
    expect(await (await event).failure()).toBeNull();
  }
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await signIn(page, "student");
  for (const released of [false, true]) {
    await setRelease(f.exam.id, released);
    for (const width of [1440, 820, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/student/results/${f.exam.id}`);
      await expect(
        page.getByRole("heading", { name: f.exam.title }),
      ).toBeVisible();
      const response = await page.request.get(
        `${base}/student/exams/${f.exam.id}/results`,
      );
      expect((await response.json()).data.attempts[0].visible).toBe(released);
      await page.screenshot({
        path: `${root}/student-${released ? "released" : "hidden"}-${width}.png`,
      });
    }
  }
  await writeFile(
    `${root}/audit.json`,
    JSON.stringify({ geometry, staleSavedMessage }, null, 2),
  );
});
