"use client";

import { content, type Ingredient } from "@xom/content";
import { marketPackPrice } from "@xom/sim";
import { useState } from "react";
import { vnd } from "../format";
import { send } from "../net/socket";
import { ingredientsOfProduct } from "../recipes";
import { useGame } from "../store";
import { PlaceGate } from "./PlaceGate";
import { Sheet, Stepper } from "./Sheet";

/**
 * Chợ đầu mối Bà Năm (UC-E1): nguyên liệu theo gói, giá mỗi ngày một khác, buổi chiều hàng tươi
 * đắt hơn; mua sỉ và thân với Bà Năm được bớt.
 */
export function MarketSheet() {
  const me = useGame((s) => s.me);
  const clock = useGame((s) => s.clock);
  const close = useGame((s) => s.openSheet);
  if (!me || !clock) return null;

  const mine = me.business ? ingredientsOfProduct(me.business.productId) : [];
  const others = content.data.ingredients.filter((i) => !mine.includes(i.id));
  // Tiền thuê chỗ còn phải trả hôm nay: nhắc chừa lại để không kẹt vốn.
  const biz = me.business;
  const reserve =
    biz?.lotId && !biz.open && !biz.rentPaidToday ? content.lot(biz.lotId).rentPerDay : 0;
  const eco = content.economy;
  const friend = (me.friendship.cho_dau_moi ?? 0) >= eco.friendDiscountAt;

  return (
    <Sheet title="Chợ đầu mối Bà Năm" onClose={() => close(null)}>
      <PlaceGate placeId="cho_dau_moi" open="market">
        <p className="mb-3 text-xs text-ink/60">
          Giá ngày {clock.day}
          {clock.minute >= 12 * 60 && " · buổi chiều: hàng tươi đắt hơn"}
          {` · mua từ ${eco.bulkPacks} gói bớt ${Math.round(eco.bulkDiscount * 100)}%`}
          {friend && ` · thân với Bà Năm bớt thêm ${Math.round(eco.friendDiscount * 100)}%`}
        </p>
        {mine.length > 0 && (
          <>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink/60 uppercase">
              Cho quầy của bạn
            </h3>
            <ul className="mb-4 flex flex-col gap-2">
              {mine.map((id) => (
                <Row key={id} ing={content.ingredient(id)} reserve={reserve} friend={friend} />
              ))}
            </ul>
          </>
        )}
        <details open={mine.length === 0}>
          <summary className="mb-2 cursor-pointer text-xs font-semibold tracking-wide text-ink/60 uppercase">
            Hàng khác ({others.length})
          </summary>
          <ul className="flex flex-col gap-2">
            {others.map((ing) => (
              <Row key={ing.id} ing={ing} reserve={reserve} friend={friend} />
            ))}
          </ul>
        </details>
      </PlaceGate>
    </Sheet>
  );
}

function shelfNote(ing: Ingredient) {
  if (ing.shelfLifeDays === null) return "không hỏng";
  if (ing.shelfLifeDays === 1) return "dùng trong ngày";
  return `để được ${ing.shelfLifeDays} ngày`;
}

function Row({ ing, reserve, friend }: { ing: Ingredient; reserve: number; friend: boolean }) {
  const me = useGame((s) => s.me);
  const clock = useGame((s) => s.clock);
  const [packs, setPacks] = useState(1);
  const [busy, setBusy] = useState(false);
  if (!me || !clock) return null;
  const eco = content.economy;
  const pack = marketPackPrice(ing, clock.day, clock.minute, eco);
  let total = pack * packs;
  if (packs >= eco.bulkPacks) total *= 1 - eco.bulkDiscount;
  if (friend) total *= 1 - eco.friendDiscount;
  total = Math.max(500, Math.round(total / 500) * 500);
  const stock = me.inventory.find((i) => i.itemId === ing.id)?.qty ?? 0;
  const left = me.money - total;

  return (
    <li className="rounded-2xl bg-white p-3 shadow-sm" data-item={ing.id}>
      <div className="flex items-start gap-2">
        <span className="text-2xl" aria-hidden>
          {ing.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold">{ing.name}</p>
          <p className="text-xs text-ink/60">
            Gói {ing.packSize} {ing.unit} · {shelfNote(ing)} · trong kho {stock}
          </p>
        </div>
        <p className="shrink-0 text-sm font-extrabold tabular-nums">{vnd(pack)}/gói</p>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1">
          <Stepper
            label={`số gói ${ing.name}`}
            value={packs}
            onChange={setPacks}
            step={1}
            min={1}
            max={20}
          />
        </div>
        <button
          type="button"
          disabled={busy || total > me.money}
          onClick={async () => {
            setBusy(true);
            await send("market:buy", { itemId: ing.id, packs });
            setBusy(false);
          }}
          className="h-11 shrink-0 rounded-xl bg-sun px-3 text-sm font-semibold disabled:opacity-40"
        >
          {busy ? "…" : `Mua ${vnd(total)}`}
        </button>
      </div>
      {total <= me.money && left < reserve && (
        <p className="mt-1 text-xs font-semibold text-red">
          Mua xong không đủ {vnd(reserve)} tiền thuê chỗ hôm nay!
        </p>
      )}
    </li>
  );
}
