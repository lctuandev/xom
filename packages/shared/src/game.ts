import { z } from "zod";

// View (server → client) và intent (client → server) của vòng chơi (docs/PLAN.md §3.9).

export interface ClockView {
  day: number;
  /** Phút trong ngày (game). */
  minute: number;
}

export interface MenuItemView {
  variantId: string;
  /** Đang bán món này hay không. */
  on: boolean;
  price: number;
}

export interface BusinessView {
  id: string;
  equipmentId: string;
  productId: string;
  lotId: string | null;
  menu: MenuItemView[];
  open: boolean;
  reputation: number;
  /** Đã trả tiền thuê chỗ hiện tại cho hôm nay chưa (mở lại trong ngày không mất thêm). */
  rentPaidToday: boolean;
}

export interface InventoryView {
  itemId: string;
  qty: number;
  /** Số phần sẽ hỏng cuối ngày hôm nay. */
  expiring: number;
}

/** Số liệu trong ngày hiện tại, reset khi sang ngày mới. */
export interface TodayView {
  sold: number;
  revenue: number;
  /** Tiền boa khi phục vụ kịp. */
  tips: number;
  lost: number;
  stockCost: number;
  wages: number;
}

export interface MeView {
  playerId: string;
  displayName: string;
  money: number;
  jobId: string | null;
  /** Bước kịch bản người mới hiện tại. */
  tutorial: string;
  /** Chủ đang đứng ở quầy (quầy chỉ bán khi có chủ). */
  attending: boolean;
  business: BusinessView | null;
  inventory: InventoryView[];
  /** Độ thân thiết với NPC (id địa điểm → 0–100). */
  friendship: Record<string, number>;
  today: TodayView;
}

export interface LotOccupant {
  lotId: string;
  businessId: string;
  ownerName: string;
  equipmentId: string;
  productId: string;
  open: boolean;
}

export interface WorldView {
  lots: LotOccupant[];
}

export interface Snapshot {
  me: MeView;
  clock: ClockView;
  world: WorldView;
  /** Khách đang chờ ở quầy của mình (vào lại game không mất khách). */
  orders: OrderEvent[];
  /** Ca làm thuê đang diễn ra (vào lại game vẫn tiếp tục ca). */
  shift: ShiftView | null;
}

/** Món: stepId → lựa chọn (single: id, multi: danh sách id, action/hold: true). */
export type DishSelection = string | string[] | true;
export type DishView = Record<string, DishSelection>;

export type PaymentView = { kind: "transfer" } | { kind: "cash"; bill: number };

/** Khách tới quầy gọi món (docs/USECASES.md UC-F3). */
export interface OrderEvent {
  orderId: string;
  businessId: string;
  ownerId: string;
  lotId: string;
  productId: string;
  variantId: string;
  archetype: string;
  /** Câu khách nói: "Cho con ổ bánh mì xíu mại, không hành nha!" */
  ask: string;
  /** Tên món + yêu cầu: "bánh mì xíu mại, không hành". */
  dish: string;
  /** Món khách muốn, để đối chiếu khi làm. */
  spec: DishView;
  price: number;
  pay: PaymentView;
  createdAt: number;
  /** Hết kiên nhẫn lúc này (ms epoch, giờ server). */
  expiresAt: number;
}

/** Món vừa làm xong: đúng hay sai (khách phàn nàn). */
export interface OrderUpdateEvent {
  orderId: string;
  stage: "correct" | "wrong";
  line: string;
  mistakes: string[];
  /** Hạn chờ mới (khách đợi tính tiền). */
  expiresAt: number;
}

export type ChangeOutcomeView = "exact" | "short" | "over_returned" | "over_kept" | "transfer";

/** Kết quả một đơn: đã tính tiền (có thể có boa) hoặc khách bỏ đi. */
export interface OrderResultEvent {
  orderId: string;
  served: boolean;
  tip: number;
  line: string;
  outcome?: ChangeOutcomeView;
  received?: number;
}

export interface MakeResult {
  me: MeView;
  correct: boolean;
  score: number;
  mistakes: string[];
}

/** Lời nói hiện trên đầu nhân vật (người chơi hoặc NPC). */
export interface SayEvent {
  /** playerId hoặc id NPC. */
  who: string;
  text: string;
}

export interface TalkResult {
  line: string;
  friendship: number;
}

// ───────────── Vào làm (docs/USECASES.md nhóm W) ─────────────

interface TaskBase {
  id: string;
  /** Tên kiểu khách (Học sinh, Dân văn phòng…). */
  customer: string;
  createdAt: number;
  expiresAt: number;
}

/** Đứng quầy: khách gọi dĩa cơm. */
export interface PlateTaskView extends TaskBase {
  text: string;
  /** Những thứ phải có trên dĩa (để đối chiếu; có thể lặp). */
  items: string[];
}

/** Thu ngân: khách đưa phiếu, trả tiền. */
export interface CashierTaskView extends TaskBase {
  /** Các dòng trên phiếu: "Cơm sườn, thêm trứng", "Trà đá". */
  ticket: string[];
  pay: PaymentView;
}

/** Bưng bê: dĩa ra từ bếp, kẹp phiếu số bàn. */
export interface ServeTaskView extends TaskBase {
  table: number;
  dish: string;
}

export type TableState = "free" | "waiting" | "eating" | "dirty";

export type DeliveryStage =
  | "shelf"
  | "picked"
  | "at_door"
  | "absent"
  | "later"
  | "refused"
  | "delivered"
  | "returning";

/** Giao hàng: một đơn trong chuyến. */
export interface DeliveryTaskView {
  id: string;
  code: string;
  recipient: string;
  addressId: string;
  item: string;
  fragile: boolean;
  /** Tiền thu hộ; 0 = đã trả trước. */
  cod: number;
  stage: DeliveryStage;
  /** Các gói trên kệ để chọn (khi stage = shelf). */
  shelf: string[];
  /** Người ra mở cửa (khi stage = at_door). */
  door: {
    name: string;
    relation: "self" | "relative" | "stranger";
    pay: PaymentView | null;
  } | null;
}

export interface ShiftStatsView {
  done: number;
  mistakes: number;
  /** Khách bỏ về vì chờ lâu. */
  walked: number;
  strikes: number;
  maxStrikes: number;
  /** Tiền đã nhận trong ca (lương cứng + tiền việc). */
  earned: number;
}

export interface ShiftView {
  jobId: string;
  role: string;
  placeId: string;
  stats: ShiftStatsView;
  plates: PlateTaskView[];
  /** Số phần còn trong mỗi khay. */
  trays: Record<string, number>;
  /** Khay đang chờ bếp mang ra: foodId → thời điểm có (ms). */
  refilling: Record<string, number>;
  cashier: CashierTaskView[];
  serve: ServeTaskView[];
  tables: TableState[];
  deliveries: DeliveryTaskView[];
  /** Tiền COD đang cầm (phải nộp lại). */
  cashHeld: number;
  /** Đang chạy xe nhanh. */
  fast: boolean;
}

export interface PayslipView {
  jobId: string;
  role: string;
  done: number;
  mistakes: number;
  walked: number;
  base: number;
  piece: number;
  deductions: number;
  total: number;
  reason: "stop" | "fired" | "day_end" | "left";
}

export interface WorkResult {
  me: MeView;
  ok: boolean;
  /** Lời chủ/khách nói (hiện trên đầu). */
  line: string;
  /** Tiền nhận được từ việc này. */
  pay: number;
  shift: ShiftView | null;
  payslip?: PayslipView;
}

export interface DayReportView {
  day: number;
  revenue: number;
  tips: number;
  stockCost: number;
  rent: number;
  wages: number;
  spoiledQty: number;
  spoiledValue: number;
  served: number;
  lost: number;
  /** Món làm sai phải giảm giá. */
  wrong: number;
  satisfaction: number;
  reputation: number;
  /** Lãi/lỗ tiền mặt trong ngày. */
  profit: number;
  moneyEnd: number;
}

export interface NotifyEvent {
  kind: "info" | "good" | "warn";
  text: string;
}

const contentId = z.string().regex(/^[a-z0-9_]+$/);

export const buyEquipmentSchema = z.object({ equipmentId: contentId });
export const marketBuySchema = z.object({
  itemId: contentId,
  packs: z.number().int().min(1).max(50),
});
export const updateBusinessSchema = z.object({ lotId: contentId });
export const menuSchema = z
  .object({
    variantId: contentId,
    on: z.boolean().optional(),
    price: z.number().int().min(1_000).max(1_000_000).optional(),
  })
  .refine((v) => v.on !== undefined || v.price !== undefined, "Không có gì để cập nhật");
const selection = z.union([
  z.string().max(40),
  z.array(z.string().max(40)).max(12),
  z.literal(true),
]);
export const makeOrderSchema = z.object({
  orderId: z.string().min(1).max(64),
  build: z.record(z.string().max(40), selection),
});
export const payOrderSchema = z.object({
  orderId: z.string().min(1).max(64),
  /** Tiền thối (null khi chuyển khoản / đưa đúng tiền). */
  change: z.number().int().min(0).max(1_000_000).nullable(),
  /** Món sai mà vẫn đưa, giảm 50%. */
  discount: z.boolean().default(false),
});
export const orderIdSchema = z.object({ orderId: z.string().min(1).max(64) });
export const talkSchema = z.object({
  npcId: contentId,
  topic: z.enum(["greet", "price", "gossip"]),
});
export const saySchema = z.object({ phraseId: contentId });
export const workStartSchema = z.object({ jobId: contentId, role: contentId });
const taskId = z.string().min(1).max(64);
const cents = z.number().int().min(0).max(10_000_000);
/** Mọi thao tác trong ca làm (một intent, phân biệt bằng kind). */
export const workActSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("plate"), taskId, items: z.array(contentId).max(20) }),
  z.object({ kind: z.literal("refill"), foodId: contentId }),
  z.object({
    kind: z.literal("ring"),
    taskId,
    lines: z.record(contentId, z.number().int().min(1).max(20)),
    change: cents.nullable(),
  }),
  z.object({ kind: z.literal("serve"), taskId, table: z.number().int().min(1).max(20) }),
  z.object({ kind: z.literal("clean"), table: z.number().int().min(1).max(20) }),
  z.object({ kind: z.literal("take") }),
  z.object({ kind: z.literal("pick"), taskId, code: z.string().max(12) }),
  z.object({ kind: z.literal("ride"), fast: z.boolean() }),
  z.object({ kind: z.literal("call"), taskId, addressId: contentId }),
  z.object({ kind: z.literal("handover"), taskId, accept: z.boolean(), change: cents.nullable() }),
  z.object({ kind: z.literal("absent"), taskId, choice: z.enum(["neighbor", "later", "return"]) }),
  z.object({ kind: z.literal("settle") }),
]);
export type WorkAct = z.infer<typeof workActSchema>;
export const attendSchema = z.object({ on: z.boolean() });
export const tutorialSchema = z.object({ step: contentId });
export const emptySchema = z.object({}).optional();
