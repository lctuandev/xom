import type { Content, Economy, Ingredient, Recipe, RecipeStep } from "@xom/content";
import { seededRandom } from "./time.js";

// Làm món theo đơn (docs/USECASES.md UC-F3…F7). Thuần logic: server dùng để sinh đơn & chấm món,
// web dùng để hiển thị, tools/balance dùng để tính giá vốn.

/** Lựa chọn ở một bước: single → id; multi → danh sách id; action/hold → true (đã làm). */
export type Selection = string | string[] | true;
/** Món khách yêu cầu (spec) hoặc món người chơi làm ra (build): stepId → lựa chọn. */
export type Dish = Record<string, Selection>;

export interface MenuItem {
  variantId: string;
  price: number;
}

export interface GeneratedOrder {
  variantId: string;
  spec: Dish;
  /** "bánh mì xíu mại, không hành, nhiều ớt" */
  dish: string;
  /** Câu khách nói: "Cho con ổ bánh mì xíu mại, không hành, nhiều ớt nha!" */
  ask: string;
  price: number;
}

function stepDefault(
  recipe: Recipe,
  step: RecipeStep,
  fixed: Record<string, string | string[]>,
): Selection {
  if (step.kind === "action" || step.kind === "hold") return true;
  const v = fixed[step.id] ?? recipe.defaults[step.id];
  if (step.kind === "multi") return [...((v as string[] | undefined) ?? [])];
  return (v as string | undefined) ?? step.options[0]?.id ?? "";
}

/** Món chuẩn của một variant (chưa có yêu cầu riêng). */
export function baseSpec(recipe: Recipe, variantId: string): Dish {
  const variant = recipe.variants.find((v) => v.id === variantId);
  if (!variant) throw new Error(`Không có món ${variantId}`);
  const spec: Dish = {};
  for (const step of recipe.steps) spec[step.id] = stepDefault(recipe, step, variant.fixed);
  return spec;
}

function weighted<T>(items: T[], weight: (t: T) => number, rand: () => number): T | undefined {
  const total = items.reduce((s, t) => s + weight(t), 0);
  let r = rand() * total;
  for (const t of items) {
    r -= weight(t);
    if (r <= 0) return t;
  }
  return items[items.length - 1];
}

/** Giá thêm của những thứ khách gọi ngoài mặc định (size L, thêm topping…). */
export function extrasPrice(recipe: Recipe, spec: Dish, variantId: string): number {
  const base = baseSpec(recipe, variantId);
  let extra = 0;
  for (const step of recipe.steps) {
    const want = spec[step.id];
    const def = base[step.id];
    const chosen = Array.isArray(want) ? want : typeof want === "string" ? [want] : [];
    const had = Array.isArray(def) ? def : typeof def === "string" ? [def] : [];
    for (const id of chosen) {
      if (had.includes(id)) continue;
      extra += step.options.find((o) => o.id === id)?.extraPrice ?? 0;
    }
  }
  return extra;
}

/**
 * Khách chọn món trong thực đơn (theo độ phổ biến) rồi dặn thêm yêu cầu riêng.
 * `menu` chỉ gồm các món đang bán và đủ nguyên liệu. Có `stock` thì khách chỉ xin thêm những thứ
 * quầy đang có (khách nhìn thấy trên xe) — không đòi thứ quầy không bán.
 */
export function generateOrder(
  recipe: Recipe,
  menu: MenuItem[],
  rand: () => number,
  stock?: ReadonlyMap<string, number>,
  /** Khách khó tính (VIP): dặn ít nhất chừng này yêu cầu riêng (nếu công thức có đủ). */
  minMods = 0,
): GeneratedOrder | null {
  const item = weighted(
    menu,
    (m) => recipe.variants.find((v) => v.id === m.variantId)?.popularity ?? 0,
    rand,
  );
  if (!item) return null;
  const variant = recipe.variants.find((v) => v.id === item.variantId);
  if (!variant) return null;
  const spec = baseSpec(recipe, variant.id);
  const says: string[] = [];
  const available = (step: RecipeStep, optionId: string) => {
    const opt = step.options.find((o) => o.id === optionId);
    return !stock || !opt?.ingredient || (stock.get(opt.ingredient) ?? 0) >= opt.qty;
  };

  // Khách tự chọn ở các bước có "pick" (size ly, mức đường, gói quà…).
  for (const step of recipe.steps) {
    if (!step.pick || step.id in variant.fixed) continue;
    const opts = Object.entries(step.pick).filter(([id]) => available(step, id));
    const chosen = weighted(opts, ([, w]) => w, rand)?.[0];
    if (!chosen) continue;
    const def = spec[step.id];
    spec[step.id] = chosen;
    const say = step.options.find((o) => o.id === chosen)?.say;
    if (chosen !== def && say) says.push(say);
  }

  // Yêu cầu riêng: mỗi bước single chỉ đổi một lần; bỏ qua yêu cầu không có tác dụng.
  const touched = new Set<string>();
  let mods = 0;
  for (const mod of recipe.mods) {
    if (rand() >= mod.chance) continue;
    if (applyMod(recipe, spec, mod, touched, available)) {
      says.push(mod.say);
      mods++;
    }
  }
  // Khách khó tính (VIP) dặn thêm cho đủ, theo thứ tự ngẫu nhiên.
  for (const mod of [...recipe.mods].sort(() => rand() - 0.5)) {
    if (mods >= minMods) break;
    if (applyMod(recipe, spec, mod, touched, available)) {
      says.push(mod.say);
      mods++;
    }
  }

  const dish = [variant.name, ...says].join(", ");
  return {
    variantId: variant.id,
    spec,
    dish,
    ask: recipe.ask.replace("{dish}", dish),
    price: item.price + extrasPrice(recipe, spec, variant.id),
  };
}

type Mod = Recipe["mods"][number];

/** Áp một yêu cầu riêng vào đơn; false nếu không có tác dụng (đã có sẵn, bước đã đổi, hết nguyên liệu). */
function applyMod(
  recipe: Recipe,
  spec: Dish,
  mod: Mod,
  touched: Set<string>,
  available: (step: RecipeStep, optionId: string) => boolean,
): boolean {
  const step = recipe.steps.find((s) => s.id === mod.step);
  if (!step) return false;
  const cur = spec[step.id];
  if (step.kind === "single") {
    if (touched.has(step.id) || !mod.set || cur === mod.set || !available(step, mod.set))
      return false;
    spec[step.id] = mod.set;
    touched.add(step.id);
    return true;
  }
  if (step.kind === "multi" && Array.isArray(cur)) {
    if (mod.add && !cur.includes(mod.add) && available(step, mod.add)) {
      spec[step.id] = [...cur, mod.add];
      return true;
    }
    if (mod.remove && cur.includes(mod.remove)) {
      spec[step.id] = cur.filter((x) => x !== mod.remove);
      return true;
    }
  }
  return false;
}

/**
 * Người chơi tự gọi món ở quầy người khác (docs/USECASES.md UC-J3): chọn món trong thực đơn, tự chọn ở
 * các bước có "pick" (size, đường, gói quà…) và thêm yêu cầu riêng. Trả về đơn, hoặc câu báo lỗi.
 */
export function customOrder(
  recipe: Recipe,
  menu: MenuItem[],
  variantId: string,
  picks: Record<string, string>,
  modIds: string[],
): GeneratedOrder | string {
  const item = menu.find((m) => m.variantId === variantId);
  const variant = recipe.variants.find((v) => v.id === variantId);
  if (!item || !variant) return "Quầy không bán món này (hoặc đã hết)";
  const spec = baseSpec(recipe, variant.id);
  const says: string[] = [];
  for (const [stepId, optionId] of Object.entries(picks)) {
    const step = recipe.steps.find((s) => s.id === stepId);
    if (!step?.pick || stepId in variant.fixed || !(optionId in step.pick))
      return "Lựa chọn không hợp lệ";
    const def = spec[stepId];
    spec[stepId] = optionId;
    const say = step.options.find((o) => o.id === optionId)?.say;
    if (optionId !== def && say) says.push(say);
  }
  const touched = new Set<string>();
  for (const id of new Set(modIds)) {
    const mod = recipe.mods.find((m) => m.id === id);
    if (!mod) return "Yêu cầu không hợp lệ";
    if (applyMod(recipe, spec, mod, touched, () => true)) says.push(mod.say);
  }
  const dish = [variant.name, ...says].join(", ");
  return {
    variantId: variant.id,
    spec,
    dish,
    ask: recipe.ask.replace("{dish}", dish),
    price: item.price + extrasPrice(recipe, spec, variant.id),
  };
}

function same(a: Selection | undefined, b: Selection | undefined): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = new Set(Array.isArray(a) ? a : []);
    const y = new Set(Array.isArray(b) ? b : []);
    return x.size === y.size && [...x].every((v) => y.has(v));
  }
  return a === b;
}

/** Chấm món: đúng từng bước so với đơn, có trọng số (sai nhân nặng hơn sai rau). */
export function scoreDish(
  recipe: Recipe,
  spec: Dish,
  build: Dish,
): { score: number; mistakes: string[] } {
  let total = 0;
  let got = 0;
  const mistakes: string[] = [];
  for (const step of recipe.steps) {
    total += step.weight;
    if (same(spec[step.id], build[step.id])) got += step.weight;
    else mistakes.push(step.id);
  }
  return { score: total ? got / total : 0, mistakes };
}

/** Kiểm tra món làm ra có hợp lệ về cấu trúc (bước tồn tại, lựa chọn có thật). Trả về lỗi hoặc null. */
export function validateBuild(recipe: Recipe, build: Dish): string | null {
  for (const [stepId, sel] of Object.entries(build)) {
    const step = recipe.steps.find((s) => s.id === stepId);
    if (!step) return `Không có bước ${stepId}`;
    if (step.kind === "action" || step.kind === "hold") {
      if (sel !== true) return `Bước ${step.label} không hợp lệ`;
      continue;
    }
    const ids = step.kind === "multi" ? sel : [sel];
    if (!Array.isArray(ids)) return `Bước ${step.label} cần danh sách`;
    if (step.kind === "single" && typeof sel !== "string") return `Bước ${step.label} chỉ chọn một`;
    for (const id of ids) {
      if (typeof id !== "string" || !step.options.some((o) => o.id === id)) {
        return `Bước ${step.label} không có lựa chọn này`;
      }
    }
  }
  return null;
}

/** Nguyên liệu tiêu hao để làm ra món này (theo đúng những gì đã cho vào). */
export function ingredientsFor(recipe: Recipe, dish: Dish): Map<string, number> {
  const need = new Map<string, number>();
  const add = (id: string | undefined, qty: number) => {
    if (id) need.set(id, (need.get(id) ?? 0) + qty);
  };
  for (const step of recipe.steps) {
    const sel = dish[step.id];
    if (sel === undefined) continue;
    if (sel === true) {
      add(step.ingredient, 1);
      continue;
    }
    for (const id of Array.isArray(sel) ? sel : [sel]) {
      const opt = step.options.find((o) => o.id === id);
      add(opt?.ingredient, opt?.qty ?? 1);
    }
  }
  return need;
}

export function hasIngredients(
  need: Map<string, number>,
  stock: ReadonlyMap<string, number>,
): string[] {
  const missing: string[] = [];
  for (const [id, qty] of need) if ((stock.get(id) ?? 0) < qty) missing.push(id);
  return missing;
}

/** Giá vốn nguyên liệu của một món (theo giá gốc ở chợ). */
export function dishCost(content: Content, recipe: Recipe, dish: Dish): number {
  let cost = 0;
  for (const [id, qty] of ingredientsFor(recipe, dish))
    cost += content.ingredient(id).costPerUnit * qty;
  return cost;
}

/** Giá một gói nguyên liệu ở chợ hôm nay: dao động theo ngày, buổi chiều hàng tươi đắt hơn. */
export function marketPackPrice(
  ing: Ingredient,
  day: number,
  minuteOfDay: number,
  eco: Economy,
): number {
  const r = seededRandom("market", ing.id, day)();
  let unit = ing.costPerUnit * (1 + (r * 2 - 1) * eco.marketPriceSwing);
  if (ing.fresh && minuteOfDay >= 12 * 60) unit *= 1 + eco.afternoonMarkup;
  return Math.max(500, Math.round((unit * ing.packSize) / 500) * 500);
}

export type Payment = { kind: "transfer" } | { kind: "cash"; bill: number };

const BILLS = [10_000, 20_000, 50_000, 100_000, 200_000];

/** Tờ tiền nhỏ nhất đủ trả (người chơi đưa tiền mặt cho quầy hàng xóm). */
export function billFor(price: number): number {
  return BILLS.find((b) => b >= price) ?? Math.ceil(price / 100_000) * 100_000;
}

/** Khách trả thế nào: chuyển khoản, đưa đúng tiền, hay đưa tờ lớn cần thối. */
export function pickPayment(price: number, transferRate: number, rand: () => number): Payment {
  if (rand() < transferRate) return { kind: "transfer" };
  if (rand() < 0.2) return { kind: "cash", bill: price };
  const bigger = BILLS.filter((b) => b >= price);
  const bill = rand() < 0.7 ? bigger[0] : (bigger[1] ?? bigger[0]);
  return { kind: "cash", bill: bill ?? Math.ceil(price / 100_000) * 100_000 };
}

export type ChangeOutcome = "exact" | "short" | "over_returned" | "over_kept";

/**
 * Kết quả thối tiền (UC-F7): thối thiếu → khách đòi đủ (chỉ nhận đúng giá, mất uy tín);
 * thối dư → khách thật thà trả lại (40%) hoặc cầm luôn (mất phần dư).
 */
export function settleCash(
  price: number,
  bill: number,
  change: number,
  rand: () => number,
): { received: number; outcome: ChangeOutcome } {
  const correct = bill - price;
  if (change === correct) return { received: price, outcome: "exact" };
  if (change < correct) return { received: price, outcome: "short" };
  if (rand() < 0.4) return { received: price, outcome: "over_returned" };
  return { received: bill - change, outcome: "over_kept" };
}
