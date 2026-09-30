"use client";

import { useState } from "react";
import { vnd } from "../../format";

const DENOMS = [1_000, 2_000, 5_000, 10_000, 20_000, 50_000];

/**
 * Thối tiền (UC-F7, W3, W5): khách đưa tờ `bill` cho khoản `due`; ghép các tờ tiền lẻ để thối.
 * Không hiện đáp án sẵn — có nút "Tính giúp" cho ai cần.
 */
export function CashChange({
  bill,
  due,
  busy,
  onDone,
  label = "Thối",
}: {
  bill: number;
  due: number;
  busy?: boolean;
  onDone: (change: number) => void;
  label?: string;
}) {
  const [change, setChange] = useState<number[]>([]);
  const [hint, setHint] = useState(false);
  const total = change.reduce((a, b) => a + b, 0);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-center text-sm">
        💵 Khách đưa tờ <b className="tabular-nums">{vnd(bill)}</b>. Thối lại bao nhiêu?
      </p>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl bg-ink/5 p-2">
        {change.length === 0 ? (
          <span className="text-sm text-ink/50">Chạm tờ tiền bên dưới để thối</span>
        ) : (
          change.map((d, i) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: xấp tiền thối, thứ tự không đổi
              key={i}
              type="button"
              onClick={() => setChange((c) => c.filter((_, j) => j !== i))}
              className="rounded-md bg-leaf/20 px-2 py-1 text-xs font-semibold tabular-nums"
            >
              {d / 1000}k ✕
            </button>
          ))
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {DENOMS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setChange((c) => [...c, d])}
            className="h-10 rounded-xl bg-white font-semibold tabular-nums shadow-sm active:scale-95"
          >
            {d / 1000}.000đ
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => onDone(total)}
        className="h-11 rounded-2xl bg-leaf text-base font-semibold text-cream disabled:opacity-50"
      >
        {label} {vnd(total)} ✓
      </button>
      <button
        type="button"
        onClick={() => setHint((h) => !h)}
        className="h-8 text-xs font-semibold text-ink/50"
      >
        {hint ? `Cần thối ${vnd(bill - due)}` : "💡 Tính giúp"}
      </button>
    </div>
  );
}
