"use client";

import type { RewardView } from "@xom/shared";
import { useState } from "react";
import { vnd } from "../format";
import { send } from "../net/socket";

/** Phần thưởng gọn một dòng: 🎁 +10.000đ · +20 KN. */
export function RewardTag({ reward }: { reward: RewardView }) {
  const parts = [
    reward.money > 0 ? `+${vnd(reward.money)}` : null,
    reward.xp > 0 ? `+${reward.xp} KN` : null,
  ].filter(Boolean);
  if (!parts.length) return null;
  return <span className="text-[11px] font-semibold text-leaf">🎁 {parts.join(" · ")}</span>;
}

/**
 * Nút nhận thưởng thành tựu / nhiệm vụ (góp ý đợt 2): đạt rồi mới bấm được, nhận một lần; server kiểm lại rồi cộng tiền
 * mặt + kinh nghiệm qua sổ cái.
 */
export function ClaimButton({
  kind,
  id,
  done,
  claimed,
  onClaimed,
}: {
  kind: "ach" | "quest";
  id: string;
  done: boolean;
  claimed: boolean;
  onClaimed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  if (claimed)
    return (
      <span className="text-[11px] font-semibold text-ink/50" data-claimed>
        ✓ Đã nhận
      </span>
    );
  if (!done) return null;
  return (
    <button
      type="button"
      disabled={busy}
      data-claim={id}
      onClick={async () => {
        setBusy(true);
        const res = await send("reward:claim", { kind, id });
        setBusy(false);
        if (res.ok) onClaimed();
      }}
      className="h-8 shrink-0 animate-pulse rounded-lg bg-red px-2.5 text-xs font-bold text-cream disabled:opacity-50"
    >
      🎁 Nhận
    </button>
  );
}
