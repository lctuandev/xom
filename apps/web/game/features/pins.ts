import { create } from "zustand";
import { DEFAULT_PINS, FEATURES, type FeatureId, MAX_PINS } from "./registry";

const KEY = "xom:pins";

function load(): FeatureId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (Array.isArray(raw)) {
      const ids = raw.filter((x): x is FeatureId => typeof x === "string" && x in FEATURES);
      return ids.slice(0, MAX_PINS);
    }
  } catch {}
  return DEFAULT_PINS;
}

/** Icon neo trái người chơi tự ghim (tiện ích riêng từng máy — mất thì về mặc định). */
export const usePins = create<{ pins: FeatureId[]; toggle: (id: FeatureId) => boolean }>(
  (set, get) => ({
    pins: typeof window === "undefined" ? DEFAULT_PINS : load(),
    toggle: (id) => {
      const cur = get().pins;
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      if (next.length > MAX_PINS) return false;
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      set({ pins: next });
      return true;
    },
  }),
);
