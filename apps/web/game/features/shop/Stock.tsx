"use client";

import { content } from "@xom/content";
import { useState } from "react";
import { send } from "../../net/socket";
import { ingredientsOfProduct, makeableCount } from "../../recipes";
import { useGame } from "../../store";
import { Stepper } from "../../ui/Sheet";
import { GoToRow } from "../FeatureSheet";
import { openFeature } from "../open";
import { ShopFeature, shopLabel } from "./common";

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
            <TransferBox />
            <GoToRow to={["liquidate", "recipes"]} />
          </>
        );
      }}
    </ShopFeature>
  );
}

/**
 * 🚚 Chuyển kho (docs/IA.md bước D): từ cửa hàng đang quản lý sang cửa hàng khác của mình — hàng tới sau
 * `economy.transferMinutes` phút game (đang chở thì chưa bán được ở đâu).
 */
function TransferBox() {
  const me = useGame((s) => s.me);
  const others = me?.shops.filter((s) => !s.active) ?? [];
  const items = me?.inventory.filter((i) => i.qty > 0) ?? [];
  const [to, setTo] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  if (!others.length || !items.length) return null;
  const target = to ?? others[0]?.id ?? "";
  const item = items.find((i) => i.itemId === itemId) ?? items[0];
  if (!item) return null;
  const max = item.qty;
  const n = Math.min(qty, max);
  return (
    <section
      aria-label="Chuyển kho"
      className="mt-3 rounded-2xl bg-white p-3 shadow-sm"
      data-transfer
    >
      <p className="mb-1 text-sm font-extrabold">🚚 Chuyển sang cửa hàng khác</p>
      <p className="mb-2 text-xs text-ink/60">
        Hàng tới sau {content.economy.transferMinutes} phút game — đang chở thì chưa bán được.
      </p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {others.map((s) => {
          const l = shopLabel(s);
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={s.id === target}
              onClick={() => setTo(s.id)}
              className="rounded-full bg-ink/5 px-3 py-1.5 text-xs font-semibold aria-pressed:bg-ink aria-pressed:text-cream"
            >
              → {l.emoji} {l.title}
            </button>
          );
        })}
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {items.map((i) => {
          const ing = content.ingredient(i.itemId);
          return (
            <button
              key={i.itemId}
              type="button"
              aria-pressed={i.itemId === item.itemId}
              onClick={() => {
                setItemId(i.itemId);
                setQty(1);
              }}
              className="rounded-full bg-ink/5 px-2.5 py-1 text-xs aria-pressed:bg-sun"
            >
              {ing.emoji} {ing.name} · {i.qty}
            </button>
          );
        })}
      </div>
      <Stepper label="số phần chuyển" value={n} onChange={setQty} step={1} min={1} max={max} />
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await send("stock:transfer", { toId: target, itemId: item.itemId, qty: n });
          setBusy(false);
          if (r.ok)
            useGame.getState().toast({
              kind: "info",
              text: `🚚 Đang chở ${n} ${content.ingredient(item.itemId).name.toLowerCase()} — tới sau ${content.economy.transferMinutes} phút`,
            });
        }}
        className="mt-2 h-11 w-full rounded-xl bg-leaf font-semibold text-cream disabled:opacity-40"
      >
        🚚 Chuyển {n} phần
      </button>
    </section>
  );
}
