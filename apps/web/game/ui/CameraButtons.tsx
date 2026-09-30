"use client";

import { useEffect, useRef } from "react";
import { camView, resetView, rotateView, tiltView } from "../scene/CameraRig";
import { useGame } from "../store";

/**
 * Nút đổi góc nhìn (docs/USECASES.md UC-B7) cho ai không quen vặn/kéo hai ngón:
 * xoay trái/phải 45°, nghiêng, la bàn (chạm để về hướng mặc định).
 */
export function CameraButtons() {
  const needle = useRef<HTMLSpanElement>(null);
  const sheet = useGame((s) => s.sheet);
  const kitchen = useGame((s) => s.kitchen);
  const dialogue = useGame((s) => s.dialogue);

  // Kim la bàn quay theo camera (không qua React state).
  useEffect(() => {
    let id = 0;
    const loop = () => {
      if (needle.current) needle.current.style.transform = `rotate(${camView.yaw}rad)`;
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);

  if (sheet || kitchen || dialogue) return null;
  const btn =
    "flex size-10 items-center justify-center rounded-full bg-cream/95 text-base font-bold shadow-md active:scale-95";
  return (
    <div className="pointer-events-auto fixed right-3 bottom-[calc(var(--nav-h)+8.5rem)] z-20 flex flex-col gap-1.5">
      <button
        type="button"
        aria-label="Xoay trái"
        className={btn}
        onClick={() => rotateView(Math.PI / 4)}
      >
        ↺
      </button>
      <button
        type="button"
        aria-label="Xoay phải"
        className={btn}
        onClick={() => rotateView(-Math.PI / 4)}
      >
        ↻
      </button>
      <button
        type="button"
        aria-label="Nhìn thấp xuống"
        className={btn}
        onClick={() => tiltView(0.2)}
      >
        ⤵
      </button>
      <button type="button" aria-label="Về hướng mặc định" className={btn} onClick={resetView}>
        <span ref={needle} className="block leading-none">
          🧭
        </span>
      </button>
    </div>
  );
}
