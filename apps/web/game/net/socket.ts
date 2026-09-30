import {
  type Ack,
  type ClientToServerEvents,
  type MeView,
  type ServerToClientEvents,
  SOCKET_OPTIONS,
} from "@xom/shared";
import { io, type Socket } from "socket.io-client";
import { refreshAccessToken, useAuth } from "../auth/store";
import { orderBus, orderResultBus, orderUpdateBus, purchaseOf, useGame } from "../store";
import { applyPeers, seedPeers, startPresence } from "./presence";

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

  s.on("snapshot", (snap) => {
    seedPeers(snap.roster);
    game.applySnapshot(snap);
  });
  s.on("roster", (r) => {
    seedPeers(r);
    game.setRoster(r);
  });
  s.on("peers", applyPeers);
  s.on("me", (me) => game.setMe(me));
  s.on("clock", (clock) => game.setClock(clock));
  s.on("world", (world) => game.setWorld(world));
  // Đơn của khách là người chơi (UC-J3): lời gọi món và kết quả hiện trên đầu chính người đó.
  const buyers = new Map<string, string>();
  s.on("order", (o) => {
    orderBus.emit(o);
    const st = useGame.getState();
    if (o.ownerId === st.me?.playerId) game.addOrder(o);
    if (!o.buyerId) return;
    buyers.set(o.orderId, o.buyerId);
    game.say({ who: o.buyerId, text: o.dish }, 6000);
    if (o.buyerId === st.me?.playerId) game.setPurchase(purchaseOf(o, st.world));
  });
  s.on("orderUpdate", (u) => {
    orderUpdateBus.emit(u);
    game.updateOrder(u);
    const buyer = buyers.get(u.orderId);
    if (!buyer) return;
    game.say({ who: buyer, text: u.line }, 4000);
    const p = useGame.getState().purchase;
    if (p?.orderId === u.orderId) game.setPurchase({ ...p, stage: u.stage });
  });
  s.on("orderResult", (r) => {
    orderResultBus.emit(r);
    game.removeOrder(r.orderId);
    const buyer = buyers.get(r.orderId);
    if (!buyer) return;
    buyers.delete(r.orderId);
    game.say({ who: buyer, text: r.line }, 4000);
    if (useGame.getState().purchase?.orderId === r.orderId) {
      game.setPurchase(null);
      game.toast({ kind: r.served ? "good" : "warn", text: r.line });
    }
  });
  s.on("say", (e) => game.say(e));
  s.on("shift", (v) => game.setShift(v));
  s.on("payslip", (p) => game.setPayslip(p));
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
  const stopPresence = startPresence(s);

  return () => {
    stopPresence();
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
    s.disconnect();
    socket = null;
  };
}

type IntentEvent = Exclude<keyof ClientToServerEvents, "ping" | "move">;

type AckOf<E extends IntentEvent> = Parameters<Parameters<ClientToServerEvents[E]>[1]>[0];

/** Gửi intent, cập nhật `me` khi thành công, hiện toast khi lỗi. Không bao giờ chờ quá 8 giây. */
export function send<E extends IntentEvent>(
  event: E,
  payload: Parameters<ClientToServerEvents[E]>[0],
): Promise<AckOf<E>> {
  const game = useGame.getState();
  const s = socket;
  if (!s?.connected) {
    game.toast({ kind: "warn", text: "Đang mất kết nối, thử lại sau" });
    return Promise.resolve({ ok: false, error: "internal" } as AckOf<E>);
  }
  return new Promise((resolve) => {
    // biome-ignore lint/suspicious/noExplicitAny: emit với event là union generic
    (s.timeout(8000).emit as any)(event, payload, (err: Error | null, res: Ack<unknown>) => {
      const result: Ack<unknown> = err
        ? { ok: false, error: "internal", message: "Máy chủ không phản hồi" }
        : res;
      if (result.ok) {
        // Intent trả MeView trực tiếp, hoặc { me, ... } (order:make); npc:talk không có me.
        const data = result.data as (Partial<MeView> & { me?: MeView }) | undefined;
        if (data?.me) game.setMe(data.me);
        else if (data && "playerId" in data) game.setMe(data as MeView);
      } else game.toast({ kind: "warn", text: result.message ?? "Không thực hiện được" });
      resolve(result as AckOf<E>);
    });
  });
}

/**
 * Thao tác trong ca làm: cập nhật ca, lời chủ/khách hiện trên đầu người nói, tiền nhận được hiện toast.
 * `speaker`: ai nói câu trả lời (id người đứng quầy hoặc key khung thoại của khách).
 */
export async function sendWork(
  act: Parameters<ClientToServerEvents["work:act"]>[0],
  speaker?: string,
): Promise<boolean> {
  const res = await send("work:act", act);
  if (!res.ok) return false;
  const game = useGame.getState();
  game.setShift(res.data.shift);
  if (speaker && res.data.line) game.say({ who: speaker, text: res.data.line }, 3500);
  if (res.data.pay > 0) {
    game.toast({ kind: "good", text: `+${res.data.pay.toLocaleString("vi-VN")}đ` });
    game.countJobTask();
  } else if (!res.data.ok && !speaker) game.toast({ kind: "warn", text: res.data.line });
  return res.data.ok;
}
