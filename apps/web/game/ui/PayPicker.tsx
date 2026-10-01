"use client";

import { content } from "@xom/content";
import type { PayMethod } from "@xom/shared";
import { choosePayment, type PaySource } from "@xom/sim";
import { create } from "zustand";
import { vndShort } from "../format";
import { useGame } from "../store";

const KEY = "xom:pay";

function load(): PayMethod {
  try {
    const v = localStorage.getItem(KEY);
    return v === "cash" || v === "bank" ? v : "auto";
  } catch {
    return "auto";
  }
}

/** Cách trả tiền người chơi chọn lần gần nhất (tiện ích riêng từng máy, mất cũng không sao). */
export const usePayMethod = create<{ method: PayMethod; set: (m: PayMethod) => void }>((set) => ({
  method: typeof window === "undefined" ? "auto" : load(),
  set: (method) => {
    try {
      localStorage.setItem(KEY, method);
    } catch {}
    set({ method });
  },
}));

/** Trả được khoản này không, bằng ví nào (cùng luật với server — `choosePayment` trong sim). */
export function usePayCheck(): (
  amount: number,
  cashOnly?: boolean,
) => PaySource | { error: string } {
  const cash = useGame((s) => s.me?.money ?? 0);
  const bank = useGame((s) => s.me?.bank ?? 0);
  const method = usePayMethod((s) => s.method);
  return (amount, cashOnly = false) =>
    choosePayment({
      amount,
      cash,
      bank,
      method: cashOnly && method === "bank" ? "auto" : method,
      cashOnly,
      cashFirstBelow: content.economy.bank.cashFirstBelow,
    });
}

const OPTIONS: { id: PayMethod; label: string }[] = [
  { id: "auto", label: "Tự chọn" },
  { id: "cash", label: "💵 Tiền mặt" },
  { id: "bank", label: "🏦 Chuyển khoản" },
];

/**
 * Chọn cách trả (DESIGN §2): tự chọn (lặt vặt trả tiền mặt, khoản lớn chuyển khoản) · 💵 · 🏦.
 * Sạp chỉ nhận tiền mặt thì khoá ô chuyển khoản.
 */
export function PayPicker({ cashOnly = false }: { cashOnly?: boolean }) {
  const method = usePayMethod((s) => s.method);
  const setMethod = usePayMethod((s) => s.set);
  const cash = useGame((s) => s.me?.money ?? 0);
  const bank = useGame((s) => s.me?.bank ?? 0);
  const current = cashOnly && method === "bank" ? "auto" : method;
  return (
    <fieldset className="mb-3" data-pay={current}>
      <legend className="mb-1 text-xs font-semibold text-ink/60">
        Trả bằng · 💵 {vndShort(cash)} · 🏦 {vndShort(bank)}
        {cashOnly && " · sạp chỉ nhận tiền mặt"}
      </legend>
      <div className="flex gap-1.5">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={current === o.id}
            disabled={cashOnly && o.id === "bank"}
            onClick={() => setMethod(o.id)}
            className="h-9 flex-1 rounded-xl bg-white text-xs font-semibold shadow-sm aria-pressed:bg-ink aria-pressed:text-cream disabled:opacity-30"
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
