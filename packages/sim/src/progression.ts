import type { Content, ReviewTag, Skill, SkillId } from "@xom/content";

// Tiến trình (docs/DESIGN.md §4): người chơi phải luôn thấy "mình đang phát triển".
// Kinh nghiệm (KN) chỉ đến từ làm thật; cấp độ tăng chậm dần; danh tiếng xã hội theo số khách đã phục vụ + uy tín.

/** KN cho từng việc làm thật (server cộng khi việc hoàn thành đúng). */
export const XP = {
  /** Bán được một món ở quầy/tiệm của mình (làm đúng, tính tiền xong). */
  serve: 10,
  /** Món làm sai phải giảm giá: vẫn học được chút ít. */
  serveDiscount: 3,
  /** Một việc trong ca làm thuê (múc dĩa, tính tiền, bưng đúng bàn…). */
  jobTask: 6,
  /** Giao xong một đơn hàng. */
  delivery: 8,
  /** Khách đánh giá 5 sao trong ca. */
  fiveStar: 4,
} as const;

/** Tổng KN cần để đạt cấp `level` (cấp 1 = 0). Tăng chậm dần: 100, 283, 520, 800… */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(100 * (level - 1) ** 1.5);
}

export interface LevelInfo {
  level: number;
  /** KN đã có trong cấp hiện tại. */
  into: number;
  /** KN cần để lên cấp kế. */
  need: number;
}

export function levelOf(xp: number): LevelInfo {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const base = xpForLevel(level);
  return { level, into: xp - base, need: xpForLevel(level + 1) - base };
}

export type Fame = "unknown" | "local" | "popular" | "famous";

export const FAME_LABEL: Record<Fame, string> = {
  unknown: "Vô danh",
  local: "Người trong xóm",
  popular: "Có tiếng",
  famous: "Nổi tiếng",
};

/** Danh tiếng xã hội: phục vụ nhiều khách và giữ được uy tín. */
export function fameOf(totalServed: number, reputation: number): Fame {
  if (totalServed >= 600 && reputation >= 0.8) return "famous";
  if (totalServed >= 150 && reputation >= 0.6) return "popular";
  if (totalServed >= 20) return "local";
  return "unknown";
}

// ───────── Kỹ năng & mở khoá (content.skills, content.unlocks) ─────────

export type SkillPoints = Partial<Record<SkillId, number>>;

/** Bậc kỹ năng từ điểm (0 = chưa có). */
export function skillLevel(skill: Skill, points: number): number {
  return Math.min(skill.max, Math.floor(Math.max(0, points) / skill.per));
}

/** Hệ số thời gian giữ nút (tay nhanh): 1 → nhỏ dần theo bậc, không dưới 0,5. */
export function holdFactor(content: Content, points: SkillPoints): number {
  const s = content.data.skills.find((x) => x.id === "tay_nhanh");
  if (!s) return 1;
  return Math.max(0.5, 1 - skillLevel(s, points.tay_nhanh ?? 0) * s.effect);
}

/** Hệ số kiên nhẫn của khách (ăn nói). */
export function patienceFactor(content: Content, points: SkillPoints): number {
  const s = content.data.skills.find((x) => x.id === "an_noi");
  if (!s) return 1;
  return 1 + skillLevel(s, points.an_noi ?? 0) * s.effect;
}

/** Nhớ món: có gợi ý lời dặn không. */
export function remembersOrders(content: Content, points: SkillPoints): boolean {
  const s = content.data.skills.find((x) => x.id === "nho_mon");
  return !!s && skillLevel(s, points.nho_mon ?? 0) >= 1;
}

/** Cộng điểm kỹ năng (không vượt bậc tối đa). */
export function addSkill(
  content: Content,
  points: SkillPoints,
  id: SkillId,
  amount = 1,
): SkillPoints {
  const s = content.data.skills.find((x) => x.id === id);
  if (!s) return points;
  return { ...points, [id]: Math.min(s.per * s.max, (points[id] ?? 0) + amount) };
}

/** Cấp cần để mở một thứ (1 nếu không khoá). */
export function unlockLevel(content: Content, id: "lot_house" | "event_host"): number {
  return content.data.unlocks.find((u) => u.id === id)?.level ?? 1;
}

// ───────── Sổ đánh giá quầy (content.reviews, UC-F11) ─────────

/** Số sao từ độ hài lòng 0–1. */
export function reviewStars(satisfaction: number): number {
  if (satisfaction >= 0.9) return 5;
  if (satisfaction >= 0.75) return 4;
  if (satisfaction >= 0.55) return 3;
  if (satisfaction >= 0.35) return 2;
  return 1;
}

/** Tình huống chính để chọn câu: lỗi nặng nhất trước, rồi giá, rồi tốc độ. */
export function reviewTagOf(o: {
  served: boolean;
  correct?: boolean;
  fast?: boolean;
  short?: boolean;
  priceRatio?: number;
  vip?: boolean;
}): ReviewTag {
  if (!o.served) return "lost";
  if (o.vip) return o.correct && o.fast && !o.short ? "vip_good" : "vip_bad";
  if (o.short) return "short";
  if (o.correct === false) return "wrong";
  if ((o.priceRatio ?? 1) > 1.15) return "pricey";
  if (!o.fast) return "slow";
  if ((o.priceRatio ?? 1) < 0.9) return "cheap";
  return o.fast ? "fast" : "ok";
}

/** Che từ tục trong chữ người chơi viết (giữ chữ đầu cho dễ hiểu là bị che). */
export function maskText(text: string, banned: readonly string[]): string {
  let out = text;
  for (const w of banned) {
    const re = new RegExp(
      `(^|[^\\p{L}])(${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?=$|[^\\p{L}])`,
      "giu",
    );
    out = out.replace(re, (_m, pre: string) => `${pre}***`);
  }
  return out;
}

/** Điểm trung bình (1 chữ số thập phân) + phân bố 1–5 sao. */
export function reviewSummary(stars: readonly number[]): {
  avg: number;
  count: number;
  dist: number[];
} {
  const dist = [0, 0, 0, 0, 0];
  for (const s of stars) {
    const i = Math.min(5, Math.max(1, s)) - 1;
    dist[i] = (dist[i] ?? 0) + 1;
  }
  const avg = stars.length
    ? Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10
    : 0;
  return { avg, count: stars.length, dist };
}

// ───────── Giọng thoại theo kiểu khách (content.voice, UC-D6) ─────────

export type LineKind = "cheap" | "fair" | "pricey" | "thanks" | "impatient";

/** Câu khách nói theo kiểu khách; kiểu khách chưa có giọng riêng thì dùng câu chung. */
export function voiceLine(
  c: Content,
  archetype: string,
  kind: LineKind,
  rand: () => number,
): string {
  const own = c.data.voice.voices.find((v) => v.archetype === archetype)?.[kind];
  const list = own?.length ? own : c.data.customerLines[kind];
  return list[Math.floor(rand() * list.length)] ?? "";
}

/** Câu gọi món theo giọng kiểu khách (null = dùng câu mặc định của món). */
export function voiceAsk(
  c: Content,
  archetype: string,
  dish: string,
  rand: () => number,
): string | null {
  const list = c.data.voice.voices.find((v) => v.archetype === archetype)?.ask;
  if (!list?.length) return null;
  return (list[Math.floor(rand() * list.length)] ?? "").replace("{dish}", dish);
}

/** Tắt "thoại mặn": đổi từ mặn sang từ hiền (không phân biệt hoa thường, giữ phần còn lại của câu). */
export function soften(text: string, map: Readonly<Record<string, string>>): string {
  let out = text;
  for (const [from, to] of Object.entries(map)) {
    const re = new RegExp(
      `(^|[^\\p{L}])${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}])`,
      "giu",
    );
    out = out.replace(re, (_m, pre: string) => `${pre}${to}`);
  }
  return out;
}
