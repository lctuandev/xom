"use client";

import type { MyStatsView } from "@xom/shared";
import { useState } from "react";
import { vnd } from "../../format";
import { useGame } from "../../store";
import { useMyStats, WeekChart } from "../../ui/BoardSheet";
import { Section } from "../../ui/Sheet";
import { GoToRow } from "../FeatureSheet";
import { ShopFeature } from "./common";

type Day = MyStatsView["days"][number];
type CostKey = keyof Day["costs"];

const COSTS: { key: CostKey; label: string; hint: string }[] = [
  { key: "stock", label: "📦 Nhập hàng", hint: "nguyên liệu ở chợ" },
  { key: "rent", label: "🏠 Tiền nhà / chỗ", hint: "tiền chỗ vỉa hè hoặc tiền nhà" },
  { key: "staff", label: "👩‍🍳 Lương nhân viên", hint: "trả theo giờ trong ca" },
  { key: "utilities", label: "💡 Điện nước", hint: "tiệm mở cửa mỗi giờ" },
  {
    key: "fees",
    label: "🧾 Phí, thuế & khác",
    hint: "phí chợ, thuế khoán, giấy tờ, sửa xe, khai trương",
  },
];

/** Gộp nhiều ngày thành một dòng sổ. */
function total(days: Day[]) {
  const costs: Day["costs"] = { stock: 0, rent: 0, staff: 0, utilities: 0, fees: 0 };
  let revenue = 0;
  let tips = 0;
  for (const d of days) {
    revenue += d.revenue;
    tips += d.tips;
    for (const c of COSTS) costs[c.key] += d.costs[c.key];
  }
  const spent = COSTS.reduce((s, c) => s + costs[c.key], 0);
  return { revenue, tips, costs, spent, profit: revenue + tips - spent };
}

/**
 * 📊 Sổ sách (docs/IA.md bước C): thu — chi theo từng khoản — lãi/lỗ, hôm nay hoặc 7 ngày; chỉ ra khoản chi lớn nhất để
 * người chơi biết vì sao lỗ (góp ý: "luôn lỗ mà không biết tại sao").
 */
export function BooksSheet() {
  const stats = useMyStats();
  const today = useGame((s) => s.clock?.day ?? 0);
  const [range, setRange] = useState<"today" | "week">("today");
  // Sổ theo cửa hàng đang quản lý (góp ý đợt 4) hoặc gộp tất cả (kể cả tiền công làm thuê).
  const [scope, setScope] = useState<"shop" | "all">("shop");
  return (
    <ShopFeature id="books">
      {(biz) => {
        if (!stats) return <p className="text-sm text-ink/50">Đang lật sổ…</p>;
        const shopDays =
          stats.shops?.find((s) => s.businessId === biz.id)?.days ??
          stats.days.map((d) => ({
            ...d,
            revenue: 0,
            tips: 0,
            profit: 0,
            served: 0,
            costs: { stock: 0, rent: 0, staff: 0, utilities: 0, fees: 0 },
          }));
        const source = scope === "shop" ? shopDays : stats.days;
        const days = range === "today" ? source.filter((d) => d.day === today) : source;
        const t = total(days);
        const n = Math.max(1, days.length);
        const biggest = [...COSTS].sort((a, b) => t.costs[b.key] - t.costs[a.key])[0];
        const gross = t.revenue + t.tips - t.costs.stock;
        return (
          <>
            <fieldset aria-label="Sổ của" className="mb-2 flex gap-1.5 border-0 p-0">
              {(
                [
                  ["shop", "🏪 Cửa hàng này"],
                  ["all", "👤 Tất cả"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={scope === id}
                  data-books-scope={id}
                  onClick={() => setScope(id)}
                  className="h-9 flex-1 rounded-full bg-white text-sm font-semibold shadow-sm aria-pressed:bg-leaf aria-pressed:text-cream"
                >
                  {label}
                </button>
              ))}
            </fieldset>
            <fieldset aria-label="Khoảng thời gian" className="mb-3 flex gap-1.5 border-0 p-0">
              {(
                [
                  ["today", "Hôm nay"],
                  ["week", "7 ngày"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={range === id}
                  onClick={() => setRange(id)}
                  className="h-9 flex-1 rounded-full bg-white text-sm font-semibold shadow-sm aria-pressed:bg-ink aria-pressed:text-cream"
                >
                  {label}
                </button>
              ))}
            </fieldset>
            <section
              aria-label="Sổ thu chi"
              className="rounded-2xl bg-white p-3 shadow-sm"
              data-books={range}
            >
              <p className="mb-1 text-xs font-extrabold text-ink/60">THU</p>
              <Row label="💰 Bán hàng" value={t.revenue} />
              <Row label="🙏 Tiền boa" value={t.tips} />
              <p className="mt-2 mb-1 text-xs font-extrabold text-ink/60">CHI</p>
              {COSTS.map((c) => (
                <Row
                  key={c.key}
                  label={c.label}
                  value={-t.costs[c.key]}
                  data={c.key}
                  strong={t.spent > 0 && c.key === biggest?.key && t.costs[c.key] > 0}
                />
              ))}
              <div
                className={`mt-2 flex items-baseline justify-between border-t border-ink/10 pt-2 text-base font-extrabold ${t.profit < 0 ? "text-red" : "text-leaf"}`}
                data-profit={t.profit}
              >
                <span>{t.profit < 0 ? "Lỗ" : "Lãi"}</span>
                <span className="tabular-nums">{vnd(t.profit)}</span>
              </div>
              {range === "week" && days.length > 1 && (
                <p className="text-right text-xs text-ink/60 tabular-nums">
                  ~{vnd(Math.round(t.profit / n))}/ngày
                </p>
              )}
            </section>
            {t.spent > 0 && biggest && t.costs[biggest.key] > 0 && (
              <p
                className={`mt-2 rounded-xl p-2.5 text-sm ${t.profit < 0 ? "bg-red/10" : "bg-sun/20"}`}
                data-biggest={biggest.key}
              >
                Chi lớn nhất: <b>{biggest.label}</b> {vnd(t.costs[biggest.key])} ({biggest.hint})
                {t.profit < 0 && gross > 0 && t.costs[biggest.key] > gross / 2
                  ? " — hơn nửa lãi gộp sau tiền hàng. Bán nhiều hơn, chọn chỗ / ca hợp lý hơn hoặc bớt khoản này."
                  : t.profit < 0
                    ? " — đang bán chưa đủ bù chi phí."
                    : "."}
              </p>
            )}
            <Section title="📈 Doanh thu & lãi 7 ngày">
              <WeekChart stats={stats} />
            </Section>
            <GoToRow to={["staff", "lot", "dishes"]} />
          </>
        );
      }}
    </ShopFeature>
  );
}

function Row({
  label,
  value,
  strong,
  data,
}: {
  label: string;
  value: number;
  strong?: boolean;
  data?: string;
}) {
  return (
    <div
      className={`flex items-baseline justify-between py-0.5 text-sm ${strong ? "font-extrabold text-red" : ""}`}
      data-cost={data}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value === 0 ? "—" : vnd(value)}</span>
    </div>
  );
}
