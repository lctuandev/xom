import { z } from "zod";
import type {
  AtmReceipt,
  ClockView,
  ContractBoardView,
  CrewView,
  DayReportView,
  EventView,
  FundView,
  GigBoardView,
  InspectResult,
  MakeResult,
  MeView,
  MixResultView,
  MovePayload,
  MyStatsView,
  NotifyEvent,
  OrderEvent,
  OrderResultEvent,
  OrderUpdateEvent,
  PayMethod,
  PayslipView,
  PeerPos,
  PhotoSessionView,
  PhotoShotView,
  RegularView,
  ReviewsView,
  RideView,
  RosterView,
  SayEvent,
  ShiftView,
  ShopSetupView,
  Snapshot,
  StaffView,
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
  /** Dev/test: giả như vắng lâu (THEGIOI §4). */
  "debug:away": Intent<{ minutes: number; days: number }>;
  /** Dev/test: đặt số lần ghé của mọi cư dân ở quầy mình. */
  "debug:regulars": Intent<{ visits: number }>;
  /** Sổ khách quen của quầy mình (KIENTRUC §1). */
  "regulars:list": Intent<Record<string, never>, RegularView[]>;
  /** 🏪 Mở tiệm (UC-F12): thuê nhà, đăng ký hộ kinh doanh, ATTP, biển hiệu. */
  "shop:view": Intent<Record<string, never>, ShopSetupView>;
  "shop:lease": Intent<{ lotId: string }, ShopSetupView>;
  "shop:unlease": Intent<Record<string, never>, ShopSetupView>;
  "shop:register": Intent<{ name: string }, ShopSetupView>;
  "shop:train": Intent<Record<string, never>, ShopSetupView>;
  "shop:book": Intent<Record<string, never>, ShopSetupView>;
  "shop:meet": Intent<Record<string, never>, ShopSetupView>;
  "shop:sign": Intent<Record<string, never>, ShopSetupView>;
  /** Dev/test: thuê nhà + đủ giấy tờ ngay. */
  "debug:shop": Intent<{ lotId: string }>;
  /** 🛵 Xe ôm (KIENTRUC §4): xem / thuê xe / chờ khách / trả giá / chọn đường / tới nơi / thu tiền / nghỉ. */
  "ride:view": Intent<Record<string, never>, RideView>;
  "ride:rent": Intent<{ pay?: PayMethod }, RideView>;
  "ride:wait": Intent<Record<string, never>, RideView>;
  "ride:offer": Intent<{ ratio: number }, RideView>;
  "ride:go": Intent<{ route: "road" | "alley" }, RideView>;
  "ride:arrive": Intent<Record<string, never>, RideView>;
  "ride:pay": Intent<{ change: number | null }, RideView>;
  "ride:quit": Intent<Record<string, never>, RideView>;
  /** Bảng việc xóm (KIENTRUC §3): xem / nhận / làm hàng / giao / bỏ việc. */
  "contract:list": Intent<Record<string, never>, ContractBoardView>;
  "contract:take": Intent<{ id: string }, ContractBoardView>;
  "contract:prepare": Intent<{ id: string }, ContractBoardView>;
  "contract:deliver": Intent<{ id: string }, ContractBoardView>;
  "contract:drop": Intent<{ id: string }, ContractBoardView>;
  /** Dev/test: đăng ngay một việc theo mẫu. */
  "debug:contract": Intent<{ templateId: string }>;
  "crew:view": Intent<{ siteId: string }, CrewView>;
  "crew:mix": Intent<
    { siteId: string; cement: number; sand: number; water: number },
    MixResultView
  >;
  "gig:list": Intent<Record<string, never>, GigBoardView>;
  "gig:post": Intent<{ kind: "photo"; reward: number; hours: number }, GigBoardView>;
  "gig:cancel": Intent<{ id: string }, GigBoardView>;
  "gig:take": Intent<{ id: string }, GigBoardView>;
  "gig:drop": Intent<{ id: string }, GigBoardView>;
  "gig:shoot": Intent<{ id: string }, PhotoSessionView>;
  "gig:shot": Intent<{ id: string; at?: number }, PhotoShotView>;
  "gig:submit": Intent<{ id: string }, GigBoardView>;
  "gig:review": Intent<{ id: string; stars: number }, GigBoardView>;
  "gig:dispute": Intent<{ id: string }, GigBoardView>;
  /** Nhân viên đứng quầy thay (KIENTRUC §2). */
  "staff:view": Intent<Record<string, never>, StaffView>;
  "staff:hire": Intent<{ staffId: string; shiftId: string }, StaffView>;
  "staff:fire": Intent<Record<string, never>, StaffView>;
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
  /** Xe ôm: khách tới / trạng thái cuốc đổi ngoài intent. */
  ride: (r: RideView) => void;
}
