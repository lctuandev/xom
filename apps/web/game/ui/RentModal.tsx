"use client";

import { content } from "@xom/content";
import type { Ack, LandlordEvent, RentView } from "@xom/shared";
import { formatClock } from "@xom/sim";
import { useState } from "react";
import { vnd, vndShort } from "../format";
import { send } from "../net/socket";
import { useGame } from "../store";
import { Counterpart } from "./Counterpart";
import { Modal } from "./Modal";
import { PayPicker, usePayCheck, usePayMethod } from "./PayPicker";

/** "Thứ Tư, ngày 7" — hẹn theo ngày, không theo giờ. */
export const dayLabel = (day: number) => `${content.weekday(day).name}, ngày ${day}`;

const TITLE: Record<LandlordEvent["mood"], string> = {
  remind: "🏠 Chủ nhà tới đòi tiền nhà",
  promised: "🏠 Hôm nay tới hẹn tiền nhà",
  promise: "🗓️ Đã hẹn ngày trả",
  paid: "🏠 Trả đủ tiền nhà",
  late: "⚠️ Trễ tiền nhà",
  evict: "📦 Chủ nhà dẹp tiệm",
};

/**
 * 🏠 Chủ nhà tới (docs/USECASES.md UC-F13): modal chân dung + bong bóng thoại như khung "đứng trước quầy". Đang nợ thì
 * chọn 💵 Trả ngay · 🗓️ Hẹn ngày (phí trễ theo số ngày) · Để sau. Trả / hẹn xong chủ nhà nói câu mới, bấm Đóng.
 */
export function RentModal() {
  const e = useGame((s) => s.landlord);
  const setLandlord = useGame((s) => s.setLandlord);
  if (!e) return null;
  const close = () => setLandlord(null);
  const ll = e.rent.landlord;
  const asking = (e.mood === "remind" || e.mood === "promised") && e.rent.owed > 0;
  return (
    <Modal title={TITLE[e.mood]} onClose={close}>
      <div data-landlord={e.mood} className="flex flex-col gap-2">
        <Counterpart model={ll.model} name={ll.name} tag={ll.tag} line={e.line} />
        {e.mood === "evict" ? (
          <p className="rounded-xl bg-red/10 p-2 text-sm">
            Mất nhà {content.lot(e.rent.lotId).name} và cọc. Đồ nghề đã dọn ra — muốn bán tiếp thì
            chọn chỗ vỉa hè trong <b>Làm ăn</b>, hoặc thuê nhà khác.
          </p>
        ) : (
          <RentPanel
            rent={e.rent}
            actions={asking}
            onDone={() => undefined}
            onLater={asking ? close : undefined}
          />
        )}
        {!asking && (
          <button
            type="button"
            onClick={close}
            className="h-11 rounded-xl bg-ink text-sm font-semibold text-cream"
          >
            Đóng
          </button>
        )}
      </div>
    </Modal>
  );
}

/** Tình hình tiền nhà + nút Trả ngay / Hẹn ngày — dùng trong modal chủ nhà và mục 🏪 Mở tiệm. */
export function RentPanel({
  rent,
  actions = true,
  onDone,
  onLater,
}: {
  rent: RentView;
  actions?: boolean;
  onDone: (r: RentView) => void;
  /** Có thì hiện nút "Để sau". */
  onLater?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const method = usePayMethod((s) => s.method);
  const check = usePayCheck();
  const due = rent.owed + rent.lateFee;
  const payable = check(due);
  // Lỗi đã hiện toast trong send().
  const run = async (p: Promise<Ack<RentView>>) => {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (r.ok) onDone(r.data);
  };
  const rules = content.data.shopSetup.rent;
  return (
    <div className="flex flex-col gap-2" data-rent-owed={rent.owed}>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 rounded-xl bg-white/70 p-2 text-xs tabular-nums">
        <dt className="text-ink/60">Tiền nhà</dt>
        <dd className="m-0 text-right">{vnd(rent.rentPerDay)}/ngày</dd>
        <dt className="text-ink/60">Đã trả tới</dt>
        <dd className="m-0 text-right">{dayLabel(rent.paidDay)}</dd>
        <dt className="text-ink/60">Đang nợ</dt>
        <dd className="m-0 text-right font-bold" data-rent-due>
          {rent.owed > 0 ? `${vnd(rent.owed)} (${rent.owedDays} ngày)` : "Không"}
        </dd>
        {rent.promiseDay !== null && (
          <>
            <dt className="text-ink/60">Hẹn trả</dt>
            <dd className="m-0 text-right" data-rent-promise={rent.promiseDay}>
              {dayLabel(rent.promiseDay)} · phí {vndShort(rent.lateFee)}
            </dd>
          </>
        )}
        <dt className="text-ink/60">Cọc còn</dt>
        <dd className="m-0 text-right">{vnd(rent.depositLeft)}</dd>
        <dt className="text-ink/60">Trễ hạn</dt>
        <dd
          className={`m-0 text-right ${rent.strikes > 0 ? "font-bold text-red" : ""}`}
          data-rent-strikes={rent.strikes}
        >
          {rent.strikes}/{rent.maxStrikes} lần
        </dd>
      </dl>
      <details className="text-[11px] leading-snug text-ink/60">
        <summary className="cursor-pointer font-semibold">ℹ️ Luật tiền nhà</summary>
        Chưa hẹn thì hạn trong ngày là {formatClock(rules.dueMinute)}: quá hạn chủ nhà trừ vào cọc
        kèm phí trễ {rules.lateFeePct}% và trừ 🤝 tin cậy. Hẹn theo <b>ngày</b>: trả lúc nào trong
        ngày hẹn cũng được, qua ngày đó là thất hẹn. Trễ {rent.maxStrikes} lần hoặc cọc không đủ trừ
        thì chủ nhà dẹp tiệm.
      </details>
      {actions && rent.owed > 0 && (
        <>
          <PayPicker />
          <button
            type="button"
            disabled={busy || typeof payable !== "string"}
            onClick={() => void run(send("rent:pay", { pay: method }))}
            className="h-11 rounded-xl bg-leaf text-sm font-bold text-cream disabled:opacity-40"
          >
            💵 Trả ngay · {vnd(due)}
          </button>
          {typeof payable !== "string" && <p className="m-0 text-xs text-red">{payable.error}</p>}
          {rent.promiseOptions.map((o) => (
            <button
              key={o.day}
              type="button"
              disabled={busy}
              onClick={() => void run(send("rent:promise", { day: o.day }))}
              className="h-10 rounded-xl bg-amber-100 text-sm font-semibold disabled:opacity-40"
            >
              🗓️ Hẹn tới {dayLabel(o.day)} · phí trễ {vndShort(o.fee)}
            </button>
          ))}
          {onLater && (
            <button
              type="button"
              disabled={busy}
              onClick={onLater}
              className="h-10 rounded-xl bg-ink/5 text-sm font-semibold"
            >
              Để sau
            </button>
          )}
        </>
      )}
    </div>
  );
}
