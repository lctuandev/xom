"use client";

import { content } from "@xom/content";
import type { BusinessView } from "@xom/shared";
import { formatClock, priceScore, repairCost, unlockLevel, wearState } from "@xom/sim";
import { useEffect, useRef, useState } from "react";
import { stars, vnd, vndShort } from "../format";
import { send } from "../net/socket";
import { baseCost, ingredientsOfProduct, makeableCount } from "../recipes";
import { useGame } from "../store";
import { usePayMethod } from "./PayPicker";
import { ReviewBook } from "./Reviews";
import { Section, Sheet, Stepper } from "./Sheet";

export function BusinessSheet() {
  const me = useGame((s) => s.me);
  const close = useGame((s) => s.openSheet);
  const setGoal = useGame((s) => s.setGoal);
  const [changing, setChanging] = useState(false);
  const biz = me?.business;

  if (!biz || changing) {
    // Mua / đổi xe chỉ ở vựa xe Ông Sáu.
    return (
      <Sheet title={biz ? "Đổi nghề" : "Chưa có xe hàng"} onClose={() => close(null)}>
        {biz && (
          <button
            type="button"
            onClick={() => setChanging(false)}
            className="mb-3 h-10 font-semibold text-red"
          >
            ← Quay lại quầy
          </button>
        )}
        <p className="mb-3 text-sm text-ink/70">
          Xe đẩy mua ở vựa xe Ông Sáu, đầu phố phía tây. Đổi nghề thì xe cũ được bán lại nửa giá;
          hàng tồn của nghề cũ đem ra chợ Bà Năm thanh lý (♻️ trong bảng chợ).
        </p>
        <button
          type="button"
          onClick={() => {
            setGoal({ kind: "place", id: "vua_xe", open: "equipment" });
            close(null);
          }}
          className="h-11 w-full rounded-xl bg-red font-semibold text-cream"
        >
          🚶 Tới vựa xe Ông Sáu
        </button>
      </Sheet>
    );
  }

  const product = content.product(biz.productId);
  const equipment = content.equipment(biz.equipmentId);
  // Số phần còn làm được của các món đang bán (theo nguyên liệu trong kho).
  const stock = biz.menu
    .filter((m) => m.on)
    .reduce((sum, m) => sum + makeableCount(biz.productId, m.variantId, me.inventory), 0);

  return (
    <Sheet title={`${product.emoji} ${equipment.name}`} onClose={() => close(null)}>
      <div className="mb-4 flex items-center justify-between">
        <span
          role="img"
          className="text-lg text-sun"
          title="Uy tín"
          aria-label={`Uy tín ${Math.round(biz.reputation * 100)}%`}
        >
          {stars(biz.reputation)}
        </span>
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${biz.open ? "bg-leaf text-cream" : "bg-ink/10"}`}
        >
          {biz.open ? "Đang bán" : "Đóng cửa"}
        </span>
      </div>

      <OpenButton biz={biz} stock={stock} working={me.jobId !== null} money={me.money} />

      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => close("recipes")}
          className="h-11 rounded-xl bg-white font-semibold shadow-sm"
        >
          📖 Công thức
        </button>
        <button
          type="button"
          onClick={() => {
            close(null);
            setGoal({ kind: "place", id: "cho_dau_moi", open: "market" });
          }}
          className="h-11 rounded-xl bg-white font-semibold shadow-sm"
        >
          🧺 Ra chợ mua hàng
        </button>
      </div>

      <WearBar biz={biz} />

      <PromoSection biz={biz} money={me.money} />

      <Section title="Thực đơn & giá">
        <MenuEditor biz={biz} />
      </Section>

      <Section title="Chỗ bán">
        <LotPicker biz={biz} />
      </Section>

      <Section title="Nguyên liệu trong kho">
        <StockList productId={biz.productId} />
        <div className="mt-2 flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm">
          <p className="text-sm">
            Làm được khoảng <b className="tabular-nums">{stock}</b> phần
          </p>
          <button
            type="button"
            onClick={() => {
              setGoal({ kind: "place", id: "cho_dau_moi", open: "market" });
              close(null);
            }}
            className="h-10 rounded-xl bg-sun px-4 font-semibold"
          >
            🚶 Ra chợ
          </button>
        </div>
      </Section>

      <Section title="Hôm nay">
        <div className="grid grid-cols-3 gap-2 text-center">
          {/* Khách hụt hiện trong báo cáo cuối ngày. */}
          <Stat label="Đã bán" value={String(me.today.sold)} />
          <Stat label="Doanh thu" value={vndShort(me.today.revenue)} />
          <Stat label="Tiền boa" value={vndShort(me.today.tips)} />
        </div>
      </Section>

      <Section title="📒 Sổ đánh giá">
        <ReviewBook ownerId={me.playerId} owner />
      </Section>

      <button
        type="button"
        onClick={() => setChanging(true)}
        className="h-11 font-semibold text-ink/60"
      >
        Đổi nghề…
      </button>
    </Sheet>
  );
}

function OpenButton({
  biz,
  stock,
  working,
  money,
}: {
  biz: BusinessView;
  stock: number;
  working: boolean;
  money: number;
}) {
  const [busy, setBusy] = useState(false);
  const atStall = useGame((s) => s.atStall);
  const setGoal = useGame((s) => s.setGoal);
  const close = useGame((s) => s.openSheet);
  const lot = biz.lotId ? content.lot(biz.lotId) : null;
  const eco = content.economy;
  // Tiền thuê chỗ + phí chợ/thuế trả một lần mỗi ngày (Luật 2.2).
  const rentDue =
    !biz.open && lot && !biz.rentPaidToday ? lot.rentPerDay + eco.fees.daily[lot.kind] : 0;
  const broken = wearState(biz.wear, eco.maintenance) === "broken";
  const cantPay = rentDue > money;
  const hint = broken
    ? "Xe hư rồi — đẩy tới vựa xe Ông Sáu sửa đã"
    : working
      ? "Đang đi làm thuê — nghỉ việc để mở quầy"
      : !lot
        ? "Chọn chỗ bán bên dưới trước"
        : stock === 0
          ? "Chưa đủ nguyên liệu cho món nào — ra chợ mua trước"
          : cantPay
            ? `Không đủ ${vnd(rentDue)} tiền thuê chỗ — chọn chỗ rẻ hơn hoặc đi làm thuê kiếm thêm`
            : rentDue
              ? `Thuê chỗ + phí chợ hôm nay: ${vnd(rentDue)} (trả một lần/ngày)`
              : null;
  // Phải đẩy xe tới chỗ bán, đứng sau quầy mới mở được.
  if (!biz.open && lot && !atStall) {
    return (
      <div className="mb-4">
        <button
          type="button"
          onClick={() => {
            setGoal({ kind: "stall", open: "business" });
            close(null);
          }}
          className="h-12 w-full rounded-2xl bg-sun text-base font-semibold active:scale-[0.98]"
        >
          🚶 Đẩy xe tới {lot.name}
        </button>
        <p className="mt-2 text-center text-sm text-ink/60">Tới nơi rồi mới mở quầy được.</p>
      </div>
    );
  }
  return (
    <div className="mb-4">
      <button
        type="button"
        disabled={busy || (!biz.open && (broken || working || !lot || stock === 0 || cantPay))}
        onClick={async () => {
          setBusy(true);
          await send(biz.open ? "biz:close" : "biz:open", {});
          setBusy(false);
        }}
        className={`h-12 w-full rounded-2xl text-base font-semibold active:scale-[0.98] disabled:opacity-40 ${
          biz.open ? "bg-ink/10" : "bg-leaf text-cream"
        }`}
      >
        {busy ? "…" : biz.open ? "Đóng quầy" : "Mở quầy bán"}
      </button>
      {hint && <p className="mt-2 text-center text-sm text-ink/60">{hint}</p>}
    </div>
  );
}

/** Độ bền xe/quầy (Luật 2.2): bán nhiều thì mòn; ọp ẹp khách bớt ghé, làm món chậm; hư thì không mở được. */
function WearBar({ biz }: { biz: BusinessView }) {
  const setGoal = useGame((s) => s.setGoal);
  const close = useGame((s) => s.openSheet);
  const m = content.economy.maintenance;
  const state = wearState(biz.wear, m);
  const cost = repairCost(content.equipment(biz.equipmentId).price, biz.wear, m);
  const left = Math.round((1 - biz.wear) * 100);
  return (
    <div className="mb-3 rounded-2xl bg-white p-3 shadow-sm" data-wear={state}>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">🔧 Độ bền xe</span>
        <span className={state === "ok" ? "text-ink/60" : "font-semibold text-red"}>
          {state === "broken" ? "Hư rồi" : state === "worn" ? `Ọp ẹp · ${left}%` : `${left}%`}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/10">
        <div
          className={`h-full rounded-full ${state === "ok" ? "bg-leaf" : "bg-red"}`}
          style={{ width: `${left}%` }}
        />
      </div>
      {state !== "ok" && (
        <p className="mt-1 text-xs text-ink/60">
          Xe ọp ẹp: khách ngại ghé, làm món chậm hơn. Sửa ở vựa xe Ông Sáu.
        </p>
      )}
      {cost > 0 && (
        <button
          type="button"
          onClick={() => {
            setGoal({ kind: "place", id: "vua_xe", open: "equipment" });
            close(null);
          }}
          className="mt-2 h-10 w-full rounded-xl bg-sun text-sm font-semibold"
        >
          🚶 Tới vựa xe sửa · {vnd(cost)}
        </button>
      )}
    </div>
  );
}

/**
 * Khai trương (sự kiện người chơi tạo, DESIGN §9): trả tiền pháo giấy, bong bóng, băng rôn → quầy đông khách + giảm giá
 * vài giờ game, cả xóm thấy tin. Mỗi lần cách nhau vài ngày.
 */
function PromoSection({ biz, money }: { biz: BusinessView; money: number }) {
  const def = content.data.events.find((e) => e.trigger.kind === "player");
  const atStall = useGame((s) => s.atStall);
  const day = useGame((s) => s.clock?.day ?? 1);
  const minute = useGame((s) => s.clock?.minute ?? 0);
  const active = useGame((s) =>
    s.events.find((e) => e.businessId === biz.id && minute >= e.from && minute < e.to),
  );
  const [busy, setBusy] = useState(false);
  const level = useGame((s) => s.me?.progress.level ?? 1);
  if (!def || def.trigger.kind !== "player") return null;
  const cost = def.trigger.costs.reduce((sum, c) => sum + c.price, 0);
  const wait = biz.promoDay === null ? 0 : def.trigger.cooldownDays - (day - biz.promoDay);
  const need = unlockLevel(content, "event_host");
  const hint = active
    ? null
    : level < need
      ? `🔒 Cấp ${need} mới tổ chức khai trương được`
      : wait > 0
        ? `Mới khai trương — ${wait} ngày nữa mới làm lại được`
        : !biz.open || !atStall
          ? "Mở quầy và đứng ở quầy rồi mới khai trương được"
          : cost > money
            ? "Không đủ tiền mặt"
            : null;
  return (
    <Section title={`${def.emoji} ${def.name}`}>
      <div className="rounded-2xl bg-white p-3 shadow-sm" data-promo={active ? "on" : "off"}>
        {active ? (
          <p className="text-sm font-semibold text-leaf">
            🎉 Đang khai trương tới {formatClock(active.to)} — khách đông, giảm{" "}
            {Math.round((def.effects.discount ?? 0) * 100)}%
          </p>
        ) : (
          <>
            <p className="text-sm text-ink/70">
              Khách ghé ×{def.effects.demand ?? 1} trong {def.minutes / 60} giờ, giảm{" "}
              {Math.round((def.effects.discount ?? 0) * 100)}% mọi món; cả xóm được báo tin.
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
              {def.trigger.costs.map((c) => (
                <li key={c.id} className="rounded-full bg-ink/5 px-2 py-1">
                  {c.emoji} {c.label} {vndShort(c.price)}
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={busy || hint !== null}
              onClick={async () => {
                setBusy(true);
                await send("event:host", { eventId: def.id, pay: usePayMethod.getState().method });
                setBusy(false);
              }}
              className="mt-2 h-11 w-full rounded-xl bg-red font-semibold text-cream disabled:opacity-40"
            >
              {busy ? "…" : `🎉 Khai trương · ${vnd(cost)}`}
            </button>
            {hint && <p className="mt-1 text-center text-xs text-ink/60">{hint}</p>}
          </>
        )}
      </div>
    </Section>
  );
}

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
  const score = priceScore(price / variant.refPrice);
  const verdict =
    price < variant.refPrice * 0.85
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
            {verdict.text} · khách thấy hợp lý khoảng {vnd(variant.refPrice)}
          </p>
        </div>
      )}
    </li>
  );
}

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

function LotPicker({ biz }: { biz: BusinessView }) {
  const level = useGame((s) => s.me?.progress.level ?? 1);
  const world = useGame((s) => s.world);
  const [open, setOpen] = useState(biz.lotId === null);
  const current = biz.lotId ? content.lot(biz.lotId) : null;

  if (!open && current) {
    return (
      <div className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm">
        <div className="min-w-0">
          <p className="font-extrabold">{current.name}</p>
          <p className="text-sm text-ink/60">
            {current.hint} · {vndShort(current.rentPerDay)}/ngày
          </p>
        </div>
        <button
          type="button"
          disabled={biz.open}
          onClick={() => setOpen(true)}
          className="h-11 shrink-0 rounded-xl bg-ink/5 px-4 font-semibold disabled:opacity-40"
        >
          Đổi chỗ
        </button>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {content.data.lots.map((lot) => {
        const taken = world.lots.find((o) => o.lotId === lot.id && o.businessId !== biz.id);
        const selected = biz.lotId === lot.id;
        // Nhà mặt tiền mở khoá theo cấp (Luật 4.2).
        const need = lot.kind === "house" ? unlockLevel(content, "lot_house") : 1;
        const locked = level < need;
        return (
          <li key={lot.id}>
            <button
              type="button"
              disabled={!!taken || locked}
              aria-pressed={selected}
              onClick={async () => {
                const res = await send("biz:update", { lotId: lot.id });
                if (res.ok) setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white p-3 text-left shadow-sm aria-pressed:ring-2 aria-pressed:ring-red disabled:opacity-40"
            >
              <span className="min-w-0">
                <span className="block font-extrabold">{lot.name}</span>
                <span className="block text-sm text-ink/60">
                  {locked
                    ? `🔒 Cấp ${need} mới thuê được`
                    : taken
                      ? `${taken.ownerName} đang dùng`
                      : lot.hint}
                </span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">
                {vndShort(lot.rentPerDay)}
              </span>
            </button>
          </li>
        );
      })}
      {current && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-11 font-semibold text-ink/60"
        >
          Giữ chỗ cũ
        </button>
      )}
    </ul>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
      <p className={`text-xl font-extrabold tabular-nums ${warn ? "text-red" : ""}`}>{value}</p>
      <p className="text-xs text-ink/60">{label}</p>
    </div>
  );
}
