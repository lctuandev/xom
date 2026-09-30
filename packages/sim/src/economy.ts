import type { Content, Product } from "@xom/content";
import { seededRandom, valueAt } from "./time.js";

// Mô hình nhu cầu (docs/PLAN.md §3.3):
//   customers  = footTraffic(lot, t) × interest(product, t)
//   attract(b) = (refPrice / price)^elasticity × repFactor(b)
//   share(b)   = attract(b) / (Σ attract các shop cùng danh mục trong bán kính + outsideOption)
//   sales(b)   = min(customers × share(b), tồn kho, công suất)

/** Mức ảnh hưởng tới uy tín của một khách hụt so với một khách được phục vụ. */
export const LOST_WEIGHT = 0.4;

/** Bán kính (mét) mà các shop cùng danh mục tranh khách của nhau. */
export const COMPETITION_RADIUS = 12;

/** Giá nhập ở chợ đầu mối trong ngày: dao động tất định quanh unitCost, làm tròn 500đ. */
export function marketPrice(product: Product, day: number, swing: number): number {
  const r = seededRandom("market", product.id, day)();
  const price = product.unitCost * (1 + (r * 2 - 1) * swing);
  return Math.max(500, Math.round(price / 500) * 500);
}

/** Điểm hài lòng về giá: 1 khi bán bằng/rẻ hơn giá tham chiếu, giảm dần khi đắt hơn. */
export function priceScore(price: number, refPrice: number): number {
  return Math.min(1, Math.max(0, 1 - (price / refPrice - 1) * 1.2));
}

export function repFactor(reputation: number): number {
  return 0.5 + reputation;
}

export function attractiveness(price: number, product: Product, reputation: number): number {
  return (product.refPrice / price) ** product.elasticity * repFactor(reputation);
}

export interface ShopState {
  id: string;
  productId: string;
  lotId: string;
  price: number;
  reputation: number;
  /** Tổng tồn kho hiện có của sản phẩm. */
  stock: number;
  capacityPerHour: number;
  /** Phần lẻ nhu cầu mang sang tick sau (tránh làm tròn mất khách). */
  demandCarry: number;
}

export interface ShopTickResult {
  id: string;
  sold: number;
  /** Khách muốn mua nhưng hết hàng. */
  lostStock: number;
  /** Khách muốn mua nhưng quầy làm không kịp. */
  lostCapacity: number;
  /** Trung bình điểm hài lòng của mọi khách tới (kể cả khách hụt). */
  satisfaction: number;
  demandCarry: number;
}

export interface TickInput {
  content: Content;
  shops: ShopState[];
  day: number;
  minuteOfDay: number;
  /** Độ dài tick, phút game. */
  minutes: number;
}

/** Tính một nhịp bán hàng cho mọi shop đang mở trong một xóm. */
export function simulateTick({
  content,
  shops,
  day,
  minuteOfDay,
  minutes,
}: TickInput): ShopTickResult[] {
  const hours = minutes / 60;
  const outside = content.economy.outsideOption;
  const info = shops.map((s) => {
    const product = content.product(s.productId);
    const lot = content.lot(s.lotId);
    return { s, product, lot, attract: attractiveness(s.price, product, s.reputation) };
  });

  return info.map(({ s, product, lot, attract }) => {
    const traffic =
      valueAt(content.traffic(lot.traffic).peoplePerHour, minuteOfDay) * lot.trafficScale;
    const interest = valueAt(product.interestByHour, minuteOfDay);
    const rivals = info.filter(
      (o) =>
        o.product.category === product.category &&
        Math.hypot(o.lot.position.x - lot.position.x, o.lot.position.z - lot.position.z) <=
          COMPETITION_RADIUS,
    );
    const share = attract / (rivals.reduce((sum, o) => sum + o.attract, 0) + outside);
    // Nhiễu ±20% tất định theo shop/thời điểm để mỗi nhịp không giống hệt nhau.
    const noise = 0.8 + seededRandom("demand", s.id, day, minuteOfDay)() * 0.4;
    const expected = traffic * hours * interest * share * noise;

    const carry = s.demandCarry + expected;
    const demand = Math.floor(carry);
    const capacity = Math.round(s.capacityPerHour * hours);
    const sold = Math.min(demand, s.stock, capacity);
    const lostStock = Math.max(0, Math.min(demand, capacity) - s.stock);
    const lostCapacity = Math.max(0, demand - capacity);
    const served = priceScore(s.price, product.refPrice) * 0.6 + 0.4;
    // Khách hụt kéo độ hài lòng xuống, nhưng nhẹ hơn một khách được phục vụ (trọng số LOST_WEIGHT).
    const unserved = demand - sold;
    const satisfaction = demand > 0 ? (sold * served) / (sold + unserved * LOST_WEIGHT) : served;
    return { id: s.id, sold, lostStock, lostCapacity, satisfaction, demandCarry: carry - demand };
  });
}

/** Reputation bám theo độ hài lòng, nhanh hơn khi có nhiều khách. */
export function nextReputation(
  reputation: number,
  satisfaction: number,
  customers: number,
  rate: number,
): number {
  if (customers <= 0) return reputation;
  const weight = Math.min(1, customers / 10);
  const next = reputation + rate * weight * (satisfaction - reputation);
  return Math.min(1, Math.max(0, next));
}

export interface Batch {
  productId: string;
  qty: number;
  /** Ngày nhập hàng. */
  batchDay: number;
}

/** Cuối ngày: tách lô hàng đã hết hạn (chỉ template perishable). */
export function spoilage(content: Content, batches: Batch[], day: number) {
  const kept: Batch[] = [];
  const spoiled: Batch[] = [];
  for (const b of batches) {
    const p = content.product(b.productId);
    const perishable = content.template(p.template).perishable;
    const expired =
      perishable && p.shelfLifeDays !== null && day - b.batchDay + 1 >= p.shelfLifeDays;
    (expired ? spoiled : kept).push(b);
  }
  return { kept, spoiled };
}

/** Lấy hàng theo FIFO (lô cũ trước), trả về các lô sau khi trừ. */
export function takeFifo(batches: Batch[], qty: number): { batches: Batch[]; taken: Batch[] } {
  const sorted = [...batches].sort((a, b) => a.batchDay - b.batchDay);
  let left = qty;
  const taken: Batch[] = [];
  const rest: Batch[] = [];
  for (const b of sorted) {
    if (left <= 0) {
      rest.push(b);
      continue;
    }
    const n = Math.min(left, b.qty);
    left -= n;
    taken.push({ ...b, qty: n });
    if (b.qty > n) rest.push({ ...b, qty: b.qty - n });
  }
  if (left > 0) throw new Error(`Không đủ hàng: thiếu ${left}`);
  return { batches: rest, taken };
}

/** Chọn kiểu khách minh họa cho một lượt mua, theo độ ưa thích danh mục. */
export function pickArchetype(content: Content, category: string, rand: () => number): string {
  const npcs = content.data.npcs.filter((n) => n.id !== "reviewer");
  const weights = npcs.map((n) => n.likes[category] ?? 0.5);
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < npcs.length; i++) {
    r -= weights[i] ?? 0;
    if (r <= 0) return npcs[i]?.id ?? "khach_vang_lai";
  }
  return npcs[npcs.length - 1]?.id ?? "khach_vang_lai";
}
