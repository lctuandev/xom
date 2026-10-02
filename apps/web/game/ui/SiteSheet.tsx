"use client";

import { content } from "@xom/content";
import type { CrewView, MixResultView } from "@xom/shared";
import { formatClock } from "@xom/sim";
import { useCallback, useEffect, useState } from "react";
import { sfx } from "../audio";
import { vnd, vndShort } from "../format";
import { send } from "../net/socket";
import { useGame } from "../store";
import { Sheet } from "./Sheet";

/**
 * 🏗️ Phụ hồ công trình xóm (UC-J6, NGHE §3.4): Cai Lâm giao mẻ vữa ("2 bao vữa trát"); mình đổ đủ xi măng, cát, nước theo
 * định mức thật rồi trộn. Đúng thì có công (từ khoản nhân công của công trình), sai thì đổ bỏ làm lại. Đủ mẻ thì xong sớm.
 */
export function SiteSheet() {
  const siteId = useGame((s) => s.nearSite ?? s.world.sites?.[0]?.id ?? null);
  const minute = useGame((s) => s.clock?.minute ?? 0);
  const close = useGame((s) => s.openSheet);
  const [v, setV] = useState<CrewView | null>(null);
  const [cement, setCement] = useState(0);
  const [sand, setSand] = useState(0);
  const [water, setWater] = useState(0);
  const [result, setResult] = useState<MixResultView | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!siteId) return;
    void send("crew:view", { siteId }).then((r) => r.ok && setV(r.data));
  }, [siteId]);
  useEffect(load, [load]);

  const c = content.data.crew;
  const project = v ? content.data.projects.find((p) => p.id === v.site.projectId) : null;
  const mix = v ? c.mixes.find((m) => m.id === v.order.mixId) : null;
  const waiting = v?.readyAt !== null && v?.readyAt !== undefined && v.readyAt > minute;

  const doMix = async () => {
    if (!siteId) return;
    setBusy(true);
    const r = await send("crew:mix", { siteId, cement, sand, water });
    setBusy(false);
    if (!r.ok) return;
    sfx(r.data.ok ? "coin" : "error");
    setResult(r.data);
    setV(r.data.view);
    setCement(0);
    setSand(0);
    setWater(0);
  };

  return (
    <Sheet title={`🏗️ Công trường · ${c.keeper}`} onClose={() => close(null)}>
      {!siteId ? (
        <p className="text-sm text-ink/60">Xóm chưa có công trình nào đang thi công.</p>
      ) : !v || !mix ? (
        <p className="text-sm text-ink/50">Đang ra công trường…</p>
      ) : (
        <div className="flex flex-col gap-3" data-site={v.site.projectId}>
          <div className="rounded-2xl bg-white p-3 shadow-sm">
            <p className="text-sm font-extrabold">
              {project?.emoji} {project?.name}
            </p>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full rounded-full bg-sun"
                style={{ width: `${Math.min(100, (v.site.mixes / v.site.need) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-ink/60 tabular-nums" data-mixes={v.site.mixes}>
              {v.site.mixes}/{v.site.need} mẻ vữa — đủ là xong sớm · tiền công còn{" "}
              {vndShort(v.site.budget)} · công {vndShort(c.wagePerMix)}/mẻ · hôm nay bạn{" "}
              {v.today.mixes} mẻ, {vnd(v.today.earned)}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-3 shadow-sm ring-2 ring-sun" data-order={mix.id}>
            <p className="text-xs font-semibold text-ink/60">🗣️ {c.keeper} giao</p>
            <p className="text-base font-extrabold" data-order-bags={v.order.bags}>
              Trộn {v.order.bags} bao {mix.name.toLowerCase()}
            </p>
            <p className="text-xs text-ink/60">Để {mix.use}.</p>
            <div className="mt-2 rounded-xl bg-cream p-2 text-xs">
              <p className="font-semibold">📏 Định mức (1 bao xi măng 50 kg)</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {c.mixes.map((m) => (
                  <li key={m.id} className={m.id === mix.id ? "font-semibold" : "text-ink/60"}>
                    {m.name}: {m.sandPerBag} thùng cát 18 lít · ~{m.waterPerBag} lít nước
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl bg-white p-3 shadow-sm">
            <Stepper label="🧱 Xi măng" unit="bao" value={cement} step={1} onChange={setCement} />
            <Stepper label="⛱️ Cát" unit="thùng" value={sand} step={1} big={5} onChange={setSand} />
            <Stepper
              label="💧 Nước"
              unit="lít"
              value={water}
              step={5}
              big={20}
              onChange={setWater}
            />
            <button
              type="button"
              disabled={busy || waiting || cement === 0}
              onClick={() => void doMix()}
              className="mt-1 h-12 rounded-xl bg-leaf font-semibold text-cream disabled:opacity-40"
            >
              {waiting && v.readyAt !== null
                ? `⏳ Mẻ trước đang dùng — trộn tiếp lúc ${formatClock(v.readyAt)}`
                : "🪣 Trộn mẻ này"}
            </button>
          </div>

          {result && (
            <p
              className={`rounded-xl p-3 text-sm font-semibold ${result.ok ? "bg-leaf/15 text-leaf" : "bg-red/10 text-red"}`}
              data-mix-result={result.ok ? "ok" : "bad"}
            >
              {result.ok
                ? `✅ ${c.keeper}: "Vữa ngon!" · +${vnd(result.pay)}`
                : `❌ ${c.keeper}: "${result.problems.join(", ")} — đổ bỏ, trộn lại!"`}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Stepper({
  label,
  unit,
  value,
  step,
  big,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  step: number;
  /** Nút tăng nhanh (vd. +5 thùng cát). */
  big?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2" data-stepper={unit}>
      <span className="text-sm font-semibold">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={`Bớt ${label}`}
          onClick={() => onChange(Math.max(0, value - step))}
          className="h-10 w-10 rounded-xl bg-cream text-lg font-bold ring-1 ring-ink/10"
        >
          −
        </button>
        <span className="w-16 text-center text-sm font-bold tabular-nums">
          {value} {unit}
        </span>
        <button
          type="button"
          aria-label={`Thêm ${label}`}
          onClick={() => onChange(value + step)}
          className="h-10 w-10 rounded-xl bg-cream text-lg font-bold ring-1 ring-ink/10"
        >
          +
        </button>
        {big && (
          <button
            type="button"
            aria-label={`Thêm ${big} ${unit} ${label}`}
            onClick={() => onChange(value + big)}
            className="h-10 rounded-xl bg-cream px-2 text-sm font-bold ring-1 ring-ink/10"
          >
            +{big}
          </button>
        )}
      </div>
    </div>
  );
}
