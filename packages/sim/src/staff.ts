import type { Content } from "@xom/content";
import { customerArrivals } from "./economy.js";
import {
  baseSpec,
  generateOrder,
  hasIngredients,
  ingredientsFor,
  type MenuItem,
} from "./recipe.js";
import { seededRandom } from "./time.js";

// Nhân viên đứng quầy thay (docs/KIENTRUC.md §2): thuần logic — trong một khoảng giờ, khách tới theo lưu lượng như thường,
// nhân viên làm món theo tay nghề (đúng/sai) và tốc độ; hết hàng thì khách đi. Có trần tự nhiên: kho hàng × độ dài ca.

export type StaffDef = Content["data"]["staff"]["people"][number];

export interface StaffShiftInput {
  content: Content;
  staff: StaffDef;
  productId: string;
  lotId: string;
  /** Món đang bán + giá (thực đơn của chủ). */
  menu: MenuItem[];
  stock: ReadonlyMap<string, number>;
  reputation: number;
  priceRatio: number;
  day: number;
  fromMinute: number;
  toMinute: number;
  demandCarry: number;
  /** Hệ số khách khác (thời tiết, sự kiện…). */
  boost?: number;
  /** Sức làm còn dư từ nhịp trước (số món làm kịp); đầu ca nhân viên sẵn sàng làm 1 món. */
  capacity?: number;
  seed: string;
}

export interface StaffShiftResult {
  served: number;
  wrong: number;
  lost: number;
  revenue: number;
  /** Nguyên liệu đã dùng. */
  used: Map<string, number>;
  minutes: number;
  /** Hết hàng giữa ca (nhân viên về sớm). */
  soldOut: boolean;
  wages: number;
  demandCarry: number;
  /** Sức làm dư (truyền vào nhịp sau). */
  capacity: number;
}

const round500 = (n: number) => Math.round(n / 500) * 500;

/** Lương cho số phút đã làm (làm tròn 500đ). */
export function staffWage(staff: StaffDef, minutes: number): number {
  return round500((staff.wagePerHour * Math.max(0, minutes)) / 60);
}

/** Nhân viên bán từ `fromMinute` tới `toMinute`: chạy từng nhịp kinh tế như quầy thường, phục vụ tối đa theo tốc độ tay. */
export function staffShift(p: StaffShiftInput): StaffShiftResult {
  const { content, staff } = p;
  const recipe = content.product(p.productId).recipe;
  const step = content.economy.economyTickMinutes;
  const stock = new Map(p.stock);
  const used = new Map<string, number>();
  let carry = p.demandCarry;
  let capacity = p.capacity ?? 1;
  const out = { served: 0, wrong: 0, lost: 0, revenue: 0 };
  const sellable = () =>
    p.menu.filter(
      (m) =>
        hasIngredients(ingredientsFor(recipe, baseSpec(recipe, m.variantId)), stock).length === 0,
    );
  // Hết hàng thì nhân viên dọn quầy về sớm: chỉ trả lương tới lúc đó.
  let end = p.toMinute;
  let soldOut = false;
  for (let t = p.fromMinute; t < p.toMinute; t += step) {
    if (sellable().length === 0) {
      end = t;
      soldOut = true;
      break;
    }
    const minutes = Math.min(step, p.toMinute - t);
    const [arr] = customerArrivals({
      content,
      day: p.day,
      minuteOfDay: t,
      minutes,
      shops: [
        {
          id: "staff",
          productId: p.productId,
          lotId: p.lotId,
          priceRatio: p.priceRatio,
          reputation: p.reputation,
          boost: p.boost ?? 1,
          demandCarry: carry,
        },
      ],
    });
    carry = arr?.demandCarry ?? 0;
    capacity = Math.min(capacity + minutes / staff.serveMinutes, 3);
    for (let k = 0; k < (arr?.arrivals ?? 0); k++) {
      const rand = seededRandom("staff", p.seed, p.day, t, k);
      // Chỉ bán món còn đủ nguyên liệu (món chuẩn).
      const menu = sellable();
      const order = capacity >= 1 ? generateOrder(recipe, menu, rand, stock) : null;
      if (!order || hasIngredients(ingredientsFor(recipe, order.spec), stock).length) {
        out.lost++;
        continue;
      }
      capacity -= 1;
      for (const [id, q] of ingredientsFor(recipe, order.spec)) {
        stock.set(id, (stock.get(id) ?? 0) - q);
        used.set(id, (used.get(id) ?? 0) + q);
      }
      if (rand() < staff.accuracy) {
        out.served++;
        out.revenue += order.price;
      } else {
        // Làm sai: khách phàn nàn, nhân viên giảm nửa giá.
        out.wrong++;
        out.revenue += Math.round(order.price / 2 / 1000) * 1000;
      }
    }
  }
  const minutes = Math.max(0, end - p.fromMinute);
  return {
    ...out,
    used,
    minutes,
    soldOut,
    wages: staffWage(staff, minutes),
    demandCarry: carry,
    capacity,
  };
}

/** Ca đang làm lúc `minute` (nếu có) — ca của nhân viên được thuê. */
export function shiftAt(content: Content, shiftId: string, minute: number): boolean {
  const s = content.data.staff.shifts.find((x) => x.id === shiftId);
  return !!s && minute >= s.from && minute < s.to;
}
