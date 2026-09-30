import { io, type Socket } from "socket.io-client";
import { useEffect } from "react";
import type { ClientEvents, ServerEvents } from "@exam/shared";
export function connectSocket(): Socket<ServerEvents, ClientEvents> {
  return io(
    import.meta.env.VITE_SOCKET_URL ||
      (import.meta.env.DEV ? "http://localhost:3000" : window.location.origin),
    {
      withCredentials: true,
      autoConnect: false,
    },
  );
}
export function useAttemptPresence(
  attemptId: string,
  active: boolean,
  refresh: () => Promise<void>,
) {
  useEffect(() => {
    if (!active) return;
    const socket = connectSocket();
    let connections = 0;
    socket.on("connect", () => {
      socket.emit("exam:attempt:presence:join", { attemptId }, () => {});
      if (connections++) void refresh().catch(() => {});
    });
    const submitted = () => void refresh().catch(() => {});
    socket.on("exam:attempt:submitted", submitted);
    socket.on("exam:attempt:auto-submitted", submitted);
    const heartbeat = setInterval(() => {
      if (socket.connected)
        socket.emit("exam:attempt:heartbeat", { attemptId }, () => {});
    }, 20000);
    socket.connect();
    return () => {
      clearInterval(heartbeat);
      socket.disconnect();
    };
  }, [attemptId, active, refresh]);
}
