"use client";

import { content } from "@xom/content";
import type { BusinessView } from "@xom/shared";
import { formatClock, unlockLevel } from "@xom/sim";
import { useState } from "react";
import { vnd, vndShort } from "../../format";
import { send } from "../../net/socket";
import { shopWords } from "../../shopWords";
import { useGame } from "../../store";
import { usePayMethod } from "../../ui/PayPicker";
import { Section } from "../../ui/Sheet";
import { ShopFeature } from "./common";

/**
 * Khai trương (sự kiện người chơi tạo, DESIGN §9): trả tiền pháo giấy, bong bóng, băng rôn → quầy đông khách + giảm giá
 * vài giờ game, cả xóm thấy tin. Mỗi lần cách nhau vài ngày.
 */
function PromoSection({ biz, money }: { biz: BusinessView; money: number }) {
  const def = content.data.events.find((e) => e.trigger.kind === "player");
  const atStall = useGame((s) => s.atStall);
  const day = useGame((s) => s.clock?.day ?? 1);
  const minute = useGame((s) => s.clock?.minute ?? 0);
  const active = useGame((s) =>
    s.events.find((e) => e.businessId === biz.id && minute >= e.from && minute < e.to),
  );
  const [busy, setBusy] = useState(false);
  const level = useGame((s) => s.me?.progress.level ?? 1);
  if (!def || def.trigger.kind !== "player") return null;
  const cost = def.trigger.costs.reduce((sum, c) => sum + c.price, 0);
  const wait = biz.promoDay === null ? 0 : def.trigger.cooldownDays - (day - biz.promoDay);
  const need = unlockLevel(content, "event_host");
  const hint = active
    ? null
    : level < need
      ? `🔒 Cấp ${need} mới tổ chức khai trương được`
      : wait > 0
        ? `Mới khai trương — ${wait} ngày nữa mới làm lại được`
        : !biz.open || !atStall
          ? `${shopWords(biz.lotId).open} và đứng ở ${shopWords(biz.lotId).noun} rồi mới khai trương được`
          : cost > money
            ? "Không đủ tiền mặt"
            : null;
  return (
    <Section title={`${def.emoji} ${def.name}`}>
      <div className="rounded-2xl bg-white p-3 shadow-sm" data-promo={active ? "on" : "off"}>
        {active ? (
          <p className="text-sm font-semibold text-leaf">
            🎉 Đang khai trương tới {formatClock(active.to)} — khách đông, giảm{" "}
            {Math.round((def.effects.discount ?? 0) * 100)}%
          </p>
        ) : (
          <>
            <p className="text-sm text-ink/70">
              Khách ghé ×{def.effects.demand ?? 1} trong {def.minutes / 60} giờ, giảm{" "}
              {Math.round((def.effects.discount ?? 0) * 100)}% mọi món; cả xóm được báo tin.
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
              {def.trigger.costs.map((c) => (
                <li key={c.id} className="rounded-full bg-ink/5 px-2 py-1">
                  {c.emoji} {c.label} {vndShort(c.price)}
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={busy || hint !== null}
              onClick={async () => {
                setBusy(true);
                await send("event:host", { eventId: def.id, pay: usePayMethod.getState().method });
                setBusy(false);
              }}
              className="mt-2 h-11 w-full rounded-xl bg-red font-semibold text-cream disabled:opacity-40"
            >
              {busy ? "…" : `🎉 Khai trương · ${vnd(cost)}`}
            </button>
            {hint && <p className="mt-1 text-center text-xs text-ink/60">{hint}</p>}
          </>
        )}
      </div>
    </Section>
  );
}

/** 🎉 Khai trương. */
export function PromoSheet() {
  return (
    <ShopFeature id="promo">{(biz, me) => <PromoSection biz={biz} money={me.money} />}</ShopFeature>
  );
}
