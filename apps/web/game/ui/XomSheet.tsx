"use client";

import { content } from "@xom/content";
import { useState } from "react";
import { send } from "../net/socket";
import { useGame } from "../store";
import { Sheet } from "./Sheet";

export const inviteUrl = (code: string) => `${window.location.origin}/play?xom=${code}`;

/**
 * Xóm chung (docs/USECASES.md UC-J1): mã xóm, mời bạn qua link (Zalo/Messenger bằng Web Share),
 * ai đang online, vào xóm của bạn bằng mã.
 */
export function XomSheet() {
  const roster = useGame((s) => s.roster);
  const me = useGame((s) => s.me);
  const invite = useGame((s) => s.invite);
  const setInvite = useGame((s) => s.setInvite);
  const close = useGame((s) => s.openSheet);
  const toast = useGame((s) => s.toast);
  const lots = useGame((s) => s.world.lots);
  const setGoal = useGame((s) => s.setGoal);
  const [code, setCode] = useState(invite ?? "");
  const [busy, setBusy] = useState(false);
  if (!roster || !me) return null;

  const share = async () => {
    const url = inviteUrl(roster.code);
    try {
      if (navigator.share) {
        await navigator.share({ title: "XÓM", text: "Vào xóm mình chơi nè!", url });
        return;
      }
    } catch {
      return; // người chơi bấm hủy
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ kind: "good", text: "Đã chép link mời — dán vào Zalo/Messenger gửi bạn" });
    } catch {
      toast({ kind: "info", text: url });
    }
  };

  const join = async () => {
    setBusy(true);
    const res = await send("xom:join", { code });
    setBusy(false);
    if (!res.ok) return;
    setInvite(null);
    window.history.replaceState(null, "", "/play");
    close(null);
    toast({ kind: "good", text: "Đã vào xóm mới — chào hàng xóm đi!" });
  };

  const busyHere = me.business?.open || useGame.getState().shift;

  return (
    <Sheet title="Xóm" onClose={() => close(null)}>
      {invite && invite !== roster.code && (
        <p className="mb-3 rounded-2xl bg-sun/30 p-3 text-sm font-semibold">
          📨 Bạn được mời vào xóm <span className="font-mono">{invite}</span>. Bấm "Vào xóm" bên
          dưới nha.
        </p>
      )}
      <div className="flex items-center gap-2 rounded-2xl bg-white p-3 shadow-sm">
        <div className="flex-1">
          <p className="text-xs text-ink/60">Mã xóm đang ở</p>
          <p className="font-mono text-xl font-extrabold tracking-wider" data-xom-code>
            {roster.code}
          </p>
        </div>
        <button
          type="button"
          onClick={share}
          className="h-11 rounded-xl bg-red px-4 font-semibold text-cream"
        >
          📨 Mời bạn
        </button>
      </div>

      <button
        type="button"
        onClick={() => close("fund")}
        className="mt-3 h-12 w-full rounded-xl bg-leaf font-semibold text-cream"
      >
        🏗️ Quỹ xóm & công trình chung
      </button>

      <p className="mt-4 mb-1.5 text-sm font-extrabold">
        Đang online ({roster.peers.length}/{roster.max})
      </p>
      <ul className="flex flex-col gap-1">
        {roster.peers.map((p) => (
          <li key={p.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm">
            <span className="size-2 rounded-full bg-leaf" />
            <span className="flex-1 font-semibold">
              {p.name}
              {p.id === me.playerId && " (bạn)"}
            </span>
            {p.inside && (
              <span className="text-xs text-ink/60">
                ở {content.placeById.get(p.inside)?.name ?? "trong nhà"}
              </span>
            )}
            {(() => {
              const stall = lots.find((l) => l.ownerId === p.id && l.open);
              if (!stall || p.id === me.playerId) return null;
              return (
                <button
                  type="button"
                  onClick={() => {
                    close(null);
                    setGoal({
                      kind: "shop",
                      id: stall.businessId,
                      lotId: stall.lotId,
                      open: "shop",
                    });
                  }}
                  className="h-8 shrink-0 rounded-lg bg-red px-2.5 text-xs font-semibold text-cream"
                >
                  🛒 Tới quầy
                </button>
              );
            })()}
          </li>
        ))}
      </ul>

      <p className="mt-4 mb-1.5 text-sm font-extrabold">Vào xóm của bạn bè</p>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.trim().toLowerCase())}
          placeholder="Mã 8 ký tự"
          aria-label="Mã xóm của bạn bè"
          maxLength={8}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="h-11 min-w-0 flex-1 rounded-xl bg-white px-3 font-mono text-base shadow-sm outline-none focus:ring-2 focus:ring-red"
        />
        <button
          type="button"
          disabled={busy || code.length !== 8 || !!busyHere}
          onClick={join}
          className="h-11 shrink-0 rounded-xl bg-leaf px-4 font-semibold text-cream disabled:opacity-40"
        >
          Vào xóm
        </button>
      </div>
      <p className="mt-1.5 text-xs text-ink/60">
        {busyHere
          ? "Đang mở quầy hoặc đang trong ca — dọn quầy, ra ca rồi mới chuyển xóm được."
          : "Chuyển xóm thì mang theo tiền, hàng tồn và xe hàng; chỗ bán cũ có người dùng thì chọn chỗ khác."}
      </p>
    </Sheet>
  );
}
