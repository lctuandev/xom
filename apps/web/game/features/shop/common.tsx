"use client";

import type { BusinessView, MeView } from "@xom/shared";
import type { ReactNode } from "react";
import { useGame } from "../../store";
import { FeatureSheet, GoTo } from "../FeatureSheet";
import type { FeatureId } from "../registry";

/**
 * Khung sheet nhóm 🏪 Cửa hàng: chưa có xe hàng thì chỉ đường tới vựa xe; có rồi thì đưa `biz` + `me` cho nội dung.
 * (Bước D — nhiều cửa hàng: thêm `shopId` ở đây, các sheet con không phải sửa.)
 */
export function ShopFeature({
  id,
  children,
}: {
  id: FeatureId;
  children: (biz: BusinessView, me: MeView) => ReactNode;
}) {
  const me = useGame((s) => s.me);
  const biz = me?.business;
  return (
    <FeatureSheet id={id}>
      {me && biz ? (
        children(biz, me)
      ) : (
        <>
          <p className="mb-3 text-sm text-ink/70">
            Chưa có xe hàng. Xe đẩy mua ở vựa xe Ông Sáu, đầu phố phía tây — có xe rồi mới bán được.
          </p>
          <GoTo to="equipment" label="Tới vựa xe Ông Sáu" />
        </>
      )}
    </FeatureSheet>
  );
}

export function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
      <p className={`text-xl font-extrabold tabular-nums ${warn ? "text-red" : ""}`}>{value}</p>
      <p className="text-xs text-ink/60">{label}</p>
    </div>
  );
}
