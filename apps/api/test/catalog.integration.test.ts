import { beforeAll, afterAll, it, expect } from "vitest";
import { testContext, account } from "./helpers.js";
let ctx: ReturnType<typeof testContext>;
beforeAll(() => {
  ctx = testContext();
});
afterAll(async () => ctx?.cleanup());
it("enforces ownership, roster roles and question validation", async () => {
  const t = await account(ctx, "TEACHER"),
    other = await account(ctx, "TEACHER"),
    s = await account(ctx, "STUDENT");
  const c = await t.agent
    .post("/api/v1/teacher/classes")
    .set(t.headers)
    .send({ name: "Lớp kiểm thử" });
  expect(c.status).toBe(201);
  expect(
    (
      await other.agent
        .patch(`/api/v1/teacher/classes/${c.body.data.id}`)
        .set(other.headers)
        .send({ name: "Bị sửa" })
    ).status,
  ).toBe(404);
  expect((await s.agent.get("/api/v1/teacher/classes")).status).toBe(403);
  expect(
    (
      await t.agent
        .post(`/api/v1/teacher/classes/${c.body.data.id}/students`)
        .set(t.headers)
        .send({ studentId: other.user.id })
    ).status,
  ).toBe(400);
  expect(
    (
      await t.agent
        .post(`/api/v1/teacher/classes/${c.body.data.id}/students`)
        .set(t.headers)
        .send({ studentId: s.user.id })
    ).status,
  ).toBe(201);
  const b = await t.agent
    .post("/api/v1/teacher/question-banks")
    .set(t.headers)
    .send({ title: "Ngân hàng" });
  const endpoint = `/api/v1/teacher/question-banks/${b.body.data.id}/questions`;
  expect(
    (
      await t.agent
        .post(endpoint)
        .set(t.headers)
        .send({ type: "SINGLE_CHOICE", promptMarkdown: "x", options: [] })
    ).status,
  ).toBe(400);
  expect(
    (
      await t.agent
        .post(endpoint)
        .set(t.headers)
        .send({ type: "ESSAY", promptMarkdown: "Giải thích $x^2$" })
    ).status,
  ).toBe(201);
});
it("validates uploads before storage and blocks another teacher", async () => {
  const t = await account(ctx, "TEACHER"),
    other = await account(ctx, "TEACHER");
  const b = await ctx.db.questionBank.create({
    data: { title: "Upload tests", ownerTeacherId: t.user.id },
  });
  const q = await ctx.db.question.create({
    data: { bankId: b.id, type: "ESSAY", promptMarkdown: "Ảnh", tags: [] },
  });
  const endpoint = `/api/v1/teacher/questions/${q.id}/assets`;
  expect(
    (
      await other.agent
        .post(endpoint)
        .set(other.headers)
        .attach("file", Buffer.from("fake"), {
          filename: "x.png",
          contentType: "image/png",
        })
    ).status,
  ).toBe(404);
  expect(
    (
      await t.agent
        .post(endpoint)
        .set(t.headers)
        .attach("file", Buffer.from("<script>"), {
          filename: "x.png",
          contentType: "image/png",
        })
    ).status,
  ).toBe(400);
  expect(
    (
      await t.agent
        .post(endpoint)
        .set(t.headers)
        .attach("file", Buffer.alloc(5 * 1024 * 1024 + 1), {
          filename: "x.png",
          contentType: "image/png",
        })
    ).status,
  ).toBe(413);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=",
    "base64",
  );
  expect(
    (
      await t.agent
        .post(endpoint)
        .set(t.headers)
        .attach("file", png, { filename: "x.png", contentType: "image/png" })
    ).body.error.code,
  ).toBe("STORAGE_NOT_CONFIGURED");
  await t.agent.delete(`/api/v1/teacher/questions/${q.id}`).set(t.headers);
  expect(
    (await ctx.db.question.findUniqueOrThrow({ where: { id: q.id } }))
      .isArchived,
  ).toBe(true);
});
