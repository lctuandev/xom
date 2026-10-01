"use client";

import { content } from "@xom/content";
import { useState } from "react";
import { vnd } from "../format";
import { send } from "../net/socket";
import { useGame } from "../store";
import { Sheet } from "./Sheet";

// Cây ATM (docs/USECASES.md UC-I6, DESIGN §2): 💵 tiền mặt ↔ 🏦 tài khoản. Khách chuyển khoản thì tiền vào tài khoản;
// muốn có tiền mặt đi chợ, trả tiền thuê… thì ra đây rút. Lãi rất nhỏ, có trần.

const CHIPS = [50_000, 100_000, 200_000, 500_000];

export function AtmSheet() {
  const me = useGame((s) => s.me);
  const atmId = useGame((s) => s.nearAtm);
  const close = useGame((s) => s.openSheet);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const bank = content.economy.bank;
  const act = async (action: "deposit" | "withdraw", amount: number) => {
    if (!atmId) return;
    setBusy(true);
    const res = await send("atm:use", { atmId, action, amount });
    setBusy(false);
    if (res.ok)
      useGame.getState().toast({
        kind: "good",
        text: action === "deposit" ? `🏦 Đã gửi ${vnd(amount)}` : `💵 Đã rút ${vnd(amount)}`,
      });
  };
  const roundDown = (n: number, step: number) => Math.floor(n / step) * step;
  return (
    <Sheet title="🏧 Cây ATM" onClose={() => close(null)}>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-white p-3 shadow-sm">
          <p className="text-xs text-ink/60">💵 Tiền mặt</p>
          <p className="text-lg font-extrabold tabular-nums" data-cash={me.money}>
            {vnd(me.money)}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-3 shadow-sm">
          <p className="text-xs text-ink/60">🏦 Tài khoản</p>
          <p className="text-lg font-extrabold tabular-nums" data-bank={me.bank}>
            {vnd(me.bank)}
          </p>
        </div>
      </div>
      {!atmId && (
        <p className="mb-3 rounded-xl bg-sun/30 p-2 text-sm">Tới tận cây ATM mới rút/gửi được.</p>
      )}
      {(["withdraw", "deposit"] as const).map((action) => {
        const max =
          action === "withdraw"
            ? roundDown(me.bank, bank.withdrawStep)
            : roundDown(me.money, bank.depositStep);
        return (
          <section
            key={action}
            aria-label={action === "withdraw" ? "Rút tiền" : "Gửi tiền"}
            className="mb-3"
          >
            <p className="mb-1.5 text-sm font-extrabold">
              {action === "withdraw" ? "💵 Rút tiền mặt" : "🏦 Gửi vào tài khoản"}
            </p>
            {max <= 0 && (
              <p className="text-sm text-ink/60">
                {action === "withdraw" ? "Tài khoản đang trống." : "Hết tiền mặt để gửi."}
              </p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {(max > 0 ? [...CHIPS.filter((c) => c < max).slice(0, 2), max] : []).map(
                (amount, i, list) => (
                  <button
                    // biome-ignore lint/suspicious/noArrayIndexKey: số tiền có thể trùng khi max nhỏ
                    key={`${amount}-${i}`}
                    type="button"
                    disabled={busy || !atmId || amount <= 0}
                    onClick={() => act(action, amount)}
                    className="h-11 rounded-xl bg-white text-sm font-semibold shadow-sm disabled:opacity-40"
                  >
                    {i === list.length - 1 && list.length > 1 ? "Tất cả" : ""} {vnd(amount)}
                  </button>
                ),
              )}
            </div>
          </section>
        );
      })}
      <p className="text-xs text-ink/60">
        Khách chuyển khoản → tiền vào tài khoản. Lãi{" "}
        {(bank.interestRate * 100).toLocaleString("vi-VN")}%/ngày cho số dư từ{" "}
        {vnd(bank.interestMin)}, tối đa {vnd(bank.interestCap)}/ngày.
      </p>
    </Sheet>
  );
}
