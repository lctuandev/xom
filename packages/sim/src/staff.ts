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
  /** Một người (bản đầu) — hoặc dùng `team` cho cả nhóm nhân viên trong ca. */
  staff: StaffDef;
  /** Nhóm nhân viên cùng ca (docs/IA.md bước E): sức làm cộng dồn, mỗi món do một người làm theo tay nghề người đó. */
  team?: StaffDef[];
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
  /** Từng người làm được gì (phiếu ca theo người) — lương theo số phút có mặt. */
  byStaff: { staffId: string; served: number; wrong: number; revenue: number; wages: number }[];
}

const round500 = (n: number) => Math.round(n / 500) * 500;

/** Lương cho số phút đã làm (làm tròn 500đ). */
export function staffWage(staff: StaffDef, minutes: number): number {
  return round500((staff.wagePerHour * Math.max(0, minutes)) / 60);
}

/**
 * Lương trả theo từng nhịp ngắn: cộng dồn phần lẻ (`carry`) thay vì làm tròn mỗi nhịp — làm tròn 500đ mỗi 5 phút khiến
 * người 10k/giờ thành 12k/giờ. Trả bội số 500đ, phần dư mang sang nhịp sau.
 */
export function staffWageCarry(
  staff: StaffDef,
  minutes: number,
  carry: number,
): { wages: number; carry: number } {
  const exact = (staff.wagePerHour * Math.max(0, minutes)) / 60 + carry;
  const wages = Math.floor(exact / 500) * 500;
  return { wages, carry: exact - wages };
}

/** Nhân viên bán từ `fromMinute` tới `toMinute`: chạy từng nhịp kinh tế như quầy thường, phục vụ tối đa theo tốc độ tay. */
export function staffShift(p: StaffShiftInput): StaffShiftResult {
  const { content } = p;
  const team = p.team?.length ? p.team : [p.staff];
  // Sức làm cả nhóm = tổng tốc độ từng người (món / phút); dư tối đa 3 món mỗi người.
  const rate = team.reduce((r, m) => r + 1 / m.serveMinutes, 0);
  const per = new Map(team.map((m) => [m.id, { served: 0, wrong: 0, revenue: 0 }]));
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
    capacity = Math.min(capacity + minutes * rate, 3 * team.length);
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
      // Ai làm món này: người tay nhanh nhận nhiều món hơn (theo tỉ lệ tốc độ).
      let pick = rand() * rate;
      let who = team[team.length - 1] as StaffDef;
      for (const m of team) {
        pick -= 1 / m.serveMinutes;
        if (pick <= 0) {
          who = m;
          break;
        }
      }
      const mine = per.get(who.id);
      if (rand() < who.accuracy) {
        out.served++;
        out.revenue += order.price;
        if (mine) {
          mine.served++;
          mine.revenue += order.price;
        }
      } else {
        // Làm sai: khách phàn nàn, nhân viên giảm nửa giá.
        const half = Math.round(order.price / 2 / 1000) * 1000;
        out.wrong++;
        out.revenue += half;
        if (mine) {
          mine.wrong++;
          mine.revenue += half;
        }
      }
    }
  }
  const minutes = Math.max(0, end - p.fromMinute);
  return {
    ...out,
    used,
    minutes,
    soldOut,
    wages: team.reduce((w, m) => w + staffWage(m, minutes), 0),
    demandCarry: carry,
    capacity,
    byStaff: team.map((m) => ({
      staffId: m.id,
      ...(per.get(m.id) ?? { served: 0, wrong: 0, revenue: 0 }),
      wages: staffWage(m, minutes),
    })),
  };
}

/** Ca đang làm lúc `minute` (nếu có) — ca của nhân viên được thuê. */
export function shiftAt(content: Content, shiftId: string, minute: number): boolean {
  const s = content.data.staff.shifts.find((x) => x.id === shiftId);
  return !!s && minute >= s.from && minute < s.to;
}

/** Nhân viên đang trong ca lúc `minute`. */
export function onDutyTeam<E extends { shiftId: string }>(
  content: Content,
  employees: readonly E[],
  minute: number,
): E[] {
  return employees.filter((e) => shiftAt(content, e.shiftId, minute));
}

export type ShopLevel = Content["data"]["shopLevels"][number];

/** Cấp tiệm hiện tại (docs/IA.md bước E). */
export function shopLevel(content: Content, level: number): ShopLevel {
  const levels = content.data.shopLevels;
  return levels.find((l) => l.level === level) ?? (levels[0] as ShopLevel);
}

/**
 * Cấp tiệm có hiệu lực ở chỗ đang bán (docs/BANDO.md bước E): nhà mặt tiền theo cấp đã nâng của cửa hàng; sạp trên ô đất của
 * mình theo công trình đã xây xong trên ô; xe đẩy vỉa hè luôn cấp 1 (nâng cấp nhà thuê rồi dọn ra vỉa hè không giữ cấp).
 */
export function effectiveShopLevel(
  lotKind: "cart" | "house" | "stall" | null,
  bizLevel: number,
  plotLevel?: number | null,
): number {
  if (lotKind === "house") return bizLevel;
  if (lotKind === "stall") return plotLevel ?? 1;
  return 1;
}

/** Cấp kế tiếp nâng được (null = đã cao nhất, hoặc xe đẩy vỉa hè không lên cấp nhà mặt tiền). */
export function nextShopLevel(
  content: Content,
  level: number,
  lotKind: "cart" | "house" | "stall" | null,
): ShopLevel | null {
  const next = content.data.shopLevels.find((l) => l.level === level + 1);
  if (!next) return null;
  if (next.houseOnly && lotKind !== "house") return null;
  return next;
}
