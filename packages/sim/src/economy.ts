import type { Content, Product } from "@xom/content";
import { seededRandom, valueAt } from "./time.js";

// Mô hình khách tới (docs/PLAN.md §3.3, docs/USECASES.md UC-F3):
//   customers  = footTraffic(lot, t) × interest(product, t)
//   attract(b) = (1 / tỉ lệ giá thực đơn)^elasticity × repFactor(b)
//   share(b)   = attract(b) / (Σ attract các shop cùng danh mục trong bán kính + outsideOption)
//   arrivals   = customers × share(b)   (tích lũy phần lẻ qua các nhịp)
// Khách tới không có nghĩa là bán được: người chơi phải làm món và giao tận tay.

/** Mức ảnh hưởng tới uy tín của một khách hụt so với một khách được phục vụ. */
export const LOST_WEIGHT = 0.4;

/** Bán kính (mét) mà các shop cùng danh mục tranh khách của nhau. */
export const COMPETITION_RADIUS = 12;

/** Điểm hài lòng về giá theo tỉ lệ giá bán / giá hợp lý: 1 khi ≤ 1, giảm dần khi đắt hơn. */
export function priceScore(ratio: number): number {
  return Math.min(1, Math.max(0, 1 - (ratio - 1) * 1.2));
}

export function repFactor(reputation: number): number {
  return 0.5 + reputation;
}

export function attractiveness(priceRatio: number, product: Product, reputation: number): number {
  return (1 / priceRatio) ** product.elasticity * repFactor(reputation);
}

/** Tỉ lệ giá trung bình của các món đang bán so với giá khách thấy hợp lý. */
export function menuPriceRatio(
  product: Product,
  menu: { variantId: string; price: number }[],
): number {
  const ratios = menu
    .map((m) => {
      const v = product.recipe.variants.find((x) => x.id === m.variantId);
      return v ? m.price / v.refPrice : null;
    })
    .filter((r): r is number => r !== null);
  return ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 1;
}

export interface ShopState {
  id: string;
  productId: string;
  lotId: string;
  /** Giá bán / giá hợp lý (trung bình thực đơn). */
  priceRatio: number;
  reputation: number;
  /** Hệ số khách tạm thời (rao hàng, thời tiết…), mặc định 1. */
  boost?: number;
  /** Phần lẻ nhu cầu mang sang tick sau (tránh làm tròn mất khách). */
  demandCarry: number;
}

export interface ArrivalResult {
  id: string;
  /** Số khách dừng lại ở quầy trong nhịp này. */
  arrivals: number;
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

/** Một nhịp: mỗi quầy đang mở (có người đứng) có bao nhiêu khách dừng lại. */
export function customerArrivals({
  content,
  shops,
  day,
  minuteOfDay,
  minutes,
}: TickInput): ArrivalResult[] {
  const hours = minutes / 60;
  const outside = content.economy.outsideOption;
  const info = shops.map((s) => {
    const product = content.product(s.productId);
    const lot = content.lot(s.lotId);
    return { s, product, lot, attract: attractiveness(s.priceRatio, product, s.reputation) };
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
    const carry = s.demandCarry + traffic * hours * interest * share * noise * (s.boost ?? 1);
    const arrivals = Math.floor(carry);
    return { id: s.id, arrivals, demandCarry: carry - arrivals };
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
  /** Id nguyên liệu. */
  itemId: string;
  qty: number;
  /** Ngày nhập hàng. */
  batchDay: number;
}

/** Cuối ngày: tách lô nguyên liệu đã hết hạn dùng. */
export function spoilage<B extends Batch>(content: Content, batches: B[], day: number) {
  const kept: B[] = [];
  const spoiled: B[] = [];
  for (const b of batches) {
    const life = content.ingredient(b.itemId).shelfLifeDays;
    const expired = life !== null && day - b.batchDay + 1 >= life;
    (expired ? spoiled : kept).push(b);
  }
  return { kept, spoiled };
}

/** Lấy hàng theo FIFO (lô cũ trước), trả về các lô sau khi trừ. */
export function takeFifo<B extends Batch>(batches: B[], qty: number): { batches: B[]; taken: B[] } {
  const sorted = [...batches].sort((a, b) => a.batchDay - b.batchDay);
  let left = qty;
  const taken: B[] = [];
  const rest: B[] = [];
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
