import type { GameEventDef } from "@xom/content";
import { seededRandom } from "./time.js";

// Sự kiện bằng dữ liệu (docs/DESIGN.md §9, USECASES nhóm K): khai báo trong content (điều kiện, thời lượng, ảnh hưởng);
// ở đây chỉ có công thức thuần: sự kiện ngẫu nhiên nào xảy ra hôm nay, lúc mấy giờ; người chơi có được tạo sự kiện không.

export interface ScheduledEvent {
  eventId: string;
  /** Phút bắt đầu / kết thúc trong ngày. */
  from: number;
  to: number;
}

/**
 * Sự kiện ngẫu nhiên cấp xóm trong ngày (tất định theo xóm + ngày): mỗi sự kiện tung xác suất một lần/ngày,
 * nếu trúng thì chọn giờ bắt đầu trong khung giờ khai báo.
 */
export function dailyEvents(defs: GameEventDef[], ...seed: (string | number)[]): ScheduledEvent[] {
  const out: ScheduledEvent[] = [];
  for (const d of defs) {
    if (d.trigger.kind !== "daily") continue;
    const rand = seededRandom("event", d.id, ...seed);
    if (rand() >= d.trigger.chance) continue;
    const latest = Math.max(d.trigger.from, d.trigger.to - d.minutes);
    const from = d.trigger.from + Math.floor(rand() * (latest - d.trigger.from + 1));
    out.push({ eventId: d.id, from, to: from + d.minutes });
  }
  return out;
}

/** Xác suất xảy ra trong một nhịp `minutes` phút khi tỉ lệ là `perHour` lần/giờ. */
export function chanceIn(perHour: number, minutes: number): number {
  return 1 - Math.exp((-perHour * minutes) / 60);
}

/** Người chơi tạo sự kiện (khai trương): còn trong thời gian chờ thì không được. Trả về lý do hoặc null. */
export function canHost(def: GameEventDef, lastDay: number | null, day: number): string | null {
  if (def.trigger.kind !== "player") return "Sự kiện này không do người chơi tạo";
  if (lastDay !== null && day - lastDay < def.trigger.cooldownDays)
    return `Mới tổ chức rồi — ${def.trigger.cooldownDays - (day - lastDay)} ngày nữa mới làm lại được`;
  return null;
}

/** Tổng chi phí tổ chức (các khoản pháo, bong bóng…). */
export function hostCost(def: GameEventDef): number {
  return def.trigger.kind === "player" ? def.trigger.costs.reduce((s, c) => s + c.price, 0) : 0;
}
