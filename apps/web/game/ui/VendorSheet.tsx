"use client";

import { content } from "@xom/content";
import { formatClock } from "@xom/sim";
import { useState } from "react";
import { vnd } from "../format";
import { walkTo } from "../nav";
import { send } from "../net/socket";
import { getPlayer } from "../scene/player";
import { useGame } from "../store";
import { vendorOpen, vendorSeats } from "../world";
import { PayPicker, usePayCheck, usePayMethod } from "./PayPicker";
import { Sheet } from "./Sheet";

/** Thời gian ngồi ăn (ms thật). */
const EAT_MS = 8000;

/** Sạp đồ ăn đang đứng trước (UC-B9, B10): chọn món, trả tiền, rồi ra ghế nhựa ngồi ăn. */
export function VendorSheet() {
  const id = useGame((s) => s.nearVendor);
  const close = useGame((s) => s.openSheet);
  const [busy, setBusy] = useState(false);
  const check = usePayCheck();
  const pay = usePayMethod((s) => s.method);
  const v = content.data.vendors.find((x) => x.id === id);
  if (!v) return null;

  const buy = async (itemId: string) => {
    setBusy(true);
    const res = await send("vendor:buy", {
      vendorId: v.id,
      itemId,
      pay: v.cashOnly && pay === "bank" ? "auto" : pay,
    });
    setBusy(false);
    if (!res.ok) return;
    close(null);
    // Ra ghế trống cuối hàng ngồi ăn.
    const seat = vendorSeats(v.id).at(-1);
    const game = useGame.getState();
    if (seat) walkTo(getPlayer(), seat.x, seat.z, seat.yaw);
    game.setEating({ vendorId: v.id, until: Date.now() + EAT_MS });
    game.toast({ kind: "good", text: "Ngồi xuống ăn thôi! 😋" });
  };

  return (
    <Sheet title={v.sign} onClose={() => close(null)}>
      <p className="mb-2 text-sm text-ink/60">
        {v.name} bán từ {formatClock(v.open)} tới {formatClock(v.close)} · ăn tại chỗ, ghế nhựa có
        sẵn.
      </p>
      <PayPicker cashOnly={v.cashOnly} />
      <ul className="flex flex-col gap-1.5">
        {v.items.map((i) => (
          <li
            key={i.id}
            className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm"
          >
            <span className="text-2xl" aria-hidden>
              {i.emoji}
            </span>
            <span className="flex-1 font-semibold">{i.name}</span>
            <span className="text-sm tabular-nums">{vnd(i.price)}</span>
            <button
              type="button"
              disabled={busy || typeof check(i.price, v.cashOnly) !== "string"}
              onClick={() => buy(i.id)}
              className="h-10 rounded-xl bg-red px-3 text-sm font-semibold text-cream disabled:opacity-40"
            >
              Mua
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/** Danh sách quán ăn quanh xóm: sạp nào đang bày, mấy giờ mở; chạm để đi tới (UC-B9). */
export function FoodSheet() {
  const minute = useGame((s) => s.clock?.minute ?? 0);
  const close = useGame((s) => s.openSheet);
  const setGoal = useGame((s) => s.setGoal);
  const list = [...content.data.vendors].sort(
    (a, b) =>
      Number(vendorOpen(b.id, minute)) - Number(vendorOpen(a.id, minute)) || a.open - b.open,
  );
  return (
    <Sheet title="Quán ăn quanh xóm" onClose={() => close(null)}>
      <ul className="flex flex-col gap-1.5">
        {list.map((v) => {
          const open = vendorOpen(v.id, minute);
          return (
            <li
              key={v.id}
              className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm"
            >
              <span className="text-xl" aria-hidden>
                {v.items[0]?.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold">{v.sign}</p>
                <p className="text-xs text-ink/60">
                  {open
                    ? `Đang bày · dọn lúc ${formatClock(v.close)}`
                    : `Mở ${formatClock(v.open)}–${formatClock(v.close)}`}
                </p>
              </div>
              <button
                type="button"
                disabled={!open}
                aria-label={`Đi tới ${v.sign}`}
                onClick={() => {
                  close(null);
                  setGoal({ kind: "vendor", id: v.id, open: "vendor" });
                }}
                className="h-9 shrink-0 rounded-xl bg-leaf px-3 text-sm font-semibold text-cream disabled:opacity-30"
              >
                🚶 Đi tới
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
