"use client";

import { formatClock } from "@xom/sim";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { logout } from "../auth/store";
import { vnd } from "../format";
import { type SheetId, useGame } from "../store";

const NAV: { id: SheetId | null; label: string; icon: string }[] = [
  { id: null, label: "Bản đồ", icon: "🗺️" },
  { id: "business", label: "Kinh doanh", icon: "🛒" },
  { id: "market", label: "Chợ", icon: "🧺" },
  { id: "jobs", label: "Việc làm", icon: "💼" },
];

export function Hud() {
  const me = useGame((s) => s.me);
  const clock = useGame((s) => s.clock);
  const sheet = useGame((s) => s.sheet);
  const openSheet = useGame((s) => s.openSheet);
  const [menu, setMenu] = useState(false);
  const [showPerf, setShowPerf] = useState(false);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
      <header className="pt-safe pointer-events-auto flex items-center gap-2 px-3">
        <div className="rounded-full bg-cream/95 px-4 py-2 text-base font-extrabold tabular-nums shadow-sm">
          {me ? vnd(me.money) : "…"}
        </div>
        <div className="rounded-full bg-cream/95 px-4 py-2 text-base font-semibold tabular-nums shadow-sm">
          {clock ? `N${clock.day} · ${formatClock(clock.minute)}` : "…"}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setMenu((v) => !v)}
          aria-expanded={menu}
          aria-label="Menu"
          className="flex h-11 items-center gap-2 rounded-full bg-cream/95 px-3 text-sm font-semibold shadow-sm"
        >
          <Connection />☰
        </button>
      </header>

      {menu && (
        <div className="pointer-events-auto absolute top-16 right-3 z-20 flex w-52 flex-col rounded-2xl bg-cream p-2 shadow-lg">
          <p className="px-3 py-2 text-sm text-ink/60">{me?.displayName}</p>
          <button
            type="button"
            onClick={() => setShowPerf((v) => !v)}
            className="h-11 rounded-xl px-3 text-left font-semibold active:bg-ink/5"
          >
            {showPerf ? "Ẩn số đo" : "Hiện số đo hiệu năng"}
          </button>
          <LogoutButton />
        </div>
      )}

      <Toasts />
      <div className="flex flex-col items-start gap-2 px-3">
        {showPerf && <PerfPanel />}
        <JobBadge />
      </div>

      <nav className="pb-safe pointer-events-auto relative z-40 grid grid-cols-4 gap-1 bg-cream px-2 pt-2 shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
        {NAV.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => openSheet(item.id)}
            aria-current={sheet === item.id ? "page" : undefined}
            className="flex h-14 flex-col items-center justify-center rounded-xl text-xs font-semibold aria-[current=page]:bg-red aria-[current=page]:text-cream"
          >
            <span className="text-xl leading-none" aria-hidden>
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await logout();
        router.replace("/dang-nhap");
      }}
      className="h-11 rounded-xl px-3 text-left font-semibold text-red active:bg-ink/5"
    >
      Đăng xuất
    </button>
  );
}

function Connection() {
  const status = useGame((s) => s.status);
  const ping = useGame((s) => s.pingMs);
  return (
    <>
      <span className={`size-2.5 rounded-full ${status === "online" ? "bg-leaf" : "bg-red"}`} />
      <span className="tabular-nums">{status === "online" ? `${ping ?? "…"}ms` : "Mất mạng"}</span>
    </>
  );
}

function JobBadge() {
  const me = useGame((s) => s.me);
  if (!me?.jobId) return null;
  return (
    <div className="rounded-full bg-leaf px-4 py-2 text-sm font-semibold text-cream shadow-sm">
      💼 Đang đi làm · hôm nay +{vnd(me.today.wages)}
    </div>
  );
}

function Toasts() {
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
          className={`pointer-events-auto rounded-2xl px-4 py-3 text-left text-sm font-semibold shadow-md ${
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
