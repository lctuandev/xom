"use client";

import { content } from "@xom/content";
import type { ContractBoardView, ContractView } from "@xom/shared";
import { contractIngredients, formatClock, trustLevel } from "@xom/sim";
import { useCallback, useEffect, useState } from "react";
import { vnd, vndShort } from "../format";
import { send } from "../net/socket";
import { useGame } from "../store";

/**
 * 📋 Bảng việc xóm của Chú Hai tổ trưởng (docs/KIENTRUC.md §3, UC-M7): việc NPC đặt — giao N phần tới một chỗ trước giờ hẹn.
 * Nhận việc (đặt cọc) → làm hàng ở quầy mình → mang tới tận nơi → giao. Giữ lời thì 🤝 tin cậy tăng; trễ / bỏ thì mất cọc.
 */
export function ContractBoard() {
  const [board, setBoard] = useState<ContractBoardView | null>(null);
  const [busy, setBusy] = useState(false);
  const me = useGame((s) => s.me);
  const minute = useGame((s) => s.clock?.minute ?? 0);
  const close = useGame((s) => s.openSheet);
  const setGoal = useGame((s) => s.setGoal);
  const tick = Math.floor(minute / 15);

  const load = useCallback(() => {
    void send("contract:list", {}).then((r) => r.ok && setBoard(r.data));
  }, []);
  // Tải lại mỗi 15 phút game (việc hết hạn, người khác nhận).
  useEffect(() => {
    void tick;
    load();
  }, [load, tick]);

  if (!board || !me) return <p className="text-sm text-ink/50">Đang ra bảng việc…</p>;
  const { keeper, trust: rule } = content.data.contracts;
  const level = trustLevel(content, board.trust);
  const mine = board.offers.find((o) => o.mine && (o.status === "TAKEN" || o.status === "READY"));
  const act = async (
    event: "contract:take" | "contract:prepare" | "contract:deliver" | "contract:drop",
    id: string,
  ) => {
    setBusy(true);
    const r = await send(event, { id });
    setBusy(false);
    if (r.ok) setBoard(r.data);
  };
  const canMake = (o: ContractView) =>
    !!me.business && content.equipment(me.business.equipmentId).products.includes(o.productId);

  return (
    <section aria-label="Bảng việc xóm" className="flex flex-col gap-3">
      <div className="rounded-2xl bg-white p-3 shadow-sm" data-trust={board.trust}>
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">🤝 Tin cậy</span>
          <b className="tabular-nums">{board.trust}/100</b>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink/10">
          <div
            className={`h-full rounded-full ${level === "ok" ? "bg-leaf" : level === "low" ? "bg-sun" : "bg-red"}`}
            style={{ width: `${board.trust}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-ink/60">
          {board.lockedUntil
            ? `🔒 ${keeper} khoá nhận việc tới hết ngày ${board.lockedUntil} vì bỏ việc nhiều.`
            : level === "low"
              ? `${keeper}: "Giữ lời lại cho người ta tin nghen" — dưới ${rule.lockAt} là bị khoá.`
              : `Giao đúng hẹn +${rule.done} · trễ / bỏ ngang −${rule.fail} · bị bắt thối thiếu −${rule.short}.`}
        </p>
      </div>

      {mine && (
        <ActiveContract
          c={mine}
          busy={busy}
          onAct={act}
          onWalk={(goal) => {
            close(null);
            setGoal(goal);
          }}
        />
      )}

      <ul className="flex flex-col gap-2">
        {board.offers
          .filter((o) => o !== mine)
          .map((o) => {
            const open = o.status === "OPEN" && o.deadline > minute;
            const lockedOut = !!board.lockedUntil || board.trust < o.minTrust;
            const why = !canMake(o)
              ? `Cần đồ nghề ${content.product(o.productId).name.toLowerCase()}`
              : board.trust < o.minTrust
                ? `Cần 🤝 ${o.minTrust}`
                : mine
                  ? "Xong việc đang làm đã"
                  : null;
            return (
              <li
                key={o.id}
                data-contract={o.templateId}
                className={`rounded-2xl bg-white p-3 shadow-sm ${open ? "" : "opacity-60"}`}
              >
                <p className="text-xs font-semibold text-ink/60">📌 {o.poster}</p>
                <p className="mt-0.5 text-sm font-semibold leading-snug">{o.text}</p>
                <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink/70 tabular-nums">
                  <span>
                    💰 <b className="text-ink">{vnd(o.reward)}</b>
                  </span>
                  <span>🔒 cọc {vndShort(o.deposit)}</span>
                  <span>⏰ trước {formatClock(o.deadline)}</span>
                  {o.minTrust > 0 && <span>🤝 ≥ {o.minTrust}</span>}
                </p>
                {open ? (
                  <button
                    type="button"
                    disabled={busy || lockedOut || !!why}
                    onClick={() => void act("contract:take", o.id)}
                    className="mt-2 h-10 w-full rounded-xl bg-leaf text-sm font-semibold text-cream disabled:opacity-40"
                  >
                    {why ?? `Nhận việc · đặt cọc ${vndShort(o.deposit)}`}
                  </button>
                ) : (
                  <p className="mt-1.5 text-xs font-semibold text-ink/60">
                    {o.status === "DONE"
                      ? `✅ ${o.mine ? "Bạn" : (o.takerName ?? "Có người")} đã giao`
                      : o.status === "FAILED"
                        ? `❌ ${o.mine ? "Bạn" : (o.takerName ?? "Có người")} không giao kịp`
                        : o.takerName
                          ? `🙋 ${o.takerName} đã nhận`
                          : "⌛ Hết hạn"}
                  </p>
                )}
              </li>
            );
          })}
      </ul>
    </section>
  );
}

function ActiveContract({
  c,
  busy,
  onAct,
  onWalk,
}: {
  c: ContractView;
  busy: boolean;
  onAct: (
    event: "contract:prepare" | "contract:deliver" | "contract:drop",
    id: string,
  ) => Promise<void>;
  onWalk: (goal: { kind: "stall" } | { kind: "drop"; lotId: string; open: "jobs" }) => void;
}) {
  const inventory = useGame((s) => s.me?.inventory ?? []);
  const t = content.data.contracts.templates.find((x) => x.id === c.templateId);
  const need = t ? [...contractIngredients(content, t, c.qty)] : [];
  const have = (id: string) => inventory.find((i) => i.itemId === id)?.qty ?? 0;
  const lot = content.lot(c.lotId).name;
  const ready = c.status === "READY";
  return (
    <div
      className="rounded-2xl bg-white p-3 shadow-sm ring-2 ring-sun"
      data-active-contract={c.status}
    >
      <p className="text-xs font-semibold text-ink/60">📋 Việc đang làm · {c.poster}</p>
      <p className="mt-0.5 text-sm font-semibold leading-snug">{c.text}</p>
      <ol className="mt-2 flex flex-col gap-1 text-xs">
        <li className={ready ? "text-ink/50 line-through" : "font-semibold"}>
          1. Về quầy làm {c.qty} phần (tốn nguyên liệu thật)
        </li>
        {!ready && (
          <li className="flex flex-wrap gap-x-2 pl-3 text-ink/70 tabular-nums">
            {need.map(([id, q]) => {
              const ing = content.ingredient(id);
              return (
                <span key={id} className={have(id) < q ? "font-semibold text-red" : ""}>
                  {ing.emoji} {have(id)}/{q}
                </span>
              );
            })}
          </li>
        )}
        <li className={ready ? "font-semibold" : "text-ink/60"}>
          2. Mang tới {lot} trước {formatClock(c.deadline)} rồi giao
        </li>
      </ol>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {ready ? (
          <>
            <button
              type="button"
              onClick={() => onWalk({ kind: "drop", lotId: c.lotId, open: "jobs" })}
              className="h-10 rounded-xl bg-white text-sm font-semibold shadow-sm ring-1 ring-ink/10"
            >
              🚶 Tới {lot}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onAct("contract:deliver", c.id)}
              className="h-10 rounded-xl bg-leaf text-sm font-semibold text-cream disabled:opacity-40"
            >
              📦 Giao hàng
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onWalk({ kind: "stall" })}
              className="h-10 rounded-xl bg-white text-sm font-semibold shadow-sm ring-1 ring-ink/10"
            >
              🚶 Về quầy
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onAct("contract:prepare", c.id)}
              className="h-10 rounded-xl bg-leaf text-sm font-semibold text-cream disabled:opacity-40"
            >
              🔪 Làm {c.qty} phần
            </button>
          </>
        )}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void onAct("contract:drop", c.id)}
        className="mt-2 w-full text-center text-xs font-semibold text-red underline-offset-2 hover:underline"
      >
        Bỏ việc (mất cọc {vndShort(c.deposit)}, 🤝 −{content.data.contracts.trust.fail})
      </button>
    </div>
  );
}
