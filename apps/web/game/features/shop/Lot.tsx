"use client";

import { content } from "@xom/content";
import type { BusinessView } from "@xom/shared";
import { useMemo, useState } from "react";
import { districtLikes } from "../../districts";
import { vndShort } from "../../format";
import { send } from "../../net/socket";
import { useGame } from "../../store";
import { type MapLot, XomMap } from "../../ui/XomMap";
import { GoToRow } from "../FeatureSheet";
import { ShopFeature } from "./common";

function LotPicker({ biz }: { biz: BusinessView }) {
  const world = useGame((s) => s.world);
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
            : l.kind === "house"
              ? "house"
              : world.lots.some((o) => o.lotId === l.id && o.businessId !== biz.id)
                ? "taken"
                : "free",
      })),
    [lots, world.lots, biz.lotId, biz.id],
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
      </>
    );
  }

  return (
    <>
      {map}
      <ul className="flex flex-col gap-2">
        {lots.map((lot) => {
          const taken = world.lots.find((o) => o.lotId === lot.id && o.businessId !== biz.id);
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
                  const res = await send("biz:update", { lotId: lot.id });
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
                          : lot.hint}
                  </span>
                </span>
                <span className="shrink-0 text-right font-semibold tabular-nums">
                  {vndShort(lot.rentPerDay)}
                  <span className="block text-[10px] font-normal text-ink/50">
                    {lot.kind === "house" ? "tiền nhà/ngày" : "tiền chỗ/ngày"}
                  </span>
                </span>
              </button>
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
