import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Db } from "../../db/client.js";
import { teacherResults } from "../results/service.js";
import { analytics } from "../analytics/service.js";
import { check } from "../../utils/errors.js";
export async function excelReport(db: Db, examId: string) {
  const rows = await teacherResults(db, examId);
  const book = new ExcelJS.Workbook();
  book.creator = "ExamSpace";
  const sheet = book.addWorksheet("Results");
  sheet.columns = [
    { header: "STT", key: "index", width: 8 },
    { header: "Student Code", key: "code", width: 20 },
    { header: "Student Name", key: "name", width: 28 },
    { header: "Email", key: "email", width: 35 },
    { header: "Attempt Count", key: "count", width: 18 },
    { header: "Final Attempt No", key: "final", width: 18 },
    { header: "Score", key: "score", width: 14 },
    { header: "Max Score", key: "max", width: 14 },
    { header: "Percentage", key: "percent", width: 16 },
    { header: "Status", key: "status", width: 28 },
    { header: "Submitted At (UTC)", key: "submitted", width: 28 },
  ];
  rows.forEach((r, i) => {
    const a = r.finalAttempt;
    sheet.addRow({
      index: i + 1,
      code: r.student.studentCode,
      name: r.student.fullName,
      email: r.student.email,
      count: r.attemptCount,
      final: a?.attemptNo,
      score: a?.totalScore === null ? null : a ? Number(a.totalScore) : null,
      max: a ? Number(a.maxScore) : null,
      percent:
        a?.totalScore !== null && a
          ? (Number(a.totalScore) / Number(a.maxScore)) * 100
          : null,
      status: a?.status || "NOT_STARTED",
      submitted: a?.submittedAt?.toISOString(),
    });
  });
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = "A1:K1";
  const summary = book.addWorksheet("Summary");
  const stats = await analytics(db, examId);
  for (const [k, v] of Object.entries(stats))
    if (typeof v === "number" || v === null) summary.addRow([k, v]);
  const attempts = book.addWorksheet("Attempts");
  attempts.addRow([
    "Student",
    "Attempt",
    "Status",
    "Objective",
    "Manual",
    "Total",
  ]);
  for (const r of rows)
    for (const a of r.attempts)
      attempts.addRow([
        r.student.fullName,
        a.attemptNo,
        a.status,
        Number(a.objectiveScore),
        Number(a.manualScore),
        a.totalScore === null ? null : Number(a.totalScore),
      ]);
  return Buffer.from(await book.xlsx.writeBuffer());
}
export async function pdfReport(db: Db, examId: string, studentId: string) {
  const exam = await db.exam.findUniqueOrThrow({ where: { id: examId } });
  const rows = await teacherResults(db, examId);
  const row = rows.find((r) => r.student.id === studentId);
  check(row, 404, "NOT_FOUND");
  const classes = await db.class.findMany({
    where: { exams: { some: { examId } }, members: { some: { studentId } } },
    select: { name: true },
  });
  const font = [
    new URL("../assets/fonts/DejaVuSans.ttf", import.meta.url),
    new URL("../../../assets/fonts/DejaVuSans.ttf", import.meta.url),
  ]
    .map((url) => fileURLToPath(url))
    .find(existsSync);
  check(font, 500, "PDF_FONT_MISSING");
  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    info: { Title: `Kết quả ${exam.title}`, Author: "ExamSpace" },
  });
  const result = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.font(font).fontSize(22).text("ExamSpace · Phiếu kết quả");
  doc.moveDown().fontSize(16).text(exam.title);
  doc.moveDown().fontSize(11);
  const a = row.finalAttempt;
  const lines = [
    `Họ tên: ${row.student.fullName}`,
    `Mã sinh viên: ${row.student.studentCode || "—"}`,
    `Lớp: ${classes.map((c) => c.name).join(", ") || "—"}`,
    `Email: ${row.student.email}`,
    `Trạng thái: ${a?.status || "Chưa bắt đầu"}`,
    `Lượt được tính: ${a?.attemptNo || "—"} (${exam.resultStrategy})`,
    `Thời điểm nộp (UTC): ${a?.submittedAt?.toISOString() || "—"}`,
    `Điểm cuối: ${a?.totalScore === null || !a ? "Đang chờ chấm" : `${a.totalScore}/${a.maxScore}`}`,
    `Điểm khách quan: ${a?.objectiveScore || 0} · Điểm tự luận: ${a?.manualScore || 0}`,
  ];
  for (const line of lines) doc.text(line).moveDown(0.5);
  if (a)
    for (const q of a.questions)
      if (q.answer?.feedback) {
        doc
          .moveDown()
          .text(`Nhận xét câu ${q.orderIndex + 1}: ${q.answer.feedback}`);
      }
  doc.end();
  return result;
}
