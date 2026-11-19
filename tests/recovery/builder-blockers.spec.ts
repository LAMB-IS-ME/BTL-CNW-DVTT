import { test, expect, type Page } from "@playwright/test";
const base = "http://localhost:3000/api/v1";
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("teacher1@exam.local");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("DevOnly!2026");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL("**/teacher");
}
async function mutate(
  page: Page,
  path: string,
  data: unknown,
  method = "POST",
  expected = method === "POST" ? 201 : 200,
) {
  const csrf = (await (await page.request.get(`${base}/auth/csrf`)).json()).data
    .token;
  const response = await page.request.fetch(base + path, {
    method,
    data,
    headers: { Origin: "http://localhost:5173", "X-CSRF-Token": csrf },
  });
  expect(response.status(), await response.text()).toBe(expected);
  return (await response.json()).data;
}
const modules = [
  {
    name: "Exam",
    list: "/teacher/exams",
    newPath: "/teacher/exams/new",
    create: "Tạo bài thi",
    field: "Tên bài thi",
    save: "Lưu bài thi",
  },
  {
    name: "Quiz",
    list: "/teacher/quizzes",
    newPath: "/teacher/quizzes/new",
    create: "Tạo Quiz",
    field: "Tên Quiz",
    save: "Lưu Quiz",
  },
];
async function stay(page: Page) {
  await expect(
    page.getByRole("dialog", { name: "Nội dung chưa lưu" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tiếp tục soạn" }).click();
}
for (const c of modules) {
  test(`${c.name}: internal navigation, Back/Forward, reload and tab close protect unsaved values`, async ({
    page,
  }) => {
    await login(page);
    await page.goto(c.list);
    await page
      .getByRole("link", { name: c.create, exact: true })
      .first()
      .click();
    const field = page.getByLabel(c.field, { exact: true });
    await field.fill("BLOCKER unsaved input");
    if (c.name === "Exam") {
      await page.getByRole("button", { name: "Tiếp", exact: true }).click();
      await page.getByRole("button", { name: "Trước", exact: true }).click();
      await expect(field).toHaveValue("BLOCKER unsaved input");
    }
    await page.locator('a[href="/teacher/classes"]:visible').first().click();
    await stay(page);
    await expect(field).toHaveValue("BLOCKER unsaved input");
    await page.evaluate(() => history.back());
    await stay(page);
    await expect(field).toHaveValue("BLOCKER unsaved input");
    let reloadPrompt = false;
    page.once("dialog", async (d) => {
      expect(d.type()).toBe("beforeunload");
      reloadPrompt = true;
      await d.dismiss();
    });
    // A cancelled reload has no completed navigation for page.reload() to await.
    await page.evaluate(() => window.location.reload());
    expect(reloadPrompt).toBe(true);
    await expect(field).toHaveValue("BLOCKER unsaved input");
    let closePrompt = false;
    page.once("dialog", async (prompt) => {
      expect(prompt.type()).toBe("beforeunload");
      closePrompt = true;
      await prompt.dismiss();
    });
    await page.close({ runBeforeUnload: true });
    await expect.poll(() => closePrompt).toBe(true);
    expect(page.isClosed()).toBe(false);
    await expect(field).toHaveValue("BLOCKER unsaved input");
    await page.locator('a[href="/teacher/classes"]:visible').first().click();
    await page.getByRole("button", { name: "Rời trang, bỏ thay đổi" }).click();
    await expect(page).toHaveURL(/\/teacher\/classes$/);
    await expect(
      page.getByRole("heading", { name: "Lớp học của tôi", exact: true }),
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(c.newPath + "$"));
    await expect(field).toHaveValue("");
    await field.fill("BLOCKER forward input");
    await page.evaluate(() => history.forward());
    await stay(page);
    await expect(field).toHaveValue("BLOCKER forward input");
  });

  test(`${c.name}: failed/pending saves preserve input; a real successful save clears the guard`, async ({
    page,
  }) => {
    await login(page);
    const title = `BLOCKER-${c.name}-${crypto.randomUUID()}`;
    const created =
      c.name === "Exam"
        ? await mutate(page, "/teacher/exams/configuration", {
            exam: {
              title,
              openAt: new Date().toISOString(),
              closeAt: new Date(Date.now() + 3600000).toISOString(),
              durationMinutes: 30,
            },
            classIds: [],
            questions: [],
            pools: [],
          })
        : await mutate(page, "/teacher/quizzes/configuration", {
            quiz: { title },
            questions: [],
          });
    const resource = c.name === "Exam" ? "exams" : "quizzes";
    const edit = `/teacher/${resource}/${created.id}/edit`,
      endpoint = `/teacher/${resource}/${created.id}/configuration`;
    await page.goto(edit);
    const field = page.getByLabel(c.field, { exact: true });
    await field.fill(title + " changed");
    await page
      .getByRole("button", {
        name: c.name === "Exam" ? "Lưu trữ bài thi" : "Lưu trữ Quiz",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Xác nhận", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "Hãy lưu hoặc bỏ thay đổi",
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Hủy", exact: true })
      .click();
    await expect(field).toHaveValue(title + " changed");

    await page.route(
      `**${endpoint}`,
      (r) =>
        r.fulfill({
          status: 503,
          json: {
            error: {
              code: "AUDIT_NETWORK_FAILURE",
              message: "Lưu tạm thời thất bại",
            },
          },
        }),
      { times: 1 },
    );
    await page.getByRole("button", { name: c.save, exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(field).toHaveValue(title + " changed");
    expect(
      (
        await (
          await page.request.get(`${base}/teacher/${resource}/${created.id}`)
        ).json()
      ).data.title,
    ).toBe(title);
    await page.locator('a[href="/teacher/classes"]:visible').first().click();
    await stay(page);
    let release!: () => void, observed!: () => void;
    const held = new Promise<void>((r) => {
        release = r;
      }),
      entered = new Promise<void>((r) => {
        observed = r;
      });
    await page.route(
      `**${endpoint}`,
      async (route) => {
        observed();
        await held;
        await route.continue();
      },
      { times: 1 },
    );
    await page.getByRole("button", { name: c.save, exact: true }).click();
    await entered;
    await expect(field).toBeDisabled();
    await page.locator('a[href="/teacher/classes"]:visible').first().click();
    await expect(
      page.getByRole("button", { name: "Rời trang, bỏ thay đổi" }),
    ).toBeDisabled();
    release();
    await expect(page).toHaveURL(/\/teacher\/classes$/);
    expect(
      (
        await (
          await page.request.get(`${base}/teacher/${resource}/${created.id}`)
        ).json()
      ).data.title,
    ).toBe(title + " changed");
    await page.goto(edit);
    await expect(field).toHaveValue(title + " changed");
    await page.reload();
    await expect(field).toHaveValue(title + " changed");
    await field.fill(title + " saved again");
    await page.getByRole("button", { name: c.save, exact: true }).click();
    await expect(
      page.getByText(c.name === "Exam" ? "Đã lưu cấu hình" : "Đã lưu Quiz", {
        exact: true,
      }),
    ).toBeVisible();
    await page.locator('a[href="/teacher/classes"]:visible').first().click();
    await expect(page).toHaveURL(/\/teacher\/classes$/);
  });
}

async function sourceFixture(page: Page) {
  const title = `BLOCKER-invariant-${crypto.randomUUID()}`;
  const bank = await mutate(page, "/teacher/question-banks", { title });
  const cls = await mutate(page, "/teacher/classes", { name: title });
  const body = {
    type: "SINGLE_CHOICE",
    promptMarkdown: title + " question",
    defaultPoints: 1,
    difficulty: "EASY",
    tags: ["required"],
    options: [
      { contentMarkdown: "Correct", isCorrect: true },
      { contentMarkdown: "Wrong", isCorrect: false },
    ],
  };
  const question = await mutate(
    page,
    `/teacher/question-banks/${bank.id}/questions`,
    body,
  );
  const examInput = {
    title,
    openAt: new Date(Date.now() - 60000).toISOString(),
    closeAt: new Date(Date.now() + 3600000).toISOString(),
    durationMinutes: 30,
  };
  const exam = await mutate(page, "/teacher/exams/configuration", {
    exam: examInput,
    classIds: [cls.id],
    questions: [{ questionId: question.id, points: 1 }],
    pools: [],
    publish: true,
  });
  return { title, bank, cls, body, question, exam, examInput };
}
test("Published Exam UI rejects removing its last question and rolls back metadata; valid save succeeds", async ({
  page,
}) => {
  await login(page);
  const f = await sourceFixture(page);
  await page.goto(`/teacher/exams/${f.exam.id}/edit`);
  await page
    .getByLabel("Tên bài thi", { exact: true })
    .fill("Must not persist");
  await page.locator(".exam-steps button").nth(2).click();
  await page.getByRole("button", { name: "Bỏ câu 1", exact: true }).click();
  await page.getByRole("button", { name: "Lưu bài thi", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Cần ít nhất một câu hỏi",
  );
  const retained = (
    await (await page.request.get(`${base}/teacher/exams/${f.exam.id}`)).json()
  ).data;
  expect(retained.title).toBe(f.title);
  expect(retained.status).toBe("PUBLISHED");
  expect(retained.questions).toHaveLength(1);
  await mutate(
    page,
    `/teacher/exams/${f.exam.id}/configuration`,
    {
      exam: { ...f.examInput, title: f.title + " valid" },
      classIds: [f.cls.id],
      questions: [{ questionId: f.question.id, points: 2 }],
      pools: [],
    },
    "PUT",
  );
  expect(
    (
      await (
        await page.request.get(`${base}/teacher/exams/${f.exam.id}`)
      ).json()
    ).data.title,
  ).toBe(f.title + " valid");
});

test("Real API and question editor preserve pool filters and reject ESSAY sources for an active Quiz", async ({
  page,
}) => {
  await login(page);
  const f = await sourceFixture(page);
  await mutate(
    page,
    `/teacher/exams/${f.exam.id}/configuration`,
    {
      exam: f.examInput,
      classIds: [f.cls.id],
      questions: [],
      pools: [
        {
          questionBankId: f.bank.id,
          pickCount: 1,
          pointsEach: 1,
          difficultyFilter: "EASY",
          tagFilter: ["required"],
        },
      ],
    },
    "PUT",
  );
  await mutate(
    page,
    `/teacher/questions/${f.question.id}`,
    { ...f.body, difficulty: "HARD" },
    "PATCH",
    409,
  );
  const preserved = (
    await (
      await page.request.get(`${base}/teacher/questions/${f.question.id}`)
    ).json()
  ).data;
  expect(preserved.difficulty).toBe("EASY");
  const quiz = await mutate(page, "/teacher/quizzes/configuration", {
    quiz: { title: f.title },
    questions: [
      { questionId: f.question.id, timeLimitSeconds: 20, basePoints: 100 },
    ],
  });
  await page.goto(`/teacher/questions/${f.question.id}/edit`);
  await page.getByLabel("Loại câu hỏi").selectOption("ESSAY");
  await page.getByRole("button", { name: "Lưu câu hỏi", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Không thể đổi sang tự luận",
  );
  expect(
    (
      await (
        await page.request.get(`${base}/teacher/questions/${f.question.id}`)
      ).json()
    ).data.type,
  ).toBe("SINGLE_CHOICE");
  const room = await mutate(page, `/teacher/quizzes/${quiz.id}/rooms`, {});
  expect(room.status).toBe("LOBBY");
});
