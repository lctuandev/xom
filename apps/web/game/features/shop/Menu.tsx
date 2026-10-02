"use client";

import { content } from "@xom/content";
import type { BusinessView } from "@xom/shared";
import { fairPrice, priceScore } from "@xom/sim";
import { useEffect, useRef, useState } from "react";
import { vnd } from "../../format";
import { send } from "../../net/socket";
import { baseCost, makeableCount } from "../../recipes";
import { useGame } from "../../store";
import { Stepper } from "../../ui/Sheet";
import { ShopFeature } from "./common";

/** Bật/tắt món, chỉnh giá từng món (gửi lên server sau khi ngừng bấm 400ms). */
function MenuEditor({ biz }: { biz: BusinessView }) {
  return (
    <ul className="flex flex-col gap-2">
      {biz.menu.map((m) => (
        <MenuRow key={m.variantId} biz={biz} item={m} />
      ))}
    </ul>
  );
}
function MenuRow({ biz, item }: { biz: BusinessView; item: BusinessView["menu"][number] }) {
  const variant = content.variant(biz.productId, item.variantId);
  const inventory = useGame((s) => s.me?.inventory);
  const [price, setPrice] = useState(item.price);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => setPrice(item.price), [item.price]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const change = (v: number) => {
    setPrice(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => void send("biz:menu", { variantId: item.variantId, price: v }),
      400,
    );
  };
  const cost = baseCost(biz.productId, item.variantId);
  const can = makeableCount(biz.productId, item.variantId, inventory);
  // Ngồi tiệm khách chịu giá cao hơn xe đẩy (lot.priceTolerance).
  const fair = fairPrice(content, variant.refPrice, biz.lotId);
  const score = priceScore(price / fair);
  const verdict =
    price < fair * 0.85
      ? { text: "Rẻ", cls: "text-leaf" }
      : score >= 0.95
        ? { text: "Hợp lý", cls: "text-leaf" }
        : score >= 0.7
          ? { text: "Hơi đắt", cls: "text-sun" }
          : { text: "Đắt", cls: "text-red" };

  return (
    <li className={`rounded-2xl bg-white p-3 shadow-sm ${item.on ? "" : "opacity-60"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-extrabold first-letter:uppercase">{variant.name}</p>
          <p className="text-xs text-ink/60">
            Vốn ~{vnd(cost)} · lãi {vnd(price - cost)} · còn làm được {can}
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-1.5 text-sm font-semibold">
          <input
            type="checkbox"
            checked={item.on}
            onChange={(e) =>
              void send("biz:menu", { variantId: item.variantId, on: e.target.checked })
            }
            className="size-5 accent-red"
          />
          Bán
        </label>
      </div>
      {item.on && (
        <div className="mt-2">
          <Stepper
            label={`giá ${variant.name}`}
            value={price}
            onChange={change}
            step={1_000}
            min={1_000}
            max={variant.refPrice * 4}
            format={vnd}
          />
          <p className={`mt-1 text-center text-xs font-semibold ${verdict.cls}`}>
            {verdict.text} · khách{" "}
            {biz.lotId && content.lot(biz.lotId).kind === "house" ? "vào tiệm " : ""}thấy hợp lý
            khoảng {vnd(fair)}
          </p>
        </div>
      )}
    </li>
  );
}

/** 🍽️ Thực đơn & giá: bật/tắt món, chỉnh giá từng món. */
export function MenuSheet() {
  return <ShopFeature id="dishes">{(biz) => <MenuEditor biz={biz} />}</ShopFeature>;
}
