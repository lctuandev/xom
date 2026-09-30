"use client";

import { content } from "@xom/content";
import type { BusinessView } from "@xom/shared";
import { priceScore } from "@xom/sim";
import { useEffect, useRef, useState } from "react";
import { stars, vnd, vndShort } from "../format";
import { send } from "../net/socket";
import { useGame } from "../store";
import { EquipmentPicker } from "./EquipmentPicker";
import { Section, Sheet, Stepper } from "./Sheet";

export function BusinessSheet() {
  const me = useGame((s) => s.me);
  const close = useGame((s) => s.openSheet);
  const [changing, setChanging] = useState(false);
  const biz = me?.business;

  if (!biz || changing) {
    return (
      <Sheet title={biz ? "Đổi nghề" : "Chọn nghề"} onClose={() => close(null)}>
        {biz && (
          <button
            type="button"
            onClick={() => setChanging(false)}
            className="mb-3 h-11 font-semibold text-red"
          >
            ← Quay lại quầy
          </button>
        )}
        <EquipmentPicker onDone={() => setChanging(false)} />
      </Sheet>
    );
  }

  const product = content.product(biz.productId);
  const equipment = content.equipment(biz.equipmentId);
  const stock = me.inventory.find((i) => i.productId === biz.productId)?.qty ?? 0;

  return (
    <Sheet title={`${product.emoji} ${equipment.name}`} onClose={() => close(null)}>
      <div className="mb-5 flex items-center justify-between">
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

      <Section title="Giá bán">
        <PriceControl biz={biz} />
      </Section>

      <Section title="Chỗ bán">
        <LotPicker biz={biz} />
      </Section>

      <Section title="Hàng trong kho">
        <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm">
          <div>
            <p className="text-2xl font-extrabold tabular-nums">{stock}</p>
            <p className="text-sm text-ink/60">
              {product.name}
              {content.template(product.template).perishable && " · hỏng cuối ngày"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => close("market")}
            className="h-12 rounded-xl bg-sun px-5 font-semibold"
          >
            Ra chợ
          </button>
        </div>
      </Section>

      <Section title="Hôm nay">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Đã bán" value={String(me.today.sold)} />
          <Stat label="Doanh thu" value={vndShort(me.today.revenue)} />
          <Stat label="Khách hụt" value={String(me.today.lost)} warn={me.today.lost > 0} />
        </div>
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
  const lot = biz.lotId ? content.lot(biz.lotId) : null;
  const rentDue = !biz.open && lot && !biz.rentPaidToday ? lot.rentPerDay : 0;
  const cantPay = rentDue > money;
  const hint = working
    ? "Đang đi làm thuê — nghỉ việc để mở quầy"
    : !lot
      ? "Chọn chỗ bán bên dưới trước"
      : stock === 0
        ? "Chưa có hàng — ra chợ nhập trước"
        : cantPay
          ? `Không đủ ${vnd(rentDue)} tiền thuê chỗ — chọn chỗ rẻ hơn hoặc đi làm thuê kiếm thêm`
          : rentDue
            ? `Tiền thuê chỗ hôm nay: ${vnd(rentDue)} (trả một lần/ngày)`
            : null;
  return (
    <div className="mb-5">
      <button
        type="button"
        disabled={busy || (!biz.open && (working || !lot || stock === 0 || cantPay))}
        onClick={async () => {
          setBusy(true);
          await send(biz.open ? "biz:close" : "biz:open", {});
          setBusy(false);
        }}
        className={`h-14 w-full rounded-2xl text-lg font-semibold active:scale-[0.98] disabled:opacity-40 ${
          biz.open ? "bg-ink/10" : "bg-leaf text-cream"
        }`}
      >
        {busy ? "…" : biz.open ? "Đóng quầy" : "Mở quầy bán"}
      </button>
      {hint && <p className="mt-2 text-center text-sm text-ink/60">{hint}</p>}
    </div>
  );
}

/** Đổi giá tại chỗ, gửi lên server sau khi ngừng bấm 400ms. */
function PriceControl({ biz }: { biz: BusinessView }) {
  const product = content.product(biz.productId);
  const [price, setPrice] = useState(biz.price);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => setPrice(biz.price), [biz.price]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const change = (v: number) => {
    setPrice(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void send("biz:update", { price: v }), 400);
  };

  const score = priceScore(price, product.refPrice);
  const verdict =
    price < product.refPrice * 0.85
      ? { text: "Rẻ — đông khách, lãi mỏng", cls: "text-leaf" }
      : score >= 0.95
        ? { text: "Hợp lý", cls: "text-leaf" }
        : score >= 0.7
          ? { text: "Hơi đắt — khách bớt hài lòng", cls: "text-sun" }
          : { text: "Đắt — khách bỏ đi, mất uy tín", cls: "text-red" };

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <Stepper
        label="giá bán"
        value={price}
        onChange={change}
        step={1_000}
        min={1_000}
        max={product.refPrice * 4}
        format={vnd}
      />
      <p className={`mt-2 text-center text-sm font-semibold ${verdict.cls}`}>{verdict.text}</p>
      <p className="text-center text-xs text-ink/50">
        Khách thấy hợp lý khoảng {vnd(product.refPrice)} · lãi {vnd(price - product.unitCost)}/phần
        theo giá nhập gốc
      </p>
    </div>
  );
}

function LotPicker({ biz }: { biz: BusinessView }) {
  const world = useGame((s) => s.world);
  const [open, setOpen] = useState(biz.lotId === null);
  const current = biz.lotId ? content.lot(biz.lotId) : null;

  if (!open && current) {
    return (
      <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm">
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
        return (
          <li key={lot.id}>
            <button
              type="button"
              disabled={!!taken}
              aria-pressed={selected}
              onClick={async () => {
                const res = await send("biz:update", { lotId: lot.id });
                if (res.ok) setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white p-4 text-left shadow-sm aria-pressed:ring-2 aria-pressed:ring-red disabled:opacity-40"
            >
              <span className="min-w-0">
                <span className="block font-extrabold">{lot.name}</span>
                <span className="block text-sm text-ink/60">
                  {taken ? `${taken.ownerName} đang dùng` : lot.hint}
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
