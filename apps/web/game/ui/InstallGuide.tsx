"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";

/** Sự kiện cài PWA của Chrome/Android (chưa có trong lib.dom). */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "android";

/** Ảnh chụp Safari iOS (đã làm mờ danh bạ) + vùng cần bấm (phần trăm khung ảnh). */
const IOS_STEPS = [
  {
    img: "/pwa/ios-1.webp",
    text: "Bấm nút Chia sẻ ở thanh dưới của Safari",
    box: { left: 41, top: 91.5, width: 16, height: 5.5 },
  },
  {
    img: "/pwa/ios-2.webp",
    text: "Kéo lên rồi bấm “Xem thêm”",
    box: { left: 73, top: 84.5, width: 19, height: 12 },
  },
  {
    img: "/pwa/ios-3.webp",
    text: "Chọn “Thêm vào Màn hình chính” → bấm Thêm",
    box: { left: 3, top: 93.4, width: 94, height: 5.6 },
  },
] as const;

function detect(): { platform: Platform; installed: boolean } {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const installed =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return { platform: ios ? "ios" : "android", installed };
}

/**
 * Nút + hướng dẫn thêm XÓM vào màn hình chính (PWA) ở trang chủ: iOS xem từng bước có ảnh khoanh vùng;
 * Android cài thẳng bằng hộp cài của Chrome nếu có, không thì hướng dẫn qua menu ⋮. Đã cài thì ẩn nút.
 */
export function InstallGuide() {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("ios");
  const [installed, setInstalled] = useState(true);
  const [step, setStep] = useState(0);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const d = detect();
    setPlatform(d.platform);
    setInstalled(d.installed);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;
  const s = IOS_STEPS[step] ?? IOS_STEPS[0];

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setStep(0);
          setOpen(true);
        }}
        className="mx-6 mb-3 flex h-11 items-center justify-center gap-2 rounded-2xl border-2 border-red/30 bg-white text-sm font-semibold text-red active:scale-[0.98]"
      >
        📲 Thêm XÓM vào màn hình chính
      </button>
      {open && (
        <Modal title="Cài XÓM như ứng dụng" onClose={() => setOpen(false)}>
          <p className="mb-3 text-sm text-ink/70">
            Mở XÓM từ màn hình chính: toàn màn hình, không thanh địa chỉ, vào game nhanh hơn.
          </p>
          <div className="mb-3 grid grid-cols-2 gap-1.5" role="tablist" aria-label="Loại máy">
            {(["ios", "android"] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={platform === p}
                onClick={() => setPlatform(p)}
                className="h-10 rounded-xl bg-white text-sm font-semibold shadow-sm aria-selected:bg-ink aria-selected:text-cream"
              >
                {p === "ios" ? "📱 iPhone / iPad" : "🤖 Android"}
              </button>
            ))}
          </div>

          {platform === "ios" ? (
            <div data-install="ios">
              <p className="mb-2 text-center text-sm font-extrabold" aria-live="polite">
                Bước {step + 1}/3 · {s.text}
              </p>
              <div className="relative mx-auto w-fit overflow-hidden rounded-2xl shadow-md">
                {/* biome-ignore lint/performance/noImgElement: ảnh tĩnh nhỏ trong public, không cần next/image */}
                <img
                  src={s.img}
                  alt={`Bước ${step + 1}: ${s.text}`}
                  width={460}
                  height={1000}
                  className="block h-[min(48dvh,26rem)] w-auto"
                />
                <span
                  aria-hidden="true"
                  className="absolute animate-pulse rounded-xl border-[3px] border-red shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]"
                  style={{
                    left: `${s.box.left}%`,
                    top: `${s.box.top}%`,
                    width: `${s.box.width}%`,
                    height: `${s.box.height}%`,
                  }}
                />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  disabled={step === 0}
                  onClick={() => setStep(step - 1)}
                  className="h-11 flex-1 rounded-xl bg-white font-semibold shadow-sm disabled:opacity-30"
                >
                  ← Quay lại
                </button>
                <div className="flex gap-1" aria-hidden="true">
                  {IOS_STEPS.map((x, i) => (
                    <span
                      key={x.img}
                      className={`size-2 rounded-full ${i === step ? "bg-red" : "bg-ink/20"}`}
                    />
                  ))}
                </div>
                {step < IOS_STEPS.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setStep(step + 1)}
                    className="h-11 flex-1 rounded-xl bg-red font-semibold text-cream"
                  >
                    Tiếp →
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="h-11 flex-1 rounded-xl bg-leaf font-semibold text-cream"
                  >
                    Xong 👍
                  </button>
                )}
              </div>
              <p className="mt-2 text-center text-xs text-ink/60">
                Cần mở bằng Safari. Đang ở Zalo/Messenger thì bấm ⋯ → “Mở bằng trình duyệt” trước.
              </p>
            </div>
          ) : (
            <div data-install="android" className="flex flex-col gap-2">
              {prompt ? (
                <button
                  type="button"
                  onClick={async () => {
                    await prompt.prompt();
                    const { outcome } = await prompt.userChoice;
                    setPrompt(null);
                    if (outcome === "accepted") setOpen(false);
                  }}
                  className="h-12 rounded-2xl bg-red font-semibold text-cream"
                >
                  📲 Cài ngay
                </button>
              ) : null}
              <ol className="flex flex-col gap-2 text-sm">
                {[
                  "Mở XÓM bằng Chrome (đang ở Zalo/Messenger thì bấm ⋮ → “Mở bằng trình duyệt”)",
                  "Bấm ⋮ ở góc trên bên phải",
                  "Chọn “Thêm vào màn hình chính” hoặc “Cài đặt ứng dụng” → Cài đặt",
                ].map((t, i) => (
                  <li key={t} className="flex gap-2 rounded-xl bg-white p-3 shadow-sm">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-red text-xs font-bold text-cream">
                      {i + 1}
                    </span>
                    {t}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
