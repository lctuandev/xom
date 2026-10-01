import { z } from "zod";
import type {
  AtmReceipt,
  ClockView,
  DayReportView,
  EventView,
  FundView,
  InspectResult,
  MakeResult,
  MeView,
  MovePayload,
  MyStatsView,
  NotifyEvent,
  OrderEvent,
  OrderResultEvent,
  OrderUpdateEvent,
  PayMethod,
  PayslipView,
  PeerPos,
  ReviewsView,
  RosterView,
  SayEvent,
  ShiftView,
  Snapshot,
  StoryEntryView,
  TalkResult,
  WorkAct,
  WorkResult,
  WorldView,
  XomBoardView,
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
  "equipment:buy": Intent<{ equipmentId: string; pay?: PayMethod }>;
  "market:buy": Intent<{ itemId: string; packs: number; pay?: PayMethod }>;
  /** Thanh lý hàng tồn cho chợ Bà Năm (đổi nghề, dư hàng). */
  "market:sell": Intent<{ itemId: string }>;
  "biz:update": Intent<{ lotId: string }>;
  "biz:menu": Intent<{ variantId: string; on?: boolean; price?: number }>;
  "biz:open": Intent<Record<string, never>>;
  "biz:close": Intent<Record<string, never>>;
  /** Sửa xe/quầy ở vựa xe Ông Sáu (Luật 2.2). */
  "biz:repair": Intent<{ pay?: PayMethod }>;
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
  /** Chủ quầy bắt tay làm món cho khách này (khách thấy thì chờ thêm). */
  "order:start": Intent<{ orderId: string }>;
  /** Sửa xe: kiểm tra một bộ phận (server trả kết quả, khách chờ thêm chút). */
  "order:inspect": Intent<{ orderId: string; part: string }, InspectResult>;
  /** Chuyện của tôi: dòng thời gian các mốc (docs/THEGIOI.md §1). */
  "story:list": Intent<Record<string, never>, StoryEntryView[]>;
  "npc:talk": Intent<{ npcId: string; topic: "greet" | "price" | "gossip" }, TalkResult>;
  "chat:say": Intent<{ phraseId: string }>;
  /** Chat tự gõ: hiện trên đầu nhân vật cho cả xóm (UC-D4). */
  "chat:text": Intent<{ text: string }>;
  "tutorial:set": Intent<{ step: string }>;
  /** Vị trí của mình (không cần Ack, 10 lần/giây khi có thay đổi). */
  move: (payload: MovePayload) => void;
  "xom:join": Intent<{ code: string }>;
  /** Mua đồ ăn ở sạp NPC (UC-B9, B10). */
  "vendor:buy": Intent<{ vendorId: string; itemId: string; pay?: PayMethod }>;
  /** Rút / gửi tiền ở cây ATM (UC-I6). */
  "atm:use": Intent<
    { atmId: string; action: "deposit" | "withdraw"; amount: number; pin: string },
    { me: MeView; receipt: AtmReceipt }
  >;
  /** Nhập PIN ở màn hình ATM (sai quá số lần thì máy giữ thẻ). */
  "atm:auth": Intent<{ atmId: string; pin: string }>;
  /** Tạo PIN lần đầu / đổi PIN (cần PIN cũ). */
  "atm:pin": Intent<{ atmId: string; pin: string; old?: string }>;
  /** Người chơi tổ chức sự kiện (khai trương). */
  "event:host": Intent<{ eventId: string; pay?: PayMethod }>;
  /** Dev/test: đặt giờ của xóm (production từ chối). */
  "debug:clock": Intent<{ minute: number }>;
  /** Dev/test: cộng tiền (production từ chối). */
  "debug:grant": Intent<{ money?: number; xp?: number; food?: number; drink?: number }>;
  /** Dev/test: ép thời tiết xóm mình (production từ chối). */
  "debug:weather": Intent<{ kind: string; after?: number; minutes: number }>;
  /** Sổ đánh giá quầy (UC-F11): xem, viết (đã mua hôm nay), chủ quầy trả lời. */
  "review:list": Intent<{ ownerId: string }, ReviewsView>;
  "review:write": Intent<{ ownerId: string; stars: number; text: string }, ReviewsView>;
  "review:reply": Intent<{ reviewId: string; text: string }, ReviewsView>;
  /** Quỹ xóm + công trình chung (UC-J5). */
  "fund:view": Intent<Record<string, never>, FundView>;
  "fund:donate": Intent<{ amount: number; pay?: PayMethod }, FundView>;
  "project:propose": Intent<{ projectId: string }, FundView>;
  "project:vote": Intent<{ id: string; yes: boolean }, FundView>;
  /** Bảng giải + thị phần + đang hot của xóm (UC-P2). */
  "stats:xom": Intent<Record<string, never>, XomBoardView>;
  /** Số liệu 7 ngày của mình + thành tựu. */
  "stats:me": Intent<Record<string, never>, MyStatsView>;
  /** Gọi món ở quầy hàng xóm (UC-J3). */
  "shop:order": Intent<{
    businessId: string;
    variantId: string;
    picks?: Record<string, string>;
    mods?: string[];
    pay?: PayMethod;
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
  events: (e: EventView[]) => void;
}
