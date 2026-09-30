import { snapshotSchema } from "../attempts/logic.js";
import { resultVisible } from "../results/logic.js";
import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Db } from "../../db/client.js";
import type { Config } from "../../config/env.js";
import { allow } from "../../middleware/auth.js";
import { check, param } from "../../utils/errors.js";
import { ownQuestion } from "../question-banks/routes.js";
export function storageRoutes(db: Db, config: Config) {
  const r = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });
  const bucket = () => {
    check(
      config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY,
      503,
      "STORAGE_NOT_CONFIGURED",
      "Chưa cấu hình Supabase Storage.",
    );
    return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    }).storage.from(config.SUPABASE_STORAGE_BUCKET);
  };
  r.post(
    "/teacher/questions/:questionId/assets",
    allow("TEACHER"),
    upload.single("file"),
    async (req, res) => {
      const q = await ownQuestion(db, param(req, "questionId"), req.user.id);
      check(!q.isArchived && !q.bank.isArchived, 409, "QUESTION_ARCHIVED");
      check(req.file, 400, "FILE_REQUIRED");
      const f = req.file;
      const png = f.buffer
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpg =
        f.buffer[0] === 255 && f.buffer[1] === 216 && f.buffer[2] === 255;
      const webp =
        f.buffer.toString("ascii", 0, 4) === "RIFF" &&
        f.buffer.toString("ascii", 8, 12) === "WEBP";
      const mime = png
        ? "image/png"
        : jpg
          ? "image/jpeg"
          : webp
            ? "image/webp"
            : null;
      check(
        mime && mime === f.mimetype,
        400,
        "INVALID_IMAGE",
        "Chỉ nhận ảnh PNG, JPEG hoặc WebP hợp lệ.",
      );
      const path = `${req.user.id}/${q.id}/${randomUUID()}`;
      const store = bucket();
      const result = await store.upload(path, f.buffer, { contentType: mime });
      check(!result.error, 502, "STORAGE_UPLOAD_FAILED");
      try {
        res.status(201).json({
          data: await db.questionAsset.create({
            data: {
              questionId: q.id,
              storagePath: path,
              mimeType: mime,
              originalName: f.originalname,
              altText:
                typeof req.body.altText === "string"
                  ? req.body.altText.slice(0, 300)
                  : null,
            },
          }),
        });
      } catch (e) {
        await store.remove([path]);
        throw e;
      }
    },
  );
  r.get("/assets/:id", async (req, res) => {
    const a = await db.questionAsset.findUnique({
      where: { id: param(req) },
      include: { question: { include: { bank: true } } },
    });
    check(a, 404, "NOT_FOUND");
    let permitted =
      req.user.role === "TEACHER" &&
      a.question.bank.ownerTeacherId === req.user.id;
    if (req.user.role === "STUDENT") {
      const [attempts, rooms] = await Promise.all([
        db.attemptQuestion.findMany({
          where: {
            originalQuestionId: a.questionId,
            attempt: { studentId: req.user.id },
          },
          include: { attempt: { include: { exam: true } } },
        }),
        db.liveRoomQuestion.findMany({
          where: {
            room: { participants: { some: { studentId: req.user.id } } },
            snapshotJson: { path: ["id"], equals: a.questionId },
          },
          include: { room: true },
        }),
      ]);
      const references = (snapshot: unknown, explanation: boolean) => {
        const q = snapshotSchema.parse(snapshot);
        return [
          q.promptMarkdown,
          ...q.options.map((o) => o.contentMarkdown),
          ...(explanation ? [q.explanationMarkdown || ""] : []),
        ].some((text) => text.includes(`asset:${a.id}`));
      };
      permitted =
        attempts.some((q) =>
          references(
            q.snapshotJson,
            q.attempt.exam.showExplanations &&
              resultVisible(q.attempt.exam, q.attempt.status),
          ),
        ) ||
        rooms.some(
          (q) =>
            q.room.currentQuestionIndex !== null &&
            q.orderIndex <= q.room.currentQuestionIndex &&
            references(
              q.snapshotJson,
              q.orderIndex < q.room.currentQuestionIndex || !!q.room.revealedAt,
            ),
        );
    }
    check(permitted);
    const result = await bucket().createSignedUrl(a.storagePath, 300);
    check(!result.error && result.data, 502, "STORAGE_URL_FAILED");
    res.json({ data: { url: result.data.signedUrl } });
  });
  r.delete(
    "/teacher/questions/:questionId/assets/:assetId",
    allow("TEACHER"),
    async (req, res) => {
      const q = await ownQuestion(db, param(req, "questionId"), req.user.id);
      const a = await db.questionAsset.findFirst({
        where: { id: param(req, "assetId"), questionId: q.id },
      });
      check(a, 404, "NOT_FOUND");
      const uses = await db.attemptQuestion.count({
        where: { originalQuestionId: q.id },
      });
      const live = await db.liveRoomQuestion.count({
        where: { snapshotJson: { path: ["id"], equals: q.id } },
      });
      check(
        !uses && !live,
        409,
        "ASSET_REFERENCED",
        "Ảnh thuộc đề đã snapshot nên phải giữ lịch sử.",
      );
      const result = await bucket().remove([a.storagePath]);
      check(!result.error, 502, "STORAGE_DELETE_FAILED");
      await db.questionAsset.delete({ where: { id: a.id } });
      res.status(204).end();
    },
  );
  return r;
}
