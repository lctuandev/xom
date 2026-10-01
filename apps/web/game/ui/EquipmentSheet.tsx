"use client";

import { content } from "@xom/content";
import { repairCost } from "@xom/sim";
import { useState } from "react";
import { vnd } from "../format";
import { send } from "../net/socket";
import { useGame } from "../store";
import { EquipmentPicker } from "./EquipmentPicker";
import { usePayMethod } from "./PayPicker";
import { PlaceGate } from "./PlaceGate";
import { Sheet } from "./Sheet";

/** Vựa xe Ông Sáu: nơi duy nhất mua / đổi xe hàng. */
export function EquipmentSheet() {
  const close = useGame((s) => s.openSheet);
  const toast = useGame((s) => s.toast);
  return (
    <Sheet title="Vựa xe Ông Sáu" onClose={() => close(null)}>
      <PlaceGate placeId="vua_xe" open="equipment">
        <RepairBox />
        <EquipmentPicker
          onDone={() => {
            // Về bản đồ để thấy bước tiếp theo (dòng nhiệm vụ / lời dặn của Chú Bảy).
            close(null);
            toast({ kind: "good", text: "Có xe rồi! Giờ ra chợ nhập hàng nào." });
          }}
        />
      </PlaceGate>
    </Sheet>
  );
}

/** Sửa xe đang dùng (Luật 2.2): tiền sửa theo độ mòn. */
function RepairBox() {
  const biz = useGame((s) => s.me?.business);
  const [busy, setBusy] = useState(false);
  if (!biz) return null;
  const cost = repairCost(
    content.equipment(biz.equipmentId).price,
    biz.wear,
    content.economy.maintenance,
  );
  if (cost <= 0) return null;
  return (
    <section aria-label="Sửa xe" className="mb-3 rounded-2xl bg-white p-3 shadow-sm">
      <p className="text-sm">
        🔧 Xe của con mòn {Math.round(biz.wear * 100)}% — sửa hết <b>{vnd(cost)}</b>.
      </p>
      <button
        type="button"
        disabled={busy || biz.open}
        onClick={async () => {
          setBusy(true);
          await send("biz:repair", { pay: usePayMethod.getState().method });
          setBusy(false);
        }}
        className="mt-2 h-11 w-full rounded-xl bg-sun font-semibold disabled:opacity-40"
      >
        {biz.open ? "Đóng quầy rồi mới đem xe đi sửa" : `🔧 Sửa xe · ${vnd(cost)}`}
      </button>
    </section>
  );
}
