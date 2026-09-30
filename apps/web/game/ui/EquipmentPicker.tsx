"use client";

import { content } from "@xom/content";
import { useState } from "react";
import { vnd } from "../format";
import { send } from "../net/socket";
import { useGame } from "../store";

/** Chọn nghề = chọn thiết bị. Đổi nghề thì thiết bị cũ được bán lại nửa giá. */
export function EquipmentPicker({ onDone }: { onDone?: () => void }) {
  const me = useGame((s) => s.me);
  const [busy, setBusy] = useState<string | null>(null);
  const current = me?.business?.equipmentId;

  return (
    <ul className="flex flex-col gap-3">
      {content.data.equipment.map((eq) => {
        const product = content.product(eq.products[0] ?? "");
        const affordable = (me?.money ?? 0) >= eq.price;
        const owned = current === eq.id;
        return (
          <li key={eq.id} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="text-4xl" aria-hidden>
                {product.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-extrabold">{eq.name}</p>
                <p className="text-sm text-ink/70">
                  Bán {product.name.toLowerCase()} · tối đa {eq.capacityPerHour} khách/giờ
                </p>
                <p className="text-sm text-ink/70">
                  {content.template(product.template).perishable
                    ? "Hàng hỏng cuối ngày"
                    : "Hàng để lâu được"}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={owned || !affordable || busy !== null}
              onClick={async () => {
                setBusy(eq.id);
                const res = await send("equipment:buy", { equipmentId: eq.id });
                setBusy(null);
                if (res.ok) onDone?.();
              }}
              className="mt-3 h-12 w-full rounded-xl bg-red text-base font-semibold text-cream disabled:bg-ink/15 disabled:text-ink/50"
            >
              {owned ? "Đang dùng" : busy === eq.id ? "Đang mua…" : `Mua · ${vnd(eq.price)}`}
            </button>
          </li>
        );
      })}
      {current && (
        <p className="text-sm text-ink/60">
          Đổi nghề: {content.equipment(current).name} cũ được bán lại nửa giá. Hàng trong kho vẫn
          giữ.
        </p>
      )}
    </ul>
  );
}
