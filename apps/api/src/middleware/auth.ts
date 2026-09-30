import type { RequestHandler } from "express";
import type { UserDto, Role } from "@exam/shared";
import type { Db } from "../db/client.js";
import { AppError } from "../utils/errors.js";
declare module "express-session" {
  interface SessionData {
    userId?: string;
    csrf?: string;
  }
}
declare module "express-serve-static-core" {
  interface Request {
    user: UserDto;
  }
}
export const userSelect = {
  id: true,
  email: true,
  fullName: true,
  studentCode: true,
  role: true,
  status: true,
} as const;
export function authenticate(db: Db): RequestHandler {
  return async (req, _res, next) => {
    if (!req.session.userId)
      throw new AppError(401, "UNAUTHENTICATED", "Vui lòng đăng nhập.");
    const user = await db.user.findUnique({
      where: { id: req.session.userId },
      select: userSelect,
    });
    if (!user || user.status === "LOCKED") {
      req.session.destroy(() => {});
      throw new AppError(
        401,
        "ACCOUNT_LOCKED",
        "Tài khoản không còn hoạt động.",
      );
    }
    req.user = user;
    next();
  };
}
export function allow(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!roles.includes(req.user.role))
      throw new AppError(
        403,
        "FORBIDDEN",
        "Bạn không có quyền thực hiện thao tác này.",
      );
    next();
  };
}
