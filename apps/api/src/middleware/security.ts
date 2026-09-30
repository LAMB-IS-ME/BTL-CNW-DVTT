import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import type { Config } from "../config/env.js";
import { AppError } from "../utils/errors.js";
export function csrfProtection(config: Config): RequestHandler {
  return (req, _res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.get("origin");
    if (!origin || !config.origins.includes(origin))
      throw new AppError(403, "ORIGIN_REJECTED");
    const token = req.get("X-CSRF-Token");
    const expected = req.session.csrf;
    if (
      !token ||
      !expected ||
      Buffer.byteLength(token) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
    )
      throw new AppError(
        403,
        "CSRF_INVALID",
        "Phiên biểu mẫu hết hạn. Vui lòng tải lại.",
      );
    next();
  };
}
