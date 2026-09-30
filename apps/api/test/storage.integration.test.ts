import { beforeAll, afterAll, it, expect, vi } from "vitest";
const provider = vi.hoisted(() => ({
  upload: vi.fn(
    async (
      _path: string,
      _data: Buffer,
      _options: { contentType: string },
    ) => ({ error: null }),
  ),
  remove: vi.fn(async () => ({ error: null })),
  createSignedUrl: vi.fn(async () => ({
    error: null,
    data: { signedUrl: "https://storage.test.invalid/signed-image" },
  })),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ storage: { from: () => provider } }),
}));
import { testContext } from "./helpers.js";
import { examFixture } from "./fixture.js";
let ctx: ReturnType<typeof testContext>;
beforeAll(() => {
  ctx = testContext();
  ctx.config.SUPABASE_URL = "https://storage.test.invalid";
  ctx.config.SUPABASE_SERVICE_ROLE_KEY = "unit-test-provider-double";
});
afterAll(async () => ctx?.cleanup());
it("signs only snapshot-visible media and keeps explanation assets private until release (Storage provider double)", async () => {
  const f = await examFixture(ctx);
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=",
    "base64",
  );
  const uploaded = await f.teacher.agent
    .post(`/api/v1/teacher/questions/${f.question.id}/assets`)
    .set(f.teacher.headers)
    .attach("file", bytes, {
      filename: "unsafe-name.png",
      contentType: "image/png",
    });
  expect(uploaded.status).toBe(201);
  const asset = uploaded.body.data;
  expect(provider.upload.mock.calls[0]?.[0]).not.toContain("unsafe-name");
  await ctx.db.question.update({
    where: { id: f.question.id },
    data: { explanationMarkdown: `![Đáp án](asset:${asset.id})` },
  });
  const start = await f.student.agent
    .post(`/api/v1/student/exams/${f.exam.id}/attempts`)
    .set(f.student.headers);
  expect((await f.student.agent.get(`/api/v1/assets/${asset.id}`)).status).toBe(
    403,
  );
  await f.student.agent
    .post(`/api/v1/student/attempts/${start.body.data.id}/submit`)
    .set(f.student.headers);
  expect((await f.student.agent.get(`/api/v1/assets/${asset.id}`)).status).toBe(
    403,
  );
  await ctx.db.exam.update({
    where: { id: f.exam.id },
    data: { showExplanations: true },
  });
  const signed = await f.student.agent.get(`/api/v1/assets/${asset.id}`);
  expect(signed.body.data.url).toBe(
    "https://storage.test.invalid/signed-image",
  );
  expect(provider.createSignedUrl).toHaveBeenCalledWith(asset.storagePath, 300);
  const later = await ctx.db.questionAsset.create({
    data: {
      questionId: f.question.id,
      storagePath: crypto.randomUUID(),
      mimeType: "image/png",
      originalName: "later.png",
    },
  });
  expect((await f.student.agent.get(`/api/v1/assets/${later.id}`)).status).toBe(
    403,
  );
  expect(
    (
      await f.teacher.agent
        .delete(`/api/v1/teacher/questions/${f.question.id}/assets/${asset.id}`)
        .set(f.teacher.headers)
    ).body.error.code,
  ).toBe("ASSET_REFERENCED");
});
