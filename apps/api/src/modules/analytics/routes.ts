import { Router } from "express";
import type { Db } from "../../db/client.js";
import { allow } from "../../middleware/auth.js";
import { param } from "../../utils/errors.js";
import { ownExam } from "../exams/service.js";
import { analytics } from "./service.js";
import { excelReport, pdfReport } from "../exports/reports.js";
export function analyticsRoutes(db: Db) {
  const r = Router();
  r.use(allow("TEACHER"));
  r.get("/exams/:id/analytics", async (req, res) => {
    await ownExam(db, param(req), req.user.id);
    res.json({ data: await analytics(db, param(req)) });
  });
  r.get("/exams/:id/export.xlsx", async (req, res) => {
    await ownExam(db, param(req), req.user.id);
    res
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .attachment("exam-results.xlsx")
      .send(await excelReport(db, param(req)));
  });
  r.get("/exams/:id/students/:studentId/result.pdf", async (req, res) => {
    await ownExam(db, param(req), req.user.id);
    res
      .type("application/pdf")
      .attachment("student-result.pdf")
      .send(await pdfReport(db, param(req), param(req, "studentId")));
  });
  return r;
}
