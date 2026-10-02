"use client";

import { content, type Ingredient } from "@xom/content";
import { marketPackPrice, openDue, resaleValue } from "@xom/sim";
import { useState } from "react";
import { vnd } from "../format";
import { send } from "../net/socket";
import { ingredientsOfProduct } from "../recipes";
import { useGame } from "../store";
import { PayPicker, usePayCheck, usePayMethod } from "./PayPicker";
import { PlaceFace, PlaceGate } from "./PlaceGate";
import { Sheet, Stepper } from "./Sheet";
import { Tabs } from "./Tabs";

const NONE: never[] = [];

/**
 * Chợ đầu mối Bà Năm (UC-E1): nguyên liệu theo gói, giá mỗi ngày một khác, buổi chiều hàng tươi
 * đắt hơn; mua sỉ và thân với Bà Năm được bớt.
 */
export function MarketSheet() {
  const me = useGame((s) => s.me);
  const clock = useGame((s) => s.clock);
  const close = useGame((s) => s.openSheet);
  const [tab, setTab] = useState<string>("mine");
  if (!me || !clock) return null;

  const mine = me.business ? ingredientsOfProduct(me.business.productId) : [];
  // Tab theo nghề (góp ý UX: list dài chia tab): quầy của mình trước, rồi từng nghề khác. Thanh lý là sheet riêng (♻️).
  const groups: { id: string; label: string; items: string[] }[] = [];
  if (me.business) {
    const p = content.product(me.business.productId);
    groups.push({ id: "mine", label: `${p.emoji} Quầy của bạn`, items: mine });
  }
  const seen = new Set(mine);
  for (const p of content.data.products) {
    const items = ingredientsOfProduct(p.id).filter((id) => !seen.has(id));
    for (const id of items) seen.add(id);
    if (items.length) groups.push({ id: p.id, label: `${p.emoji} ${p.name}`, items });
  }
  const rest = content.data.ingredients.map((i) => i.id).filter((id) => !seen.has(id));
  if (rest.length) groups.push({ id: "khac", label: "🧺 Khác", items: rest });
  const leftovers = me.inventory.filter((i) => i.qty > 0).length;
  const current = groups.some((g) => g.id === tab) ? tab : groups[0]?.id;
  // Tiền thuê chỗ còn phải trả hôm nay: nhắc chừa lại để không kẹt vốn.
  const biz = me.business;
  const reserve =
    biz?.lotId && !biz.open && !biz.rentPaidToday ? openDue(content, biz.lotId).total : 0;
  const eco = content.economy;
  const friend = (me.friendship.cho_dau_moi ?? 0) >= eco.friendDiscountAt;

  return (
    <Sheet
      title="Chợ đầu mối Bà Năm"
      onClose={() => close(null)}
      face={<PlaceFace placeId="cho_dau_moi" />}
    >
      <PlaceGate placeId="cho_dau_moi" open="market">
        <p className="mb-3 text-xs text-ink/60">
          Giá ngày {clock.day}
          {clock.minute >= 12 * 60 && " · buổi chiều: hàng tươi đắt hơn"}
          {` · mua từ ${eco.bulkPacks} gói bớt ${Math.round(eco.bulkDiscount * 100)}%`}
          {friend && ` · thân với Bà Năm bớt thêm ${Math.round(eco.friendDiscount * 100)}%`}
        </p>
        {me.shops.length > 1 && biz && (
          <p
            className="mb-2 rounded-xl bg-sun/25 px-3 py-2 text-xs font-semibold"
            data-market-for={biz.id}
          >
            📦 Nhập hàng cho: {content.product(biz.productId).emoji}{" "}
            {me.shops.find((x) => x.active)?.name ?? content.product(biz.productId).name} — đổi cửa
            hàng ở 🏬 Các cửa hàng
          </p>
        )}
        {!me.business && (
          <p
            className="mb-2 rounded-xl bg-red/10 px-3 py-2 text-xs font-semibold"
            data-market-noshop
          >
            🛒 Hàng nhập về kho của quầy — mua xe hàng ở vựa Ông Sáu trước rồi mới nhập hàng được.
          </p>
        )}
        <PayPicker />
        <Tabs
          label="Quầy hàng ở chợ"
          value={current ?? "sell"}
          onChange={setTab}
          tabs={groups.map((g) => ({ id: g.id, label: g.label }))}
        />
        {current === "sell" ? null : (
          <ul className="flex flex-col gap-2" data-group={current}>
            {groups
              .find((g) => g.id === current)
              ?.items.map((id) => (
                <Row key={id} ing={content.ingredient(id)} reserve={reserve} friend={friend} />
              ))}
          </ul>
        )}
        {leftovers > 0 && (
          <button
            type="button"
            onClick={() => close("liquidate")}
            className="mt-3 h-11 w-full rounded-xl bg-white font-semibold shadow-sm"
          >
            ♻️ Thanh lý hàng tồn ({leftovers}) ›
          </button>
        )}
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
  const check = usePayCheck();
  const pay = usePayMethod((s) => s.method);
  if (!me || !clock) return null;
  const eco = content.economy;
  const pack = marketPackPrice(ing, clock.day, clock.minute, eco);
  let total = pack * packs;
  if (packs >= eco.bulkPacks) total *= 1 - eco.bulkDiscount;
  if (friend) total *= 1 - eco.friendDiscount;
  total = Math.max(500, Math.round(total / 500) * 500);
  const stock = me.inventory.find((i) => i.itemId === ing.id)?.qty ?? 0;
  const src = check(total);
  const left = src === "cash" ? me.money - total : me.money;

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
          disabled={busy || typeof src !== "string" || !me.business}
          onClick={async () => {
            setBusy(true);
            await send("market:buy", { itemId: ing.id, packs, pay });
            setBusy(false);
          }}
          className="h-11 shrink-0 rounded-xl bg-sun px-3 text-sm font-semibold disabled:opacity-40"
        >
          {busy ? "…" : `Mua ${vnd(total)}`}
        </button>
      </div>
      {typeof src !== "string" && <p className="mt-1 text-xs text-ink/60">{src.error}</p>}
      {src === "cash" && left < reserve && (
        <p className="mt-1 text-xs font-semibold text-red">
          Mua xong không đủ {vnd(reserve)} tiền thuê chỗ hôm nay!
        </p>
      )}
    </li>
  );
}

/**
 * Thanh lý hàng tồn (góp ý chơi thử): đổi nghề hoặc dư hàng thì bán lại cho Bà Năm — giá thấp hơn giá gốc nhiều.
 */
export function Liquidate() {
  const inventory = useGame((s) => s.me?.inventory ?? NONE);
  const [busy, setBusy] = useState<string | null>(null);
  const items = inventory.filter((i) => i.qty > 0);
  if (items.length === 0) return null;
  const rate = content.economy.resaleRate;
  return (
    <section aria-label="Thanh lý hàng tồn" data-liquidate>
      <p className="mb-2 text-xs text-ink/60">
        Bà Năm mua lại {Math.round(rate * 100)}% giá gốc — dùng khi đổi nghề hoặc dư hàng.
      </p>
      <ul className="flex flex-col gap-1.5">
        {items.map((i) => {
          const ing = content.ingredient(i.itemId);
          const value = resaleValue(ing.costPerUnit, i.qty, rate);
          return (
            <li
              key={i.itemId}
              data-liquidate-item={i.itemId}
              className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm shadow-sm"
            >
              <span>
                {ing.emoji} {ing.name} · {i.qty} {ing.unit}
              </span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy(i.itemId);
                  await send("market:sell", { itemId: i.itemId });
                  setBusy(null);
                }}
                className="h-9 rounded-lg bg-sun px-3 text-xs font-semibold disabled:opacity-40"
              >
                {busy === i.itemId ? "…" : `Bán lại · ${vnd(value)}`}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
