"use client";

import { content } from "@xom/content";
import { useEffect, useState } from "react";
import { send } from "../net/socket";
import { useGame } from "../store";
import { sheetForPlace } from "../world";

/**
 * Hành động theo ngữ cảnh, ngay trên thanh điều hướng (vùng ngón cái):
 * bưng cơm khi làm thuê → đưa hàng cho khách → quầy vắng chủ → vào địa điểm đang đứng gần.
 */
export function ActionBar() {
  const sheet = useGame((s) => s.sheet);
  const dialogue = useGame((s) => s.dialogue);
  if (sheet || dialogue) return null;
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(var(--nav-h)+0.5rem)] z-20 flex flex-col items-center gap-2">
      <JobTaskButton />
      <ServeButton />
      <AwayChip />
      <OpenStallButton />
      <PlaceButton />
    </div>
  );
}

/** Thanh đếm ngược cho việc cần làm kịp. */
function useCountdown(expiresAt: number | undefined, windowMs: number) {
  const [left, setLeft] = useState(1);
  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setLeft(Math.max(0, (expiresAt - Date.now()) / windowMs)), 100);
    return () => clearInterval(id);
  }, [expiresAt, windowMs]);
  return left;
}

function Countdown({ left }: { left: number }) {
  return (
    <span className="absolute inset-x-3 bottom-1 h-1 overflow-hidden rounded-full bg-black/15">
      <span className="block h-full rounded-full bg-cream" style={{ width: `${left * 100}%` }} />
    </span>
  );
}

function ServeButton() {
  const orders = useGame((s) => s.orders);
  const atStall = useGame((s) => s.atStall);
  const oldest = orders[0];
  const left = useCountdown(oldest?.expiresAt, content.economy.serveWindowMs);
  const [busy, setBusy] = useState(false);
  if (!oldest || !atStall) return null;
  const product = content.product(oldest.productId);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await send("order:serve", { orderId: oldest.orderId });
        const g = useGame.getState();
        g.removeOrder(oldest.orderId);
        if (res.ok) g.countServed();
        setBusy(false);
      }}
      className="pointer-events-auto relative h-12 w-full max-w-xs rounded-2xl bg-leaf px-4 font-semibold text-cream shadow-lg active:scale-[0.97]"
    >
      🤲 Đưa {product.emoji}×{oldest.qty}
      {orders.length > 1 && <span className="ml-1 opacity-80">· {orders.length} khách chờ</span>}
      <Countdown left={left} />
    </button>
  );
}

function JobTaskButton() {
  const task = useGame((s) => s.jobTask);
  const left = useCountdown(task?.expiresAt, content.economy.serveWindowMs);
  if (!task || left <= 0) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        const g = useGame.getState();
        g.setJobTask(null);
        const res = await send("job:task", { taskId: task.id });
        if (res.ok) {
          g.countJobTask();
          g.toast({
            kind: "good",
            text: `Làm tốt! +${content.economy.jobTaskBonus.toLocaleString("vi-VN")}đ`,
          });
        }
      }}
      className="pointer-events-auto relative w-full max-w-xs rounded-2xl bg-sun px-4 py-2.5 text-left shadow-lg active:scale-[0.97]"
    >
      <span className="block text-xs font-semibold opacity-70">🍚 Bưng ra ngay</span>
      <span className="block text-sm font-extrabold">{task.text}</span>
      <Countdown left={left} />
    </button>
  );
}

function AwayChip() {
  const open = useGame((s) => s.me?.business?.open ?? false);
  const atStall = useGame((s) => s.atStall);
  const setGoal = useGame((s) => s.setGoal);
  if (!open || atStall) return null;
  return (
    <div className="pointer-events-auto flex w-full max-w-xs items-center justify-between gap-2 rounded-2xl bg-ink/85 py-2 pr-2 pl-3 text-cream shadow-lg">
      <span className="text-xs font-semibold">Quầy vắng chủ — khách không mua được</span>
      <button
        type="button"
        onClick={() => setGoal({ kind: "stall" })}
        className="h-9 shrink-0 rounded-xl bg-cream px-3 text-sm font-semibold text-ink"
      >
        Về quầy
      </button>
    </div>
  );
}

function PlaceButton() {
  const nearPlace = useGame((s) => s.nearPlace);
  const openSheet = useGame((s) => s.openSheet);
  if (!nearPlace) return null;
  const place = content.place(nearPlace);
  return (
    <button
      type="button"
      onClick={() => openSheet(sheetForPlace(nearPlace))}
      className="pointer-events-auto h-11 w-full max-w-xs rounded-2xl bg-red px-4 text-sm font-semibold text-cream shadow-lg active:scale-[0.97]"
    >
      {place.action} · {place.keeper.name}
    </button>
  );
}

/** Đứng ở quầy mà quầy đang đóng: mở hàng ngay tại chỗ. */
function OpenStallButton() {
  const atStall = useGame((s) => s.atStall);
  const biz = useGame((s) => s.me?.business);
  const [busy, setBusy] = useState(false);
  if (!atStall || !biz || biz.open) return null;
  const rent = biz.lotId && !biz.rentPaidToday ? content.lot(biz.lotId).rentPerDay : 0;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await send("biz:open", {});
        setBusy(false);
      }}
      className="pointer-events-auto h-11 w-full max-w-xs rounded-2xl bg-leaf px-4 text-sm font-semibold text-cream shadow-lg active:scale-[0.97]"
    >
      🔓 Mở quầy{rent ? ` · thuê chỗ ${Math.round(rent / 1000)}k` : ""}
    </button>
  );
}
