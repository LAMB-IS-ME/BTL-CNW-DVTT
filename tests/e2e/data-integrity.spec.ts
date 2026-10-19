import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createDb } from "../../apps/api/src/db/client";
const database = process.env.TEST_DATABASE_URL!;
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("DevOnly!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
}
test("Classes → Builder: page boundaries, SPA cache and reload", async ({
  page,
}) => {
  const catalogRequests: string[] = [];
  const db = createDb(database);
  const seed = await db.user.findUniqueOrThrow({
    where: { email: "teacher1@exam.local" },
  });
  const teacher = await db.user.create({
    data: {
      email: `integrity-${crypto.randomUUID()}@test.local`,
      fullName: "Integrity Teacher",
      role: "TEACHER",
      passwordHash: seed.passwordHash,
    },
  });
  await db.class.createMany({
    data: Array.from({ length: 22 }, (_, i) => ({
      teacherId: teacher.id,
      name: `Integrity class ${String(i + 1).padStart(2, "0")}`,
      createdAt: new Date(Date.now() - i * 1000),
    })),
  });
  await db.questionBank.createMany({
    data: Array.from({ length: 101 }, (_, i) => ({
      ownerTeacherId: teacher.id,
      title: `Integrity bank ${String(i + 1).padStart(3, "0")}`,
    })),
  });
  await db.$disconnect();
  await login(page, teacher.email);
  // Finish the login/dashboard document before observing Classes/Builder.
  await page.goto("about:blank");
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      ["/api/v1/teacher/classes", "/api/v1/teacher/question-banks"].includes(
        url.pathname,
      )
    )
      catalogRequests.push(url.pathname + url.search);
  });
  await page.goto("/teacher/classes");
  await expect(
    page.getByRole("heading", { name: "Lớp học của tôi" }),
  ).toBeVisible();
  await expect(page.locator('main a[href^="/teacher/classes/"]')).toHaveCount(
    20,
  );
  await page.getByRole("link", { name: "Bài thi", exact: true }).click();
  await page
    .getByRole("link", { name: "Tạo bài thi", exact: true })
    .first()
    .click();
  await page.locator(".exam-steps button").nth(1).click();
  await expect(page.locator(".exam-class-list input")).not.toHaveCount(0);
  const spa = await page.locator(".exam-class-list input").count();
  await page.reload();
  await page.locator(".exam-steps button").nth(1).click();
  await expect(page.locator(".exam-class-list input")).not.toHaveCount(0);
  const reload = await page.locator(".exam-class-list input").count();
  expect(spa).toBe(20);
  expect(reload).toBe(20);
  await expect(page.getByText("Trang 1 / 2 · 22 kết quả")).toBeVisible();
  await page.getByRole("button", { name: "Trang sau", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Integrity class 22", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Integrity class 22", exact: true })
    .check();
  await page.getByRole("button", { name: "Trang trước", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Bỏ Integrity class 22", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Tìm lớp", { exact: true }).fill("class 22");
  await expect(page.locator(".exam-class-list input")).toHaveCount(1);
  await expect(
    page.getByRole("checkbox", { name: "Integrity class 22", exact: true }),
  ).toBeChecked();
  await page.locator(".exam-steps button").nth(0).click();
  await page
    .getByLabel("Tên bài thi", { exact: true })
    .fill("Integrity unsaved draft");
  await page.locator(".exam-steps button").nth(2).click();
  const discovered = new Set<string>();
  for (let bankPage = 1; bankPage <= 6; bankPage++) {
    await expect(
      page.getByText(`Trang ${bankPage} / 6 · 101 kết quả`),
    ).toBeVisible();
    for (const id of await page
      .getByLabel("Ngân hàng", { exact: true })
      .locator("option")
      .evaluateAll((options) =>
        options.map((o) => (o as HTMLOptionElement).value).filter(Boolean),
      ))
      discovered.add(id);
    if (bankPage < 6)
      await page
        .getByRole("button", { name: "Trang sau", exact: true })
        .click();
  }
  expect(discovered.size).toBe(101);
  await page.getByLabel("Tìm ngân hàng", { exact: true }).fill("bank 101");
  await expect(
    page.getByLabel("Ngân hàng", { exact: true }).locator("option"),
  ).toHaveCount(2);
  await page
    .getByLabel("Ngân hàng", { exact: true })
    .selectOption({ label: "Integrity bank 101" });
  await page.getByLabel("Tìm ngân hàng", { exact: true }).fill("bank 001");
  await expect(
    page.getByLabel("Ngân hàng", { exact: true }).locator("option"),
  ).toHaveCount(3);
  await expect(
    page.getByLabel("Ngân hàng", { exact: true }).locator("option:checked"),
  ).toHaveText("Integrity bank 101");
  await page.locator(".exam-steps button").nth(0).click();
  await expect(page.getByLabel("Tên bài thi", { exact: true })).toHaveValue(
    "Integrity unsaved draft",
  );
  await page.getByRole("button", { name: "Lưu bài thi", exact: true }).click();
  await expect(page).toHaveURL(/\/teacher\/exams$/);
  const verify = createDb(database);
  const saved = await verify.exam.findFirstOrThrow({
    where: { teacherId: teacher.id, title: "Integrity unsaved draft" },
    include: { classes: { include: { class: true } } },
  });
  expect(saved.classes.map((c) => c.class.name)).toEqual([
    "Integrity class 22",
  ]);
  await verify.$disconnect();
  await page
    .getByRole("link", { name: "Integrity unsaved draft", exact: true })
    .click();
  await page.locator(".exam-steps button").nth(1).click();
  await expect(
    page.getByRole("button", { name: "Bỏ Integrity class 22", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.locator(".exam-steps button").nth(1).click();
  await expect(
    page.getByRole("button", { name: "Bỏ Integrity class 22", exact: true }),
  ).toBeVisible();
  await mkdir("docs/screenshots/data-integrity", { recursive: true });
  const geometry = [];
  for (const width of [1440, 1024, 820, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    expect(overflow).toBe(false);
    const next = page.getByRole("button", { name: "Trang sau", exact: true });
    await next.focus();
    await expect(next).toBeFocused();
    const box = await next.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({
      path: `docs/screenshots/data-integrity/builder-after-${width}.png`,
      fullPage: true,
    });
    geometry.push({ width, overflow, touchHeight: box!.height });
  }
  expect(catalogRequests.length).toBeGreaterThan(0);
  expect(catalogRequests.every((path) => path.includes("pageSize=20"))).toBe(
    true,
  );
  expect(catalogRequests.length).toBeLessThan(35);
  await writeFile(
    "docs/screenshots/data-integrity/request-counts.json",
    JSON.stringify(
      { catalogRequests: catalogRequests.length, paths: catalogRequests },
      null,
      2,
    ),
  );
  await writeFile(
    "docs/screenshots/data-integrity/geometry.json",
    JSON.stringify(geometry, null, 2),
  );
});

const base = "http://localhost:3000/api/v1";
async function mutation(
  ctx: BrowserContext,
  path: string,
  data: unknown,
  method = "POST",
) {
  const csrf = await ctx.request.get(`${base}/auth/csrf`);
  const token = (await csrf.json()).data.token;
  return ctx.request.fetch(`${base}${path}`, {
    method,
    data,
    headers: { Origin: "http://localhost:5173", "X-CSRF-Token": token },
  });
}
test("Published image survives delete, Student start/reload/submit and bank replacement", async ({
  browser,
}) => {
  const teacherContext = await browser.newContext(),
    studentContext = await browser.newContext();
  const teacher = await teacherContext.newPage(),
    student = await studentContext.newPage();
  try {
    await login(teacher, "teacher1@exam.local");
    await login(student, "student1@exam.local");
    const db = createDb(database);
    const t = await db.user.findUniqueOrThrow({
      where: { email: "teacher1@exam.local" },
    });
    const s = await db.user.findUniqueOrThrow({
      where: { email: "student1@exam.local" },
    });
    const c = await db.class.create({
      data: {
        teacherId: t.id,
        name: "Image integrity class",
        members: { create: { studentId: s.id } },
      },
    });
    await db.$disconnect();
    const bankResponse = await mutation(
      teacherContext,
      "/teacher/question-banks",
      { title: "Image integrity bank" },
    );
    const bank = (await bankResponse.json()).data;
    const content = {
      type: "SINGLE_CHOICE",
      promptMarkdown: "Image question",
      options: [
        { contentMarkdown: "Yes", isCorrect: true },
        { contentMarkdown: "No", isCorrect: false },
      ],
    };
    const question = (
      await (
        await mutation(
          teacherContext,
          `/teacher/question-banks/${bank.id}/questions`,
          content,
        )
      ).json()
    ).data;
    const csrf = (
      await (await teacherContext.request.get(`${base}/auth/csrf`)).json()
    ).data.token;
    const upload = await teacherContext.request.post(
      `${base}/teacher/questions/${question.id}/assets`,
      {
        headers: { Origin: "http://localhost:5173", "X-CSRF-Token": csrf },
        multipart: {
          file: {
            name: "image.png",
            mimeType: "image/png",
            buffer: Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=",
              "base64",
            ),
          },
        },
      },
    );
    expect(upload.status()).toBe(201);
    const asset = (await upload.json()).data;
    expect(
      (
        await mutation(
          teacherContext,
          `/teacher/questions/${question.id}`,
          {
            ...content,
            promptMarkdown: `Image question ![Integrity figure](asset:${asset.id})`,
          },
          "PATCH",
        )
      ).status(),
    ).toBe(200);
    const exam = (
      await (
        await mutation(teacherContext, "/teacher/exams", {
          title: "Image integrity exam",
          openAt: new Date(Date.now() - 60000).toISOString(),
          closeAt: new Date(Date.now() + 3600000).toISOString(),
          durationMinutes: 30,
        })
      ).json()
    ).data;
    expect(
      (
        await mutation(
          teacherContext,
          `/teacher/exams/${exam.id}/classes`,
          { classIds: [c.id] },
          "PUT",
        )
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await mutation(
          teacherContext,
          `/teacher/exams/${exam.id}/questions`,
          { questions: [{ questionId: question.id, points: 1 }] },
          "PUT",
        )
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await mutation(teacherContext, `/teacher/exams/${exam.id}/publish`, {})
      ).status(),
    ).toBe(200);
    const removed = await mutation(
      teacherContext,
      `/teacher/questions/${question.id}/assets/${asset.id}`,
      undefined,
      "DELETE",
    );
    expect(removed.status()).toBe(409);
    expect((await removed.json()).error.message).toContain("không thể xóa");
    const started = await mutation(
      studentContext,
      `/student/exams/${exam.id}/attempts`,
      {},
    );
    expect(started.status()).toBe(201);
    const attempt = (await started.json()).data;
    await student.goto(`/student/attempts/${attempt.id}`);
    const img = student.getByRole("img", {
      name: "Integrity figure",
      exact: true,
    });
    await expect(img).toBeVisible();
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
    await student.reload();
    await expect(img).toBeVisible();
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
    expect(
      (
        await mutation(
          teacherContext,
          `/teacher/questions/${question.id}`,
          content,
          "PATCH",
        )
      ).status(),
    ).toBe(200);
    expect(
      (
        await mutation(
          teacherContext,
          `/teacher/questions/${question.id}/assets/${asset.id}`,
          undefined,
          "DELETE",
        )
      ).status(),
    ).toBe(409);
    await student.screenshot({
      path: "docs/screenshots/data-integrity/student-image-after.png",
      fullPage: true,
    });
    expect(
      (
        await mutation(
          studentContext,
          `/student/attempts/${attempt.id}/submit`,
          {},
        )
      ).status(),
    ).toBe(200);
    const signed = await studentContext.request.get(
      `${base}/assets/${asset.id}`,
    );
    expect(signed.status()).toBe(200);
    expect(
      (
        await studentContext.request.get((await signed.json()).data.url)
      ).status(),
    ).toBe(200);
    expect(
      (
        await mutation(
          studentContext,
          `/teacher/questions/${question.id}/assets/${asset.id}`,
          undefined,
          "DELETE",
        )
      ).status(),
    ).toBe(403);
  } finally {
    await teacherContext.close();
    await studentContext.close();
  }
});
test("Management paging, search, class mutations, student discovery and admin boundaries", async ({
  page,
  browser,
}) => {
  const db = createDb(database);
  const seed = await db.user.findUniqueOrThrow({
    where: { email: "teacher1@exam.local" },
  });
  const teacher = await db.user.create({
    data: {
      email: `management-${crypto.randomUUID()}@test.local`,
      fullName: "Paging Teacher",
      role: "TEACHER",
      passwordHash: seed.passwordHash,
    },
  });
  const marker = `Paging${Date.now()}`;
  await db.class.createMany({
    data: Array.from({ length: 22 }, (_, i) => ({
      teacherId: teacher.id,
      name: `${marker} class ${String(i + 1).padStart(2, "0")}`,
      createdAt: new Date(Date.now() - i * 1000),
    })),
  });
  await db.exam.createMany({
    data: Array.from({ length: 22 }, (_, i) => ({
      teacherId: teacher.id,
      title: `${marker} exam ${String(i + 1).padStart(2, "0")}`,
      openAt: new Date(),
      closeAt: new Date(Date.now() + 3600000),
      durationMinutes: 30,
      createdAt: new Date(Date.now() - i * 1000),
    })),
  });
  await db.user.createMany({
    data: Array.from({ length: 22 }, (_, i) => ({
      role: "STUDENT",
      email: `${marker}-${i}@test.local`,
      fullName: `${marker} student ${String(i + 1).padStart(2, "0")}`,
      passwordHash: "synthetic-unusable",
    })),
  });
  await db.$disconnect();
  await login(page, teacher.email);
  await page.goto("/teacher/classes");
  await page.getByRole("button", { name: "Trang sau", exact: true }).click();
  await expect(
    page.getByRole("link").filter({ hasText: `${marker} class 22` }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("Trang 2 / 2 · 22 kết quả")).toBeVisible();
  await page.getByLabel("Tìm lớp", { exact: true }).fill(`${marker} class 22`);
  await expect(page.getByText("Trang 1 / 1 · 1 kết quả")).toBeVisible();
  await page
    .getByRole("link")
    .filter({ hasText: `${marker} class 22` })
    .click();
  await page.getByLabel("Tên", { exact: true }).fill(`${marker} renamed class`);
  await page
    .getByRole("button", { name: "Lưu thông tin", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: `${marker} renamed class`, exact: true }),
  ).toBeVisible();
  await page.getByLabel("Tìm sinh viên để thêm", { exact: true }).fill(marker);
  await expect(page.getByText("Trang 1 / 2 · 22 kết quả")).toBeVisible();
  await page.getByRole("button", { name: "Trang sau", exact: true }).click();
  const student = page
    .getByRole("list", { name: "Sinh viên có thể thêm", exact: true })
    .getByRole("listitem")
    .filter({ has: page.getByText(`${marker} student 22`, { exact: true }) });
  await expect(student).toHaveCount(1);
  await student
    .getByRole("button", { name: "Thêm vào lớp", exact: true })
    .click();
  await expect(
    student.getByRole("button", { name: "Đã trong lớp", exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .getByRole("list", { name: "Sinh viên trong lớp", exact: true })
      .getByText(`${marker} student 22`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Danh sách lớp (1)", exact: true }),
  ).toBeVisible();
  await page.goto("/teacher/classes");
  await page
    .getByLabel("Tên lớp", { exact: true })
    .fill(`${marker} created class`);
  await page.getByRole("button", { name: "Tạo lớp học", exact: true }).click();
  await expect(page.getByText("Trang 1 / 2 · 23 kết quả")).toBeVisible();
  await page.getByRole("link", { name: "Bài thi", exact: true }).click();
  await expect(page.getByLabel("Tìm bài thi", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Trang sau", exact: true }).click();
  await expect(
    page.getByRole("link", { name: `${marker} exam 22`, exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Tìm bài thi", { exact: true })
    .fill(`${marker} exam 22`);
  await expect(page.getByText("Trang 1 / 1 · 1 kết quả")).toBeVisible();
  const adminContext = await browser.newContext();
  try {
    const admin = await adminContext.newPage();
    await login(admin, "admin@exam.local");
    await admin.goto("/admin/classes");
    await admin.getByLabel("Tìm lớp", { exact: true }).fill(marker);
    await expect(admin.getByText("Trang 1 / 2 · 23 kết quả")).toBeVisible();
    await admin.getByRole("button", { name: "Trang sau", exact: true }).click();
    await expect(admin.getByText("Trang 2 / 2 · 23 kết quả")).toBeVisible();
    for (const width of [1440, 1024, 820, 390, 320]) {
      await admin.setViewportSize({ width, height: 900 });
      expect(
        await admin.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      await admin.screenshot({
        path: `docs/screenshots/data-integrity/admin-classes-${width}.png`,
        fullPage: true,
      });
    }
  } finally {
    await adminContext.close();
  }
  for (const path of ["/teacher/classes", "/teacher/exams"]) {
    await page.goto(path);
    await expect(
      page.getByRole("navigation", { name: "Phân trang", exact: true }),
    ).toBeVisible();
    for (const width of [1440, 1024, 820, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      await page.screenshot({
        path: `docs/screenshots/data-integrity/${path.endsWith("classes") ? "classes" : "exams"}-${width}.png`,
        fullPage: true,
      });
    }
  }
});
