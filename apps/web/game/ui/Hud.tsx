"use client";

import { content } from "@xom/content";
import { formatClock } from "@xom/sim";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { vnd, vndHud } from "../format";
import { type SheetId, useGame } from "../store";
import {
  IconCash,
  IconDrop,
  IconFood,
  IconGear,
  IconJob,
  IconMap,
  IconMarket,
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

type NavItem = { id: SheetId | null; label: string; icon: (c: string) => ReactNode };

/**
 * Điều hướng chính (docs/PLAN.md — HUD): 5 mục theo nhóm tính năng, giữa là Nhiệm vụ (nổi lên).
 * Xóm = bản đồ · Làm ăn = quầy/chợ/công thức/kho · Nhiệm vụ = việc hôm nay + hướng dẫn ·
 * Việc làm = làm thuê (sau này: bảng tuyển dụng) · Hàng xóm = ai online, mời bạn (sau này: bạn bè, chat).
 */
const NAV: NavItem[] = [
  { id: null, label: "Xóm", icon: (c) => <IconMap className={c} /> },
  { id: "business", label: "Làm ăn", icon: (c) => <IconShop className={c} /> },
  { id: "quests", label: "Nhiệm vụ", icon: (c) => <IconQuest className={c} /> },
  { id: "jobs", label: "Việc làm", icon: (c) => <IconJob className={c} /> },
  { id: "xom", label: "Hàng xóm", icon: (c) => <IconNeighbors className={c} /> },
];

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

      <Toasts />
      <div className="flex flex-1 flex-col">
        <Objective />
        <DeliveryHud />
        {/* Icon neo hai bên bản đồ: trái = ăn uống, chợ, bảng xóm · phải = cài đặt (góp ý UI: gỡ khỏi thanh trên). */}
        <div className="flex items-start justify-between">
          <SideRail />
          <div className="mt-2 flex flex-col gap-1.5 px-2">
            <button
              type="button"
              onClick={() => openSheet(sheet === "settings" ? null : "settings")}
              aria-label="Cài đặt"
              title="Cài đặt"
              className="pointer-events-auto relative flex size-12 items-center justify-center active:scale-90"
            >
              <IconGear className="icon-halo size-10" />
              <ConnectionDot />
            </button>
          </div>
        </div>
        <div className="mt-auto mb-24 flex flex-col items-start gap-2 px-3">
          {showPerf && <PerfPanel />}
          <JobBadge />
        </div>
      </div>

      {/* Không nền (góp ý UI): chỉ icon vẽ tay + nhãn chữ, nổi trên bản đồ nhờ quầng sáng như cột icon neo. */}
      <nav className="pb-safe pointer-events-none relative z-40 grid grid-cols-5 items-end gap-0.5 px-1.5 pt-1">
        {NAV.map((item) => {
          const center = item.id === "quests";
          const active = sheet === item.id;
          const label = item.id === "xom" ? `Hàng xóm: ${online} người online` : item.label;
          return (
            <button
              key={item.label}
              type="button"
              aria-label={label}
              onClick={() => openSheet(active ? null : item.id)}
              aria-current={active ? "page" : undefined}
              className={`group pointer-events-auto relative flex flex-col items-center ${center ? "-mt-5" : "h-14 justify-end"}`}
            >
              {/* Icon vẽ tay cỡ lớn; nhãn chữ đè nhẹ ở chân icon (góp ý UI) — mục đang mở nổi lên + nhãn đỏ. */}
              {center ? (
                <span className="flex size-16 items-end justify-center transition-transform group-active:scale-90 group-aria-[current=page]:-translate-y-1 group-aria-[current=page]:scale-110">
                  {item.icon("icon-halo size-14")}
                </span>
              ) : (
                <span className="flex h-11 items-end transition-transform group-active:scale-90 group-aria-[current=page]:-translate-y-1 group-aria-[current=page]:scale-110">
                  {item.icon("icon-halo size-10")}
                </span>
              )}
              <span
                aria-hidden
                className={`relative -mt-2.5 rounded-full px-1.5 py-px text-[10px] leading-tight font-extrabold whitespace-nowrap shadow-sm ring-1 ring-cream/80 ${
                  active ? "bg-red text-cream" : "bg-ink/80 text-cream"
                }`}
              >
                {item.label}
              </span>
              {item.id === "xom" && online > 1 && (
                <span className="absolute top-0 right-2 flex size-4 items-center justify-center rounded-full bg-leaf text-[10px] font-bold text-cream ring-2 ring-cream">
                  {online}
                </span>
              )}
            </button>
          );
        })}
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
      <span
        className="flex shrink-0 items-center gap-1 rounded-full bg-cream/15 py-0.5 pr-2 pl-1 text-sm font-extrabold whitespace-nowrap tabular-nums"
        data-money={me?.money}
        title={me ? `Tiền mặt ${vnd(me.money)}` : undefined}
      >
        <IconCash className="size-5 shrink-0" />
        {me ? vndHud(me.money) : "…"}
      </span>
      {rep !== null && (
        <span
          className="flex shrink-0 items-center gap-0.5 text-xs font-bold tabular-nums"
          title="Uy tín quầy"
        >
          <IconStar className="size-4" />
          {rep.toFixed(1)}
        </span>
      )}
      <NeedsChip />
      <span
        className="ml-auto flex shrink-0 items-center gap-1 text-xs font-bold whitespace-nowrap tabular-nums"
        data-clock={clock ? minute : undefined}
        data-weather={clock ? sky : undefined}
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
      </span>
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
    <div
      className="flex h-7 items-center gap-1.5 overflow-hidden rounded-full bg-cream/90 px-2.5 text-xs font-semibold shadow-sm"
      data-news-ticker
    >
      <span aria-hidden>📺</span>
      <span key={item?.id} className="truncate">
        {item?.text ?? "Một ngày mới trong xóm…"}
      </span>
    </div>
  );
}

/**
 * Icon neo bên trái bản đồ (góp ý UX): ăn uống, ra chợ, bảng xóm — icon vẽ tay nhìn là biết, không nền, không chữ
 * (tên đầy đủ ở aria-label / title).
 */
function SideRail() {
  const openSheet = useGame((s) => s.openSheet);
  const nearPlace = useGame((s) => s.nearPlace);
  const setGoal = useGame((s) => s.setGoal);
  const toast = useGame((s) => s.toast);
  const btn = "pointer-events-auto flex size-12 items-center justify-center active:scale-90";
  const icon = "icon-halo size-11";
  return (
    <div className="mt-2 flex flex-col gap-1.5 self-start px-2">
      <button
        type="button"
        aria-label="Quán ăn quanh xóm"
        title="Ăn uống"
        className={btn}
        onClick={() => openSheet("food")}
      >
        <IconFood className={icon} />
      </button>
      <button
        type="button"
        aria-label="Ra chợ"
        title="Chợ đầu mối"
        className={btn}
        onClick={() => {
          if (nearPlace === "cho_dau_moi") return openSheet("market");
          openSheet(null);
          setGoal({ kind: "place", id: "cho_dau_moi", open: "market" });
          toast({ kind: "info", text: "Đang đi ra chợ đầu mối…" });
        }}
      >
        <IconMarket className={icon} />
      </button>
      <button
        type="button"
        aria-label="Bảng xóm"
        title="Bảng xóm: giải tuần, thị phần, đang hot"
        className={btn}
        onClick={() => openSheet("board")}
      >
        <IconTrophy className={icon} />
      </button>
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

/** Chấm trạng thái kết nối trên nút cài đặt. */
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

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  if (!toasts.length) return null;
  return (
    // Một khối duy nhất đè tạm lên thanh trạng thái + dải tin (3,5 giây), mới nhất trên cùng — không còn các mẩu rời căn
    // giữa chồng lên dải tin / thanh nhiệm vụ (góp ý chơi thử). Nằm trên mọi sheet/modal để lỗi không bị che.
    <div
      className="pointer-events-none fixed inset-x-3 top-[max(env(safe-area-inset-top),0.75rem)] z-60 flex flex-col overflow-hidden rounded-2xl bg-cream shadow-lg ring-1 ring-ink/10"
      aria-live="polite"
      data-toasts={toasts.length}
    >
      {[...toasts].reverse().map((t, i) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
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
          <span className="line-clamp-2">{t.text}</span>
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
