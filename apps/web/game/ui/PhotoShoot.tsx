"use client";

import { content } from "@xom/content";
import { useEffect, useRef, useState } from "react";
import { sfx } from "../audio";
import { send } from "../net/socket";
import { useGame } from "../store";
import { setJobsTab } from "./JobsSheet";

/** Vòng ngắm bắt đầu co lại trước khoảnh khắc bấy nhiêu ms. */
const LEAD_MS = 1400;

/**
 * 📸 Khung ngắm (UC-M8, NGHE §3.3): phủ lên cảnh 3D trước quầy. Khoảnh khắc đẹp (khách cười, món bốc khói…) hiện dần ở
 * giữa khung, vòng ngắm co lại đúng lúc đẹp nhất — bấm màn trập khi vòng khít. Server chấm điểm từng tấm theo giờ server.
 */
export function PhotoShoot() {
  const shoot = useGame((s) => s.shoot);
  const setShoot = useGame((s) => s.setShoot);
  const openSheet = useGame((s) => s.openSheet);
  const [now, setNow] = useState(() => Date.now());
  const [shots, setShots] = useState<number[]>([]);
  const [last, setLast] = useState<number | null>(null);
  const [flash, setFlash] = useState(0);
  const busy = useRef(false);

  useEffect(() => {
    if (!shoot) return;
    setShots([]);
    setLast(null);
    let raf = 0;
    const loop = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [shoot]);

  // Bản dev: kịch bản Playwright đọc lịch khoảnh khắc để bấm đúng lúc (máy test chỉ vài khung hình/giây).
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { xomShoot?: () => typeof shoot };
    w.xomShoot = () => useGame.getState().shoot;
    return () => {
      w.xomShoot = undefined;
    };
  }, []);

  if (!shoot) return null;
  const p = content.data.gigs.photo;
  const t = now - shoot.startedAt;
  const over = t > shoot.sessionMs || shots.length >= shoot.shotsMax;
  // Khoảnh khắc gần nhất (sắp tới hoặc vừa qua).
  let near = shoot.moments[0];
  for (const m of shoot.moments) if (Math.abs(m.at - t) < Math.abs((near?.at ?? 0) - t)) near = m;
  const d = near ? near.at - t : Number.POSITIVE_INFINITY;
  const cue = Math.max(0, 1 - Math.abs(d) / p.windowMs);
  const kind = near ? p.kinds[near.kind] : undefined;
  // Vòng co dần tới khoảnh khắc; khít (xanh) chỉ trong lúc bấm là ăn trọn điểm.
  const ring =
    Math.abs(d) <= p.perfectMs ? 1 : d > 0 && d < LEAD_MS ? 1 + (d / LEAD_MS) * 1.6 : null;

  const fire = async () => {
    if (busy.current || over) return;
    busy.current = true;
    sfx("shutter");
    setFlash(Date.now());
    // Gửi kèm lúc bấm theo máy mình — server bù trễ mạng có giới hạn.
    const r = await send("gig:shot", { id: shoot.gigId, at: Date.now() - shoot.startedAt });
    busy.current = false;
    if (r.ok) {
      setShots(r.data.shots.slice(-shoot.shotsMax));
      setLast(r.data.score);
    }
  };
  const done = () => {
    setShoot(null);
    setJobsTab("gigs");
    openSheet("jobs");
  };

  return (
    <div className="fixed inset-0 z-50 select-none" data-photo-shoot={over ? "over" : "on"}>
      {/* Viền tối quanh khung ngắm */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ boxShadow: "inset 0 0 0 18px rgba(20,16,12,0.65)" }}
      />
      {/* Đèn flash */}
      <div
        className="pointer-events-none absolute inset-0 bg-white transition-opacity duration-300"
        style={{ opacity: now - flash < 120 ? 0.85 : 0 }}
      />
      <div className="absolute inset-x-3 top-[max(env(safe-area-inset-top),0.75rem)] flex flex-col gap-1.5 rounded-2xl bg-ink/80 px-3 py-2 text-cream">
        <div className="flex items-center justify-between text-sm font-semibold">
          <span>📸 Chờ đúng lúc rồi bấm</span>
          <span className="tabular-nums" data-shots-left>
            {shots.length}/{shoot.shotsMax} kiểu
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-cream/20">
          <div
            className="h-full rounded-full bg-sun"
            style={{ width: `${Math.max(0, 100 - (t / shoot.sessionMs) * 100)}%` }}
          />
        </div>
      </div>

      {/* Khung ngắm: góc + lưới 1/3 */}
      <div className="pointer-events-none absolute inset-x-6 top-[22%] bottom-[30%]">
        {[
          "top-0 left-0 border-t-4 border-l-4",
          "top-0 right-0 border-t-4 border-r-4",
          "bottom-0 left-0 border-b-4 border-l-4",
          "bottom-0 right-0 border-b-4 border-r-4",
        ].map((c) => (
          <span key={c} className={`absolute h-8 w-8 border-cream/90 ${c}`} />
        ))}
        <span className="absolute inset-y-0 left-1/3 w-px bg-cream/25" />
        <span className="absolute inset-y-0 left-2/3 w-px bg-cream/25" />
        <span className="absolute inset-x-0 top-1/3 h-px bg-cream/25" />
        <span className="absolute inset-x-0 top-2/3 h-px bg-cream/25" />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="relative flex h-28 w-28 items-center justify-center">
            {ring !== null && (
              <span
                className={`absolute inset-0 rounded-full border-4 ${ring === 1 ? "border-leaf" : "border-sun"}`}
                style={{ transform: `scale(${ring})` }}
                data-ring={ring === 1 ? "tight" : "closing"}
              />
            )}
            <span
              className="text-6xl"
              style={{ opacity: 0.15 + cue * 0.85, transform: `scale(${0.7 + cue * 0.5})` }}
            >
              {kind?.emoji ?? "📷"}
            </span>
          </div>
          <span
            className="mt-2 rounded-full bg-ink/70 px-3 py-1 text-sm font-semibold text-cream"
            style={{ opacity: cue > 0.05 ? 1 : 0.35 }}
          >
            {cue > 0.05 ? kind?.label : "Đợi khoảnh khắc…"}
          </span>
        </div>
      </div>

      <div className="absolute inset-x-3 bottom-[max(env(safe-area-inset-bottom),1rem)] flex flex-col items-center gap-3">
        <div className="flex min-h-12 flex-wrap justify-center gap-1.5">
          {shots.map((s, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: tấm theo thứ tự chụp
              key={i}
              className={`flex h-12 w-10 flex-col items-center justify-center rounded-md text-[11px] font-bold tabular-nums shadow ${
                s >= 80 ? "bg-leaf text-cream" : s >= 40 ? "bg-sun" : "bg-cream/80 text-ink/60"
              }`}
            >
              <span className="text-base">{s >= 80 ? "🌟" : s >= 40 ? "🖼️" : "🌫️"}</span>
              {s}
            </span>
          ))}
        </div>
        {last !== null && !over && (
          <output
            className="rounded-full bg-ink/80 px-3 py-1 text-sm font-semibold text-cream"
            data-last-shot={last}
          >
            {last >= 80
              ? `🌟 Đẹp! ${last}`
              : last >= 40
                ? `Tạm được · ${last}`
                : `Hụt rồi · ${last}`}
          </output>
        )}
        {over ? (
          <button
            type="button"
            onClick={done}
            className="h-12 w-full max-w-xs rounded-2xl bg-leaf font-semibold text-cream shadow-lg"
          >
            ✓ Xong buổi chụp — xem ảnh
          </button>
        ) : (
          <div className="flex w-full max-w-xs items-center justify-between">
            <button
              type="button"
              onClick={done}
              className="h-11 rounded-2xl bg-cream/90 px-4 text-sm font-semibold shadow"
            >
              Dừng
            </button>
            <button
              type="button"
              aria-label="Bấm máy"
              onClick={() => void fire()}
              className="h-20 w-20 rounded-full border-[6px] border-cream bg-red shadow-xl active:scale-95"
            />
            <span className="w-[4.5rem]" />
          </div>
        )}
      </div>
    </div>
  );
}
