"use client";

import { content } from "@xom/content";
import type { BusinessView, RegularView, StaffView } from "@xom/shared";
import { formatClock, openDue, priceScore, repairCost, unlockLevel, wearState } from "@xom/sim";
import { useEffect, useRef, useState } from "react";
import { districtLikes } from "../districts";
import { stars, vnd, vndShort } from "../format";
import { send } from "../net/socket";
import { baseCost, ingredientsOfProduct, makeableCount } from "../recipes";
import { useGame } from "../store";
import { useMyStats, WeekChart } from "./BoardSheet";
import { usePayMethod } from "./PayPicker";
import { ReviewBook } from "./Reviews";
import { Section, Sheet, Stepper } from "./Sheet";
import { ShopSetup } from "./ShopSetup";
import { Tabs } from "./Tabs";

type BizTab =
  | "sell"
  | "menu"
  | "stock"
  | "lot"
  | "shop"
  | "stats"
  | "regulars"
  | "staff"
  | "reviews";

/** Bảng Làm ăn: phần đầu (uy tín, mở quầy) luôn hiện; phần dài chia tab dính (góp ý UX). */
export function BusinessSheet() {
  const me = useGame((s) => s.me);
  const close = useGame((s) => s.openSheet);
  const setGoal = useGame((s) => s.setGoal);
  const [changing, setChanging] = useState(false);
  const [tab, setTab] = useState<BizTab | null>(null);
  const stats = useMyStats();
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

  // Chưa chọn chỗ thì mở thẳng tab Chỗ bán (người mới đi theo kịch bản).
  const current: BizTab = tab ?? (biz.lotId ? "sell" : "lot");
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

      <Tabs
        label="Bảng làm ăn"
        value={current}
        onChange={setTab}
        tabs={[
          { id: "sell", label: "🏪 Bán" },
          { id: "menu", label: "🍽️ Thực đơn" },
          { id: "stock", label: "📦 Kho" },
          { id: "lot", label: "📍 Chỗ bán" },
          { id: "shop", label: "🏪 Mở tiệm" },
          { id: "stats", label: "📊 Số liệu" },
          { id: "regulars", label: "❤️ Khách quen" },
          { id: "staff", label: "👩‍🍳 Nhân viên" },
          { id: "reviews", label: "📒 Đánh giá" },
        ]}
      />

      {current === "sell" && (
        <>
          <WearBar biz={biz} />
          <PromoSection biz={biz} money={me.money} />
          <Section title="Hôm nay">
            <div className="grid grid-cols-3 gap-2 text-center">
              {/* Khách hụt hiện trong báo cáo cuối ngày. */}
              <Stat label="Đã bán" value={String(me.today.sold)} />
              <Stat label="Doanh thu" value={vndShort(me.today.revenue)} />
              <Stat label="Tiền boa" value={vndShort(me.today.tips)} />
            </div>
          </Section>
        </>
      )}

      {current === "menu" && (
        <Section title="Thực đơn & giá">
          <MenuEditor biz={biz} />
        </Section>
      )}

      {current === "regulars" && <RegularBook />}

      {current === "staff" && <StaffBoard />}

      {current === "shop" && <ShopSetup />}

      {current === "lot" && (
        <Section title="Chỗ bán">
          <LotPicker biz={biz} />
        </Section>
      )}

      {current === "stock" && (
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
      )}

      {current === "stats" && (
        <Section title="📊 7 ngày qua">
          <WeekChart stats={stats} />
        </Section>
      )}

      {current === "reviews" && (
        <Section title="📒 Sổ đánh giá">
          <ReviewBook ownerId={me.playerId} owner />
        </Section>
      )}

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
  // Tiền chỗ (xe đẩy) + phí chợ/thuế trả một lần mỗi ngày (Luật 2.2); tiệm thì tiền nhà theo hợp đồng.
  const rentDue = !biz.open && lot && !biz.rentPaidToday ? openDue(content, lot.id).total : 0;
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
  const world = useGame((s) => s.world);
  const [open, setOpen] = useState(biz.lotId === null);
  const current = biz.lotId ? content.lot(biz.lotId) : null;

  if (!open && current) {
    return (
      <div className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm">
        <div className="min-w-0">
          <p className="font-extrabold">{current.name}</p>
          <p className="text-xs font-semibold text-leaf" data-district={current.traffic}>
            {content.traffic(current.traffic).emoji} {content.traffic(current.traffic).name} ·{" "}
            {districtLikes(current.traffic)}
          </p>
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
        // Đang thuê nhà: không dọn ra vỉa hè (tiền nhà vẫn chạy) — trả nhà ở tab 🏪 Mở tiệm trước.
        const leased = !!biz.leaseLotId && lot.kind !== "house";
        // Nhà mặt tiền: phải ký hợp đồng thuê ở tab 🏪 Mở tiệm (UC-F12) — server kiểm.
        return (
          <li key={lot.id}>
            <button
              type="button"
              disabled={!!taken || leased}
              aria-pressed={selected}
              onClick={async () => {
                const res = await send("biz:update", { lotId: lot.id });
                if (res.ok) setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white p-3 text-left shadow-sm aria-pressed:ring-2 aria-pressed:ring-red disabled:opacity-40"
            >
              <span className="min-w-0">
                <span className="block font-extrabold">{lot.name}</span>
                {/* Bản sắc khu (THEGIOI §3): khu nào hợp hàng gì. */}
                <span className="block text-xs font-semibold text-leaf" data-district={lot.traffic}>
                  {content.traffic(lot.traffic).emoji} {content.traffic(lot.traffic).name} ·{" "}
                  {districtLikes(lot.traffic)}
                </span>
                <span className="block text-sm text-ink/60">
                  {lot.kind === "house" && !selected
                    ? "📝 Ký hợp đồng thuê ở tab 🏪 Mở tiệm"
                    : leased
                      ? "🏠 Đang thuê nhà — trả nhà ở tab 🏪 Mở tiệm rồi mới ra vỉa hè"
                      : taken
                        ? `${taken.ownerName} đang dùng`
                        : lot.hint}
                </span>
              </span>
              <span className="shrink-0 text-right font-semibold tabular-nums">
                {vndShort(lot.rentPerDay)}
                <span className="block text-[10px] font-normal text-ink/50">
                  {lot.kind === "house" ? "tiền nhà/ngày" : "tiền chỗ/ngày"}
                </span>
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

/**
 * Sổ khách quen (KIENTRUC §1): cư dân có tên đã mua ở quầy mấy lần; đủ lần thì ❤️. Làm sai / để chờ bỏ về liên tiếp thì
 * khách quen giận.
 */
function RegularBook() {
  const [list, setList] = useState<RegularView[] | null>(null);
  useEffect(() => {
    void send("regulars:list", {}).then((r) => setList(r.ok ? r.data : []));
  }, []);
  const need = content.data.regulars.regularAt;
  if (!list) return <p className="text-sm text-ink/50">Đang lật sổ…</p>;
  return (
    <section aria-label="Sổ khách quen" className="mb-3">
      <p className="mb-2 text-xs text-ink/60">
        Khách mua đúng món đủ {need} lần thì thành ❤️ khách quen: kiên nhẫn hơn, hay ghé hơn, có khi
        rủ bạn tới. Làm sai {content.data.regulars.angryStreak} lần liền là họ giận.
      </p>
      {list.length === 0 ? (
        <p className="text-sm text-ink/60">Chưa ai ghé — bán đi rồi sẽ có người quen mặt.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {list.map((r) => (
            <li
              key={r.residentId}
              className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm"
              data-resident={r.residentId}
            >
              <span aria-hidden className="text-lg">
                {r.regular ? "❤️" : "🙂"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{r.name}</span>
                <span className="block truncate text-xs text-ink/60">{r.bio}</span>
              </span>
              <span className="text-xs font-semibold tabular-nums">
                {r.regular ? `${r.visits} lần` : `${r.visits}/${need}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Bảng tuyển người của Anh Tám (KIENTRUC §2): chọn người + ca. Trong ca, mình rời quầy (hay thoát game) thì nhân viên bán
 * thay — theo tay nghề, không tự nhập hàng, lương trả theo giờ từ ví mình.
 */
function StaffBoard() {
  const minute = useGame((s) => s.clock?.minute ?? 0);
  const [view, setView] = useState<StaffView | null>(null);
  // Mặc định chọn ca đang diễn ra (thuê là bán thay được ngay).
  const [shift, setShift] = useState(
    () =>
      content.data.staff.shifts.find((s) => minute >= s.from && minute < s.to && s.id !== "ca_ngay")
        ?.id ??
      content.data.staff.shifts[0]?.id ??
      "",
  );
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void send("staff:view", {}).then((r) => r.ok && setView(r.data));
  }, []);
  useEffect(() => {
    if (view?.employee) setShift(view.employee.shiftId);
  }, [view?.employee]);
  if (!view) return <p className="text-sm text-ink/50">Đang hỏi Anh Tám…</p>;
  const { people, shifts } = content.data.staff;
  const emp = view.employee;
  const person = (id: string) => people.find((p) => p.id === id);
  const act = async (fn: () => Promise<{ ok: boolean; data?: StaffView }>) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r.ok && r.data) setView(r.data);
  };
  const hire = (staffId: string) =>
    act(
      () =>
        send("staff:hire", { staffId, shiftId: shift }) as Promise<{
          ok: boolean;
          data?: StaffView;
        }>,
    );
  const fire = () =>
    act(() => send("staff:fire", {}) as Promise<{ ok: boolean; data?: StaffView }>);
  const hours = (id: string) => {
    const s = shifts.find((x) => x.id === id);
    return s ? (s.to - s.from) / 60 : 0;
  };
  const empShift = emp ? shifts.find((s) => s.id === emp.shiftId) : undefined;
  const onDuty = !!empShift && minute >= empShift.from && minute < empShift.to;
  const picked = shifts.find((s) => s.id === shift);
  const pickedNow = !!picked && minute >= picked.from && minute < picked.to;
  return (
    <section aria-label="Nhân viên" className="mb-3 flex flex-col gap-3">
      <details className="rounded-2xl bg-sun/20 p-3 text-xs" open={!emp} data-staff-guide>
        <summary className="cursor-pointer text-sm font-extrabold">📘 Cách dùng nhân viên</summary>
        <ol className="mt-1.5 flex list-decimal flex-col gap-1 pl-4">
          <li>
            <b>Chọn ca</b> — nhân viên chỉ làm trong giờ ca (cần cả ngày thì chọn{" "}
            <i>Cả ngày 6–22h</i>).
          </li>
          <li>
            <b>Nhập đủ hàng</b> — nhân viên không tự nhập hàng, hết hàng là dọn về. Tới giờ ca mà
            quầy đang đóng thì <b>nhân viên tự mở cửa</b> (trả phí ngày như bạn mở).
          </li>
          <li>
            Trong giờ ca <b>nhân viên đứng bán</b>: bạn đi đâu cũng được (chợ, làm thuê, xe ôm,
            thoát game), hoặc ở lại quầy / trong tiệm xem — muốn tự bán thì bấm <b>🙋 Tôi bán</b>,
            bấm lại để trả quầy cho nhân viên. <b>Đừng đóng quầy</b> giữa ca: đóng rồi thì không ai
            bán.
          </li>
          <li>
            Tiền bán vào ví bạn, lương trừ theo giờ; xem kết quả ở <i>Phiếu ca</i> bên dưới.
          </li>
        </ol>
      </details>
      {emp && empShift && (
        <p
          className={`rounded-xl px-3 py-2 text-xs font-semibold ${onDuty ? "bg-leaf/15 text-leaf" : "bg-red/10 text-red"}`}
          data-staff-status={onDuty ? "on" : "off"}
        >
          {onDuty
            ? `Bây giờ ${formatClock(minute)}: ${person(emp.staffId)?.name} đang trong ca (${empShift.name}) — bạn rời quầy là có người bán thay.`
            : `Bây giờ ${formatClock(minute)}: ${person(emp.staffId)?.name} ngoài giờ làm (${empShift.name}) — rời quầy lúc này thì quầy vắng chủ. Đổi sang ca đang diễn ra nếu cần.`}
        </p>
      )}
      {emp && (
        <div
          className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm"
          data-employee={emp.staffId}
        >
          <span aria-hidden className="text-2xl">
            👩‍🍳
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              {person(emp.staffId)?.name} đang làm cho bạn
            </span>
            <span className="block text-xs text-ink/60">
              {shifts.find((s) => s.id === emp.shiftId)?.name} · từ ngày {emp.hiredDay}
            </span>
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void fire()}
            className="rounded-full bg-ink/10 px-3 py-1.5 text-xs font-semibold text-ink"
          >
            Cho nghỉ
          </button>
        </div>
      )}
      <fieldset>
        <legend className="mb-1 text-xs font-semibold text-ink/70">Ca làm</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {shifts.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={shift === s.id}
              onClick={() => setShift(s.id)}
              className={`rounded-xl px-2 py-2 text-xs font-semibold ${
                shift === s.id ? "bg-ink text-cream" : "bg-white shadow-sm"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </fieldset>
      {picked && !pickedNow && (
        <p className="-mt-1 text-[11px] text-ink/60" data-shift-later>
          ⏰ {picked.name} chưa tới / đã qua giờ — thuê ca này thì {formatClock(picked.from)} nhân
          viên mới vào làm.
        </p>
      )}
      <ul className="flex flex-col gap-1.5">
        {people.map((p) => {
          const mine = emp?.staffId === p.id && emp.shiftId === shift;
          return (
            <li key={p.id} className="rounded-xl bg-white px-3 py-2 shadow-sm" data-staff={p.id}>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{p.name}</span>
                  <span className="block truncate text-xs text-ink/60">{p.bio}</span>
                </span>
                <button
                  type="button"
                  disabled={busy || mine}
                  onClick={() => void hire(p.id)}
                  className="shrink-0 rounded-full bg-red px-3 py-1.5 text-xs font-bold text-cream disabled:opacity-40"
                >
                  {mine ? "Đang làm" : emp ? "Đổi người" : "Thuê"}
                </button>
              </div>
              <p className="mt-1 flex gap-3 text-[11px] text-ink/70 tabular-nums">
                <span>🎯 đúng {Math.round(p.accuracy * 100)}%</span>
                <span>⏱️ {p.serveMinutes} phút/món</span>
                <span>
                  💸 {vndShort(p.wagePerHour)}/giờ · ca {vndShort(p.wagePerHour * hours(shift))}
                </span>
              </p>
            </li>
          );
        })}
      </ul>
      {view.recent.length > 0 && (
        <Section title="Phiếu ca gần đây">
          <ul className="flex flex-col gap-1.5" data-shift-slips>
            {view.recent.map((r) => (
              <li
                key={`${r.day}-${r.fromMinute}-${r.staffId}`}
                className="rounded-xl bg-white px-3 py-2 text-xs shadow-sm"
              >
                <span className="font-semibold">
                  Ngày {r.day} · {person(r.staffId)?.name} · {formatClock(r.fromMinute)}–
                  {formatClock(r.toMinute)}
                </span>
                <span className="mt-0.5 block text-ink/70 tabular-nums">
                  Bán {r.served + r.wrong} món ({r.wrong} sai) · thu {vnd(r.revenue)} · lương{" "}
                  {vnd(r.wages)}
                  {r.lost > 0 ? ` · ${r.lost} khách hụt` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </section>
  );
}
