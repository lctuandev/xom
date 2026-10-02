"use client";

import { content } from "@xom/content";
import type { BusinessView } from "@xom/shared";
import { openDue, repairCost, wearState } from "@xom/sim";
import { useState } from "react";
import { stars, vnd, vndShort } from "../../format";
import { send } from "../../net/socket";
import { makeableCount } from "../../recipes";
import { useGame } from "../../store";
import { Section } from "../../ui/Sheet";
import { GoToRow } from "../FeatureSheet";
import { ShopFeature, Stat } from "./common";

function OpenButton({
  biz,
  stock,
  working,
  money,
}: {
  biz: BusinessView;
  stock: number;
  working: boolean;
  money: number;
}) {
  const [busy, setBusy] = useState(false);
  const atStall = useGame((s) => s.atStall);
  const setGoal = useGame((s) => s.setGoal);
  const close = useGame((s) => s.openSheet);
  const lot = biz.lotId ? content.lot(biz.lotId) : null;
  const eco = content.economy;
  // Tiền chỗ (xe đẩy) + phí chợ/thuế trả một lần mỗi ngày (Luật 2.2); tiệm thì tiền nhà theo hợp đồng.
  const rentDue = !biz.open && lot && !biz.rentPaidToday ? openDue(content, lot.id).total : 0;
  const broken = wearState(biz.wear, eco.maintenance) === "broken";
  const cantPay = rentDue > money;
  const hint = broken
    ? "Xe hư rồi — đẩy tới vựa xe Ông Sáu sửa đã"
    : working
      ? "Đang đi làm thuê — nghỉ việc để mở quầy"
      : !lot
        ? "Chọn chỗ bán trước (📍 Chỗ bán)"
        : stock === 0
          ? "Chưa đủ nguyên liệu cho món nào — ra chợ mua trước"
          : cantPay
            ? `Không đủ ${vnd(rentDue)} tiền thuê chỗ — chọn chỗ rẻ hơn hoặc đi làm thuê kiếm thêm`
            : rentDue
              ? `Thuê chỗ + phí chợ hôm nay: ${vnd(rentDue)} (trả một lần/ngày)`
              : null;
  // Phải đẩy xe tới chỗ bán, đứng sau quầy mới mở được.
  if (!biz.open && lot && !atStall) {
    return (
      <div className="mb-4">
        <button
          type="button"
          onClick={() => {
            setGoal({ kind: "stall", open: "stall" });
            close(null);
          }}
          className="h-12 w-full rounded-2xl bg-sun text-base font-semibold active:scale-[0.98]"
        >
          🚶 Đẩy xe tới {lot.name}
        </button>
        <p className="mt-2 text-center text-sm text-ink/60">Tới nơi rồi mới mở quầy được.</p>
      </div>
    );
  }
  return (
    <div className="mb-4">
      <button
        type="button"
        disabled={busy || (!biz.open && (broken || working || !lot || stock === 0 || cantPay))}
        onClick={async () => {
          setBusy(true);
          await send(biz.open ? "biz:close" : "biz:open", {});
          setBusy(false);
        }}
        className={`h-12 w-full rounded-2xl text-base font-semibold active:scale-[0.98] disabled:opacity-40 ${
          biz.open ? "bg-ink/10" : "bg-leaf text-cream"
        }`}
      >
        {busy ? "…" : biz.open ? "Đóng quầy" : "Mở quầy bán"}
      </button>
      {hint && <p className="mt-2 text-center text-sm text-ink/60">{hint}</p>}
    </div>
  );
}
/** Độ bền xe/quầy (Luật 2.2): bán nhiều thì mòn; ọp ẹp khách bớt ghé, làm món chậm; hư thì không mở được. */
function WearBar({ biz }: { biz: BusinessView }) {
  const setGoal = useGame((s) => s.setGoal);
  const close = useGame((s) => s.openSheet);
  const m = content.economy.maintenance;
  const state = wearState(biz.wear, m);
  const cost = repairCost(content.equipment(biz.equipmentId).price, biz.wear, m);
  const left = Math.round((1 - biz.wear) * 100);
  return (
    <div className="mb-3 rounded-2xl bg-white p-3 shadow-sm" data-wear={state}>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">🔧 Độ bền xe</span>
        <span className={state === "ok" ? "text-ink/60" : "font-semibold text-red"}>
          {state === "broken" ? "Hư rồi" : state === "worn" ? `Ọp ẹp · ${left}%` : `${left}%`}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/10">
        <div
          className={`h-full rounded-full ${state === "ok" ? "bg-leaf" : "bg-red"}`}
          style={{ width: `${left}%` }}
        />
      </div>
      {state !== "ok" && (
        <p className="mt-1 text-xs text-ink/60">
          Xe ọp ẹp: khách ngại ghé, làm món chậm hơn. Sửa ở vựa xe Ông Sáu.
        </p>
      )}
      {cost > 0 && (
        <button
          type="button"
          onClick={() => {
            setGoal({ kind: "place", id: "vua_xe", open: "equipment" });
            close(null);
          }}
          className="mt-2 h-10 w-full rounded-xl bg-sun text-sm font-semibold"
        >
          🚶 Tới vựa xe sửa · {vnd(cost)}
        </button>
      )}
    </div>
  );
}

/** 🏪 Quầy của tôi: mở/đóng quầy (đẩy xe tới chỗ trước), độ bền xe, hôm nay bán được bao nhiêu. */
export function StallSheet() {
  return (
    <ShopFeature id="stall">
      {(biz, me) => {
        const product = content.product(biz.productId);
        const equipment = content.equipment(biz.equipmentId);
        // Số phần còn làm được của các món đang bán (theo nguyên liệu trong kho).
        const stock = biz.menu
          .filter((m) => m.on)
          .reduce((sum, m) => sum + makeableCount(biz.productId, m.variantId, me.inventory), 0);
        return (
          <>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="min-w-0 truncate font-extrabold">
                {product.emoji} {equipment.name}
              </p>
              <span
                role="img"
                className="shrink-0 text-lg text-sun"
                title="Uy tín"
                aria-label={`Uy tín ${Math.round(biz.reputation * 100)}%`}
              >
                {stars(biz.reputation)}
              </span>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${biz.open ? "bg-leaf text-cream" : "bg-ink/10"}`}
              >
                {biz.open ? "Đang bán" : "Đóng cửa"}
              </span>
            </div>
            <OpenButton biz={biz} stock={stock} working={me.jobId !== null} money={me.money} />
            <WearBar biz={biz} />
            <Section title="Hôm nay">
              <div className="grid grid-cols-3 gap-2 text-center">
                {/* Khách hụt hiện trong báo cáo cuối ngày. */}
                <Stat label="Đã bán" value={String(me.today.sold)} />
                <Stat label="Doanh thu" value={vndShort(me.today.revenue)} />
                <Stat label="Tiền boa" value={vndShort(me.today.tips)} />
              </div>
            </Section>
            <GoToRow to={["dishes", "stock", "lot", "staff", "promo", "recipes"]} />
          </>
        );
      }}
    </ShopFeature>
  );
}
