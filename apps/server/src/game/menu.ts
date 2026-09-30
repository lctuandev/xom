import { content } from "@xom/content";
import type { MenuItemView } from "@xom/shared";
import { baseSpec, hasIngredients, ingredientsFor, type MenuItem } from "@xom/sim";
import type { Business } from "../generated/prisma/client.js";

type StoredMenu = Record<string, { on?: boolean; price?: number }>;

/** Thực đơn của quầy: dữ liệu đã lưu gộp với mặc định của công thức (mọi món bật, giá hợp lý). */
export function menuOf(biz: Pick<Business, "productId" | "menu">): MenuItemView[] {
  const stored = (biz.menu ?? {}) as StoredMenu;
  return content.product(biz.productId).recipe.variants.map((v) => ({
    variantId: v.id,
    on: stored[v.id]?.on ?? true,
    price: stored[v.id]?.price ?? v.refPrice,
  }));
}

export function patchMenu(
  biz: Pick<Business, "productId" | "menu">,
  variantId: string,
  patch: { on?: boolean; price?: number },
): StoredMenu {
  const stored = { ...((biz.menu ?? {}) as StoredMenu) };
  stored[variantId] = { ...stored[variantId], ...patch };
  return stored;
}

/** Món khách có thể gọi lúc này: đang bật và đủ nguyên liệu cho món chuẩn. */
export function availableMenu(
  productId: string,
  menu: MenuItemView[],
  stock: ReadonlyMap<string, number>,
): MenuItem[] {
  const recipe = content.product(productId).recipe;
  return menu
    .filter((m) => m.on)
    .filter(
      (m) =>
        hasIngredients(ingredientsFor(recipe, baseSpec(recipe, m.variantId)), stock).length === 0,
    )
    .map((m) => ({ variantId: m.variantId, price: m.price }));
}
