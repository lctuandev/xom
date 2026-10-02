"use client";

import { useGame } from "../../store";
import { Liquidate } from "../../ui/MarketSheet";
import { PlaceFace, PlaceGate } from "../../ui/PlaceGate";
import { FeatureSheet } from "../FeatureSheet";

/** ♻️ Thanh lý hàng tồn: Bà Năm mua lại theo giá thu hồi (phải đứng ở chợ). */
export function LiquidateSheet() {
  const left = useGame((s) => s.me?.inventory.filter((i) => i.qty > 0).length ?? 0);
  return (
    <FeatureSheet id="liquidate" face={<PlaceFace placeId="cho_dau_moi" />}>
      <PlaceGate placeId="cho_dau_moi" open="liquidate">
        {left ? (
          <Liquidate />
        ) : (
          <p className="text-sm text-ink/60">Không còn hàng tồn nào để thanh lý.</p>
        )}
      </PlaceGate>
    </FeatureSheet>
  );
}
