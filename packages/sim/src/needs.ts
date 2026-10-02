import type { Content } from "@xom/content";

// Đói / khát (docs/USECASES.md UC-B11): giảm theo giờ game, ăn uống thì hồi. Chỉ làm chậm tay + nhắc,
// không khoá việc chơi (DESIGN Luật 17).

const DAY = 24 * 60;

export interface Needs {
  food: number;
  drink: number;
  /** Phút game tuyệt đối (ngày × 1440 + phút) lúc cập nhật gần nhất; 0 = chưa có (coi như vừa ăn). */
  at: number;
}

export const absMinute = (day: number, minute: number) => day * DAY + minute;

/** Mức no / khát bây giờ: trừ theo thời gian đã trôi, mỗi đêm (ngủ) chỉ tính `nightMinutes`. */
export function needsAt(c: Content, n: Needs, now: number): { food: number; drink: number } {
  const cfg = c.data.needs;
  if (!n.at || now <= n.at) return { food: n.food, drink: n.drink };
  const nights = Math.max(0, Math.floor(now / DAY) - Math.floor(n.at / DAY));
  const sleep = DAY - (c.economy.dayEndMinute - c.economy.dayStartMinute);
  const minutes = Math.max(0, now - n.at - nights * Math.max(0, sleep - cfg.nightMinutes));
  const h = minutes / 60;
  return {
    food: Math.max(0, Math.round(n.food - h * cfg.foodPerHour)),
    drink: Math.max(0, Math.round(n.drink - h * cfg.drinkPerHour)),
  };
}

/** Ăn / uống: cộng vào mức hiện tại (tối đa 100), mốc thời gian là bây giờ. */
export function eat(
  c: Content,
  n: Needs,
  now: number,
  add: { food?: number; drink?: number },
): Needs {
  const cur = needsAt(c, n, now);
  return {
    food: Math.min(100, cur.food + (add.food ?? 0)),
    drink: Math.min(100, cur.drink + (add.drink ?? 0)),
    at: now,
  };
}

/** Hệ số giữ nút khi làm món: đói hoặc khát thì tay chậm đi chút. */
export function needsHold(c: Content, cur: { food: number; drink: number }): number {
  const low = c.data.needs.lowAt;
  return cur.food < low || cur.drink < low ? c.data.needs.slowHold : 1;
}

/** Mức cảnh báo vừa chạm (để nhắc một lần): "low" dưới lowAt, "empty" dưới 10. */
export function needsAlert(
  c: Content,
  cur: { food: number; drink: number },
): { food: "ok" | "low" | "empty"; drink: "ok" | "low" | "empty" } {
  const low = c.data.needs.lowAt;
  const lvl = (v: number) => (v < 10 ? "empty" : v < low ? "low" : "ok");
  return { food: lvl(cur.food), drink: lvl(cur.drink) };
}

/** Đọc mức no/khát lưu dạng JSON: thiếu thì coi như vừa ăn (80/80, chưa có mốc). */
export function needsFrom(raw: unknown): Needs {
  const n = (raw ?? {}) as Partial<Needs>;
  return { food: n.food ?? 80, drink: n.drink ?? 80, at: n.at ?? 0 };
}
