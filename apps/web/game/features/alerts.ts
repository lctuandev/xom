import { makeableCount } from "../recipes";
import { useGame } from "../store";
import type { FeatureId } from "./registry";

/** Chấm đỏ: chức năng có việc cần làm ngay. */
export function useAlerts(): Partial<Record<FeatureId, string>> {
  const me = useGame((s) => s.me);
  const biz = me?.business;
  const out: Partial<Record<FeatureId, string>> = {};
  if (biz) {
    const stock = biz.menu
      .filter((m) => m.on)
      .reduce((sum, m) => sum + makeableCount(biz.productId, m.variantId, me?.inventory), 0);
    if (stock === 0) out.stock = "Hết hàng";
    if (!biz.lotId) out.lot = "Chưa chọn chỗ";
  } else out.equipment = "Chưa có xe hàng";
  if (me && (me.needs.food < 30 || me.needs.drink < 30)) out.food = "Đói / khát";
  // 🎁 Thưởng đạt mà chưa nhận (UC-P4).
  if (me?.rewards?.quests) out.quests = `${me.rewards.quests} thưởng chờ nhận`;
  if (me?.rewards?.badges) out.badges = `${me.rewards.badges} thưởng chờ nhận`;
  return out;
}
