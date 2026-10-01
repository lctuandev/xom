import { z } from "zod";
import type {
  ClockView,
  DayReportView,
  MakeResult,
  MeView,
  MovePayload,
  NotifyEvent,
  OrderEvent,
  OrderResultEvent,
  OrderUpdateEvent,
  PayslipView,
  PeerPos,
  RosterView,
  SayEvent,
  ShiftView,
  Snapshot,
  TalkResult,
  WorkAct,
  WorkResult,
  WorldView,
} from "./game.js";

// Hợp đồng socket dùng chung cho web và server.
// Client → server: mọi payload phải được server validate bằng schema tương ứng.

/** Mọi intent đều được trả lời bằng Ack: client không bao giờ phải chờ vô hạn. */
export type Ack<T> = { ok: true; data: T } | { ok: false; error: AckError; message?: string };
export type AckError =
  | "invalid_payload"
  | "unauthorized"
  | "invalid_state"
  | "insufficient_funds"
  | "rate_limited"
  | "internal";

export const pingSchema = z.object({
  clientTime: z.number().int().nonnegative(),
});
export type PingPayload = z.infer<typeof pingSchema>;

export const pongSchema = z.object({
  clientTime: z.number().int().nonnegative(),
  serverTime: z.number().int().nonnegative(),
});
export type PongPayload = z.infer<typeof pongSchema>;

type Intent<P, R = MeView> = (payload: P, ack: (res: Ack<R>) => void) => void;

export interface ClientToServerEvents {
  ping: (payload: PingPayload, ack: (res: Ack<PongPayload>) => void) => void;
  "equipment:buy": Intent<{ equipmentId: string }>;
  "market:buy": Intent<{ itemId: string; packs: number }>;
  "biz:update": Intent<{ lotId: string }>;
  "biz:menu": Intent<{ variantId: string; on?: boolean; price?: number }>;
  "biz:open": Intent<Record<string, never>>;
  "biz:close": Intent<Record<string, never>>;
  "work:start": Intent<{ jobId: string; role: string }, WorkResult>;
  "work:act": Intent<WorkAct, WorkResult>;
  "work:stop": Intent<Record<string, never>, WorkResult>;
  "biz:attend": Intent<{ on: boolean }>;
  "order:make": Intent<
    { orderId: string; build: Record<string, string | string[] | true> },
    MakeResult
  >;
  "order:pay": Intent<{ orderId: string; change: number | null; discount?: boolean }>;
  "order:decline": Intent<{ orderId: string }>;
  "npc:talk": Intent<{ npcId: string; topic: "greet" | "price" | "gossip" }, TalkResult>;
  "chat:say": Intent<{ phraseId: string }>;
  "tutorial:set": Intent<{ step: string }>;
  /** Vị trí của mình (không cần Ack, 10 lần/giây khi có thay đổi). */
  move: (payload: MovePayload) => void;
  "xom:join": Intent<{ code: string }>;
  /** Mua đồ ăn ở sạp NPC (UC-B9, B10). */
  "vendor:buy": Intent<{ vendorId: string; itemId: string }>;
  /** Dev/test: ép thời tiết xóm mình (production từ chối). */
  "debug:weather": Intent<{ kind: string; after?: number; minutes: number }>;
  /** Gọi món ở quầy hàng xóm (UC-J3). */
  "shop:order": Intent<{
    businessId: string;
    variantId: string;
    picks?: Record<string, string>;
    mods?: string[];
  }>;
}

export interface ServerToClientEvents {
  snapshot: (s: Snapshot) => void;
  me: (me: MeView) => void;
  clock: (clock: ClockView) => void;
  world: (world: WorldView) => void;
  order: (o: OrderEvent) => void;
  orderUpdate: (u: OrderUpdateEvent) => void;
  say: (s: SayEvent) => void;
  dayEnd: (report: DayReportView) => void;
  notify: (n: NotifyEvent) => void;
  orderResult: (r: OrderResultEvent) => void;
  shift: (s: ShiftView | null) => void;
  payslip: (p: PayslipView) => void;
  roster: (r: RosterView) => void;
  peers: (p: PeerPos[]) => void;
}
