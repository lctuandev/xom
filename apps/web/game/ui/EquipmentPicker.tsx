"use client";

import { content } from "@xom/content";
import { useState } from "react";
import { vnd, vndShort } from "../format";
import { send } from "../net/socket";
import { useGame } from "../store";
import { PayPicker, usePayCheck, usePayMethod } from "./PayPicker";

/** Chọn nghề = chọn thiết bị: mở thêm cửa hàng, hoặc đổi nghề quầy đang chọn (thiết bị cũ bán lại nửa giá). */
export function EquipmentPicker({ onDone }: { onDone?: () => void }) {
  const me = useGame((s) => s.me);
  const [busy, setBusy] = useState<string | null>(null);
  const current = me?.business?.equipmentId;
  const hasShop = (me?.shops.length ?? 0) > 0;
  const activeOpen = me?.business?.open ?? false;
  const check = usePayCheck();
  const pay = usePayMethod((s) => s.method);
  const buy = async (equipmentId: string, mode: "new" | "replace") => {
    setBusy(equipmentId);
    const res = await send("equipment:buy", { equipmentId, pay, mode });
    setBusy(null);
    if (res.ok) onDone?.();
  };

  return (
    <ul className="flex flex-col gap-3">
      <li>
        <p className="font-extrabold">🏪 Mở cửa hàng: chọn mặt hàng bán</p>
        <p className="mb-2 text-xs text-ink/60">
          Mỗi mặt hàng một bộ đồ nghề · mua xong ra chợ nhập hàng, chọn chỗ bán rồi mở quầy.
        </p>
        <PayPicker />
      </li>
      {content.data.equipment.map((eq) => {
        const product = content.product(eq.products[0] ?? "");
        const affordable = typeof check(eq.price) === "string";
        const owned = current === eq.id;
        return (
          <li key={eq.id} className="rounded-2xl bg-white p-3 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="text-3xl" aria-hidden>
                {product.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-red" data-category={product.id}>
                  {product.name}
                </p>
                <p className="text-lg font-extrabold">{eq.name}</p>
                <p className="text-sm text-ink/70">
                  {product.recipe.variants.map((v) => v.name).join(", ")}
                </p>
                <p className="text-xs text-ink/60">
                  {product.recipe.steps.length} bước làm mỗi món · tối đa {eq.queueSize} khách chờ
                </p>
              </div>
            </div>
            {!hasShop ? (
              <button
                type="button"
                disabled={!affordable || busy !== null}
                onClick={() => void buy(eq.id, "new")}
                className="mt-3 h-12 w-full rounded-xl bg-red text-base font-semibold text-cream disabled:bg-ink/15 disabled:text-ink/50"
              >
                {busy === eq.id ? "Đang mua…" : `Mua · ${vnd(eq.price)}`}
              </button>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!affordable || busy !== null}
                  onClick={() => void buy(eq.id, "new")}
                  className="h-12 rounded-xl bg-red px-2 text-sm font-semibold text-cream disabled:bg-ink/15 disabled:text-ink/50"
                >
                  🏪 Mở thêm cửa hàng · {vndShort(eq.price)}
                </button>
                <button
                  type="button"
                  disabled={owned || activeOpen || !affordable || busy !== null}
                  onClick={() => void buy(eq.id, "replace")}
                  className="h-12 rounded-xl bg-white px-2 text-sm font-semibold shadow-sm disabled:opacity-40"
                >
                  {owned ? "Quầy đang chọn là nghề này" : "🔄 Đổi nghề quầy đang chọn"}
                </button>
              </div>
            )}
          </li>
        );
      })}
      {current && (
        <p className="text-sm text-ink/60">
          🏪 Mở thêm cửa hàng: giữ nguyên các quầy đang có (không giới hạn số cửa hàng). 🔄 Đổi
          nghề: {content.equipment(current).name} của quầy đang chọn được bán lại nửa giá, kho hàng
          cũ vẫn giữ để thanh lý.
        </p>
      )}
    </ul>
  );
}
