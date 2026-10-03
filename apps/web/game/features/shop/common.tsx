"use client";

import { content } from "@xom/content";
import type { BusinessView, MeView, ShopSummary } from "@xom/shared";
import type { ReactNode } from "react";
import { send } from "../../net/socket";
import { useGame } from "../../store";
import { FeatureSheet, GoTo } from "../FeatureSheet";
import type { FeatureId } from "../registry";

/**
 * Khung sheet nhóm 🏪 Cửa hàng: chưa có xe hàng thì chỉ đường tới vựa xe; có rồi thì đưa `biz` + `me` cho nội dung.
 * (Bước D — nhiều cửa hàng: thêm `shopId` ở đây, các sheet con không phải sửa.)
 */
export function ShopFeature({
  id,
  title,
  children,
}: {
  id: FeatureId;
  /** Tiêu đề theo cửa hàng đang quản lý (vd. "🏠 Tiệm của tôi"). */
  title?: (biz: BusinessView) => string;
  children: (biz: BusinessView, me: MeView) => ReactNode;
}) {
  const me = useGame((s) => s.me);
  const biz = me?.business;
  return (
    <FeatureSheet id={id} title={biz && title ? title(biz) : undefined}>
      {me && biz ? (
        <>
          <ShopSwitcher />
          {children(biz, me)}
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink/70">
            Chưa có xe hàng. Xe đẩy mua ở vựa xe Ông Sáu, đầu phố phía tây — có xe rồi mới bán được.
          </p>
          <GoTo to="equipment" label="Tới vựa xe Ông Sáu" />
        </>
      )}
    </FeatureSheet>
  );
}

export function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
      <p className={`text-xl font-extrabold tabular-nums ${warn ? "text-red" : ""}`}>{value}</p>
      <p className="text-xs text-ink/60">{label}</p>
    </div>
  );
}

/** Tên ngắn của một cửa hàng: tên quán (nếu có) hoặc món + chỗ bán. */
export function shopLabel(s: ShopSummary) {
  const product = content.product(s.productId);
  const where = s.lotId ? content.lot(s.lotId).name.replace(/^🏠 /, "") : "chưa có chỗ";
  return { emoji: product.emoji, title: s.name ?? product.name, where };
}

/**
 * Chọn cửa hàng đang quản lý (docs/IA.md bước D): có từ 2 cửa hàng thì hiện hàng chip trên đầu mọi sheet nhóm 🏪 —
 * thực đơn, kho, nhân viên… đều áp cho cửa hàng đang chọn.
 */
export function ShopSwitcher() {
  const shops = useGame((s) => s.me?.shops ?? NONE);
  if (shops.length < 2) return null;
  return (
    <nav aria-label="Chọn cửa hàng" className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {shops.map((s) => {
        const l = shopLabel(s);
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={s.active}
            data-shop={s.id}
            onClick={() => !s.active && void send("biz:select", { businessId: s.id })}
            className="flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold shadow-sm aria-pressed:bg-ink aria-pressed:text-cream"
          >
            <span aria-hidden>{l.emoji}</span>
            <span className="max-w-28 truncate">{l.title}</span>
            {s.open && <span className="size-2 rounded-full bg-leaf" title="Đang mở" />}
          </button>
        );
      })}
    </nav>
  );
}

const NONE: ShopSummary[] = [];
