import { create } from "zustand";
import { DEFAULT_PINS, FEATURES, type FeatureId, MAX_PINS } from "./registry";

const KEY = "xom:pins";

export type Side = "left" | "right";
export type Pins = Record<Side, FeatureId[]>;

const clean = (raw: unknown): FeatureId[] =>
  Array.isArray(raw)
    ? raw.filter((x): x is FeatureId => typeof x === "string" && x in FEATURES).slice(0, MAX_PINS)
    : [];

function load(): Pins {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    // Bản cũ chỉ có một mảng (cột trái).
    if (Array.isArray(raw)) return { left: clean(raw), right: DEFAULT_PINS.right };
    if (raw && typeof raw === "object") return { left: clean(raw.left), right: clean(raw.right) };
  } catch {}
  return DEFAULT_PINS;
}

/**
 * Icon neo hai bên màn hình người chơi tự ghim (tiện ích riêng từng máy — mất thì về mặc định). Mỗi bên tối đa
 * `MAX_PINS`; chạm trong chế độ 📌 Ghim xoay vòng: chưa ghim → trái → phải → bỏ ghim.
 */
export const usePins = create<{
  pins: Pins;
  sideOf: (id: FeatureId) => Side | null;
  /** Trả về bên mới (null = bỏ ghim), hoặc false khi bên đó đã đầy. */
  cycle: (id: FeatureId) => Side | null | false;
}>((set, get) => ({
  pins: typeof window === "undefined" ? DEFAULT_PINS : load(),
  sideOf: (id) => {
    const { left, right } = get().pins;
    return left.includes(id) ? "left" : right.includes(id) ? "right" : null;
  },
  cycle: (id) => {
    const cur = get().pins;
    const side = get().sideOf(id);
    const next: Pins = {
      left: cur.left.filter((x) => x !== id),
      right: cur.right.filter((x) => x !== id),
    };
    let to: Side | null = side === null ? "left" : side === "left" ? "right" : null;
    // Bên trái đầy thì thử ghim bên phải luôn.
    if (to === "left" && next.left.length >= MAX_PINS) to = "right";
    if (to && next[to].length >= MAX_PINS) return false;
    if (to) next[to] = [...next[to], id];
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
    set({ pins: next });
    return to;
  },
}));
