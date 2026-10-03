"use client";

import { vndShort } from "../../format";
import { send } from "../../net/socket";
import { useGame } from "../../store";
import { FeatureSheet, GoTo } from "../FeatureSheet";
import { openFeature } from "../open";
import { shopLabel } from "./common";

/**
 * 🏬 Các cửa hàng (docs/IA.md bước D): mọi cửa hàng của mình — đang mở hay đóng, có nhân viên trong ca không, ở đâu;
 * bấm "Quản lý" để chọn làm cửa hàng đang quản lý (thực đơn, kho, nhân viên… áp cho cửa hàng đó). Không giới hạn số
 * cửa hàng; chủ tự đứng bán một quầy một lúc, quầy khác cần nhân viên.
 */
export function ShopsSheet() {
  const shops = useGame((s) => s.me?.shops ?? []);
  return (
    <FeatureSheet id="shops">
      {shops.length === 0 ? (
        <p className="mb-3 text-sm text-ink/70">
          Chưa có cửa hàng nào — mua xe hàng ở vựa Ông Sáu.
        </p>
      ) : (
        <ul className="mb-3 flex flex-col gap-2" data-shops={shops.length}>
          {shops.map((s) => {
            const l = shopLabel(s);
            return (
              <li
                key={s.id}
                className={`rounded-2xl bg-white p-3 shadow-sm ${s.active ? "ring-2 ring-red" : ""}`}
                data-shop-card={s.id}
              >
                <div className="flex items-center gap-2">
                  <span aria-hidden className="text-2xl">
                    {l.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-extrabold">{l.title}</span>
                    <span className="block truncate text-xs text-ink/60">📍 {l.where}</span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${s.open ? "bg-leaf text-cream" : "bg-ink/10"}`}
                  >
                    {s.open ? "Đang bán" : "Đóng"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink/60">
                  {s.staffOnDuty ? "👩‍🍳 Nhân viên đang trong ca" : "Không có nhân viên trong ca"}
                  {s.active && " · đang quản lý"}
                </p>
                {/* Doanh thu + uy tín riêng từng cửa hàng (góp ý đợt 4). */}
                <p className="mt-1 flex gap-3 text-xs font-semibold" data-shop-stats={s.id}>
                  <span>💰 Hôm nay {vndShort(s.todayRevenue ?? 0)}</span>
                  {s.reputation !== undefined && <span>⭐ {(s.reputation * 5).toFixed(1)}</span>}
                </p>
                {!s.active && (
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await send("biz:select", { businessId: s.id });
                      if (r.ok) openFeature("stall", { from: "sheet" });
                    }}
                    className="mt-2 h-10 w-full rounded-xl bg-ink/5 text-sm font-semibold"
                  >
                    Quản lý cửa hàng này ›
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <GoTo to="equipment" label="Mở thêm cửa hàng (vựa Ông Sáu)" />
    </FeatureSheet>
  );
}
