import type { Content } from "@xom/content";

// Khách quen (docs/KIENTRUC.md §1): khách tới quầy là cư dân có tên; quầy nhớ họ ghé mấy lần. Thuần logic.

export type RegularStage = "new" | "returning" | "regular";

/** Giai đoạn theo số lần đã mua ở quầy này (khách quen ❤️ phải còn `regularSince`, giận thì mất). */
export function regularStage(content: Content, visits: number, isRegular: boolean): RegularStage {
  if (isRegular) return "regular";
  return visits >= content.data.regulars.greetAt ? "returning" : "new";
}

export interface ResidentMemory {
  visits: number;
  regular: boolean;
}

/**
 * Chọn cư dân cụ thể cho một lượt khách thuộc kiểu `archetype` ghé quầy bán nhóm `category`:
 * ưa đúng nhóm hàng ×2, đã là khách quen ×3, đã ghé vài lần ×1,5. Kiểu khách không có cư dân (vãng lai) → null.
 */
export function pickResident(
  content: Content,
  archetype: string,
  category: string,
  memory: ReadonlyMap<string, ResidentMemory>,
  rand: () => number,
): string | null {
  const pool = content.data.residents.filter((r) => r.archetype === archetype);
  if (pool.length === 0) return null;
  const greetAt = content.data.regulars.greetAt;
  const weight = (id: string, favorite?: string) => {
    const m = memory.get(id);
    return (
      (favorite === category ? 2 : 1) * (m?.regular ? 3 : (m?.visits ?? 0) >= greetAt ? 1.5 : 1)
    );
  };
  const weights = pool.map((r) => weight(r.id, r.favorite));
  let x = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    x -= weights[i] ?? 0;
    if (x <= 0) return pool[i]?.id ?? null;
  }
  return pool.at(-1)?.id ?? null;
}

/** Câu mở lời theo giai đoạn (khách mới thì không thêm gì). */
export function regularGreeting(content: Content, stage: RegularStage, rand: () => number): string {
  const r = content.data.regulars;
  const list = stage === "regular" ? r.usual : stage === "returning" ? r.returning : [];
  return list[Math.floor(rand() * list.length)] ?? "";
}

/** Sau một lần mua đúng món: số lần mới, có vừa thành khách quen không. */
export function afterServed(
  content: Content,
  m: ResidentMemory,
): { visits: number; becameRegular: boolean } {
  const visits = m.visits + 1;
  return { visits, becameRegular: !m.regular && visits >= content.data.regulars.regularAt };
}

/** Sau một lần bị làm sai / chờ bỏ về: khách quen giận khi đủ chuỗi, lùi số lần về dưới ngưỡng. */
export function afterDisappointed(
  content: Content,
  m: ResidentMemory & { streak: number },
): { streak: number; lostRegular: boolean; visits: number } {
  const r = content.data.regulars;
  const streak = m.streak + 1;
  const lost = m.regular && streak >= r.angryStreak;
  return {
    streak: lost ? 0 : streak,
    lostRegular: lost,
    visits: lost ? r.regularAt - 2 : m.visits,
  };
}
