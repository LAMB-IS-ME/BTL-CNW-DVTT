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
  // Serialize one member's join/leave transitions, including a reconnect on
  // another socket, so an older disconnect cannot overwrite a real new join.
  const transitions = new Map<string, Promise<void>>();
  function transition<T>(roomId: string, userId: string, fn: () => Promise<T>) {
    const key = `${roomId}:${userId}`;
    const result = (transitions.get(key) || Promise.resolve()).then(fn);
    const tail: Promise<void> = result
      .then(
        () => {},
        () => {},
      )
      .finally(() => {
        if (transitions.get(key) === tail) transitions.delete(key);
      });
    transitions.set(key, tail);
    return result;
  }
  async function offlineIfAbsent(roomId: string, studentId: string) {
    const sockets = await io.in(`quiz-room:${roomId}`).fetchSockets();
    if (!sockets.some((s) => s.data.user.id === studentId))
      await leaveRoom(db, roomId, studentId);
  }
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
    const settledMiddlewareErrors = new WeakSet<Error>();
    type MembershipTurn = {
      start: (failed: (error: Error) => void) => void;
      finish: () => void;
    };
    const pending: MembershipTurn[] = [];
    let active: MembershipTurn | undefined;
    function advance() {
      if (active || !socket.connected) return;
      active = pending.shift();
      const turn = active;
      if (turn)
        turn.start((error) => {
          settledMiddlewareErrors.add(error);
          turn.finish();
        });
    }
    // Called at packet ingress, before asynchronous authorization. Keep this
    // turn until the membership handler AND its ACK have settled, not just next().
    function sequenceMembership(
      event: string,
      start: (failed: (error: Error) => void) => void,
    ) {
      if (event !== "quiz:room:join" && event !== "quiz:room:leave") {
        start((error) => {
          settledMiddlewareErrors.add(error);
        });
        return;
      }
      if (!socket.connected) return;
      const turn: MembershipTurn = {
        start,
        finish() {
          if (active !== turn) return;
          active = undefined;
          advance();
        },
      };
      pending.push(turn);
      advance();
    }
    const run = <T>(
      ack: SocketAck<T>,
      fn: () => Promise<T>,
      answer = false,
      finished?: () => void,
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
        })
        .finally(finished);
    };
    const membership = <T>(ack: SocketAck<T>, fn: () => Promise<T>) =>
      run(ack, fn, false, active?.finish);
    const roomPayload = z.object({ roomId: z.uuid() });
    socket.on("quiz:room:join", (payload, ack) =>
      membership(ack, async () => {
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
        const joinedRoomId = roomId;
        return transition(joinedRoomId, socket.data.user.id, async () => {
          check(socket.connected, 409, "QUIZ_CONNECTION_CLOSED");
          await joinRoom(db, joinedRoomId, socket.data.user);
          await socket.join(`quiz-room:${joinedRoomId}`);
          if (socket.data.user.role === "TEACHER")
            await socket.join(`quiz-host:${joinedRoomId}`);
          // disconnect may have fired while the database transaction was pending,
          // before this room could be recorded by the disconnect handler.
          if (!socket.connected) {
            await offlineIfAbsent(joinedRoomId, socket.data.user.id);
            throw new AppError(409, "QUIZ_CONNECTION_CLOSED");
          }
          rooms.add(joinedRoomId);
          const state = await roomState(db, joinedRoomId, socket.data.user);
          socket.emit("quiz:state", state);
          return state;
        });
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
    const leave = (roomId: string) =>
      transition(roomId, socket.data.user.id, async () => {
        await socket.leave(`quiz-room:${roomId}`);
        await socket.leave(`quiz-host:${roomId}`);
        rooms.delete(roomId);
        await offlineIfAbsent(roomId, socket.data.user.id);
      });
    socket.on("quiz:room:leave", (p, ack) =>
      membership(ack, async () => {
        await leave(roomPayload.parse(p).roomId);
        return { left: true };
      }),
    );
    socket.on("disconnect", () => {
      // Queued packets must never enter authorization/handlers on a dead socket.
      // An in-flight DB join still performs its connected check and reconciliation.
      pending.length = 0;
      active = undefined;
      for (const roomId of rooms) void leave(roomId).catch(() => {});
    });
    socket.on("error", (error) => {
      if (settledMiddlewareErrors.delete(error)) return;
      // A downstream middleware rejection never reaches the handler's finally.
      // Without packet identity on this event, cancel the transport rather than
      // accidentally releasing a different in-flight membership operation.
      if (active) socket.disconnect(true);
    });
    return sequenceMembership;
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
