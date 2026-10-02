import type { Content } from "@xom/content";
import { baseSpec, ingredientsFor } from "./recipe.js";
import { formatClock, seededRandom } from "./time.js";

// Bảng việc xóm + điểm tin cậy (docs/KIENTRUC.md §3): thuần logic — việc NPC đăng mỗi ngày, tiền thưởng / cọc, nguyên
// liệu cần làm, điểm tin cậy lên xuống theo việc mình làm.

export type ContractTemplate = Content["data"]["contracts"]["templates"][number];

export interface ContractOffer {
  templateId: string;
  qty: number;
  reward: number;
  deposit: number;
  deadline: number;
}

const round1000 = (n: number) => Math.round(n / 1000) * 1000;

/** Tiền thưởng + cọc cho `qty` phần theo mẫu việc (làm tròn nghìn, cọc tối thiểu 1.000đ). */
export function contractPay(content: Content, t: ContractTemplate, qty: number) {
  const variant = content.product(t.productId).recipe.variants.find((v) => v.id === t.variantId);
  const reward = round1000(qty * (variant?.refPrice ?? 0) * t.priceMul);
  const deposit = Math.max(1000, round1000(reward * content.data.contracts.depositRate));
  return { reward, deposit };
}

/** Việc NPC đăng trong ngày ở một xóm: chọn `perDay` mẫu khác nhau (cố định theo xóm + ngày). */
export function contractOffers(content: Content, day: number, seed: string): ContractOffer[] {
  const { templates, perDay } = content.data.contracts;
  const rand = seededRandom("contracts", seed, day);
  const pool = [...templates];
  const out: ContractOffer[] = [];
  while (out.length < perDay && pool.length) {
    const t = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    if (!t) break;
    const qty = t.qty[0] + Math.floor(rand() * (t.qty[1] - t.qty[0] + 1));
    out.push({ templateId: t.id, qty, deadline: t.deadline, ...contractPay(content, t, qty) });
  }
  return out;
}

/** Nguyên liệu cần để làm đủ `qty` phần món chuẩn của việc. */
export function contractIngredients(content: Content, t: ContractTemplate, qty: number) {
  const recipe = content.product(t.productId).recipe;
  const one = ingredientsFor(recipe, baseSpec(recipe, t.variantId));
  return new Map([...one].map(([id, q]) => [id, q * qty]));
}

/** Câu ghi trên bảng: "Giao 6 bánh mì thịt cho … ở Cổng trường trước 11:00". */
export function contractText(content: Content, t: ContractTemplate, qty: number): string {
  const variant = content.product(t.productId).recipe.variants.find((v) => v.id === t.variantId);
  return t.text
    .replace("{qty}", String(qty))
    .replace("{dish}", (variant?.name ?? t.variantId).toLowerCase())
    .replace("{place}", content.lot(t.lotId).name)
    .replace("{deadline}", formatClock(t.deadline));
}

export type TrustEvent = "done" | "fail" | "short" | "dispute_lost";

/** Điểm tin cậy sau một chuyện (0–100). */
export function trustAfter(content: Content, trust: number, event: TrustEvent): number {
  const t = content.data.contracts.trust;
  const delta =
    event === "done"
      ? t.done
      : event === "fail"
        ? -t.fail
        : event === "dispute_lost"
          ? -content.data.gigs.disputeLostTrust
          : -t.short;
  return Math.max(0, Math.min(100, trust + delta));
}

/** Mức tin cậy: bình thường / thấp (Chú Hai nhắc) / tới ngưỡng khoá. */
export function trustLevel(content: Content, trust: number): "ok" | "low" | "lock" {
  const t = content.data.contracts.trust;
  return trust < t.lockAt ? "lock" : trust < t.lowAt ? "low" : "ok";
}
