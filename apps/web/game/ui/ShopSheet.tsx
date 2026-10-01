"use client";

import { content } from "@xom/content";
import { customOrder } from "@xom/sim";
import { useState } from "react";
import { vnd } from "../format";
import { send } from "../net/socket";
import { useGame } from "../store";
import { PayPicker, usePayCheck, usePayMethod } from "./PayPicker";
import { RatingLine, ReviewBook, useReviews } from "./Reviews";
import { Sheet } from "./Sheet";

/**
 * Gọi món ở quầy hàng xóm (docs/USECASES.md UC-J3): chọn món trên thực đơn của họ, tự chọn size/mức
 * đường…, dặn thêm yêu cầu riêng. Chủ quầy (người thật) làm tay; tính tiền thì chuyển khoản từ ví mình.
 */
export function ShopSheet() {
  const lot = useGame((s) => s.world.lots.find((l) => l.businessId === s.nearShop));
  // Trả 💵 / 🏦 theo lựa chọn; tiền mặt thì đưa một tờ, chủ quầy thối lại (UC-I6).
  const check = usePayCheck();
  const pay = usePayMethod((s) => s.method);
  const close = useGame((s) => s.openSheet);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [mods, setMods] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const { view: rating, setView: setRating } = useReviews(lot?.ownerId);
  // Vừa mua thì mở sẵn sổ để chấm sao; viết xong vẫn để mở cho thấy đánh giá của mình.
  const [bookOpen, setBookOpen] = useState(false);
  if (!lot) return null;

  const recipe = content.product(lot.productId).recipe;
  const menu = lot.menu
    .filter((m) => m.on && lot.available.includes(m.variantId))
    .map((m) => ({ variantId: m.variantId, price: m.price }));
  const soldOut = lot.menu.filter((m) => m.on && !lot.available.includes(m.variantId));
  const variant = recipe.variants.find((v) => v.id === variantId);
  const order = variant ? customOrder(recipe, menu, variant.id, picks, mods) : null;
  const priced = order && typeof order !== "string" ? order : null;
  const src = priced ? check(priced.price) : null;

  const place = async () => {
    if (!variant) return;
    setBusy(true);
    const res = await send("shop:order", {
      businessId: lot.businessId,
      variantId: variant.id,
      picks,
      mods,
      pay,
    });
    setBusy(false);
    if (res.ok) close(null);
  };

  return (
    <Sheet title={`Quầy ${lot.ownerName}`} onClose={() => close(null)}>
      <p className="mb-2 text-sm text-ink/60">
        {content.product(lot.productId).name} · người thật đứng quầy, làm tay theo lời bạn dặn.
      </p>
      <details
        className="mb-3"
        open={bookOpen || !!rating?.canWrite}
        onToggle={(e) => setBookOpen(e.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm">
          <RatingLine view={rating} /> · 📒 Sổ đánh giá
        </summary>
        <div className="mt-2">
          <ReviewBook ownerId={lot.ownerId} owner={false} onChange={setRating} />
        </div>
      </details>
      <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0" aria-label="Thực đơn">
        {menu.map((m) => {
          const v = recipe.variants.find((x) => x.id === m.variantId);
          if (!v) return null;
          return (
            <button
              key={v.id}
              type="button"
              aria-pressed={variantId === v.id}
              onClick={() => {
                setVariantId(v.id);
                setPicks({});
                setMods([]);
              }}
              className="flex items-center justify-between rounded-xl bg-white px-3 py-2.5 text-left text-sm font-semibold shadow-sm aria-pressed:ring-2 aria-pressed:ring-red"
            >
              <span className="first-letter:uppercase">{v.name}</span>
              <span className="tabular-nums">{vnd(m.price)}</span>
            </button>
          );
        })}
        {soldOut.map((m) => (
          <p
            key={m.variantId}
            className="flex items-center justify-between rounded-xl bg-ink/5 px-3 py-2.5 text-sm text-ink/40"
          >
            <span className="first-letter:uppercase">
              {recipe.variants.find((v) => v.id === m.variantId)?.name}
            </span>
            <span>hết</span>
          </p>
        ))}
        {menu.length === 0 && (
          <p className="text-center text-sm text-ink/60">Quầy đang hết món — ghé lại sau nha.</p>
        )}
      </fieldset>

      {variant && (
        <>
          {recipe.steps
            .filter((st) => st.pick && !(st.id in variant.fixed))
            .map((st) => (
              <div key={st.id} className="mt-3">
                <p className="mb-1 text-xs font-extrabold">{st.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.keys(st.pick ?? {}).map((id) => {
                    const opt = st.options.find((o) => o.id === id);
                    if (!opt) return null;
                    const on = (picks[st.id] ?? recipe.defaults[st.id]) === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setPicks({ ...picks, [st.id]: id })}
                        className="h-9 rounded-lg bg-white px-2.5 text-xs font-semibold shadow-sm aria-pressed:bg-ink aria-pressed:text-cream"
                      >
                        {opt.emoji} {opt.label}
                        {opt.extraPrice ? ` +${opt.extraPrice / 1000}k` : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          {recipe.mods.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-extrabold">Dặn thêm</p>
              <div className="flex flex-wrap gap-1.5">
                {recipe.mods.map((m) => {
                  const on = mods.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setMods(on ? mods.filter((x) => x !== m.id) : [...mods, m.id])}
                      className="h-9 rounded-lg bg-white px-2.5 text-xs font-semibold shadow-sm first-letter:uppercase aria-pressed:bg-ink aria-pressed:text-cream"
                    >
                      {m.say}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="sticky bottom-0 mt-3 bg-cream pt-2 pb-1">
            {priced && (
              <p className="mb-1.5 text-center text-sm" data-dish={priced.dish}>
                “{priced.ask}”
              </p>
            )}
            {typeof order === "string" && (
              <p className="mb-1.5 text-center text-sm text-red">{order}</p>
            )}
            <PayPicker />
            <button
              type="button"
              disabled={busy || !priced || typeof src !== "string"}
              onClick={place}
              className="h-12 w-full rounded-2xl bg-red font-semibold text-cream disabled:opacity-40"
            >
              {src && typeof src !== "string"
                ? src.error
                : `🛒 Gọi món · ${priced ? vnd(priced.price) : ""}`}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
