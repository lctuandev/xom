"use client";

import { content } from "@xom/content";
import { ingredientsOfProduct, makeableCount } from "../../recipes";
import { useGame } from "../../store";
import { GoToRow } from "../FeatureSheet";
import { openFeature } from "../open";
import { ShopFeature } from "./common";

function StockList({ productId }: { productId: string }) {
  const inventory = useGame((s) => s.me?.inventory ?? []);
  const ids = ingredientsOfProduct(productId);
  return (
    <ul className="grid grid-cols-2 gap-1.5">
      {ids.map((id) => {
        const ing = content.ingredient(id);
        const row = inventory.find((i) => i.itemId === id);
        return (
          <li
            key={id}
            className="flex items-center gap-1.5 rounded-xl bg-white px-2.5 py-1.5 text-xs shadow-sm"
          >
            <span aria-hidden>{ing.emoji}</span>
            <span className="min-w-0 flex-1 truncate">{ing.name}</span>
            <b className={`tabular-nums ${row ? "" : "text-red"}`}>{row?.qty ?? 0}</b>
            {row && row.expiring > 0 && (
              <span className="text-[10px] text-red" title="Hỏng tối nay">
                ⏳
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** 📦 Kho hàng: nguyên liệu còn bao nhiêu, làm được mấy phần; thiếu thì ra chợ. */
export function StockSheet() {
  return (
    <ShopFeature id="stock">
      {(biz, me) => {
        const stock = biz.menu
          .filter((m) => m.on)
          .reduce((sum, m) => sum + makeableCount(biz.productId, m.variantId, me.inventory), 0);
        return (
          <>
            <StockList productId={biz.productId} />
            <div className="mt-2 flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm">
              <p className="text-sm">
                Làm được khoảng <b className="tabular-nums">{stock}</b> phần
              </p>
              <button
                type="button"
                onClick={() => openFeature("market")}
                className="h-10 rounded-xl bg-sun px-4 font-semibold"
              >
                🚶 Ra chợ
              </button>
            </div>
            <GoToRow to={["liquidate", "recipes"]} />
          </>
        );
      }}
    </ShopFeature>
  );
}
