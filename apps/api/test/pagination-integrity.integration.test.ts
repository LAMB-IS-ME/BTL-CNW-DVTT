import { beforeAll, afterAll, it, expect } from "vitest";
import { account, testContext } from "./helpers.js";
let ctx: ReturnType<typeof testContext>;
beforeAll(() => {
  ctx = testContext();
});
afterAll(async () => ctx?.cleanup());
it("classes: stable 20/2 boundary, total/search/filter, mutations and legacy array compatibility", async () => {
  const t = await account(ctx, "TEACHER"),
    other = await account(ctx, "TEACHER"),
    student = await account(ctx, "STUDENT");
  const time = new Date();
  await ctx.db.class.createMany({
    data: Array.from({ length: 22 }, (_, i) => ({
      teacherId: t.user.id,
      name: `Boundary ${i}`,
      code: `C${i}`,
      createdAt: time,
    })),
  });
  const path = "/api/v1/teacher/classes";
  const first = (await t.agent.get(`${path}?view=manage`)).body.data;
  const last = (await t.agent.get(`${path}?view=manage&page=2`)).body.data;
  expect(first.items).toHaveLength(20);
  expect(last.items).toHaveLength(2);
  expect(first.total).toBe(22);
  expect(
    new Set([...first.items, ...last.items].map((c: { id: string }) => c.id))
      .size,
  ).toBe(22);
  expect(
    (await t.agent.get(path)).body.data.map((c: { id: string }) => c.id),
  ).toEqual(first.items.map((c: { id: string }) => c.id));
  const target = last.items[1];
  expect(
    (
      await t.agent.get(
        `${path}?view=manage&search=${encodeURIComponent(target.name)}`,
      )
    ).body.data.items.map((c: { id: string }) => c.id),
  ).toContain(target.id);
  expect(
    (
      await t.agent
        .patch(`${path}/${target.id}`)
        .set(t.headers)
        .send({ name: "Renamed boundary" })
    ).status,
  ).toBe(200);
  expect(
    (await t.agent.get(`${path}?view=manage&search=Renamed`)).body.data.items[0]
      .id,
  ).toBe(target.id);
  expect(
    (await t.agent.delete(`${path}/${target.id}`).set(t.headers)).status,
  ).toBe(204);
  expect(
    (await t.agent.get(`${path}?view=manage&status=archived`)).body.data.total,
  ).toBe(1);
  expect(
    (await t.agent.get(`${path}?view=manage&status=active`)).body.data.total,
  ).toBe(21);
  expect(
    (await t.agent.get(`${path}?view=manage&search=absent`)).body.data.total,
  ).toBe(0);
  expect((await other.agent.get(`${path}?view=manage`)).body.data.total).toBe(
    0,
  );
  expect((await student.agent.get(path)).status).toBe(403);
  expect((await other.agent.get(`${path}/${target.id}`)).status).toBe(404);
  expect((await t.agent.get(`${path}?pageSize=101`)).status).toBe(400);
});
it("exam list and bank selectors find records beyond both former limits without fetching all pages", async () => {
  const t = await account(ctx, "TEACHER");
  await ctx.db.exam.createMany({
    data: Array.from({ length: 22 }, (_, i) => ({
      teacherId: t.user.id,
      title: `Exam ${i}`,
      openAt: new Date(),
      closeAt: new Date(Date.now() + 3600000),
      durationMinutes: 30,
      createdAt: new Date(0),
    })),
  });
  const path = "/api/v1/teacher/exams";
  const first = (await t.agent.get(`${path}?view=manage`)).body.data;
  const last = (await t.agent.get(`${path}?view=manage&page=2`)).body.data;
  expect(first.total).toBe(22);
  expect(first.items).toHaveLength(20);
  expect(last.items).toHaveLength(2);
  expect(
    new Set([...first.items, ...last.items].map((e: { id: string }) => e.id))
      .size,
  ).toBe(22);
  const target = last.items[0];
  expect(
    (
      await t.agent.get(
        `${path}?view=manage&search=${encodeURIComponent(target.title)}`,
      )
    ).body.data.items.map((e: { id: string }) => e.id),
  ).toContain(target.id);
  await t.agent.post(`${path}/${target.id}/archive`).set(t.headers);
  expect(
    (await t.agent.get(`${path}?view=manage&status=ARCHIVED`)).body.data.total,
  ).toBe(1);
  await ctx.db.questionBank.createMany({
    data: Array.from({ length: 101 }, (_, i) => ({
      ownerTeacherId: t.user.id,
      title: `Bank ${String(i).padStart(3, "0")}`,
    })),
  });
  const banks = "/api/v1/teacher/question-banks";
  expect((await t.agent.get(`${banks}?pageSize=100`)).body.data).toHaveLength(
    100,
  );
  const end = (await t.agent.get(`${banks}?view=manage&sort=title&page=6`)).body
    .data;
  expect(end.total).toBe(101);
  expect(end.items).toHaveLength(1);
  expect(
    (await t.agent.get(`${banks}?view=manage&search=Bank%20100`)).body.data
      .items[0].id,
  ).toBe(end.items[0].id);
});
it("admin classes and student discovery expose accurate totals and stable later-page identities; roles remain enforced", async () => {
  const admin = await account(ctx, "ADMIN"),
    t = await account(ctx, "TEACHER");
  const marker = crypto.randomUUID();
  await ctx.db.class.createMany({
    data: Array.from({ length: 22 }, (_, i) => ({
      teacherId: t.user.id,
      name: `${marker} ${i}`,
    })),
  });
  await ctx.db.user.createMany({
    data: Array.from({ length: 22 }, (_, i) => ({
      role: "STUDENT",
      email: `${marker}-${i}@test.local`,
      fullName: `${marker} ${i}`,
      passwordHash: "unusable-synthetic-hash",
    })),
  });
  for (const [actor, path] of [
    [admin, "/api/v1/admin/classes"],
    [t, "/api/v1/teacher/students"],
  ] as const) {
    const first = (
      await actor.agent.get(`${path}?view=manage&search=${marker}`)
    ).body.data;
    const last = (
      await actor.agent.get(`${path}?view=manage&search=${marker}&page=2`)
    ).body.data;
    expect(first.total).toBe(22);
    expect(first.items).toHaveLength(20);
    expect(last.items).toHaveLength(2);
    expect(
      new Set([...first.items, ...last.items].map((v: { id: string }) => v.id))
        .size,
    ).toBe(22);
    expect(
      (await actor.agent.get(`${path}?search=${marker}&page=2`)).body.data.map(
        (v: { id: string }) => v.id,
      ),
    ).toEqual(last.items.map((v: { id: string }) => v.id));
  }
  expect((await t.agent.get("/api/v1/admin/classes?view=manage")).status).toBe(
    403,
  );
  expect(
    (await admin.agent.get("/api/v1/teacher/students?view=manage")).status,
  ).toBe(403);
});
