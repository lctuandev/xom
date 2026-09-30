import { z } from "zod";

// View (server → client) và intent (client → server) của vòng chơi (docs/PLAN.md §3.9).

export interface ClockView {
  day: number;
  /** Phút trong ngày (game). */
  minute: number;
}

export interface BusinessView {
  id: string;
  equipmentId: string;
  productId: string;
  lotId: string | null;
  price: number;
  open: boolean;
  reputation: number;
  /** Đã trả tiền thuê chỗ hiện tại cho hôm nay chưa (mở lại trong ngày không mất thêm). */
  rentPaidToday: boolean;
}

export interface InventoryView {
  productId: string;
  qty: number;
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

export interface MarketView {
  day: number;
  prices: Record<string, number>;
}

export interface Snapshot {
  me: MeView;
  clock: ClockView;
  world: WorldView;
  market: MarketView;
}

export interface SaleEvent {
  /** Đơn chờ chủ quầy "Đưa hàng". */
  orderId: string;
  businessId: string;
  ownerId: string;
  lotId: string;
  productId: string;
  qty: number;
  archetype: string;
  /** Câu khách nói khi gọi món (theo mức giá). */
  line: string;
  /** Thời điểm hết hạn chờ (ms epoch, giờ server). */
  expiresAt: number;
}

/** Kết quả một đơn: phục vụ kịp (có boa) hoặc khách bỏ đi. */
export interface OrderResultEvent {
  orderId: string;
  served: boolean;
  tip: number;
  line: string;
}

/** Việc vặt khi làm thuê: bấm kịp để được thưởng. */
export interface JobTaskEvent {
  id: string;
  jobId: string;
  text: string;
  expiresAt: number;
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
  productId: contentId,
  qty: z.number().int().min(1).max(500),
});
export const updateBusinessSchema = z
  .object({
    price: z.number().int().min(1_000).max(1_000_000).optional(),
    lotId: contentId.optional(),
  })
  .refine((v) => v.price !== undefined || v.lotId !== undefined, "Không có gì để cập nhật");
export const startJobSchema = z.object({ jobId: contentId });
export const attendSchema = z.object({ on: z.boolean() });
export const serveOrderSchema = z.object({ orderId: z.string().min(1).max(64) });
export const jobTaskSchema = z.object({ taskId: z.string().min(1).max(64) });
export const tutorialSchema = z.object({ step: contentId });
export const emptySchema = z.object({}).optional();
