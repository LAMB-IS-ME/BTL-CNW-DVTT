import { attachQuiz } from "./quiz.js";
import { Server, type Socket } from "socket.io";
import type { Server as HttpServer } from "node:http";
import type { Express, Request } from "express";
import { z } from "zod";
import type {
  ClientEvents,
  ServerEvents,
  UserDto,
  SocketAck,
} from "@exam/shared";
import type { Db } from "../db/client.js";
import type { Config } from "../config/env.js";
import { userSelect } from "../middleware/auth.js";
import { AppError, check } from "../utils/errors.js";
import { ownExam } from "../modules/exams/service.js";
import { examEvents } from "../modules/attempts/service.js";
import { Presence, monitorSnapshot } from "./presence.js";
export type ExamSocket = Socket<
  ClientEvents,
  ServerEvents,
  Record<string, never>,
  { user: UserDto }
>;
export function createRealtime(
  server: HttpServer,
  app: Express,
  db: Db,
  config: Config,
  graceMs = 10000,
) {
  const io = new Server<
    ClientEvents,
    ServerEvents,
    Record<string, never>,
    { user: UserDto }
  >(server, {
    cors: { origin: config.origins, credentials: true },
    allowRequest: (req, cb) =>
      cb(
        null,
        !!req.headers.origin && config.origins.includes(req.headers.origin),
      ),
    maxHttpBufferSize: 100000,
  });
  io.engine.use(app.locals.sessionMiddleware);
  app.locals.io = io;
  const authorize = async (socket: ExamSocket, reload = false) => {
    const req = socket.request as Request;
    if (reload)
      await new Promise<void>((resolve, reject) =>
        req.session.reload((e) =>
          e ? reject(new AppError(401, "UNAUTHENTICATED")) : resolve(),
        ),
      );
    check(req.session?.userId, 401, "UNAUTHENTICATED");
    const user = await db.user.findUnique({
      where: { id: req.session.userId },
      select: userSelect,
    });
    check(user?.status === "ACTIVE", 401, "ACCOUNT_LOCKED");
    socket.data.user = user;
  };
  io.use((socket, next) => {
    authorize(socket)
      .then(() => next())
      .catch(() => next(new Error("UNAUTHENTICATED")));
  });
  const broadcast = async (examId: string) => {
    if (!io.sockets.adapter.rooms.has(`exam-monitor:${examId}`)) return;
    const snapshot = await monitorSnapshot(db, examId, presence);
    io.to(`exam-monitor:${examId}`).emit("exam:monitor:snapshot", snapshot);
    io.to(`exam-monitor:${examId}`).emit("exam:participant:status", snapshot);
  };
  const changed = (id: string) =>
    void broadcast(id).catch(() =>
      console.error(JSON.stringify({ event: "monitor_broadcast_failed" })),
    );
  const presence = new Presence(changed, graceMs);
  app.locals.presence = presence;
  const submitted = (a: { id: string; autoSubmitted: boolean }) =>
    io
      .to(`exam-attempt:${a.id}`)
      .emit(
        a.autoSubmitted
          ? "exam:attempt:auto-submitted"
          : "exam:attempt:submitted",
        { id: a.id },
      );
  examEvents.on("changed", changed);
  examEvents.on("submitted", submitted);
  const quiz = attachQuiz(io, db);
  io.on("connection", (socket) => {
    quiz.bind(socket);
    const req = socket.request as Request;
    void socket.join(`user:${socket.data.user.id}`);
    void socket.join(`session:${req.session.id}`);
    const attempts = new Map<string, string>();
    let messages = 0;
    const interval = setInterval(() => {
      messages = 0;
      void authorize(socket, true).catch(() => socket.disconnect(true));
    }, 30000);
    interval.unref();
    socket.use((_packet, next) => {
      if (++messages > 180) {
        next(new Error("RATE_LIMITED"));
        return;
      }
      authorize(socket, true)
        .then(() => next())
        .catch(() => socket.disconnect(true));
    });
    const run = <T>(ack: SocketAck<T> | undefined, fn: () => Promise<T>) => {
      void fn()
        .then((data) => {
          if (typeof ack === "function") ack({ data });
        })
        .catch((e: unknown) => {
          const error =
            e instanceof AppError
              ? { code: e.code, message: e.message }
              : { code: "INVALID_EVENT", message: "Không thể xử lý sự kiện." };
          if (typeof ack === "function") ack({ error });
          else socket.emit("server:error", error);
        });
    };
    socket.on("exam:monitor:join", (payload, ack) =>
      run(ack, async () => {
        const { examId } = z.object({ examId: z.uuid() }).parse(payload);
        check(socket.data.user.role === "TEACHER");
        await ownExam(db, examId, socket.data.user.id);
        await socket.join(`exam-monitor:${examId}`);
        const state = await monitorSnapshot(db, examId, presence);
        socket.emit("exam:monitor:snapshot", state);
        return state;
      }),
    );
    const joinAttempt = async (payload: { attemptId: string }) => {
      const { attemptId } = z.object({ attemptId: z.uuid() }).parse(payload);
      check(socket.data.user.role === "STUDENT");
      const a = await db.examAttempt.findUnique({ where: { id: attemptId } });
      check(a && a.studentId === socket.data.user.id, 404, "NOT_FOUND");
      check(
        a.status === "IN_PROGRESS" && a.expiresAt > new Date(),
        409,
        "ATTEMPT_EXPIRED",
      );
      await socket.join(`exam-attempt:${a.id}`);
      attempts.set(a.id, a.examId);
      presence.join(a.id, socket.id, a.examId);
      await db.examAttempt.update({
        where: { id: a.id },
        data: { lastActivityAt: new Date() },
      });
      return { joined: true };
    };
    socket.on("exam:attempt:presence:join", (p, ack) =>
      run(ack, () => joinAttempt(p)),
    );
    socket.on("exam:attempt:heartbeat", (p, ack) =>
      run(ack, () => joinAttempt(p)),
    );
    socket.on("disconnect", () => {
      clearInterval(interval);
      for (const [id, examId] of attempts)
        presence.leave(id, socket.id, examId);
    });
  });
  return {
    io,
    presence,
    close: async () => {
      quiz.close();
      examEvents.off("changed", changed);
      examEvents.off("submitted", submitted);
      presence.close();
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
