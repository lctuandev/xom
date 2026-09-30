"use client";

import { content } from "@xom/content";
import type { ReactNode } from "react";
import { type SheetId, useGame } from "../store";

/**
 * Chỉ giao dịch được khi đang đứng ở địa điểm (docs/PLAN.md Phase 1.5).
 * Ở xa thì hiện lời nhắn của người đứng quầy + nút tự đi tới.
 */
export function PlaceGate({
  placeId,
  open,
  children,
}: {
  placeId: string;
  open: SheetId;
  children: ReactNode;
}) {
  const place = content.place(placeId);
  const near = useGame((s) => s.nearPlace === placeId);
  const setGoal = useGame((s) => s.setGoal);
  const openSheet = useGame((s) => s.openSheet);

  return (
    <>
      <div className="mb-3 flex items-start gap-2 rounded-xl bg-sun/20 p-3">
        <span className="text-xl" aria-hidden>
          💬
        </span>
        <p className="text-sm">
          <b>{place.keeper.name}:</b>{" "}
          {near ? place.keeper.greeting : `Ghé ${place.name} nha, ở đây mới có hàng.`}
        </p>
      </div>
      {near ? (
        children
      ) : (
        <button
          type="button"
          onClick={() => {
            setGoal({ kind: "place", id: placeId, open });
            openSheet(null);
          }}
          className="h-11 w-full rounded-xl bg-red font-semibold text-cream"
        >
          🚶 Đi tới {place.name}
        </button>
      )}
    </>
  );
}
