import { beforeAll, afterAll, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { testContext } from "./helpers.js";
import { examFixture } from "./fixture.js";
import { excelReport, pdfReport } from "../src/modules/exports/reports.js";
import { analytics } from "../src/modules/analytics/service.js";
let ctx: ReturnType<typeof testContext>;
beforeAll(() => {
  ctx = testContext();
});
afterAll(async () => ctx?.cleanup());
it("exports valid Excel, Vietnamese PDF and final-attempt analytics", async () => {
  const f = await examFixture(ctx);
  const a = await f.student.agent
    .post(`/api/v1/student/exams/${f.exam.id}/attempts`)
    .set(f.student.headers);
  await f.student.agent
    .put(
      `/api/v1/student/attempts/${a.body.data.id}/answers/${a.body.data.questions[0].id}`,
    )
    .set(f.student.headers)
    .send({ selectedOptionIds: [f.question.options[0]!.id] });
  await f.student.agent
    .post(`/api/v1/student/attempts/${a.body.data.id}/submit`)
    .set(f.student.headers);
  const stats = await analytics(ctx.db, f.exam.id);
  expect(stats.average).toBe(100);
  expect(stats.passRate).toBe(100);
  expect(stats.questions[0]?.correctRate).toBe(100);
  const excel = await excelReport(ctx.db, f.exam.id);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(excel as unknown as ExcelJS.Buffer);
  expect(book.getWorksheet("Results")?.getCell("C2").value).toBe(
    "Nguyễn Hoàng Anh",
  );
  const dir = await mkdtemp(join(tmpdir(), "exam-pdf-"));
  try {
    for (const name of ["Nguyễn Hoàng Anh", "Trần Thị Hương"]) {
      await ctx.db.user.update({
        where: { id: f.student.user.id },
        data: { fullName: name },
      });
      const pdf = await pdfReport(ctx.db, f.exam.id, f.student.user.id);
      const path = join(dir, "result.pdf");
      await writeFile(path, pdf);
      const text = execFileSync("pdftotext", [path, "-"], { encoding: "utf8" });
      expect(text).toContain(name);
      expect(text).toContain("Điểm cuối: 2/2");
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
