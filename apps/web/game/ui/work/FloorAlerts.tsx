"use client";

import type { ShiftView } from "@xom/shared";
import { sendWork } from "../../net/socket";

/**
 * Chuyện xảy ra trong quán cần xử lý ngay (docs/USECASES.md UC-W8): khách than chờ lâu → xin lỗi;
 * hai bàn cãi nhau → can ngăn (bưng bê phải đi tới bàn); khách đi ra chưa trả tiền → gọi lại.
 */
export function FloorAlerts({
  shift,
  onCalm,
}: {
  shift: ShiftView;
  onCalm: (dinerId: string, table: number) => void;
}) {
  const alerts: { id: string; text: string; action: string; run: () => void; tone: string }[] = [];
  for (const d of shift.diners) {
    if (d.incident === "dash")
      alerts.push({
        id: d.id,
        text: `🏃 ${d.name} đi ra mà chưa trả tiền!`,
        action: "📢 Gọi lại",
        run: () => void sendWork({ kind: "callback", taskId: d.id }, `diner:${d.id}`),
        tone: "bg-red",
      });
    else if (d.incident === "argue")
      alerts.push({
        id: d.id,
        text: `⚠️ Bàn ${d.table} đang cãi nhau`,
        action: "✋ Can ngăn",
        run: () => onCalm(d.id, d.table),
        tone: "bg-red",
      });
    else if (d.complaining)
      alerts.push({
        id: d.id,
        text: `😠 ${d.name} than chờ lâu`,
        action: "🙏 Xin lỗi",
        run: () => void sendWork({ kind: "sorry", taskId: d.id }, `diner:${d.id}`),
        tone: "bg-ink/85",
      });
  }
  if (alerts.length === 0) return null;
  return (
    <section
      className="pointer-events-auto flex w-full max-w-sm flex-col gap-1"
      aria-label="Chuyện trong quán"
    >
      {alerts.slice(0, 2).map((a) => (
        <div
          key={a.id}
          className={`flex items-center gap-2 rounded-xl py-1.5 pr-1.5 pl-3 text-xs font-semibold text-cream shadow-lg ${a.tone}`}
        >
          <span className="flex-1">{a.text}</span>
          <button
            type="button"
            onClick={a.run}
            className="h-8 shrink-0 rounded-lg bg-cream px-2.5 text-xs font-semibold text-ink"
          >
            {a.action}
          </button>
        </div>
      ))}
    </section>
  );
}
