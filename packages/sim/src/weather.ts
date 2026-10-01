import type { Weather, WeatherId, WeatherKind } from "@xom/content";
import { seededRandom, valueAt } from "./time.js";

// Thời tiết (docs/USECASES.md UC-B4, DESIGN §8): mỗi ngày chia khối (mặc định 2 giờ), mỗi khối một kiểu trời,
// chọn theo trọng số theo giờ trong content + xác suất "giữ nguyên trời" để không đổi xoành xoạch.
// Có seed theo (xóm, ngày): server và test luôn ra cùng một kết quả; dự báo được trước.

export interface WeatherSpan {
  /** Phút trong ngày bắt đầu / kết thúc (không gồm `to`). */
  from: number;
  to: number;
  kind: WeatherId;
}

/** Chọn một kiểu trời theo trọng số ở phút `minute`. */
function pickKind(w: Weather, minute: number, r: number): WeatherId {
  const ids = Object.keys(w.weights) as WeatherId[];
  const weights = ids.map((id) => Math.max(0, valueAt(w.weights[id], minute)));
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r * total;
  for (let i = 0; i < ids.length; i++) {
    x -= weights[i] ?? 0;
    if (x < 0) return ids[i] ?? "sunny";
  }
  return "sunny";
}

/** Thời tiết cả ngày (từ giờ mở tới giờ đóng ngày game). Các khối liền nhau cùng kiểu được gộp lại. */
export function weatherPlan(
  w: Weather,
  dayStart: number,
  dayEnd: number,
  ...seed: (string | number)[]
): WeatherSpan[] {
  const rand = seededRandom("weather", ...seed);
  const spans: WeatherSpan[] = [];
  let prev: WeatherId | null = null;
  for (let from = dayStart; from < dayEnd; from += w.blockMinutes) {
    const to = Math.min(dayEnd, from + w.blockMinutes);
    const keep = rand() < w.persist;
    const fresh = pickKind(w, from + w.blockMinutes / 2, rand());
    const kind: WeatherId = prev && keep ? prev : fresh;
    const last = spans[spans.length - 1];
    if (last && last.kind === kind) last.to = to;
    else spans.push({ from, to, kind });
    prev = kind;
  }
  return spans;
}

/** Trời ở phút `minute` (ngoài khoảng thì lấy khối gần nhất). */
export function weatherAt(plan: WeatherSpan[], minute: number): WeatherSpan {
  const hit = plan.find((s) => minute >= s.from && minute < s.to);
  if (hit) return hit;
  const first = plan[0];
  if (!first) return { from: 0, to: 1440, kind: "sunny" };
  return minute < first.from ? first : (plan[plan.length - 1] ?? first);
}

/** Đè một khoảng trời (sự kiện "mưa lớn toàn xóm", thử nghiệm): cắt các khối cũ, chèn khối mới. */
export function overrideWeather(plan: WeatherSpan[], span: WeatherSpan): WeatherSpan[] {
  const out: WeatherSpan[] = [];
  for (const s of plan) {
    if (s.to <= span.from || s.from >= span.to) {
      out.push({ ...s });
      continue;
    }
    if (s.from < span.from) out.push({ ...s, to: span.from });
    if (s.to > span.to) out.push({ ...s, from: span.to });
  }
  out.push({ ...span });
  out.sort((a, b) => a.from - b.from);
  // Gộp các khối liền nhau cùng kiểu.
  const merged: WeatherSpan[] = [];
  for (const s of out) {
    const last = merged[merged.length - 1];
    if (last && last.kind === s.kind && last.to === s.from) last.to = s.to;
    else merged.push(s);
  }
  return merged;
}

/** Lần đổi trời kế tiếp nếu nó bắt đầu trong vòng `lead` phút tới (để báo trước trên dải tin). */
export function upcomingWeather(
  plan: WeatherSpan[],
  minute: number,
  lead: number,
): WeatherSpan | null {
  const now = weatherAt(plan, minute);
  const next = plan.find((s) => s.from > minute && s.kind !== now.kind);
  if (!next || next.from - minute > lead) return null;
  return next;
}

/**
 * Hệ số khách do trời: chỗ ngoài trời (xe đẩy) hay trong nhà có mái (tiệm), nhân với hệ số theo danh mục
 * (trời nóng đồ uống lạnh bán chạy, trời mưa đồ nóng đắt hàng).
 */
export function weatherDemand(
  kind: WeatherKind,
  place: "cart" | "house",
  category: string,
): number {
  return (place === "house" ? kind.indoor : kind.outdoor) * (kind.category[category] ?? 1);
}

/** Phụ phí bão/mưa cho một đơn giao (làm tròn 500đ). */
export function deliverySurcharge(kind: WeatherKind, pay: number): number {
  return Math.round((pay * kind.delivery.surcharge) / 500) * 500;
}
