import { submissionInput } from "./helpers.js";
import {
  createRoom,
  joinRoom,
  startRoom,
} from "../src/modules/live-quiz/service.js";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
const provider = vi.hoisted(() => {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    upload: vi.fn(async (path: string, bytes: Buffer) => {
      objects.set(path, Buffer.from(bytes));
      return { error: null };
    }),
    remove: vi.fn(async (paths: string[]) => {
      for (const path of paths) objects.delete(path);
      return { error: null as null | { message: string } };
    }),
    createSignedUrl: vi.fn(async () => ({
      error: null,
      data: { signedUrl: "https://storage.test.invalid/image" },
    })),
  };
});
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ storage: { from: () => provider } }),
}));
import { testContext, account } from "./helpers.js";
import { examFixture } from "./fixture.js";
let ctx: ReturnType<typeof testContext>;
beforeAll(() => {
  ctx = testContext();
  ctx.config.SUPABASE_URL = "https://storage.test.invalid";
  ctx.config.SUPABASE_SERVICE_ROLE_KEY = "isolated-provider-double";
});
afterAll(async () => ctx?.cleanup());
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=",
  "base64",
);
async function fixture() {
  const f = await examFixture(ctx);
  const base = `/api/v1/teacher/questions/${f.question.id}`;
  const upload = await f.teacher.agent
    .post(`${base}/assets`)
    .set(f.teacher.headers)
    .attach("file", png, { filename: "image.png", contentType: "image/png" });
  expect(upload.status).toBe(201);
  const asset = upload.body.data;
  const content = {
    type: "SINGLE_CHOICE",
    promptMarkdown: `![Figure](asset:${asset.id})`,
    options: f.question.options.map((o) => ({
      contentMarkdown: o.contentMarkdown,
      isCorrect: o.isCorrect,
    })),
  };
  expect(
    (await f.teacher.agent.patch(base).set(f.teacher.headers).send(content))
      .status,
  ).toBe(200);
  return {
    ...f,
    base,
    asset,
    content,
    remove: () =>
      f.teacher.agent
        .delete(`${base}/assets/${asset.id}`)
        .set(f.teacher.headers),
  };
}
it("protects a published image before first attempt and keeps the student's historical image after edits/archive", async () => {
  const f = await fixture();
  provider.remove.mockClear();
  expect((await f.remove()).status).toBe(409);
  expect(provider.remove).not.toHaveBeenCalled();
  expect(provider.objects.get(f.asset.storagePath)).toEqual(png);
  expect(
    await ctx.db.questionAsset.findUnique({ where: { id: f.asset.id } }),
  ).not.toBeNull();
  const start = await f.student.agent
    .post(`/api/v1/student/exams/${f.exam.id}/attempts`)
    .set(f.student.headers);
  expect(start.status).toBe(201);
  const snapshot = await ctx.db.attemptQuestion.findFirstOrThrow({
    where: { attemptId: start.body.data.id },
  });
  expect(JSON.stringify(snapshot.snapshotJson)).toContain(f.asset.id);
  expect(provider.objects.get(f.asset.storagePath)).toEqual(png);
  expect(
    (await f.student.agent.get(`/api/v1/assets/${f.asset.id}`)).status,
  ).toBe(200);
  expect(
    (
      await f.teacher.agent
        .patch(f.base)
        .set(f.teacher.headers)
        .send({ ...f.content, promptMarkdown: "Replacement" })
    ).status,
  ).toBe(200);
  expect((await f.remove()).status).toBe(409);
  await f.teacher.agent
    .post(`/api/v1/teacher/exams/${f.exam.id}/archive`)
    .set(f.teacher.headers);
  expect(
    (await f.teacher.agent.delete(f.base).set(f.teacher.headers)).status,
  ).toBe(204);
  expect(
    (await f.teacher.agent.post(`${f.base}/restore`).set(f.teacher.headers))
      .status,
  ).toBe(200);
  expect(
    (
      await f.student.agent
        .post(`/api/v1/student/attempts/${start.body.data.id}/submit`)
        .set(f.student.headers)
        .send(await submissionInput(ctx.db, start.body.data.id))
    ).status,
  ).toBe(200);
  expect(
    (await f.student.agent.get(`/api/v1/assets/${f.asset.id}`)).status,
  ).toBe(200);
});
it("rejects dangling or foreign asset references on question writes", async () => {
  const f = await fixture();
  const other = await fixture();
  for (const id of [crypto.randomUUID(), other.asset.id]) {
    const response = await f.teacher.agent
      .patch(f.base)
      .set(f.teacher.headers)
      .send({ ...f.content, promptMarkdown: `![broken](asset:${id})` });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_ASSET_REFERENCE");
  }
});
it("serializes deletion with reference writes and publish", async () => {
  const f = await fixture();
  await ctx.db.exam.update({
    where: { id: f.exam.id },
    data: { status: "DRAFT" },
  });
  const [deleted, published] = await Promise.all([
    f.remove(),
    f.teacher.agent
      .post(`/api/v1/teacher/exams/${f.exam.id}/publish`)
      .set(f.teacher.headers),
  ]);
  expect(deleted.status).toBe(409);
  expect(published.status).toBe(200);
});

it("removes unused draft assets, rejects unauthorized deletion, and reports remote failure without restoring a referenceable identity", async () => {
  const f = await fixture(),
    other = await account(ctx, "TEACHER");
  const path = `${f.base}/assets/${f.asset.id}`;
  for (const [actor, status] of [
    [other, 404],
    [f.student, 403],
  ] as const)
    expect((await actor.agent.delete(path).set(actor.headers)).status).toBe(
      status,
    );
  expect((await f.teacher.agent.delete(path)).status).toBe(403);
  expect(
    (
      await f.teacher.agent
        .patch(f.base)
        .set(f.teacher.headers)
        .send({ ...f.content, promptMarkdown: "No image" })
    ).status,
  ).toBe(200);
  provider.remove.mockResolvedValueOnce({
    error: { message: "provider unavailable" },
  });
  expect((await f.remove()).status).toBe(502);
  expect(provider.objects.get(f.asset.storagePath)).toEqual(png);
  const currentQuestion = await ctx.db.question.findUniqueOrThrow({
    where: { id: f.question.id },
  });
  expect(currentQuestion.promptMarkdown).not.toContain(f.asset.id);
  // A later inventory can identify this object by storagePath minus live metadata.
  const livePaths = new Set(
    (
      await ctx.db.questionAsset.findMany({ select: { storagePath: true } })
    ).map((a) => a.storagePath),
  );
  expect(
    [...provider.objects.keys()].filter((path) => !livePaths.has(path)),
  ).toContain(f.asset.storagePath);
  expect(
    await ctx.db.questionAsset.findUnique({ where: { id: f.asset.id } }),
  ).toBeNull();
  expect((await f.remove()).status).toBe(404);
  expect(
    (await f.teacher.agent.patch(f.base).set(f.teacher.headers).send(f.content))
      .status,
  ).toBe(400);
  const upload = await f.teacher.agent
    .post(`${f.base}/assets`)
    .set(f.teacher.headers)
    .attach("file", png, { filename: "unused.png", contentType: "image/png" });
  expect(
    (
      await f.teacher.agent
        .delete(`${f.base}/assets/${upload.body.data.id}`)
        .set(f.teacher.headers)
    ).status,
  ).toBe(204);
  expect(provider.objects.has(upload.body.data.storagePath)).toBe(false);
  expect(provider.objects.has(f.asset.storagePath)).toBe(true);
});
it("guards prompt, options and explanation, including random pool candidates before any attempt", async () => {
  const f = await fixture();
  await ctx.db.examQuestion.deleteMany({ where: { examId: f.exam.id } });
  await ctx.db.examQuestionPool.create({
    data: {
      examId: f.exam.id,
      questionBankId: f.bank.id,
      pickCount: 1,
      pointsEach: 2,
      tagFilter: [],
    },
  });
  for (const content of [
    {
      ...f.content,
      promptMarkdown: "Text",
      explanationMarkdown: `![why](asset:${f.asset.id})`,
    },
    {
      ...f.content,
      promptMarkdown: "Text",
      options: f.content.options.map((o, i) => ({
        ...o,
        contentMarkdown:
          i === 0 ? `![choice](asset:${f.asset.id})` : o.contentMarkdown,
      })),
    },
  ]) {
    expect(
      (await f.teacher.agent.patch(f.base).set(f.teacher.headers).send(content))
        .status,
    ).toBe(200);
    expect((await f.remove()).status).toBe(409);
  }
  const started = await f.student.agent
    .post(`/api/v1/student/exams/${f.exam.id}/attempts`)
    .set(f.student.headers);
  expect(started.status).toBe(201);
  expect(
    (await f.student.agent.get(`/api/v1/assets/${f.asset.id}`)).status,
  ).toBe(200);
});
it("delete racing a new reference can only delete an unused asset or preserve a valid reference", async () => {
  const f = await fixture();
  await f.teacher.agent
    .patch(f.base)
    .set(f.teacher.headers)
    .send({ ...f.content, promptMarkdown: "Detached" });
  const [removed, saved] = await Promise.all([
    f.remove(),
    f.teacher.agent.patch(f.base).set(f.teacher.headers).send(f.content),
  ]);
  expect([
    [204, 400],
    [409, 200],
  ]).toContainEqual([removed.status, saved.status]);
  const current = await ctx.db.question.findUniqueOrThrow({
    where: { id: f.question.id },
  });
  const asset = await ctx.db.questionAsset.findUnique({
    where: { id: f.asset.id },
  });
  expect(!current.promptMarkdown.includes(f.asset.id) || !!asset).toBe(true);
});
it("preserves Live Quiz images before and after room snapshot and rejects legacy dangling sources at start", async () => {
  const f = await fixture();
  const quiz = await ctx.db.liveQuiz.create({
    data: {
      teacherId: f.teacher.user.id,
      title: "Asset Quiz",
      questions: {
        create: {
          questionId: f.question.id,
          orderIndex: 0,
          timeLimitSeconds: 60,
          basePoints: 100,
        },
      },
    },
  });
  expect((await f.remove()).status).toBe(409);
  const room = await createRoom(ctx.db, quiz.id, f.teacher.user.id);
  await joinRoom(ctx.db, room.id, f.student.user);
  await startRoom(ctx.db, room.id, f.teacher.user);
  expect(
    (await f.student.agent.get(`/api/v1/assets/${f.asset.id}`)).status,
  ).toBe(200);
  await f.teacher.agent
    .patch(f.base)
    .set(f.teacher.headers)
    .send({ ...f.content, promptMarkdown: "New source" });
  expect((await f.remove()).status).toBe(409);
  const snapshots = await ctx.db.liveRoomQuestion.findMany({
    where: { roomId: room.id },
  });
  expect(JSON.stringify(snapshots[0]!.snapshotJson)).toContain(f.asset.id);
  const broken = await fixture();
  await ctx.db.questionAsset.delete({ where: { id: broken.asset.id } });
  const start = await broken.student.agent
    .post(`/api/v1/student/exams/${broken.exam.id}/attempts`)
    .set(broken.student.headers);
  expect(start.status).toBe(400);
  expect(start.body.error.code).toBe("INVALID_ASSET_REFERENCE");
  expect(
    await ctx.db.examAttempt.count({ where: { examId: broken.exam.id } }),
  ).toBe(0);
});
it("retains legacy cross-question references and never calls Storage when metadata transaction fails", async () => {
  const f = await fixture();
  await f.teacher.agent
    .patch(f.base)
    .set(f.teacher.headers)
    .send({ ...f.content, promptMarkdown: "Detached" });
  const legacy = await ctx.db.question.create({
    data: {
      bankId: f.bank.id,
      type: "ESSAY",
      promptMarkdown: `Legacy ![figure](asset:${f.asset.id})`,
      tags: [],
    },
  });
  expect((await f.remove()).status).toBe(409);
  await ctx.db.question.update({
    where: { id: legacy.id },
    data: { promptMarkdown: "Detached legacy" },
  });
  provider.remove.mockClear();
  const transaction = vi
    .spyOn(ctx.db, "$transaction")
    .mockRejectedValueOnce(new Error("synthetic commit failure"));
  expect((await f.remove()).status).toBe(500);
  transaction.mockRestore();
  expect(provider.remove).not.toHaveBeenCalled();
  expect(
    await ctx.db.questionAsset.findUnique({ where: { id: f.asset.id } }),
  ).not.toBeNull();
  expect((await f.remove()).status).toBe(204);
});
it("rejects invalid assets at publish and Quiz start before writing published state or room snapshots", async () => {
  const f = await fixture();
  await ctx.db.questionAsset.delete({ where: { id: f.asset.id } });
  await ctx.db.exam.update({
    where: { id: f.exam.id },
    data: { status: "DRAFT" },
  });
  const publish = await f.teacher.agent
    .post(`/api/v1/teacher/exams/${f.exam.id}/publish`)
    .set(f.teacher.headers);
  expect(publish.status).toBe(400);
  expect(publish.body.error.code).toBe("INVALID_ASSET_REFERENCE");
  expect(
    (await ctx.db.exam.findUniqueOrThrow({ where: { id: f.exam.id } })).status,
  ).toBe("DRAFT");
  const quiz = await ctx.db.liveQuiz.create({
    data: {
      teacherId: f.teacher.user.id,
      title: "Invalid asset source",
      questions: {
        create: {
          questionId: f.question.id,
          orderIndex: 0,
          timeLimitSeconds: 60,
          basePoints: 100,
        },
      },
    },
  });
  const room = await createRoom(ctx.db, quiz.id, f.teacher.user.id);
  await joinRoom(ctx.db, room.id, f.student.user);
  await expect(
    startRoom(ctx.db, room.id, f.teacher.user),
  ).rejects.toMatchObject({ code: "INVALID_ASSET_REFERENCE" });
  expect(
    await ctx.db.liveRoomQuestion.count({ where: { roomId: room.id } }),
  ).toBe(0);
  expect(
    (await ctx.db.quizRoom.findUniqueOrThrow({ where: { id: room.id } }))
      .status,
  ).toBe("LOBBY");
});
it("concurrent Student start and direct deletion retain the exact snapshot reference and storage bytes", async () => {
  const f = await fixture();
  provider.remove.mockClear();
  const [start, deleted] = await Promise.all([
    f.student.agent
      .post(`/api/v1/student/exams/${f.exam.id}/attempts`)
      .set(f.student.headers),
    f.remove(),
  ]);
  expect(start.status).toBe(201);
  expect(deleted.status).toBe(409);
  expect(provider.remove).not.toHaveBeenCalled();
  const snapshot = await ctx.db.attemptQuestion.findFirstOrThrow({
    where: { attemptId: start.body.data.id },
  });
  expect(JSON.stringify(snapshot.snapshotJson)).toContain(f.asset.id);
  expect(
    await ctx.db.questionAsset.findUnique({ where: { id: f.asset.id } }),
  ).not.toBeNull();
  expect(provider.objects.get(f.asset.storagePath)).toEqual(png);
});
