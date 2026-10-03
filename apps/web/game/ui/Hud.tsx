"use client";

import { content } from "@xom/content";
import { formatClock } from "@xom/sim";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useAlerts } from "../features/alerts";
import { openFeature } from "../features/open";
import { usePins } from "../features/pins";
import { FEATURES, type FeatureId, featureFromLink } from "../features/registry";
import { vnd, vndHud } from "../format";
import { useGame } from "../store";
import {
  IconCash,
  IconDrop,
  IconFood,
  IconJob,
  IconMarket,
  IconMenu,
  IconNeighbors,
  IconQuest,
  IconRice,
  IconShop,
  IconStar,
  IconTrophy,
  IconWeather,
} from "./icons";
import { Objective } from "./Objective";
import { DeliveryHud } from "./work/DeliveryHud";

/** Icon vẽ tay cho chức năng hay ghim (còn lại dùng emoji của danh mục). */
const ANCHOR_ICON: Partial<Record<FeatureId, (c: string) => ReactNode>> = {
  food: (c) => <IconFood className={c} />,
  market: (c) => <IconMarket className={c} />,
  stall: (c) => <IconShop className={c} />,
  jobs: (c) => <IconJob className={c} />,
  board: (c) => <IconTrophy className={c} />,
  quests: (c) => <IconQuest className={c} />,
  neighbors: (c) => <IconNeighbors className={c} />,
};

export function Hud() {
  const sheet = useGame((s) => s.sheet);
  const openSheet = useGame((s) => s.openSheet);
  const showPerf = useGame((s) => s.showPerf);
  const online = useGame((s) => s.roster?.peers.length ?? 0);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
      <header className="pt-safe pointer-events-auto flex items-start gap-2 pr-2 pl-3">
        <ProfileBadge />
        {/* Container query: màn hẹp thì thanh trạng thái tự ẩn bớt phần phụ, không tràn ra ngoài. */}
        <div className="@container flex min-w-0 flex-1 flex-col gap-1.5">
          <ResourceBar />
          <NewsTicker />
        </div>
      </header>

      <div className="flex flex-1 flex-col">
        <Objective />
        <DeliveryHud />
        {/* Icon neo hai bên bản đồ: người chơi tự ghim trong ☰ Menu (cài đặt nằm trong Menu, không neo riêng). */}
        <div className="flex items-start justify-between">
          <SideRail side="left" />
          {/* Thông báo nằm giữa hai cột icon (góp ý đợt 4) — không che thanh trạng thái / thông tin trên đầu. */}
          <div className="relative z-60 min-w-0 flex-1 pt-1">
            <Toasts inline />
          </div>
          <SideRail side="right" />
        </div>
        <div className="mt-auto mb-24 flex flex-col items-start gap-2 px-3">
          {showPerf && <PerfPanel />}
          <JobBadge />
        </div>
      </div>

      {/* Thanh dưới chỉ còn ☰ Menu (docs/IA.md §3): mọi chức năng nằm trong Menu, hay dùng thì ghim lên cột trái. */}
      <nav className="pb-safe pointer-events-none relative z-40 flex h-(--nav-h) items-end px-3">
        {/* Icon không nền, chữ "Menu" đè nhẹ dưới icon (góp ý UI); chấm xanh/đỏ = kết nối. */}
        <button
          type="button"
          aria-label="Menu"
          aria-current={sheet === "menu" ? "page" : undefined}
          onClick={() => openSheet(sheet === "menu" ? null : "menu")}
          className="group pointer-events-auto relative mb-1 flex size-14 flex-col items-center justify-center active:scale-90"
          data-menu-button
        >
          <IconMenu className="icon-halo size-10 group-aria-[current=page]:text-red" />
          <span className="-mt-2 text-[11px] font-extrabold tracking-wide text-ink [text-shadow:0_0_3px_#fff8ec,0_0_3px_#fff8ec,0_0_3px_#fff8ec]">
            Menu
          </span>
          <ConnectionDot />
          {online > 1 && (
            <span
              data-online={online}
              className="absolute -top-1 -right-3 rounded-full bg-leaf px-1.5 text-[10px] font-bold text-cream"
            >
              👥 {online}
            </span>
          )}
        </button>
      </nav>
    </div>
  );
}

/** Ảnh đại diện (chữ cái đầu tên) + ngày; chạm mở hồ sơ. */
function ProfileBadge() {
  const me = useGame((s) => s.me);
  const openSheet = useGame((s) => s.openSheet);
  const initial = (me?.displayName ?? "?").trim().charAt(0).toUpperCase();
  const p = me?.progress;
  const pct = p ? Math.round((p.into / Math.max(1, p.need)) * 100) : 0;
  return (
    <button
      type="button"
      aria-label="Hồ sơ"
      onClick={() => openSheet("profile")}
      className="relative flex size-12 shrink-0 items-center justify-center rounded-full shadow-md active:scale-95"
      style={{ background: `conic-gradient(#2f7d4f ${pct}%, #fff6e5 0)` }}
    >
      {/* Vòng KN quanh ảnh đại diện; số là cấp độ. */}
      <span className="flex size-10 items-center justify-center rounded-full bg-gradient-to-b from-sun to-[#e0a126] text-lg font-extrabold text-ink">
        {initial}
      </span>
      <span className="absolute -bottom-1.5 rounded-full bg-ink px-1.5 text-[10px] font-bold text-cream tabular-nums">
        Cấp {p?.level ?? 1}
      </span>
    </button>
  );
}

/** Thanh chỉ số: tiền · uy tín quầy · no/khát · ngày, trời, giờ — icon vẽ tay, trải tới mép phải. */
function ResourceBar() {
  const me = useGame((s) => s.me);
  const clock = useGame((s) => s.clock);
  const minute = clock?.minute ?? 0;
  const night = minute >= 1080 || minute < 330;
  const sky = clock?.weather.now ?? "sunny";
  const next = clock?.weather.next;
  const skyLabel = `${content.weekday(clock?.day ?? 1).name}, ngày ${clock?.day ?? 1} · ${content.weatherKind(sky).name}${next ? ` — khoảng ${formatClock(next.at)} ${content.weatherKind(next.kind).name.toLowerCase()}` : ""}`;
  const rep = me?.business ? Math.round(me.business.reputation * 50) / 10 : null;
  return (
    <div
      className="flex h-9 min-w-0 items-center gap-1 overflow-hidden rounded-full bg-ink/85 py-1 pr-2 pl-1 text-cream shadow-md @min-[320px]:gap-1.5 @min-[320px]:pr-2.5"
      data-status-bar
    >
      {/* Chạm từng mục mở sheet tương ứng (góp ý đợt 4): tiền → Ví, ⭐ → Đánh giá, giờ/thời tiết → Hôm nay. */}
      <button
        type="button"
        onClick={() => openFeature("wallet")}
        className="flex shrink-0 items-center gap-1 rounded-full bg-cream/15 py-0.5 pr-2 pl-1 text-sm font-extrabold whitespace-nowrap tabular-nums active:scale-95"
        data-money={me?.money}
        aria-label={me ? `Ví — tiền mặt ${vnd(me.money)}` : "Ví"}
        title={me ? `Tiền mặt ${vnd(me.money)}` : undefined}
      >
        <IconCash className="size-5 shrink-0" />
        {me ? vndHud(me.money) : "…"}
      </button>
      {rep !== null && (
        <button
          type="button"
          onClick={() => openFeature("reviews")}
          className="flex shrink-0 items-center gap-0.5 text-xs font-bold tabular-nums active:scale-95"
          aria-label={`Đánh giá — uy tín ${rep.toFixed(1)} sao`}
          title="Uy tín cửa hàng đang quản lý"
        >
          <IconStar className="size-4" />
          {rep.toFixed(1)}
        </button>
      )}
      <NeedsChip />
      <button
        type="button"
        onClick={() => openFeature("today")}
        className="ml-auto flex shrink-0 items-center gap-1 text-xs font-bold whitespace-nowrap tabular-nums active:scale-95"
        data-clock={clock ? minute : undefined}
        data-weather={clock ? sky : undefined}
        aria-label={`Hôm nay — ${skyLabel}`}
        title={skyLabel}
      >
        {/* Thứ + ngày (THEGIOI §2): cuối tuần chữ vàng. */}
        <span
          className={`opacity-90 ${content.weekday(clock?.day ?? 1).weekend ? "text-sun" : ""}`}
          data-weekday={content.weekday(clock?.day ?? 1).short}
        >
          {content.weekday(clock?.day ?? 1).short}
          {/* Màn hẹp chỉ ghi thứ; số ngày xem trong 📅 Hôm nay / title. */}
          <span className="hidden @min-[330px]:inline">·N{clock?.day ?? 1}</span>
        </span>
        <IconWeather kind={sky} night={night} className="size-5" />
        <span className="sr-only">{skyLabel}</span>
        {next && (
          <span
            aria-hidden
            className="hidden items-center opacity-80 @min-[380px]:flex"
            data-next={next.kind}
          >
            ›<IconWeather kind={next.kind} className="size-4" />
          </span>
        )}
        {clock ? formatClock(minute) : "…"}
      </button>
    </div>
  );
}

/** Dải tin "chuyện trong xóm": xoay vòng mấy tin mới nhất. */
function NewsTicker() {
  const news = useGame((s) => s.news);
  const [i, setI] = useState(0);
  const newest = news.at(-1)?.id;
  useEffect(() => {
    // Tin mới về thì hiện ngay (về đầu vòng), rồi mới xoay vòng các tin cũ mỗi 5 giây.
    setI(0);
    if (newest === undefined) return;
    const id = setInterval(() => setI((v) => v + 1), 5000);
    return () => clearInterval(id);
  }, [newest]);
  const item = news.length ? news[news.length - 1 - (i % news.length)] : null;
  return (
    <button
      type="button"
      onClick={() => openFeature("board")}
      aria-label={`Tin xóm: ${item?.text ?? "Một ngày mới trong xóm…"} — mở Bảng xóm`}
      className="flex h-7 items-center gap-1.5 overflow-hidden rounded-full bg-cream/90 px-2.5 text-left text-xs font-semibold shadow-sm active:scale-[0.98]"
      data-news-ticker
    >
      <span aria-hidden>📺</span>
      <span key={item?.id} className="truncate">
        {item?.text ?? "Một ngày mới trong xóm…"}
      </span>
    </button>
  );
}

/**
 * Icon neo bên trái bản đồ (docs/IA.md §3): tối đa 4 chức năng người chơi tự ghim trong ☰ Menu (mặc định ăn uống, chợ,
 * quầy của tôi, làm thuê) — icon không nền, không chữ (tên ở aria-label / title).
 */
function SideRail({ side }: { side: "left" | "right" }) {
  const pins = usePins((s) => s.pins[side]);
  const alerts = useAlerts();
  return (
    <div className="flex flex-col gap-1 self-start px-2" data-anchor-rail={side}>
      {pins.map((id) => {
        const f = FEATURES[id];
        const icon = ANCHOR_ICON[id];
        return (
          <button
            key={id}
            type="button"
            aria-label={f.title}
            title={alerts[id] ? `${f.title} — ${alerts[id]}` : f.title}
            data-anchor={id}
            data-alert={alerts[id] ? true : undefined}
            className="pointer-events-auto relative flex size-12 items-center justify-center active:scale-90"
            onClick={() => openFeature(id)}
          >
            {icon ? (
              icon("icon-halo size-11")
            ) : (
              <span aria-hidden className="icon-halo text-[2.1rem] leading-none">
                {f.icon}
              </span>
            )}
            {alerts[id] && (
              <span className="absolute top-0.5 right-0.5 size-3 rounded-full bg-red ring-2 ring-white" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Đói / khát (UC-B11): chỉ hiện khi dưới 50% — HUD gọn (Luật 12.1). Dưới mức đói thì đỏ, nhấp nháy; chạm để mở
 * danh sách quán ăn.
 */
function NeedsChip() {
  const needs = useGame((s) => s.me?.needs);
  const openSheet = useGame((s) => s.openSheet);
  if (!needs || (needs.food >= 50 && needs.drink >= 50)) return null;
  const low = content.data.needs.lowAt;
  const item = (icon: ReactNode, v: number, label: string) =>
    v < 50 ? (
      <span
        className={`flex items-center gap-0.5 tabular-nums ${v < low ? "animate-pulse text-[#ff9b8a]" : ""}`}
        title={`${label} ${v}%`}
      >
        {icon}
        {/* Màn hẹp chỉ còn icon (đỏ, nhấp nháy khi đói/khát); số % ở title. */}
        <span className="hidden @min-[320px]:inline">{v}%</span>
      </span>
    ) : null;
  return (
    <button
      type="button"
      onClick={() => openSheet("food")}
      aria-label={`No ${needs.food}%, khát ${needs.drink}% — mở quán ăn`}
      data-needs={`${needs.food}:${needs.drink}`}
      className="flex shrink-0 items-center gap-1 rounded-full bg-cream/15 px-1.5 py-0.5 text-xs font-semibold"
    >
      {item(<IconRice className="size-4" />, needs.food, "No")}
      {item(<IconDrop className="size-4" />, needs.drink, "Đỡ khát")}
    </button>
  );
}

/** Chấm trạng thái kết nối trên nút Menu. */
function ConnectionDot() {
  const status = useGame((s) => s.status);
  return (
    <span
      className={`absolute top-0 right-0 size-3 rounded-full ring-2 ring-cream ${status === "online" ? "bg-leaf" : "bg-red"}`}
    />
  );
}

function JobBadge() {
  const me = useGame((s) => s.me);
  const shift = useGame((s) => s.shift);
  if (!me?.jobId || shift?.role === "giao_hang") return null;
  return (
    <div className="rounded-full bg-leaf px-3 py-1.5 text-xs font-semibold text-cream shadow-sm">
      💼 Đang đi làm · hôm nay +{vnd(me.today.wages)}
    </div>
  );
}

export function Toasts({ inline = false }: { inline?: boolean }) {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  const openSheet = useGame((s) => s.openSheet);
  if (!toasts.length) return null;
  return (
    // Một khối duy nhất đè tạm lên thanh trạng thái + dải tin (3,5 giây), mới nhất trên cùng — không còn các mẩu rời căn
    // giữa chồng lên dải tin / thanh nhiệm vụ (góp ý chơi thử). Nằm trên mọi sheet/modal để lỗi không bị che.
    <div
      className={`pointer-events-none flex flex-col overflow-hidden rounded-2xl bg-cream shadow-lg ring-1 ring-ink/10 ${
        inline ? "" : "fixed inset-x-3 top-[max(env(safe-area-inset-top),0.75rem)] z-60"
      }`}
      aria-live="polite"
      data-toasts={toasts.length}
      data-toasts-inline={inline || undefined}
    >
      {[...toasts].reverse().map((t, i) => (
        <button
          key={t.id}
          type="button"
          onClick={() => {
            dismiss(t.id);
            if (t.open) {
              // Thông báo trỏ thẳng tới một chức năng (id trong features/registry; nhận cả kiểu cũ "jobs:gigs").
              const id = featureFromLink(t.open);
              if (id) openSheet(id);
            }
          }}
          data-toast-open={t.open}
          className={`pointer-events-auto flex items-start gap-2 border-l-4 px-3 py-2 text-left text-sm leading-snug font-semibold ${
            i > 0 ? "border-t border-t-ink/10 text-ink/75" : ""
          } ${
            t.kind === "warn"
              ? "border-l-red bg-red/10"
              : t.kind === "good"
                ? "border-l-leaf bg-leaf/10"
                : "border-l-sun"
          }`}
        >
          <span className={`flex-1 ${inline ? "line-clamp-3 text-[13px]" : "line-clamp-2"}`}>
            {t.text}
          </span>
          {t.open && <span className="shrink-0 self-center text-xs text-red">Xem ›</span>}
        </button>
      ))}
    </div>
  );
}

function PerfPanel() {
  const perf = useGame((s) => s.perf);
  return (
    <div className="rounded-xl bg-ink/75 px-3 py-2 font-mono text-xs leading-5 text-cream">
      <div className={perf.fps < 30 ? "text-sun" : undefined}>FPS {perf.fps}</div>
      <div className={perf.calls > 100 ? "text-sun" : undefined}>Draw calls {perf.calls}</div>
      <div className={perf.triangles > 80000 ? "text-sun" : undefined}>
        Tris {perf.triangles.toLocaleString("vi-VN")}
      </div>
      <div>DPR {perf.dpr}</div>
    </div>
  );
}
