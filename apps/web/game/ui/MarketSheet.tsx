"use client";

import { content } from "@xom/content";
import { useState } from "react";
import { vnd } from "../format";
import { send } from "../net/socket";
import { useGame } from "../store";
import { Sheet, Stepper } from "./Sheet";

/** Chợ đầu mối: giá nhập mỗi ngày dao động quanh giá gốc. */
export function MarketSheet() {
  const me = useGame((s) => s.me);
  const market = useGame((s) => s.market);
  const close = useGame((s) => s.openSheet);
  if (!me || !market) return null;
  // Tiền thuê chỗ còn phải trả hôm nay: nhắc chừa lại để không kẹt vốn.
  const biz = me.business;
  const rentReserve =
    biz?.lotId && !biz.open && !biz.rentPaidToday ? content.lot(biz.lotId).rentPerDay : 0;

  // Mặt hàng quầy mình bán lên đầu.
  const products = [...content.data.products].sort(
    (a, b) => Number(b.id === me.business?.productId) - Number(a.id === me.business?.productId),
  );

  return (
    <Sheet title="Chợ đầu mối" onClose={() => close(null)}>
      <p className="mb-3 text-sm text-ink/60">
        Giá hôm nay (ngày {market.day}). Mỗi ngày giá một khác.
      </p>
      <ul className="flex flex-col gap-3">
        {products.map((p) => (
          <ProductRow
            key={p.id}
            productId={p.id}
            price={market.prices[p.id] ?? p.unitCost}
            money={me.money}
            stock={me.inventory.find((i) => i.productId === p.id)?.qty ?? 0}
            mine={me.business?.productId === p.id}
            reserve={rentReserve}
          />
        ))}
      </ul>
    </Sheet>
  );
}

function ProductRow({
  productId,
  price,
  money,
  stock,
  mine,
  reserve,
}: {
  productId: string;
  price: number;
  money: number;
  stock: number;
  mine: boolean;
  reserve: number;
}) {
  const p = content.product(productId);
  const maxAffordable = Math.floor(money / price);
  const [qty, setQty] = useState(Math.min(10, Math.max(1, maxAffordable)));
  const [busy, setBusy] = useState(false);
  const delta = (price - p.unitCost) / p.unitCost;
  const total = qty * price;
  const perishable = content.template(p.template).perishable;

  return (
    <li className={`rounded-2xl bg-white p-4 shadow-sm ${mine ? "ring-2 ring-sun" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="text-3xl" aria-hidden>
          {p.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold">{p.name}</p>
          <p className="text-sm text-ink/60">
            Trong kho: {stock}
            {perishable ? " · hỏng cuối ngày" : " · để lâu được"}
          </p>
        </div>
        <div className="text-right">
          <p className="font-extrabold tabular-nums">{vnd(price)}</p>
          <p
            className={`text-xs font-semibold ${delta > 0.02 ? "text-red" : delta < -0.02 ? "text-leaf" : "text-ink/50"}`}
          >
            {delta > 0.02 ? "▲ đắt hơn" : delta < -0.02 ? "▼ rẻ hơn" : "như thường"}
          </p>
        </div>
      </div>
      <div className="mt-3">
        <Stepper
          label={`số lượng ${p.name}`}
          value={qty}
          onChange={setQty}
          step={1}
          min={1}
          max={500}
        />
        <div className="mt-2 flex gap-2">
          {[5, 10, 20].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setQty((q) => Math.min(500, q + n))}
              className="h-10 flex-1 rounded-xl bg-ink/5 font-semibold"
            >
              +{n}
            </button>
          ))}
        </div>
      </div>
      {total <= money && (
        <p
          className={`mt-2 text-sm ${money - total < reserve ? "font-semibold text-red" : "text-ink/60"}`}
        >
          Còn lại {vnd(money - total)}
          {money - total < reserve && ` — không đủ ${vnd(reserve)} tiền thuê chỗ hôm nay!`}
        </p>
      )}
      <button
        type="button"
        disabled={busy || total > money}
        onClick={async () => {
          setBusy(true);
          await send("market:buy", { productId, qty });
          setBusy(false);
        }}
        className="mt-3 h-12 w-full rounded-xl bg-sun text-base font-semibold disabled:opacity-40"
      >
        {total > money
          ? `Không đủ tiền (${vnd(total)})`
          : busy
            ? "Đang nhập…"
            : `Nhập ${qty} · ${vnd(total)}`}
      </button>
    </li>
  );
}
