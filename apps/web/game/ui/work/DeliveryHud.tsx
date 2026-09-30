"use client";

import { vnd } from "../../format";
import { sendWork } from "../../net/socket";
import { useGame } from "../../store";
import { addressLabel } from "./DeliveryDesk";

/** Ngoài phố khi đang giao hàng: đơn kế tiếp, nút đi tới, chạy nhanh/chậm (UC-W5). */
export function DeliveryHud() {
  const shift = useGame((s) => s.shift);
  const setGoal = useGame((s) => s.setGoal);
  if (!shift || shift.role !== "giao_hang") return null;
  const next = shift.deliveries.find((d) => d.stage === "picked" || d.stage === "later");
  const settle = shift.deliveries.some((d) =>
    ["delivered", "returning", "refused"].includes(d.stage),
  );
  const unpicked = shift.deliveries.some((d) => d.stage === "shelf");
  const busy = shift.deliveries.some((d) => d.stage === "at_door" || d.stage === "absent");
  return (
    <div className="pointer-events-auto mx-3 mt-2 flex flex-col gap-1.5 rounded-2xl bg-[#1f5fa8] p-2 text-cream shadow-lg">
      {busy ? (
        <p className="text-[13px] font-semibold">📱 Đang giao tận tay khách…</p>
      ) : next ? (
        <div className="flex items-center gap-2">
          <span aria-hidden>📦</span>
          <div className="min-w-0 flex-1 text-[13px] leading-tight">
            <p className="font-semibold">
              <span className="font-mono">{next.code}</span> → {addressLabel(next.addressId)}
            </p>
            <p className="text-xs opacity-80">
              {next.recipient}
              {next.fragile && " · ⚠️ dễ vỡ"}
              {next.cod > 0 ? ` · thu ${vnd(next.cod)}` : " · đã trả"}
              {next.stage === "later" && " · hẹn giao lại"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setGoal({ kind: "address", id: next.addressId })}
            className="h-9 shrink-0 rounded-xl bg-sun px-3 text-sm font-semibold text-ink"
          >
            🛵 Đi tới
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <p className="flex-1 text-[13px] font-semibold">
            {unpicked
              ? "Còn gói chưa soạn ở bưu cục"
              : settle
                ? "Giao xong — về bưu cục nộp tiền"
                : "Về bưu cục nhận đơn mới"}
          </p>
          <button
            type="button"
            onClick={() => setGoal({ kind: "place", id: "buu_cuc" })}
            className="h-9 shrink-0 rounded-xl bg-sun px-3 text-sm font-semibold text-ink"
          >
            📮 Về bưu cục
          </button>
        </div>
      )}
      <div className="flex gap-1.5 text-xs">
        {[false, true].map((fast) => (
          <button
            key={String(fast)}
            type="button"
            aria-pressed={shift.fast === fast}
            onClick={() => void sendWork({ kind: "ride", fast })}
            className="h-8 flex-1 rounded-lg bg-white/15 font-semibold aria-pressed:bg-cream aria-pressed:text-ink"
          >
            {fast ? "🚀 Chạy nhanh" : "🐢 Chạy chậm (hàng dễ vỡ)"}
          </button>
        ))}
      </div>
    </div>
  );
}
