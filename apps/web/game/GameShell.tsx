"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { refreshAccessToken, useAuth } from "./auth/store";
import { connectGame } from "./net/socket";
import { Scene } from "./scene/Scene";
import { useGame } from "./store";
import { BusinessSheet } from "./ui/BusinessSheet";
import { DaySummary } from "./ui/DaySummary";
import { Hud } from "./ui/Hud";
import { JobsSheet } from "./ui/JobsSheet";
import { MarketSheet } from "./ui/MarketSheet";
import { Welcome } from "./ui/Welcome";

const LOGIN = "/dang-nhap?next=/play";

export default function GameShell() {
  const router = useRouter();
  const contextLost = useGame((s) => s.contextLost);
  const me = useGame((s) => s.me);
  const sheet = useGame((s) => s.sheet);
  const [authed, setAuthed] = useState(false);

  // Cổng đăng nhập: có access token trong bộ nhớ hoặc refresh được bằng cookie thì mới kết nối.
  useEffect(() => {
    let cancelled = false;
    let disconnect: (() => void) | undefined;
    (async () => {
      const token = useAuth.getState().accessToken ?? (await refreshAccessToken());
      if (cancelled) return;
      if (!token) {
        router.replace(LOGIN);
        return;
      }
      setAuthed(true);
      disconnect = connectGame(() => router.replace(LOGIN));
    })();
    return () => {
      cancelled = true;
      disconnect?.();
    };
  }, [router]);

  if (contextLost) {
    return (
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="flex h-full w-full items-center justify-center px-8 text-center text-lg font-semibold"
      >
        Mất kết nối đồ họa. Chạm để tải lại.
      </button>
    );
  }

  if (!authed || !me) {
    return (
      <div className="flex h-full items-center justify-center text-lg font-semibold">
        Đang vào xóm…
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden select-none">
      <Scene />
      <Hud />
      {sheet === "business" && <BusinessSheet />}
      {sheet === "market" && <MarketSheet />}
      {sheet === "jobs" && <JobsSheet />}
      <Welcome />
      <DaySummary />
    </div>
  );
}
