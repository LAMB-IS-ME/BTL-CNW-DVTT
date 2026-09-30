import type { Server } from "socket.io";
import { z } from "zod";
import type {
  ClientEvents,
  ServerEvents,
  UserDto,
  SocketAck,
} from "@exam/shared";
import type { Db } from "../db/client.js";
import type { ExamSocket } from "./server.js";
import { AppError, check } from "../utils/errors.js";
import {
  quizEvents,
  roomState,
  joinRoom,
  leaveRoom,
  startRoom,
  nextQuestion,
  answerQuiz,
  closeExpiredQuestions,
  type QuizChange,
} from "../modules/live-quiz/service.js";
type IO = Server<
  ClientEvents,
  ServerEvents,
  Record<string, never>,
  { user: UserDto }
>;
export function attachQuiz(io: IO, db: Db) {
  const probes = new Map<string, { count: number; reset: number }>();
  const changed = (roomId: string, kind: QuizChange) => {
    void (async () => {
      const sockets = await io.in(`quiz-room:${roomId}`).fetchSockets();
      for (const socket of sockets) {
        const state = await roomState(db, roomId, socket.data.user);
        socket.emit("quiz:state", state);
        if (kind === "joined") {
          socket.emit("quiz:lobby:snapshot", state);
          socket.emit("quiz:participant:joined", state);
        }
        if (kind === "left") socket.emit("quiz:participant:left", state);
        if (kind === "started") socket.emit("quiz:started", state);
        if (kind === "started" || kind === "question")
          socket.emit("quiz:question", state);
        if (kind === "reveal") {
          socket.emit("quiz:question:closed", state);
          socket.emit("quiz:reveal", state);
          socket.emit("quiz:leaderboard", state);
          if (state.status === "FINISHED") socket.emit("quiz:finished", state);
        }
      }
    })().catch(() =>
      console.error(JSON.stringify({ event: "quiz_broadcast_failed" })),
    );
  };
  quizEvents.on("changed", changed);
  let working = false;
  const timer = setInterval(() => {
    if (working) return;
    working = true;
    void closeExpiredQuestions(db)
      .catch(() =>
        console.error(JSON.stringify({ event: "quiz_deadline_failed" })),
      )
      .finally(() => {
        working = false;
      });
    for (const [id, p] of probes) if (p.reset < Date.now()) probes.delete(id);
  }, 1000);
  timer.unref();
  function bind(socket: ExamSocket) {
    const rooms = new Set<string>();
    const run = <T>(
      ack: SocketAck<T>,
      fn: () => Promise<T>,
      answer = false,
    ) => {
      void fn()
        .then((data) => {
          if (typeof ack === "function") ack({ data });
        })
        .catch((e: unknown) => {
          const error =
            e instanceof AppError
              ? { code: e.code, message: e.message }
              : { code: "INVALID_EVENT", message: "Sự kiện không hợp lệ." };
          if (typeof ack === "function") ack({ error });
          socket.emit(answer ? "quiz:answer:rejected" : "quiz:error", error);
        });
    };
    const roomPayload = z.object({ roomId: z.uuid() });
    socket.on("quiz:room:join", (payload, ack) =>
      run(ack, async () => {
        const p = z
          .object({
            roomId: z.uuid().optional(),
            code: z
              .string()
              .regex(/^\d{6}$/)
              .optional(),
          })
          .refine((v) => v.roomId || v.code)
          .parse(payload);
        let roomId = p.roomId;
        if (!roomId) {
          let rate = probes.get(socket.data.user.id);
          if (!rate || rate.reset < Date.now()) {
            rate = { count: 0, reset: Date.now() + 60000 };
            probes.set(socket.data.user.id, rate);
          }
          check(++rate.count <= 20, 429, "RATE_LIMITED");
          const r = await db.quizRoom.findUnique({ where: { code: p.code } });
          check(r, 404, "QUIZ_ROOM_NOT_FOUND");
          roomId = r.id;
        }
        const state = await joinRoom(db, roomId, socket.data.user);
        await socket.join(`quiz-room:${roomId}`);
        if (socket.data.user.role === "TEACHER")
          await socket.join(`quiz-host:${roomId}`);
        rooms.add(roomId);
        socket.emit("quiz:state", state);
        return state;
      }),
    );
    socket.on("quiz:host:start", (p, ack) =>
      run(ack, () =>
        startRoom(db, roomPayload.parse(p).roomId, socket.data.user),
      ),
    );
    socket.on("quiz:host:next", (p, ack) =>
      run(ack, () =>
        nextQuestion(db, roomPayload.parse(p).roomId, socket.data.user),
      ),
    );
    socket.on("quiz:answer", (p, ack) =>
      run(
        ack,
        async () => {
          const d = z
            .object({
              roomId: z.uuid(),
              questionId: z.uuid(),
              selectedOptionIds: z.array(z.string()).max(20),
            })
            .parse(p);
          const result = await answerQuiz(
            db,
            d.roomId,
            d.questionId,
            d.selectedOptionIds,
            socket.data.user,
          );
          socket.emit("quiz:answer:accepted", { questionId: d.questionId });
          return result;
        },
        true,
      ),
    );
    const leave = async (roomId: string) => {
      await socket.leave(`quiz-room:${roomId}`);
      rooms.delete(roomId);
      const others = await io.in(`user:${socket.data.user.id}`).fetchSockets();
      if (
        !others.some(
          (s) => s.id !== socket.id && s.rooms.has(`quiz-room:${roomId}`),
        )
      )
        await leaveRoom(db, roomId, socket.data.user.id);
    };
    socket.on("quiz:room:leave", (p, ack) =>
      run(ack, async () => {
        await leave(roomPayload.parse(p).roomId);
        return { left: true };
      }),
    );
    socket.on("disconnect", () => {
      for (const roomId of rooms) void leave(roomId).catch(() => {});
    });
  }
  return {
    bind,
    close() {
      clearInterval(timer);
      quizEvents.off("changed", changed);
      probes.clear();
    },
  };
}
