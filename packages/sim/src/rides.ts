import type { Content } from "@xom/content";
import { valueAt } from "./time.js";

// Xe ôm + kẹt xe (docs/KIENTRUC.md §4–5, docs/USECASES.md UC-N1): thuần logic — độ kẹt theo giờ, giá cuốc theo quãng
// đường, trả giá, tốc độ đường lớn / hẻm, sao + tiền boa, xăng.

export type RideRoute = "road" | "alley";

export interface RideDest {
  kind: "address" | "lot";
  id: string;
  label: string;
  x: number;
  z: number;
}

const round1000 = (n: number) => Math.round(n / 1000) * 1000;

/** Trọng số ô khi tìm đường: đường lớn ưu tiên mặt đường; đi hẻm thì chui hẻm, né đường lớn. */
export const ROUTE_WEIGHTS: Record<RideRoute, Record<string, number>> = {
  road: { "=": 1, "|": 1, "+": 1, c: 1, s: 1.5, a: 4 },
  alley: { a: 0.4, s: 1, "+": 1.2, c: 1.2, "=": 2.5, "|": 2.5 },
};

/** Độ kẹt xe 0–1 theo giờ: lưu lượng khu `jamProfile` so với lúc vắng nhất / đông nhất trong ngày. */
export function congestion(content: Content, minuteOfDay: number): number {
  const profile = content.data.trafficProfiles.find((p) => p.id === content.data.rides.jamProfile);
  if (!profile) return 0;
  const values = Object.values(profile.peoplePerHour);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi <= lo) return 0;
  const v = valueAt(profile.peoplePerHour, minuteOfDay);
  return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
}

/** Nơi khách muốn tới: nhà trong xóm + các chỗ bán (đủ xa trạm mới đi xe ôm). */
export function rideDestinations(content: Content, from: { x: number; z: number }): RideDest[] {
  const { minMeters } = content.data.rides;
  const all: RideDest[] = [
    ...content.data.delivery.addresses.map((a) => ({
      kind: "address" as const,
      id: a.id,
      label: a.label,
      x: a.position.x,
      z: a.position.z,
    })),
    ...content.data.lots.map((l) => ({
      kind: "lot" as const,
      id: l.id,
      label: l.name.replace(/^🏠 /, ""),
      x: l.position.x,
      z: l.position.z,
    })),
  ];
  return all.filter((d) => Math.hypot(d.x - from.x, d.z - from.z) >= minMeters);
}

/** Giá chuẩn một cuốc (làm tròn nghìn). */
export function rideFare(content: Content, meters: number): number {
  const r = content.data.rides;
  return round1000(r.baseFare + (r.farePer100m * meters) / 100);
}

/** Tiền xăng: đi + quay về trạm, làm tròn lên 500đ. */
export function rideFuel(content: Content, meters: number): number {
  return Math.max(500, Math.ceil((content.data.rides.fuelPer100m * meters * 2) / 100 / 500) * 500);
}

/** Khả năng khách chịu giá `ratio` × giá chuẩn (mưa bão dễ chịu hơn). */
export function haggleChance(content: Content, ratio: number, wet: boolean): number {
  const r = content.data.rides;
  const p = ratio <= 1 ? 1 : 1 - (ratio - 1) * r.acceptSlope + (wet ? r.rainAcceptBonus : 0);
  return Math.max(0, Math.min(1, p));
}

/** Tốc độ (m/s) theo đường chọn: đường lớn chậm khi kẹt, hẻm chậm khi mưa. */
export function routeSpeed(content: Content, route: RideRoute, jam: number, wet: boolean): number {
  const r = content.data.rides.routes;
  return route === "road"
    ? r.road.speed * (1 - r.road.jamSlow * jam)
    : r.alley.speed * (1 - (wet ? r.alley.rainSlow : 0));
}

/** Khách chấm sao: nhanh hơn mong đợi thì vui; đi hẻm lúc mưa thì xóc, ướt → trừ 1 sao. */
export function rideStars(
  content: Content,
  o: { meters: number; ms: number; route: RideRoute; wet: boolean },
): number {
  const expected = o.meters / content.data.rides.expectSpeed;
  const ratio = o.ms / 1000 / Math.max(0.5, expected);
  let stars = ratio <= 0.85 ? 5 : ratio <= 1.1 ? 4 : ratio <= 1.5 ? 3 : ratio <= 2.2 ? 2 : 1;
  if (o.route === "alley" && o.wet) stars -= 1;
  return Math.max(1, stars);
}

/** Tiền boa theo sao (chẵn nghìn). */
export function rideTip(content: Content, stars: number, rand: () => number): number {
  const t = content.data.rides.tip;
  const range = stars >= 5 ? t.five : stars === 4 ? t.four : null;
  if (!range) return 0;
  return round1000(range[0] + rand() * (range[1] - range[0]));
}

/** Phút game chờ tới khách kế tiếp: ngã tư đông thì khách tới liền, vắng thì chờ lâu (tối đa ×3). */
export function passengerWait(content: Content, minuteOfDay: number): number {
  const jam = congestion(content, minuteOfDay);
  return Math.round(content.data.rides.waitMinutes * (1 + 2 * (1 - jam)));
}

/** Câu thoại xe ôm, điền {place}. */
export function rideLine(
  content: Content,
  kind: "ask" | "accept" | "refuse",
  rand: () => number,
  place = "",
): string {
  const list = content.data.rides.lines[kind];
  return (list[Math.floor(rand() * list.length)] ?? "").replace("{place}", place);
}

export function starLine(content: Content, stars: number, rand: () => number): string {
  const list = content.data.rides.lines.stars[String(stars)] ?? [];
  return list[Math.floor(rand() * list.length)] ?? "";
}
