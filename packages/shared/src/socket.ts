import { z } from "zod";
import type {
  ClockView,
  DayReportView,
  MeView,
  NotifyEvent,
  SaleEvent,
  Snapshot,
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

type Intent<P> = (payload: P, ack: (res: Ack<MeView>) => void) => void;

export interface ClientToServerEvents {
  ping: (payload: PingPayload, ack: (res: Ack<PongPayload>) => void) => void;
  "equipment:buy": Intent<{ equipmentId: string }>;
  "market:buy": Intent<{ productId: string; qty: number }>;
  "biz:update": Intent<{ price?: number; lotId?: string }>;
  "biz:open": Intent<Record<string, never>>;
  "biz:close": Intent<Record<string, never>>;
  "job:start": Intent<{ jobId: string }>;
  "job:stop": Intent<Record<string, never>>;
}

export interface ServerToClientEvents {
  snapshot: (s: Snapshot) => void;
  me: (me: MeView) => void;
  clock: (clock: ClockView) => void;
  world: (world: WorldView) => void;
  sale: (sale: SaleEvent) => void;
  dayEnd: (report: DayReportView) => void;
  notify: (n: NotifyEvent) => void;
}
