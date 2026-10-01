"use client";

import { content } from "@xom/content";
import type { FundView, ProjectView } from "@xom/shared";
import { canPropose, formatClock } from "@xom/sim";
import { useEffect, useState } from "react";
import { vnd, vndShort } from "../format";
import { send } from "../net/socket";
import { useGame } from "../store";
import { PayPicker, usePayCheck, usePayMethod } from "./PayPicker";
import { Sheet } from "./Sheet";
import { Tabs } from "./Tabs";

const CHIPS = [10_000, 50_000, 100_000, 500_000];
const STATUS: Record<ProjectView["status"], string> = {
  VOTING: "🗳️ Đang bỏ phiếu",
  FUNDING: "💰 Chờ đủ quỹ",
  BUILDING: "🏗️ Đang thi công",
  DONE: "✅ Đã xong",
  REJECTED: "❌ Không qua",
};

type Tab = "active" | "propose" | "done";

/**
 * Quỹ xóm + công trình chung (docs/USECASES.md UC-J5): quỹ từ phí chợ + hàng xóm góp; ai cũng đề xuất được,
 * cả xóm bỏ phiếu; qua và đủ quỹ thì thi công, xong thì khách ở chỗ bán gần đó ghé nhiều hơn.
 */
export function FundSheet() {
  const close = useGame((s) => s.openSheet);
  const day = useGame((s) => s.clock?.day ?? 1);
  const [fund, setFund] = useState<FundView | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const [busy, setBusy] = useState(false);
  const check = usePayCheck();
  const pay = usePayMethod((s) => s.method);

  useEffect(() => {
    void send("fund:view", {}).then((r) => {
      if (r.ok) {
        setFund(r.data);
        if (r.data.active.length === 0) setTab("propose");
      }
    });
  }, []);

  const act = async (p: Promise<{ ok: true; data: FundView } | { ok: false }>) => {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (r.ok) setFund(r.data);
    return r.ok;
  };

  if (!fund) {
    return (
      <Sheet title="Quỹ xóm" onClose={() => close(null)}>
        <p className="text-sm text-ink/50">Đang mở sổ quỹ…</p>
      </Sheet>
    );
  }
  const done = new Set(fund.done);
  const activeIds = new Set(fund.active.map((a) => a.projectId));
  const voting = fund.active.some((a) => a.status === "VOTING");

  return (
    <Sheet title="Quỹ xóm" onClose={() => close(null)}>
      <div className="mb-3 rounded-2xl bg-white p-3 shadow-sm" data-fund={fund.balance}>
        <p className="text-xs text-ink/60">
          Quỹ chung · {Math.round(content.data.fund.feeShare * 100)}% phí chợ mỗi ngày + hàng xóm
          góp
        </p>
        <p className="text-3xl font-extrabold tabular-nums">{vnd(fund.balance)}</p>
        <PayPicker />
        <div className="flex gap-1.5">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              disabled={busy || typeof check(c) !== "string"}
              onClick={() => act(send("fund:donate", { amount: c, pay }))}
              className="h-10 flex-1 rounded-xl bg-leaf/15 text-sm font-semibold disabled:opacity-40"
            >
              Góp {vndShort(c)}
            </button>
          ))}
        </div>
      </div>

      <Tabs
        label="Công trình"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "active", label: "🗳️ Đang bàn / làm", badge: fund.active.length },
          { id: "propose", label: "📋 Đề xuất" },
          { id: "done", label: "✅ Đã xong", badge: fund.done.length },
        ]}
      />

      {tab === "active" && (
        <ul className="flex flex-col gap-2">
          {fund.active.length === 0 && (
            <p className="text-sm text-ink/60">Chưa có công trình nào — sang tab Đề xuất nha.</p>
          )}
          {fund.active.map((a) => {
            const def = content.data.projects.find((p) => p.id === a.projectId);
            if (!def) return null;
            return (
              <li key={a.id} className="rounded-2xl bg-white p-3 shadow-sm" data-project={a.status}>
                <p className="font-extrabold">
                  {def.emoji} {def.name}
                </p>
                <p className="text-xs text-ink/60">
                  {STATUS[a.status]} · {a.proposerName} đề xuất · {vnd(def.cost)}
                </p>
                {a.status === "VOTING" && (
                  <>
                    <p className="mt-1 text-sm">
                      👍 {a.yes} · 👎 {a.no} · hết hạn ngày {a.voteDay} lúc{" "}
                      {formatClock(a.voteMinute)} · {fund.members} người được bầu
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {[true, false].map((yes) => (
                        <button
                          key={String(yes)}
                          type="button"
                          aria-pressed={a.mine === yes}
                          disabled={busy}
                          onClick={() => act(send("project:vote", { id: a.id, yes }))}
                          className="h-11 rounded-xl bg-ink/5 font-semibold aria-pressed:bg-ink aria-pressed:text-cream"
                        >
                          {yes ? "👍 Thuận" : "👎 Chống"}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {a.status === "FUNDING" && (
                  <div className="mt-2">
                    <p className="text-sm">
                      Còn thiếu <b>{vnd(Math.max(0, def.cost - fund.balance))}</b> — góp quỹ ở trên
                      là khởi công.
                    </p>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/10">
                      <div
                        className="h-full bg-sun"
                        style={{ width: `${Math.min(100, (fund.balance / def.cost) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                {a.status === "BUILDING" && a.doneDay !== null && (
                  <p className="mt-1 text-sm">
                    🏗️ Thợ đang làm — nghiệm thu ngày {a.doneDay} (còn {Math.max(0, a.doneDay - day)}{" "}
                    ngày)
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {tab === "propose" && (
        <ul className="flex flex-col gap-2">
          {content.data.projects
            .filter((p) => !done.has(p.id))
            .map((p) => {
              const why =
                canPropose(p, done, activeIds) ?? (voting ? "Xóm đang bàn một đề xuất khác" : null);
              const lots = p.demand.lots.map((l) => content.lot(l).name).join(", ");
              return (
                <li key={p.id} className="rounded-2xl bg-white p-3 shadow-sm" data-propose={p.id}>
                  <p className="font-extrabold">
                    {p.emoji} {p.name}
                  </p>
                  <p className="text-sm">{p.description}</p>
                  <p className="mt-1 text-xs text-ink/60">
                    💬 {p.why} · {vnd(p.cost)} · thi công {p.buildDays} ngày · khách ở {lots} +
                    {Math.round((p.demand.mult - 1) * 100)}%
                  </p>
                  <button
                    type="button"
                    disabled={busy || why !== null}
                    onClick={async () => {
                      if (await act(send("project:propose", { projectId: p.id }))) setTab("active");
                    }}
                    className="mt-2 h-10 w-full rounded-xl bg-sun text-sm font-semibold disabled:opacity-40"
                  >
                    {why ?? "🗳️ Đề xuất cả xóm bỏ phiếu"}
                  </button>
                </li>
              );
            })}
        </ul>
      )}

      {tab === "done" && (
        <ul className="flex flex-col gap-2">
          {fund.done.length === 0 && (
            <p className="text-sm text-ink/60">Chưa có công trình nào nghiệm thu.</p>
          )}
          {fund.done.map((id) => {
            const p = content.data.projects.find((x) => x.id === id);
            if (!p) return null;
            return (
              <li key={id} className="rounded-2xl bg-sun/20 p-3 text-sm" data-done={id}>
                <b>
                  {p.emoji} {p.name}
                </b>{" "}
                — {p.description}
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
