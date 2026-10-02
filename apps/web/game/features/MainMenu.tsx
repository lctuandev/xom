"use client";

import { useState } from "react";
import { makeableCount } from "../recipes";
import { useGame } from "../store";
import { Sheet } from "../ui/Sheet";
import { openFeature } from "./open";
import { usePins } from "./pins";
import { FEATURES, type FeatureId, GROUPS, MAX_PINS } from "./registry";

/** Chấm đỏ: chức năng có việc cần làm ngay. */
function useAlerts(): Partial<Record<FeatureId, string>> {
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
  return out;
}

/**
 * ☰ Menu (docs/IA.md §3): lưới icon mọi chức năng, chia nhóm; mỗi icon mở đúng một sheet. Chế độ 📌 Ghim: chạm để
 * ghim icon lên cột trái → cột phải → bỏ ghim (mỗi bên tối đa 4).
 */
export function MainMenu() {
  const close = useGame((s) => s.openSheet);
  const toast = useGame((s) => s.toast);
  const pins = usePins((s) => s.pins);
  const cycle = usePins((s) => s.cycle);
  const [editing, setEditing] = useState(false);
  const alerts = useAlerts();
  const ids = Object.keys(FEATURES) as FeatureId[];
  return (
    <Sheet title="☰ Menu" onClose={() => close(null)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-ink/60">
          {editing
            ? `Chạm: ghim trái ◀ → ghim phải ▶ → bỏ ghim (mỗi bên tối đa ${MAX_PINS}).`
            : "Mỗi icon là một chức năng riêng."}
        </p>
        <button
          type="button"
          aria-pressed={editing}
          onClick={() => setEditing(!editing)}
          className="h-9 shrink-0 rounded-full bg-white px-3 text-xs font-semibold shadow-sm aria-pressed:bg-ink aria-pressed:text-cream"
        >
          📌 {editing ? "Xong" : "Ghim"}
        </button>
      </div>
      {GROUPS.map((g) => (
        <section key={g.id} aria-label={g.name} className="mb-3">
          <h3 className="mb-1.5 text-xs font-extrabold tracking-wide text-ink/60 uppercase">
            {g.emoji} {g.name}
          </h3>
          <ul className="grid grid-cols-4 gap-1.5">
            {ids
              .filter((id) => FEATURES[id].group === g.id && !("hidden" in FEATURES[id]))
              .map((id) => {
                const f = FEATURES[id];
                const side = pins.left.includes(id)
                  ? "left"
                  : pins.right.includes(id)
                    ? "right"
                    : null;
                const pinned = side !== null;
                const alert = alerts[id];
                return (
                  <li key={id}>
                    <button
                      type="button"
                      data-feature={id}
                      data-pin={side ?? undefined}
                      aria-label={f.title}
                      title={alert ? `${f.title} — ${alert}` : f.hint}
                      onClick={() => {
                        if (!editing) return openFeature(id, { from: "sheet" });
                        if (cycle(id) === false)
                          toast({
                            kind: "warn",
                            text: `Mỗi bên chỉ ghim được ${MAX_PINS} icon — bỏ ghim bớt`,
                          });
                      }}
                      className={`relative flex h-[4.6rem] w-full flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-center shadow-sm active:scale-95 ${
                        editing && pinned ? "bg-sun/40 ring-2 ring-sun" : "bg-white"
                      }`}
                    >
                      <span aria-hidden className="text-2xl leading-none">
                        {f.icon}
                      </span>
                      <span className="line-clamp-2 text-[11px] leading-tight font-semibold">
                        {f.title}
                      </span>
                      {alert && !editing && (
                        <span className="absolute top-1 right-1 size-2.5 rounded-full bg-red ring-2 ring-white" />
                      )}
                      {editing && pinned && (
                        <span
                          aria-hidden
                          className="absolute top-0.5 right-1 text-[10px] font-bold"
                        >
                          📌{side === "left" ? "◀" : "▶"}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </Sheet>
  );
}
