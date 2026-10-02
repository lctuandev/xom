"use client";

import { content } from "@xom/content";
import { useEffect, useMemo, useState } from "react";
import { distanceTo } from "../scene/player";
import { useGame } from "../store";
import { spotFor } from "../world";

/** Dòng nhiệm vụ của kịch bản: việc cần làm, còn bao xa, nút tự đi tới. */
export function Objective() {
  const me = useGame((s) => s.me);
  const dialogue = useGame((s) => s.dialogue);
  const nearPlace = useGame((s) => s.nearPlace);
  const atStall = useGame((s) => s.atStall);
  const setGoal = useGame((s) => s.setGoal);
  const delivering = useGame((s) => s.shift?.role === "giao_hang");
  const openSheet = useGame((s) => s.openSheet);
  const [dist, setDist] = useState<number | null>(null);

  const step = me ? content.stepById.get(me.tutorial) : undefined;
  const target = step?.target;
  const lotId = me?.business?.lotId;
  // biome-ignore lint/correctness/useExhaustiveDependencies: vị trí chỉ đổi theo mục tiêu và chỗ bán
  const spot = useMemo(() => (target ? spotFor(target, me) : null), [target, lotId]);

  useEffect(() => {
    if (!spot) {
      setDist(null);
      return;
    }
    const id = setInterval(() => setDist(distanceTo(spot.x, spot.z)), 300);
    return () => clearInterval(id);
  }, [spot]);

  // Đang chạy đơn thì bảng giao hàng thay chỗ dòng nhiệm vụ (đỡ chồng hai bảng trên màn hình nhỏ).
  if (!step?.objective || dialogue || delivering) return null;
  const arrived = target === "stall" ? atStall : !!target && nearPlace === target;

  return (
    <div
      data-objective
      className="pointer-events-auto mx-3 mt-2 flex items-center gap-2 rounded-2xl bg-ink/85 py-2 pr-2 pl-3 text-cream shadow-lg"
    >
      <span aria-hidden>🎯</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-tight font-semibold">{step.objective}</p>
        {dist !== null && !arrived && (
          <p className="text-xs opacity-70">còn {Math.round(dist)} m</p>
        )}
      </div>
      {target && spot && !arrived && (
        <button
          type="button"
          onClick={() =>
            setGoal(target === "stall" ? { kind: "stall" } : { kind: "place", id: target })
          }
          className="h-9 shrink-0 rounded-xl bg-sun px-3 text-sm font-semibold text-ink"
        >
          🚶 Đi tới
        </button>
      )}
      {!target && (
        <button
          type="button"
          onClick={() => openSheet(step.until === "has_lot" ? "lot" : "stall")}
          className="h-9 shrink-0 rounded-xl bg-sun px-3 text-sm font-semibold text-ink"
        >
          Mở
        </button>
      )}
    </div>
  );
}
