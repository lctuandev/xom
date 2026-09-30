"use client";

import { useGame } from "../store";
import { EquipmentPicker } from "./EquipmentPicker";
import { PlaceGate } from "./PlaceGate";
import { Sheet } from "./Sheet";

/** Vựa xe Ông Sáu: nơi duy nhất mua / đổi xe hàng. */
export function EquipmentSheet() {
  const close = useGame((s) => s.openSheet);
  const toast = useGame((s) => s.toast);
  return (
    <Sheet title="Vựa xe Ông Sáu" onClose={() => close(null)}>
      <PlaceGate placeId="vua_xe" open="equipment">
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
