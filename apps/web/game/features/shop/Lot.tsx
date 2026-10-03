"use client";

import type { Lot } from "@xom/content";
import { content } from "@xom/content";
import type { BusinessView, PlotView } from "@xom/shared";
import { landPrice, landRefund } from "@xom/sim";
import { useMemo, useState } from "react";
import { districtLikes } from "../../districts";
import { vndShort } from "../../format";
import { send } from "../../net/socket";
import { getPlayer } from "../../scene/player";
import { useGame } from "../../store";
import { usePayMethod } from "../../ui/PayPicker";
import { type MapLot, XomMap } from "../../ui/XomMap";
import { GoToRow } from "../FeatureSheet";
import { ShopFeature } from "./common";

function LotPicker({ biz }: { biz: BusinessView }) {
  const world = useGame((s) => s.world);
  const me = useGame((s) => s.me);
  const [open, setOpen] = useState(biz.lotId === null);
  const [focus, setFocus] = useState<string | null>(null);
  const current = biz.lotId ? content.lot(biz.lotId) : null;
  const lots = useMemo(() => content.lotsIn(world.chunks), [world.chunks]);
  // 🗺️ Bản đồ xóm (docs/BANDO.md bước C): mọi chỗ bán của xóm (cả khu mới mở) tô theo trạng thái.
  const mapLots = useMemo<MapLot[]>(
    () =>
      lots.map((l) => ({
        id: l.id,
        x: l.position.x,
        z: l.position.z,
        state:
          l.id === biz.lotId
            ? "mine"
            : world.plots?.some((p) => p.lotId === l.id && p.ownerId === me?.playerId)
              ? "owned"
              : world.plots?.some((p) => p.lotId === l.id)
                ? "taken"
                : l.kind === "house"
                  ? "house"
                  : world.lots.some((o) => o.lotId === l.id && o.businessId !== biz.id)
                    ? "taken"
                    : "free",
      })),
    [lots, world.lots, world.plots, me?.playerId, biz.lotId, biz.id],
  );
  const map = (
    <XomMap
      lots={mapLots}
      focus={focus}
      onPick={(id) => {
        setFocus(id);
        if (biz.open) {
          useGame.getState().toast({ kind: "info", text: "Đóng quầy rồi mới đổi chỗ được" });
          return;
        }
        setOpen(true);
        requestAnimationFrame(() =>
          document.querySelector(`[data-lot="${id}"]`)?.scrollIntoView({ block: "center" }),
        );
      }}
    />
  );

  if (!open && current) {
    return (
      <>
        {map}
        <div className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm">
          <div className="min-w-0">
            <p className="font-extrabold">{current.name}</p>
            <p className="text-xs font-semibold text-leaf" data-district={current.traffic}>
              {content.traffic(current.traffic).emoji} {content.traffic(current.traffic).name} ·{" "}
              {districtLikes(current.traffic)}
            </p>
            <p className="text-sm text-ink/60">
              {current.hint} · {vndShort(current.rentPerDay)}/ngày
            </p>
          </div>
          <button
            type="button"
            disabled={biz.open}
            onClick={() => setOpen(true)}
            className="h-11 shrink-0 rounded-xl bg-ink/5 px-4 font-semibold disabled:opacity-40"
          >
            Đổi chỗ
          </button>
        </div>
        {current.kind === "stall" && (
          <LandRow
            lot={current}
            plot={world.plots?.find((p) => p.lotId === current.id)}
            myId={me?.playerId}
          />
        )}
      </>
    );
  }

  return (
    <>
      {map}
      <ul className="flex flex-col gap-2">
        {lots.map((lot) => {
          const plot = world.plots?.find((p) => p.lotId === lot.id);
          const taken =
            world.lots.find((o) => o.lotId === lot.id && o.businessId !== biz.id) ??
            (plot && plot.ownerId !== me?.playerId ? { ownerName: plot.ownerName } : undefined);
          const selected = biz.lotId === lot.id;
          // Đang thuê nhà: không dọn ra vỉa hè (tiền nhà vẫn chạy) — trả nhà ở 🏠 Thuê nhà & giấy tờ trước.
          const leased = !!biz.leaseLotId && lot.kind !== "house";
          // Nhà mặt tiền: phải ký hợp đồng thuê ở 🏠 Thuê nhà & giấy tờ (UC-F12) — server kiểm.
          return (
            <li key={lot.id} data-lot={lot.id}>
              <button
                type="button"
                disabled={!!taken || leased}
                aria-pressed={selected}
                data-focus={focus === lot.id || undefined}
                onClick={async () => {
                  const res = await send("biz:update", {
                    lotId: lot.id,
                    pay: usePayMethod.getState().method,
                  });
                  if (res.ok) setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white p-3 text-left shadow-sm data-focus:ring-2 data-focus:ring-sun aria-pressed:ring-2 aria-pressed:ring-red disabled:opacity-40"
              >
                <span className="min-w-0">
                  <span className="block font-extrabold">{lot.name}</span>
                  {/* Bản sắc khu (THEGIOI §3): khu nào hợp hàng gì. */}
                  <span
                    className="block text-xs font-semibold text-leaf"
                    data-district={lot.traffic}
                  >
                    {content.traffic(lot.traffic).emoji} {content.traffic(lot.traffic).name} ·{" "}
                    {districtLikes(lot.traffic)}
                  </span>
                  <span className="block text-sm text-ink/60">
                    {lot.kind === "house" && !selected
                      ? "📝 Ký hợp đồng ở 🏠 Thuê nhà & giấy tờ"
                      : leased
                        ? "🏠 Đang thuê nhà — trả nhà ở 🏠 Thuê nhà & giấy tờ rồi mới ra vỉa hè"
                        : taken
                          ? `${taken.ownerName} đang dùng`
                          : lot.kind === "stall" && !selected
                            ? `${lot.hint} · ⛺ dựng sạp ${vndShort(content.economy.stallBuild)} (một lần)`
                            : lot.hint}
                  </span>
                </span>
                <span className="shrink-0 text-right font-semibold tabular-nums">
                  {vndShort(lot.rentPerDay)}
                  <span className="block text-[10px] font-normal text-ink/50">
                    {lot.kind === "house"
                      ? "tiền nhà/ngày"
                      : lot.kind === "stall"
                        ? "tiền ô đất/ngày"
                        : "tiền chỗ/ngày"}
                  </span>
                </span>
              </button>
              {lot.kind === "stall" && <LandRow lot={lot} plot={plot} myId={me?.playerId} />}
            </li>
          );
        })}
        {current && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-11 font-semibold text-ink/60"
          >
            Giữ chỗ cũ
          </button>
        )}
      </ul>
    </>
  );
}

/**
 * 🏷️ Ô đất (docs/BANDO.md bước D): mua đứt ô sạp có mái — phải tới tận ô; của mình thì bán lại được cho xóm.
 */
function LandRow({ lot, plot, myId }: { lot: Lot; plot?: PlotView; myId?: string }) {
  const [busy, setBusy] = useState(false);
  const land = content.economy.land;
  const price = landPrice(content, lot.id);
  if (plot && plot.ownerId !== myId)
    return <p className="px-3 pt-1 text-xs text-ink/60">🏷️ Ô đất của {plot.ownerName}</p>;
  if (plot)
    return (
      <div className="flex items-center justify-between gap-2 px-3 pt-1 text-xs" data-land="mine">
        <span className="text-leaf font-semibold">
          🏷️ Ô đất của bạn · không trả thuê, thuế {vndShort(land.taxPerDay)}/ngày mở sạp
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await send("land:sell", { lotId: lot.id });
            setBusy(false);
          }}
          className="h-8 shrink-0 rounded-lg bg-ink/5 px-2 font-semibold disabled:opacity-40"
        >
          Bán lại · {vndShort(landRefund(content, plot.price))}
        </button>
      </div>
    );
  return (
    <div className="flex items-center justify-between gap-2 px-3 pt-1 text-xs">
      <span className="text-ink/60">
        Mua đứt thì khỏi trả {vndShort(lot.rentPerDay)}/ngày (tối đa {land.maxPerPlayer} ô)
      </span>
      <button
        type="button"
        disabled={busy}
        data-land-buy={lot.id}
        onClick={async () => {
          const p = getPlayer().position;
          if (Math.hypot(p.x - lot.position.x, p.z - lot.position.z) > 5) {
            // Phải tới tận ô xem đất (server kiểm) — đi tới rồi mở lại bảng này.
            useGame.getState().setGoal({ kind: "point", ...lot.position, open: "lot" });
            useGame.getState().openSheet(null);
            useGame
              .getState()
              .toast({ kind: "info", text: "🚶 Tới ô đất rồi bấm Mua đứt lần nữa" });
            return;
          }
          setBusy(true);
          await send("land:buy", { lotId: lot.id, pay: usePayMethod.getState().method });
          setBusy(false);
        }}
        className="h-8 shrink-0 rounded-lg bg-sun px-2 font-semibold disabled:opacity-40"
      >
        🏷️ Mua đứt · {vndShort(price)}
      </button>
    </div>
  );
}

/** 📍 Chỗ bán: chọn / đổi chỗ vỉa hè (nhà mặt tiền thì ký hợp đồng ở 🏠 Thuê nhà & giấy tờ). */
export function LotSheet() {
  return (
    <ShopFeature id="lot">
      {(biz) => (
        <>
          <LotPicker biz={biz} />
          <GoToRow to={["lease"]} />
        </>
      )}
    </ShopFeature>
  );
}
