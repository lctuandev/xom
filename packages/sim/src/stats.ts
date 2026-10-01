import type { Achievement, AchievementMetric, Award, Content } from "@xom/content";
import { marketPackPrice } from "./recipe.js";

// Thống kê + bảng giải của xóm (docs/USECASES.md UC-P2): nhiều con đường thành công, so trong xóm, theo 7 ngày gần nhất
// (người chơi lâu không thắng mãi — số liệu cũ trôi đi).

export interface DayStat {
  day: number;
  revenue: number;
  tips: number;
  /** Tiền công làm thuê. */
  wages: number;
  stockCost: number;
  rent: number;
  fees: number;
  served: number;
}

export interface Contender {
  playerId: string;
  name: string;
  /** Món đang bán (null = chưa có nghề). */
  productId: string | null;
  days: DayStat[];
  rating: { avg: number; count: number };
  /** Điểm kỹ năng Ăn nói. */
  friendly: number;
}

/** Lãi buôn bán một ngày: doanh thu + boa − tiền hàng − thuê chỗ − phí (không tính tiền công làm thuê). */
export const profitOf = (d: DayStat) => d.revenue + d.tips - d.stockCost - d.rent - d.fees;

const inWindow = (days: DayStat[], from: number, to: number) =>
  days.filter((d) => d.day >= from && d.day <= to);
const sum = (days: DayStat[], f: (d: DayStat) => number) => days.reduce((a, d) => a + f(d), 0);

/** Giá trị một hạng mục của một người trong `window` ngày tới hôm nay; null = không đủ điều kiện xếp. */
export function awardValue(a: Award, c: Contender, today: number, window = 7): number | null {
  const days = inWindow(c.days, today - window + 1, today);
  switch (a.metric) {
    case "revenue":
      return sum(days, (d) => d.revenue);
    case "profit":
      return days.some((d) => d.served > 0) ? sum(days, profitOf) : null;
    case "served":
      return sum(days, (d) => d.served);
    case "wages":
      return sum(days, (d) => d.wages);
    case "rating":
      return c.rating.count >= a.min ? c.rating.avg : null;
    case "friendly":
      return c.friendly;
    case "growth": {
      const recent = sum(inWindow(c.days, today - 2, today), (d) => d.revenue);
      const before = sum(inWindow(c.days, today - 5, today - 3), (d) => d.revenue);
      if (before <= 0 || recent <= 0) return null;
      return Math.round((recent / before - 1) * 100) / 100;
    }
  }
}

export interface AwardRow {
  id: string;
  emoji: string;
  name: string;
  description: string;
  metric: Award["metric"];
  entries: { playerId: string; name: string; value: number }[];
}

/** Top 3 mỗi hạng mục (bỏ người có giá trị ≤ 0 hoặc không đủ điều kiện). */
export function xomAwards(
  defs: readonly Award[],
  cs: readonly Contender[],
  today: number,
  window = 7,
): AwardRow[] {
  return defs.map((a) => ({
    id: a.id,
    emoji: a.emoji,
    name: a.name,
    description: a.description,
    metric: a.metric,
    entries: cs
      .map((c) => ({ playerId: c.playerId, name: c.name, value: awardValue(a, c, today, window) }))
      .filter((e): e is { playerId: string; name: string; value: number } => (e.value ?? 0) > 0)
      .sort((x, y) => y.value - x.value)
      .slice(0, 3),
  }));
}

export interface ShareRow {
  productId: string;
  total: number;
  entries: { playerId: string; name: string; served: number; share: number }[];
}

/** Thị phần theo món trong xóm: ai bán được bao nhiêu phần trăm số món cùng loại (7 ngày). */
export function marketShare(cs: readonly Contender[], today: number, window = 7): ShareRow[] {
  const by = new Map<string, ShareRow>();
  for (const c of cs) {
    if (!c.productId) continue;
    const served = sum(inWindow(c.days, today - window + 1, today), (d) => d.served);
    if (served <= 0) continue;
    const row = by.get(c.productId) ?? { productId: c.productId, total: 0, entries: [] };
    row.total += served;
    row.entries.push({ playerId: c.playerId, name: c.name, served, share: 0 });
    by.set(c.productId, row);
  }
  return [...by.values()]
    .map((r) => ({
      ...r,
      entries: r.entries
        .map((e) => ({ ...e, share: Math.round((e.served / r.total) * 100) / 100 }))
        .sort((a, b) => b.served - a.served),
    }))
    .sort((a, b) => b.total - a.total);
}

/** Trung bình mỗi ngày có bán của các quầy cùng món trong xóm (để so, không phán ai giỏi hơn). */
export function xomAverage(
  cs: readonly Contender[],
  productId: string,
  today: number,
  window = 7,
): { stalls: number; revenue: number; served: number; rating: number } {
  const same = cs.filter((c) => c.productId === productId);
  let revenue = 0;
  let served = 0;
  let days = 0;
  let rating = 0;
  let rated = 0;
  for (const c of same) {
    for (const d of inWindow(c.days, today - window + 1, today)) {
      if (d.served <= 0) continue;
      revenue += d.revenue;
      served += d.served;
      days++;
    }
    if (c.rating.count > 0) {
      rating += c.rating.avg;
      rated++;
    }
  }
  return {
    stalls: same.length,
    revenue: days ? Math.round(revenue / days / 1000) * 1000 : 0,
    served: days ? Math.round(served / days) : 0,
    rating: rated ? Math.round((rating / rated) * 10) / 10 : 0,
  };
}

export interface AchievementState {
  id: string;
  emoji: string;
  name: string;
  description: string;
  goal: number;
  value: number;
  done: boolean;
}

/** Tiến độ thành tựu từ số liệu cộng dồn. */
export function achievementProgress(
  defs: readonly Achievement[],
  values: Record<AchievementMetric, number>,
): AchievementState[] {
  return defs.map((a) => {
    const value = values[a.metric] ?? 0;
    return {
      id: a.id,
      emoji: a.emoji,
      name: a.name,
      description: a.description,
      goal: a.goal,
      value: Math.min(value, a.goal),
      done: value >= a.goal,
    };
  });
}

/** Nguyên liệu tăng/giảm giá mạnh nhất hôm nay so với hôm qua (tin "đang hot"). */
export function priceMoves(
  c: Content,
  day: number,
  minute: number,
): { id: string; name: string; emoji: string; change: number }[] {
  if (day <= 1) return [];
  return c.data.ingredients
    .map((ing) => {
      const now = marketPackPrice(ing, day, minute, c.economy);
      const before = marketPackPrice(ing, day - 1, minute, c.economy);
      return {
        id: ing.id,
        name: ing.name,
        emoji: ing.emoji,
        change: Math.round((now / before - 1) * 100) / 100,
      };
    })
    .filter((m) => Math.abs(m.change) >= 0.08)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}
