"use client";

import { content } from "@xom/content";
import type { DeliveryTaskView, ShiftView } from "@xom/shared";
import { useState } from "react";
import { vnd } from "../../format";
import { sendWork } from "../../net/socket";
import { useGame } from "../../store";

const STAGE: Record<DeliveryTaskView["stage"], string> = {
  shelf: "Chưa soạn",
  picked: "Đã lên xe",
  at_door: "Đang giao",
  absent: "Khách vắng",
  later: "Hẹn giao lại",
  refused: "Khách từ chối",
  delivered: "Đã giao",
  returning: "Hoàn về",
};

export const addressLabel = (id: string) =>
  content.data.delivery.addresses.find((a) => a.id === id)?.label ?? id;

/** Phiếu giao: mã, người nhận, địa chỉ, hàng, thu hộ. */
export function DeliveryTicket({ d, compact = false }: { d: DeliveryTaskView; compact?: boolean }) {
  return (
    <div className="rounded-xl bg-white p-2.5 text-xs shadow-sm">
      <div className="flex items-center justify-between">
        <b className="font-mono text-sm">{d.code}</b>
        <span className="rounded-full bg-ink/5 px-2 py-0.5 font-semibold">{STAGE[d.stage]}</span>
      </div>
      <p className="mt-0.5 font-semibold">
        {d.recipient} · {addressLabel(d.addressId)}
      </p>
      {!compact && (
        <p className="text-ink/60">
          {d.item}
          {d.fragile && " · ⚠️ dễ vỡ"}
          {d.cod > 0 ? ` · thu hộ ${vnd(d.cod)}` : " · đã trả trước"}
        </p>
      )}
    </div>
  );
}

/** Bưu cục (UC-W5): nhận đơn → soạn đúng gói trên kệ → ra xe → về nộp tiền COD & hàng hoàn. */
export function DeliveryDesk({
  shift,
  onPick,
}: {
  shift: ShiftView;
  onPick: (code: string) => void;
}) {
  const setInside = useGame((s) => s.setInside);
  const [busy, setBusy] = useState(false);
  const orders = shift.deliveries;
  const toPick = orders.find((d) => d.stage === "shelf");
  const toDeliver = orders.filter((d) => d.stage === "picked" || d.stage === "later");
  const toSettle = orders.filter(
    (d) => d.stage === "delivered" || d.stage === "returning" || d.stage === "refused",
  );
  const act = async (a: Parameters<typeof sendWork>[0]) => {
    setBusy(true);
    await sendWork(a, "buu_cuc");
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-2">
      {orders.length === 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => act({ kind: "take" })}
          className="h-12 rounded-2xl bg-sun font-semibold"
        >
          📋 Nhận đơn giao
        </button>
      )}
      {toPick && (
        <div className="rounded-2xl bg-sun/20 p-2.5">
          <p className="mb-1.5 text-sm font-extrabold">
            Tìm gói <span className="font-mono">{toPick.code}</span> trên kệ
          </p>
          <fieldset
            className="grid grid-cols-3 gap-1.5 m-0 min-w-0 border-0 p-0"
            aria-label="Kệ hàng"
          >
            {toPick.shelf.map((code) => (
              <button
                key={code}
                type="button"
                disabled={busy}
                onClick={() => onPick(code)}
                className="h-10 rounded-lg bg-white font-mono text-xs font-semibold shadow-sm active:scale-95"
              >
                📦 {code}
              </button>
            ))}
          </fieldset>
        </div>
      )}
      {orders.length > 0 && (
        <div className="flex max-h-44 flex-col gap-1.5 overflow-y-auto">
          {orders.map((d) => (
            <DeliveryTicket key={d.id} d={d} />
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {toSettle.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act({ kind: "settle" })}
            className="h-11 rounded-xl bg-leaf font-semibold text-cream"
          >
            💵 Nộp tiền & hàng
          </button>
        )}
        {!toPick && toDeliver.length > 0 && (
          <button
            type="button"
            onClick={() => setInside(null)}
            className="h-11 rounded-xl bg-red font-semibold text-cream"
          >
            🛵 Ra xe đi giao
          </button>
        )}
        {orders.length > 0 && !toPick && toDeliver.length === 0 && toSettle.length === 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act({ kind: "take" })}
            className="h-11 rounded-xl bg-sun font-semibold"
          >
            📋 Nhận thêm đơn
          </button>
        )}
      </div>
    </div>
  );
}
