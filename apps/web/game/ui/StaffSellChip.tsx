"use client";

import { useState } from "react";
import { send } from "../net/socket";
import { useGame } from "../store";

/**
 * Có nhân viên trong ca mà chủ đang ở quầy / trong tiệm (KIENTRUC §2): chủ không bắt buộc đứng bán — ngồi xem nhân viên bán,
 * hoặc giành tự bán (khách vào bếp của mình). Bấm lại để trả quầy cho nhân viên.
 */
export function StaffSellChip({ className = "" }: { className?: string }) {
  const staff = useGame((s) => s.me?.business?.staff);
  const open = useGame((s) => s.me?.business?.open ?? false);
  const selfSell = useGame((s) => s.me?.business?.selfSell ?? false);
  const [busy, setBusy] = useState(false);
  if (!staff?.onDuty || !open) return null;
  const toggle = async () => {
    setBusy(true);
    await send("biz:selfSell", { on: !selfSell });
    setBusy(false);
  };
  return (
    <div
      className={`pointer-events-auto flex w-full max-w-xs items-center justify-between gap-2 rounded-2xl py-2 pr-2 pl-3 shadow-lg ${
        selfSell ? "bg-ink/85 text-cream" : "bg-leaf/90 text-cream"
      } ${className}`}
      data-staff-selling={selfSell ? "owner" : "staff"}
    >
      <span className="text-xs font-semibold">
        {selfSell
          ? `🙋 Bạn đang tự bán — ${staff.name} phụ dọn dẹp`
          : `👩‍🍳 ${staff.name} đang bán — bạn cứ đứng xem`}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={() => void toggle()}
        className="h-9 shrink-0 rounded-xl bg-cream px-3 text-sm font-semibold text-ink disabled:opacity-50"
      >
        {selfSell ? `Để ${staff.name} bán` : "🙋 Tôi bán"}
      </button>
    </div>
  );
}
