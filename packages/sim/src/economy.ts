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

/** Giá khách thấy hợp lý cho một món ở một chỗ bán (tiệm: cao hơn xe đẩy theo lot.priceTolerance), làm tròn nghìn. */
export function fairPrice(content: Content, refPrice: number, lotId: string | null): number {
  const tol = lotId ? content.lot(lotId).priceTolerance : 1;
  return Math.round((refPrice * tol) / 1000) * 1000;
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

/** Lịch tuần (THEGIOI §2): cuối tuần cổng trường / văn phòng vắng, trong hẻm / gần chợ đông hơn. */
export function weekdayTraffic(content: Content, day: number, trafficId: string): number {
  if (!content.weekday(day).weekend) return 1;
  return content.data.calendar.weekendTraffic[trafficId] ?? 1;
}

/** Một quầy đang mở, đủ để tính tiếng khu: thuộc khu nào (trafficProfile), bán nhóm hàng gì. */
export interface OpenShop {
  trafficId: string;
  category: string;
}

export interface DistrictFame {
  trafficId: string;
  groupId: string;
  /** Số quầy đang mở cùng nhóm hàng trong khu. */
  shops: number;
  /** Người qua lại tăng thêm cho cả nhóm (0 → cap). */
  bonus: number;
  /** Đủ quầy để bảng xóm gọi tên ("Cổng trường đang thành khu ăn uống"). */
  named: boolean;
}

/**
 * Tiếng khu (THEGIOI §3, emergent): đếm quầy đang mở theo (khu × nhóm hàng); mỗi quầy thứ hai trở đi cộng `perShop`
 * người qua lại cho cả nhóm, tối đa `cap`. Người chơi mở quầy là đang "xây" khu phố.
 */
export function districtFame(content: Content, open: OpenShop[]): DistrictFame[] {
  const cfg = content.data.districtFame;
  const counts = new Map<string, number>();
  for (const o of open) {
    const g = cfg.groups.find((x) => x.categories.includes(o.category));
    if (!g) continue;
    const key = `${o.trafficId}|${g.id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([key, shops]) => {
    const [trafficId = "", groupId = ""] = key.split("|");
    return {
      trafficId,
      groupId,
      shops,
      bonus: Math.min(cfg.cap, cfg.perShop * Math.max(0, shops - 1)),
      named: shops >= cfg.minShops,
    };
  });
}

/** Khẩu vị khu × tiếng khu cho một quầy (THEGIOI §3). */
export function districtDemand(
  content: Content,
  trafficId: string,
  category: string,
  fame: DistrictFame[],
): number {
  const like = content.traffic(trafficId).likes[category] ?? 1;
  const group = content.data.districtFame.groups.find((g) => g.categories.includes(category));
  const bonus = fame.find((f) => f.trafficId === trafficId && f.groupId === group?.id)?.bonus ?? 0;
  return like * (1 + bonus);
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
    // Giá so với mức khách chấp nhận ở chỗ này (tiệm: khách chịu giá cao hơn xe đẩy).
    return {
      s,
      product,
      lot,
      attract: attractiveness(s.priceRatio / lot.priceTolerance, product, s.reputation),
    };
  });

  const fame = districtFame(
    content,
    info.map(({ lot, product }) => ({ trafficId: lot.traffic, category: product.category })),
  );
  return info.map(({ s, product, lot, attract }) => {
    const traffic =
      valueAt(content.traffic(lot.traffic).peoplePerHour, minuteOfDay) *
      lot.trafficScale *
      weekdayTraffic(content, day, lot.traffic) *
      districtDemand(content, lot.traffic, product.category, fame);
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
    const carry =
      s.demandCarry +
      traffic * hours * interest * share * noise * (s.boost ?? 1) * content.economy.demandScale;
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
  // Reviewer, khách VIP chỉ xuất hiện qua sự kiện.
  const npcs = content.data.npcs.filter((n) => n.id !== "reviewer" && n.id !== "vip");
  const weights = npcs.map((n) => n.likes[category] ?? 0.5);
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < npcs.length; i++) {
    r -= weights[i] ?? 0;
    if (r <= 0) return npcs[i]?.id ?? "khach_vang_lai";
  }
  return npcs[npcs.length - 1]?.id ?? "khach_vang_lai";
}

/**
 * Lãi ngân hàng một ngày (DESIGN §2, Luật 2.3): tỉ lệ rất nhỏ, chỉ cho số dư từ mức tối thiểu, có trần,
 * làm tròn xuống 500đ (không có tiền lẻ). Không bao giờ thành nguồn sống.
 */
export function bankInterest(
  balance: number,
  bank: { interestRate: number; interestCap: number; interestMin: number },
): number {
  if (balance < bank.interestMin) return 0;
  const raw = Math.min(bank.interestCap, balance * bank.interestRate);
  return Math.floor(raw / 500) * 500;
}

/** Tiền thanh lý `qty` phần hàng tồn cho chợ: rẻ hơn giá gốc nhiều, tròn 500đ (không lẻ). */
export function resaleValue(costPerUnit: number, qty: number, rate: number): number {
  return Math.floor((costPerUnit * qty * rate) / 500) * 500;
}

/** Số tiền rút/gửi ở ATM phải là bội số của `step` và dương. Trả về lý do nếu không hợp lệ. */
export function atmAmountError(amount: number, step: number): string | null {
  if (!Number.isInteger(amount) || amount <= 0) return "Số tiền không hợp lệ";
  if (amount % step !== 0) return `ATM chỉ nhận bội số ${step.toLocaleString("vi-VN")}đ`;
  return null;
}

/** Mã PIN ATM hợp lệ: đúng 6 số, không trùng hết, không dãy liên tiếp (như ngân hàng thật bắt buộc). */
export function pinError(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return "PIN gồm đúng 6 chữ số";
  if (/^(\d)\1{5}$/.test(pin)) return "PIN không được 6 số giống nhau";
  if ("0123456789".includes(pin) || "9876543210".includes(pin))
    return "PIN không được là dãy số liên tiếp";
  return null;
}

export interface Maintenance {
  wearPerServe: number;
  slowAt: number;
  slowDemand: number;
  slowHold: number;
  repairRate: number;
}

/** Độ mòn sau khi bán thêm `served` món (0–1). */
export function wearAfter(wear: number, served: number, m: Maintenance): number {
  return Math.min(1, wear + served * m.wearPerServe);
}

/** Tình trạng xe/quầy theo độ mòn: tốt · ọp ẹp (khách bớt ghé, làm món chậm) · hư (không mở được). */
export function wearState(wear: number, m: Maintenance): "ok" | "worn" | "broken" {
  if (wear >= 1) return "broken";
  return wear >= m.slowAt ? "worn" : "ok";
}

/** Hệ số khách do tình trạng xe/quầy. */
export function wearDemand(wear: number, m: Maintenance): number {
  return wearState(wear, m) === "ok" ? 1 : m.slowDemand;
}

/** Tiền sửa ở vựa xe: giá thiết bị × độ mòn × tỉ lệ, tròn 1.000đ (mòn chút ít thì miễn phí). */
export function repairCost(price: number, wear: number, m: Maintenance): number {
  return Math.round((price * wear * m.repairRate) / 1000) * 1000;
}

export type PayMethod = "auto" | "cash" | "bank";
export type PaySource = "cash" | "bank";

/**
 * Trả bằng gì (DESIGN §2): người chơi chọn 💵 tiền mặt / 🏦 chuyển khoản, hoặc "tự chọn" — món lặt vặt móc tiền mặt trước,
 * khoản lớn chuyển khoản trước; ví nào thiếu thì dùng ví kia. Sạp chỉ nhận tiền mặt thì không chuyển khoản được.
 * Trả về nguồn tiền, hoặc câu báo lỗi cho người chơi.
 */
export function choosePayment(o: {
  amount: number;
  cash: number;
  bank: number;
  method: PayMethod;
  cashOnly?: boolean;
  cashFirstBelow: number;
}): PaySource | { error: string } {
  const has = (src: PaySource) => (src === "cash" ? o.cash : o.bank) >= o.amount;
  if (o.method === "bank" && o.cashOnly) return { error: "Sạp này chỉ nhận tiền mặt thôi con" };
  if (o.method !== "auto") {
    if (has(o.method)) return o.method;
    if (o.method === "bank") return { error: "Tài khoản không đủ số dư" };
    return {
      error:
        !o.cashOnly && has("bank")
          ? "Không đủ tiền mặt — chọn chuyển khoản hoặc ra cây ATM rút"
          : "Không đủ tiền mặt — ra cây ATM rút thêm",
    };
  }
  const order: PaySource[] = o.cashOnly
    ? ["cash"]
    : o.amount < o.cashFirstBelow
      ? ["cash", "bank"]
      : ["bank", "cash"];
  const src = order.find(has);
  if (src) return src;
  if (o.cashOnly && has("bank")) return { error: "Sạp chỉ nhận tiền mặt — ra cây ATM rút đã" };
  return { error: "Không đủ tiền" };
}
