import type { Delivery, Restaurant } from "@xom/content";
import { valueAt } from "./time.js";

// Việc làm thuê trong không gian riêng (docs/USECASES.md UC-W2…W5). Thuần logic, server dùng để
// sinh việc & chấm; web dùng để hiển thị; tools/balance dùng để ước thu nhập.

/** Phiếu gọi cơm: món + yêu cầu, những thứ phải có trên dĩa, giá cả phần (kèm đồ uống). */
export interface PlateOrder {
  dishId: string;
  modIds: string[];
  drinkIds: string[];
  /** "Cơm sườn bì chả, thêm trứng, không dưa" */
  text: string;
  /** Những thứ phải múc lên dĩa (có thể lặp: thêm cơm = 2 lần "com"). */
  items: string[];
  /** Giá dĩa + yêu cầu + đồ uống. */
  total: number;
}

function weighted<T>(items: T[], weight: (t: T) => number, rand: () => number): T | undefined {
  const total = items.reduce((s, t) => s + weight(t), 0);
  let r = rand() * total;
  for (const t of items) {
    r -= weight(t);
    if (r <= 0) return t;
  }
  return items[items.length - 1];
}

export function plateOrder(r: Restaurant, rand: () => number): PlateOrder {
  const dish = weighted(r.dishes, (d) => d.popularity, rand) ?? r.dishes[0];
  if (!dish) throw new Error("Quán không có món");
  const items = [...dish.items];
  const modIds: string[] = [];
  const says: string[] = [];
  let total = dish.price;
  for (const m of r.mods) {
    if (rand() >= m.chance) continue;
    if (m.remove && !items.includes(m.remove)) continue;
    if (m.add === "trung" && items.includes("trung")) continue;
    if (m.add) items.push(m.add);
    if (m.remove) items.splice(items.indexOf(m.remove), 1);
    modIds.push(m.id);
    says.push(m.say);
    total += m.price;
  }
  const drinkIds = r.drinks.filter((d) => rand() < d.chance).map((d) => d.id);
  for (const id of drinkIds) total += r.drinks.find((d) => d.id === id)?.price ?? 0;
  return { dishId: dish.id, modIds, drinkIds, text: [dish.name, ...says].join(", "), items, total };
}

/** Dĩa múc ra có đúng những thứ trên phiếu không (không quan trọng thứ tự). */
export function sameItems(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const count = new Map<string, number>();
  for (const x of a) count.set(x, (count.get(x) ?? 0) + 1);
  for (const x of b) {
    const n = count.get(x) ?? 0;
    if (n === 0) return false;
    count.set(x, n - 1);
  }
  return true;
}

/** Thu ngân bấm món trên máy tính tiền: id món/yêu cầu/đồ uống → số lượng. Trả về tổng tiền. */
export function ringTotal(r: Restaurant, lines: Record<string, number>): number {
  let total = 0;
  for (const [id, qty] of Object.entries(lines)) {
    const price =
      r.dishes.find((d) => d.id === id)?.price ??
      r.mods.find((m) => m.id === id)?.price ??
      r.drinks.find((d) => d.id === id)?.price;
    if (price === undefined) throw new Error(`Máy tính tiền không có món ${id}`);
    total += price * qty;
  }
  return total;
}

/** Các dòng đúng trên máy tính tiền cho một phiếu. */
export function linesOf(
  o: Pick<PlateOrder, "dishId" | "modIds" | "drinkIds">,
): Record<string, number> {
  const lines: Record<string, number> = {};
  for (const id of [o.dishId, ...o.modIds, ...o.drinkIds]) lines[id] = (lines[id] ?? 0) + 1;
  return lines;
}

/** Khách tới quán trong một nhịp (cộng dồn phần lẻ qua các nhịp). */
export function restaurantArrivals(
  r: Restaurant,
  minuteOfDay: number,
  minutes: number,
  carry: number,
  crowd = 1,
) {
  const next = carry + (valueAt(r.customersPerHour, minuteOfDay) * minutes * crowd) / 60;
  const arrivals = Math.floor(next);
  return { arrivals, carry: next - arrivals };
}

export interface DeliveryOrder {
  code: string;
  recipient: string;
  addressId: string;
  item: string;
  fragile: boolean;
  /** Tiền thu hộ; 0 = đã thanh toán trước. */
  cod: number;
  /** Người nhận vắng nhà khi tới giao. */
  absent: boolean;
}

export function deliveryOrder(d: Delivery, rand: () => number): DeliveryOrder {
  const address = d.addresses[Math.floor(rand() * d.addresses.length)] ?? d.addresses[0];
  const item = d.items[Math.floor(rand() * d.items.length)] ?? d.items[0];
  if (!address || !item) throw new Error("Thiếu dữ liệu giao hàng");
  return {
    code: `XM-${1000 + Math.floor(rand() * 9000)}`,
    recipient: d.recipients[Math.floor(rand() * d.recipients.length)] ?? "Anh Hùng",
    addressId: address.id,
    item: item.name,
    fragile: item.fragile,
    cod: rand() < d.codRate ? Math.round(item.value / 1000) * 1000 : 0,
    absent: rand() < d.absentRate,
  };
}

/** Mã giả cho kệ hàng: trông giống nhau, phải đọc kỹ mới lấy đúng. */
export function decoyCodes(code: string, count: number, rand: () => number): string[] {
  const n = Number(code.slice(3));
  const out = new Set<string>();
  while (out.size < count) {
    const delta = (1 + Math.floor(rand() * 9)) * (rand() < 0.5 ? 1 : 10) * (rand() < 0.5 ? -1 : 1);
    const v = Math.min(9999, Math.max(1000, n + delta));
    if (v !== n) out.add(`XM-${v}`);
  }
  return [...out];
}

/** Tiền chuyến theo quãng đường từ bưu cục tới nơi giao (mét). */
export function deliveryPay(piecePay: number, meters: number): number {
  return Math.round((piecePay + meters * 150) / 500) * 500;
}
