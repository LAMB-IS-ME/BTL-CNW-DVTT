import { MulterError } from "multer";
import type { ErrorRequestHandler, Request } from "express";
import { ZodError, z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
const messages: Record<string, string> = {
  EXAM_NOT_OPEN: "Bài thi chưa đến giờ mở.",
  EXAM_CLOSED: "Bài thi đã đóng.",
  EXAM_NOT_PUBLISHED: "Bài thi chưa được công bố.",
  EXAM_NOT_ASSIGNED: "Bạn chưa được giao bài thi này.",
  ATTEMPT_LIMIT_REACHED: "Bạn đã dùng hết số lượt thi.",
  ATTEMPT_ALREADY_SUBMITTED: "Bài đã nộp, không thể đổi đáp án.",
  EXAM_HAS_ATTEMPTS: "Bài thi đã có lượt làm; cấu hình đã được khóa.",
  CLASS_REQUIRED: "Cần chọn ít nhất một lớp trước khi công bố.",
  INVALID_EXAM_QUESTIONS: "Cần ít nhất một câu hỏi có điểm hợp lệ.",
  INVALID_SCHEDULE: "Lịch thi không hợp lệ hoặc đã hết hạn.",
  QUIZ_ROOM_NOT_FOUND: "Không tìm thấy phòng Quiz.",
  QUIZ_ROOM_NOT_JOINABLE:
    "Phòng đã bắt đầu hoặc kết thúc; không nhận người chơi mới.",
  QUIZ_DUPLICATE_ANSWER: "Bạn đã gửi câu trả lời cho câu này.",
  QUIZ_NO_PARTICIPANTS: "Chưa có người chơi trong phòng.",
  QUIZ_QUESTION_NOT_CLOSED: "Cần chờ câu hiện tại kết thúc.",
  QUIZ_ALREADY_STARTED: "Phòng đã bắt đầu.",
  QUIZ_INVALID_QUESTIONS: "Quiz chỉ nhận câu khách quan đang hoạt động.",
  GRADE_OUT_OF_RANGE: "Điểm vượt giới hạn của câu hỏi.",
  CANNOT_MODIFY_SELF: "Không thể khóa hoặc đổi role của chính mình.",
  NOT_FOUND: "Không tìm thấy dữ liệu.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
  RATE_LIMITED: "Quá nhiều yêu cầu, vui lòng thử lại sau.",
};
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string = code,
  ) {
    super(message === code ? messages[code] || message : message);
  }
}
export function check(
  condition: unknown,
  status = 403,
  code = "FORBIDDEN",
  message?: string,
): asserts condition {
  if (!condition) throw new AppError(status, code, message);
}
export function param(req: Request, key = "id"): string {
  const value = req.params[key];
  check(typeof value === "string", 400, "INVALID_ID");
  return key === "code" ? value : z.uuid().parse(value);
}
export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  _next,
) => {
  if (
    error &&
    typeof error === "object" &&
    "type" in error &&
    ["entity.parse.failed", "entity.too.large"].includes(String(error.type))
  ) {
    res
      .status(error.type === "entity.too.large" ? 413 : 400)
      .json({
        error: {
          code: "INVALID_BODY",
          message: "Nội dung yêu cầu không hợp lệ hoặc quá lớn.",
        },
      });
    return;
  }
  if (error instanceof MulterError) {
    res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
      error: {
        code: error.code,
        message: "Ảnh vượt giới hạn 5 MB hoặc multipart không hợp lệ.",
      },
    });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Dữ liệu không hợp lệ.",
        details: error.flatten(),
      },
    });
    return;
  }
  if (error instanceof AppError) {
    res
      .status(error.status)
      .json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    res
      .status(409)
      .json({ error: { code: "DUPLICATE", message: "Dữ liệu đã tồn tại." } });
    return;
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  ) {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Không tìm thấy dữ liệu." },
    });
    return;
  }
  console.error(
    JSON.stringify({
      event: "request_error",
      type: error instanceof Error ? error.name : "unknown",
    }),
  );
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Có lỗi hệ thống. Vui lòng thử lại.",
    },
  });
};
