import { content } from "@xom/content";
import type {
  Ack,
  ClientToServerEvents,
  MeView,
  OrderEvent,
  ServerToClientEvents,
  Snapshot,
} from "@xom/shared";
import { io, type Socket } from "socket.io-client";
import { register } from "./helpers.js";

// Tiện ích socket dùng chung cho các e2e mới (đăng ký → vào xóm → gửi intent).

export type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

export async function join(
  url: string,
): Promise<{ socket: Client; snap: Snapshot; token: string }> {
  const { body } = await register(url);
  const { socket, snap } = await connect(url, body.accessToken);
  return { socket, snap, token: body.accessToken };
}

/** Kết nối (lại) bằng token có sẵn — vào lại game sau khi rời. */
export function connect(url: string, token: string): Promise<{ socket: Client; snap: Snapshot }> {
  return new Promise((resolve, reject) => {
    const socket: Client = io(url, {
      path: "/socket.io",
      addTrailingSlash: false,
      transports: ["websocket"],
      auth: { token },
    });
    socket.once("snapshot", (snap) => resolve({ socket, snap }));
    socket.once("connect_error", reject);
  });
}

export function emit<T = MeView>(
  socket: Client,
  event: keyof ClientToServerEvents,
  payload: unknown,
): Promise<Ack<T>> {
  return new Promise((resolve) => {
    // biome-ignore lint/suspicious/noExplicitAny: emit generic qua union event
    (socket.emit as any)(event, payload, resolve);
  });
}

/** Chờ sự kiện server thoả điều kiện. */
export function next<E extends keyof ServerToClientEvents>(
  socket: Client,
  event: E,
  pred: (v: Parameters<ServerToClientEvents[E]>[0]) => boolean = () => true,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve) => {
    const on = (v: Parameters<ServerToClientEvents[E]>[0]) => {
      if (!pred(v)) return;
      // biome-ignore lint/suspicious/noExplicitAny: off generic
      (socket.off as any)(event, on);
      resolve(v);
    };
    // biome-ignore lint/suspicious/noExplicitAny: on generic
    (socket.on as any)(event, on);
  });
}

export const BANH_MI_THIT = [
  "banh_mi_phoi",
  "pate",
  "thit_nguoi",
  "dua_leo",
  "do_chua",
  "hanh",
  "ngo",
  "ot",
  "sot",
  "giay_goi",
];

/** Người mới mua xe bánh mì, nguyên liệu bánh mì thịt, mở quầy ở Đầu hẻm 12 (trời nắng cho chắc khách). */
export async function openBanhMiStall(url: string) {
  const { socket, snap, token } = await join(url);
  await emit(socket, "debug:weather", { kind: "sunny", minutes: 960 });
  await emit(socket, "equipment:buy", { equipmentId: "xe_banh_mi" });
  for (const itemId of BANH_MI_THIT) await emit(socket, "market:buy", { itemId, packs: 1 });
  await emit(socket, "biz:update", { lotId: "dau_hem" });
  await emit(socket, "biz:attend", { on: true });
  const opened = await emit(socket, "biz:open", {});
  if (!opened.ok) throw new Error(`không mở được quầy: ${opened.message}`);
  return { socket, snap, token, me: opened.data };
}

export const changeFor = (o: OrderEvent) => (o.pay.kind === "cash" ? o.pay.bill - o.price : null);

/** Ra cây ATM gần nhất (đứng sát), tạo PIN nếu chưa có rồi nộp tiền mặt vào tài khoản (UC-I6). */
export async function atmDeposit(socket: Client, amount: number, pin = "270915") {
  const atm = content.atms[0];
  if (!atm) throw new Error("bản đồ không có ATM");
  socket.emit("move", { x: atm.x, z: atm.z + 1, yaw: 0, moving: false, inside: null });
  await new Promise((r) => setTimeout(r, 80));
  await emit(socket, "atm:pin", { atmId: atm.id, pin });
  const res = await emit(socket, "atm:use", { atmId: atm.id, action: "deposit", amount, pin });
  if (!res.ok) throw new Error(`nộp ATM: ${res.message}`);
}
