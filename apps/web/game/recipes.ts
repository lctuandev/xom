import { content } from "@xom/content";
import type { InventoryView } from "@xom/shared";
import { baseSpec, dishCost, ingredientsFor, recipeIngredients } from "@xom/sim";

/** Kho dạng Map: itemId → số phần. */
export const stockMap = (inv: InventoryView[] | undefined) =>
  new Map((inv ?? []).map((i) => [i.itemId, i.qty]));

/** Còn làm được bao nhiêu phần món chuẩn của variant với nguyên liệu hiện có. */
export function makeableCount(
  productId: string,
  variantId: string,
  inv: InventoryView[] | undefined,
): number {
  const recipe = content.product(productId).recipe;
  const stock = stockMap(inv);
  let n = Number.POSITIVE_INFINITY;
  for (const [id, qty] of ingredientsFor(recipe, baseSpec(recipe, variantId))) {
    n = Math.min(n, Math.floor((stock.get(id) ?? 0) / qty));
  }
  return Number.isFinite(n) ? n : 0;
}

/** Giá vốn nguyên liệu của món chuẩn. */
export function baseCost(productId: string, variantId: string): number {
  const recipe = content.product(productId).recipe;
  return dishCost(content, recipe, baseSpec(recipe, variantId));
}

/** Nguyên liệu mà công thức của nghề này dùng tới. */
export function ingredientsOfProduct(productId: string): string[] {
  return recipeIngredients(content.product(productId).recipe);
}
