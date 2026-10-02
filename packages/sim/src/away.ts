import type { Content } from "@xom/content";
import { marketPackPrice } from "./recipe.js";

// "Trong lúc bạn vắng" (docs/THEGIOI.md §4): phần thuần — giá chợ đổi bao nhiêu giữa hai ngày.

export interface PriceMove {
  itemId: string;
  /** Tỉ lệ đổi giá gói buổi sáng: +0,12 = lên 12%. */
  change: number;
}

/** Giá các nguyên liệu đổi bao nhiêu từ `fromDay` tới `toDay` (giá buổi sáng); lớn nhất trước, bỏ thay đổi < 3%. */
export function marketMovesSince(
  content: Content,
  itemIds: string[],
  fromDay: number,
  toDay: number,
  max = 3,
): PriceMove[] {
  if (toDay <= fromDay) return [];
  const morning = content.economy.dayStartMinute;
  return itemIds
    .map((id) => {
      const ing = content.ingredient(id);
      const a = marketPackPrice(ing, fromDay, morning, content.economy);
      const b = marketPackPrice(ing, toDay, morning, content.economy);
      return { itemId: id, change: a > 0 ? (b - a) / a : 0 };
    })
    .filter((m) => Math.abs(m.change) >= 0.03)
    .sort((x, y) => Math.abs(y.change) - Math.abs(x.change))
    .slice(0, max);
}
