"use client";

import { content } from "@xom/content";
import type { ReactNode } from "react";
import { type SheetId, useGame } from "../store";
import { Counterpart } from "./Counterpart";

/** Người đứng quầy ở địa điểm (chân dung + lời chào, UC-E5); ở xa thì nhắn ghé tới. */
export function PlaceFace({ placeId, line }: { placeId: string; line?: string }) {
  const place = content.place(placeId);
  const near = useGame((s) => s.nearPlace === placeId);
  return (
    <Counterpart
      model={place.keeper.model}
      name={place.keeper.name}
      anchor={placeId}
      line={line ?? (near ? place.keeper.greeting : `Ghé ${place.name} nha, ở đây mới có hàng.`)}
    />
  );
}

/**
 * Chỉ giao dịch được khi đang đứng ở địa điểm (docs/PLAN.md Phase 1.5).
 * Ở xa thì hiện nút tự đi tới (lời nhắn của người đứng quầy nằm ở PlaceFace).
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

  if (near) return children;
  return (
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
  );
}
