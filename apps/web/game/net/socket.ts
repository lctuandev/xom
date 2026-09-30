import {
  type Ack,
  type ClientToServerEvents,
  type MeView,
  type ServerToClientEvents,
  SOCKET_OPTIONS,
} from "@xom/shared";
import { io, type Socket } from "socket.io-client";
import { refreshAccessToken, useAuth } from "../auth/store";
import { orderResultBus, saleBus, useGame } from "../store";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;

/**
 * Kết nối cùng origin; Next proxy /socket.io sang NestJS. Token lấy từ bộ nhớ, hết hạn thì
 * server trả connect_error("unauthorized") → refresh bằng cookie rồi kết nối lại.
 */
export function connectGame(onSignedOut: () => void): () => void {
  const game = useGame.getState();
  const s: GameSocket = io({
    ...SOCKET_OPTIONS,
    transports: [...SOCKET_OPTIONS.transports],
    auth: (cb) => cb({ token: useAuth.getState().accessToken }),
  });
  socket = s;

  s.on("connect", () => game.setStatus("online"));
  s.on("disconnect", () => {
    game.setStatus("offline");
    game.setPing(null);
  });
  s.on("connect_error", async (err) => {
    game.setStatus("offline");
    if (err.message !== "unauthorized") return;
    const token = await refreshAccessToken();
    if (token) s.connect();
    else onSignedOut();
  });

  s.on("snapshot", (snap) => game.applySnapshot(snap));
  s.on("me", (me) => game.setMe(me));
  s.on("clock", (clock) => game.setClock(clock));
  s.on("world", (world) => game.setWorld(world));
  s.on("sale", (sale) => {
    saleBus.emit(sale);
    if (sale.ownerId === useGame.getState().me?.playerId) game.addOrder(sale);
  });
  s.on("orderResult", (r) => {
    orderResultBus.emit(r);
    game.removeOrder(r.orderId);
    if (r.served && r.tip > 0)
      game.toast({ kind: "good", text: `Khách boa +${r.tip.toLocaleString("vi-VN")}đ` });
  });
  s.on("jobTask", (t) => game.setJobTask(t));
  s.on("dayEnd", (report) => game.setReport(report));
  s.on("notify", (n) => game.toast(n));

  const timer = setInterval(() => {
    if (!s.connected) return;
    const sent = performance.now();
    s.emit("ping", { clientTime: Date.now() }, (res) => {
      if (res.ok) game.setPing(Math.round(performance.now() - sent));
    });
  }, 3000);

  // App quay lại từ nền (hay gặp trên iOS): chủ động kết nối lại.
  const onVisible = () => {
    if (document.visibilityState === "visible" && !s.connected) s.connect();
  };
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
    s.disconnect();
    socket = null;
  };
}

type IntentEvent = Exclude<keyof ClientToServerEvents, "ping">;

/** Gửi intent, cập nhật `me` khi thành công, hiện toast khi lỗi. Không bao giờ chờ quá 8 giây. */
export function send<E extends IntentEvent>(
  event: E,
  payload: Parameters<ClientToServerEvents[E]>[0],
): Promise<Ack<MeView>> {
  const game = useGame.getState();
  const s = socket;
  if (!s?.connected) {
    game.toast({ kind: "warn", text: "Đang mất kết nối, thử lại sau" });
    return Promise.resolve({ ok: false, error: "internal" });
  }
  return new Promise((resolve) => {
    // biome-ignore lint/suspicious/noExplicitAny: emit với event là union generic
    (s.timeout(8000).emit as any)(event, payload, (err: Error | null, res: Ack<MeView>) => {
      const result: Ack<MeView> = err
        ? { ok: false, error: "internal", message: "Máy chủ không phản hồi" }
        : res;
      if (result.ok) game.setMe(result.data);
      else game.toast({ kind: "warn", text: result.message ?? "Không thực hiện được" });
      resolve(result);
    });
  });
}
