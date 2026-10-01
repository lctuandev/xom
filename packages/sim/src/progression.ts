import type { Content, Skill, SkillId } from "@xom/content";

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
