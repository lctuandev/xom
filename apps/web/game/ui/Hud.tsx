"use client";

import { content } from "@xom/content";
import { formatClock } from "@xom/sim";
import { useEffect, useState } from "react";
import { vnd } from "../format";
import { type SheetId, useGame } from "../store";
import { IconFood, IconGear, IconMarket, IconTrophy } from "./icons";
import { Objective } from "./Objective";
import { DeliveryHud } from "./work/DeliveryHud";

type NavItem = { id: SheetId | null; label: string; icon: string };

/**
 * Điều hướng chính (docs/PLAN.md — HUD): 5 mục theo nhóm tính năng, giữa là Nhiệm vụ (nổi lên).
 * Xóm = bản đồ · Làm ăn = quầy/chợ/công thức/kho · Nhiệm vụ = việc hôm nay + hướng dẫn ·
 * Việc làm = làm thuê (sau này: bảng tuyển dụng) · Hàng xóm = ai online, mời bạn (sau này: bạn bè, chat).
 */
const NAV: NavItem[] = [
  { id: null, label: "Xóm", icon: "🗺️" },
  { id: "business", label: "Làm ăn", icon: "🏪" },
  { id: "quests", label: "Nhiệm vụ", icon: "🎯" },
  { id: "jobs", label: "Việc làm", icon: "💼" },
  { id: "xom", label: "Hàng xóm", icon: "👥" },
];

export function Hud() {
  const sheet = useGame((s) => s.sheet);
  const openSheet = useGame((s) => s.openSheet);
  const showPerf = useGame((s) => s.showPerf);
  const online = useGame((s) => s.roster?.peers.length ?? 0);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
      <header className="pt-safe pointer-events-auto flex items-start gap-2 px-3">
        <ProfileBadge />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <ResourceBar />
          <NewsTicker />
        </div>
        <button
          type="button"
          onClick={() => openSheet(sheet === "settings" ? null : "settings")}
          aria-label="Cài đặt"
          title="Cài đặt"
          className="relative flex size-11 shrink-0 items-center justify-center active:scale-90"
        >
          <IconGear className="icon-halo size-10" />
          <ConnectionDot />
        </button>
      </header>

      <Toasts />
      <div className="flex flex-1 flex-col">
        <Objective />
        <DeliveryHud />
        <SideRail />
        <div className="mt-auto mb-24 flex flex-col items-start gap-2 px-3">
          {showPerf && <PerfPanel />}
          <JobBadge />
        </div>
      </div>

      <nav className="pb-safe pointer-events-auto relative z-40 grid grid-cols-5 items-end gap-0.5 bg-cream px-1.5 pt-1.5 shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
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
              className={
                center
                  ? "-mt-6 flex flex-col items-center gap-0.5 text-[11px] font-semibold"
                  : "relative flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold aria-[current=page]:bg-red aria-[current=page]:text-cream"
              }
            >
              {center ? (
                <span className="flex size-14 items-center justify-center rounded-full bg-red text-2xl text-cream shadow-lg ring-4 ring-cream">
                  {item.icon}
                </span>
              ) : (
                <span className="text-lg leading-none" aria-hidden>
                  {item.icon}
                </span>
              )}
              {item.label}
              {item.id === "xom" && online > 1 && (
                <span className="absolute top-0.5 right-3 flex size-4 items-center justify-center rounded-full bg-leaf text-[10px] font-bold text-cream">
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

/** Thanh chỉ số: tiền · uy tín quầy · giờ (mặt trời/trăng). */
function ResourceBar() {
  const me = useGame((s) => s.me);
  const clock = useGame((s) => s.clock);
  const minute = clock?.minute ?? 0;
  const night = minute >= 1080 || minute < 330;
  const sky = clock?.weather.now ?? "sunny";
  // Trời quang ban đêm thì là trăng; còn lại hiện kiểu trời (UC-B4) — không thêm nút mới (Luật 12.1).
  const icon = night && sky === "sunny" ? "🌙" : content.weatherKind(sky).emoji;
  const next = clock?.weather.next;
  const skyLabel = `${content.weatherKind(sky).name}${next ? ` — khoảng ${formatClock(next.at)} ${content.weatherKind(next.kind).name.toLowerCase()}` : ""}`;
  const rep = me?.business ? Math.round(me.business.reputation * 50) / 10 : null;
  return (
    <div className="flex items-center gap-2 rounded-full bg-ink/80 py-1 pr-3 pl-1 text-cream shadow-md">
      <span
        className="rounded-full bg-cream/15 px-2 py-0.5 text-sm font-extrabold tabular-nums"
        data-money={me?.money}
      >
        💵 {me ? vnd(me.money) : "…"}
      </span>
      {rep !== null && (
        <span className="text-xs font-semibold tabular-nums">⭐ {rep.toFixed(1)}</span>
      )}
      <NeedsChip />
      <span
        className="ml-auto text-xs font-semibold tabular-nums"
        data-clock={clock ? minute : undefined}
        data-weather={clock ? sky : undefined}
        title={skyLabel}
      >
        N{clock?.day ?? 1} <span aria-hidden>{icon}</span>
        <span className="sr-only">{skyLabel}</span>
        {next && (
          <span aria-hidden className="opacity-80">
            →{content.weatherKind(next.kind).emoji}
          </span>
        )}{" "}
        {clock ? formatClock(minute) : "…"}
      </span>
    </div>
  );
}

/** Dải tin "chuyện trong xóm": xoay vòng mấy tin mới nhất. */
function NewsTicker() {
  const news = useGame((s) => s.news);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (news.length < 2) return;
    const id = setInterval(() => setI((v) => v + 1), 5000);
    return () => clearInterval(id);
  }, [news.length]);
  const item = news.length ? news[news.length - 1 - (i % news.length)] : null;
  return (
    <div className="flex h-7 items-center gap-1.5 overflow-hidden rounded-full bg-cream/90 px-2.5 text-xs font-semibold shadow-sm">
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
  const item = (icon: string, v: number, label: string) =>
    v < 50 ? (
      <span
        className={`tabular-nums ${v < low ? "animate-pulse text-[#ff9b8a]" : ""}`}
        title={`${label} ${v}%`}
      >
        {icon}
        {v}%
      </span>
    ) : null;
  return (
    <button
      type="button"
      onClick={() => openSheet("food")}
      aria-label={`No ${needs.food}%, khát ${needs.drink}% — mở quán ăn`}
      data-needs={`${needs.food}:${needs.drink}`}
      className="flex items-center gap-1 rounded-full bg-cream/15 px-1.5 py-0.5 text-xs font-semibold"
    >
      {item("🍚", needs.food, "No")}
      {item("💧", needs.drink, "Đỡ khát")}
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
  return (
    // Nằm trên mọi sheet/modal để thông báo lỗi không bị che.
    <div
      className="pointer-events-none fixed inset-x-3 top-[calc(max(env(safe-area-inset-top),0.75rem)+3.5rem)] z-60 flex flex-col items-center gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto rounded-xl px-3 py-2 text-left text-sm font-semibold shadow-md ${
            t.kind === "warn"
              ? "bg-red text-cream"
              : t.kind === "good"
                ? "bg-leaf text-cream"
                : "bg-cream"
          }`}
        >
          {t.text}
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
