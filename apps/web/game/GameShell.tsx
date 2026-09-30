"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { refreshAccessToken, useAuth } from "./auth/store";
import Interior from "./interior/Interior";
import { connectGame } from "./net/socket";
import { Scene } from "./scene/Scene";
import { useGame } from "./store";
import { useTutorial } from "./tutorial";
import { ActionBar } from "./ui/ActionBar";
import { BubbleLayer } from "./ui/BubbleLayer";
import { BusinessSheet } from "./ui/BusinessSheet";
import { DaySummary } from "./ui/DaySummary";
import { Dialogue } from "./ui/Dialogue";
import { EquipmentSheet } from "./ui/EquipmentSheet";
import { Hud } from "./ui/Hud";
import { JobsSheet } from "./ui/JobsSheet";
import { Kitchen } from "./ui/Kitchen";
import { MarketSheet } from "./ui/MarketSheet";
import { QuickChat } from "./ui/QuickChat";
import { TalkSheet } from "./ui/TalkSheet";
import { DoorSheet } from "./ui/work/DoorSheet";
import { Payslip } from "./ui/work/Payslip";
import { XomSheet } from "./ui/XomSheet";
import { useWorldEffects } from "./useWorldEffects";

/** Đăng nhập xong quay lại đúng link (giữ ?xom=… của link mời). */
const loginUrl = () =>
  `/dang-nhap?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;

export default function GameShell() {
  const router = useRouter();
  const contextLost = useGame((s) => s.contextLost);
  const me = useGame((s) => s.me);
  const sheet = useGame((s) => s.sheet);
  const inside = useGame((s) => s.inside);
  const [authed, setAuthed] = useState(false);
  useWorldEffects();
  useTutorial();
  useInvite();

  // Cổng đăng nhập: có access token trong bộ nhớ hoặc refresh được bằng cookie thì mới kết nối.
  useEffect(() => {
    let cancelled = false;
    let disconnect: (() => void) | undefined;
    (async () => {
      const token = useAuth.getState().accessToken ?? (await refreshAccessToken());
      if (cancelled) return;
      if (!token) {
        router.replace(loginUrl());
        return;
      }
      setAuthed(true);
      disconnect = connectGame(() => router.replace(loginUrl()));
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
        className="flex h-full w-full items-center justify-center px-8 text-center text-base font-semibold"
      >
        Mất kết nối đồ họa. Chạm để tải lại.
      </button>
    );
  }

  if (!authed || !me) {
    return (
      <div className="flex h-full items-center justify-center text-base font-semibold">
        Đang vào xóm…
      </div>
    );
  }

  // Vào nơi làm: cảnh nội thất riêng thay cho bản đồ (bản đồ tắt hẳn để tiết kiệm GPU).
  if (inside) {
    return (
      <div className="relative h-full w-full overflow-hidden select-none">
        <Interior placeId={inside} />
        <Dialogue />
        <Payslip />
        <DaySummary />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden select-none">
      <Scene />
      <BubbleLayer />
      <Hud />
      {sheet === "business" && <BusinessSheet />}
      {sheet === "market" && <MarketSheet />}
      {sheet === "jobs" && <JobsSheet />}
      {sheet === "xom" && <XomSheet />}
      {sheet === "equipment" && <EquipmentSheet />}
      {sheet === "talk" && <TalkSheet />}
      <ActionBar />
      <QuickChat />
      <Kitchen />
      <DoorSheet />
      <Payslip />
      <Dialogue />
      <DaySummary />
    </div>
  );
}

/**
 * Link mời /play?xom=… (UC-J1): nhớ mã, đợi vào game xong (và không đang hội thoại) thì mở bảng Xóm
 * để người chơi tự bấm vào — không tự chuyển xóm khi chưa hỏi.
 */
function useInvite() {
  const roster = useGame((s) => s.roster);
  const invite = useGame((s) => s.invite);
  const dialogue = useGame((s) => s.dialogue);
  const sheet = useGame((s) => s.sheet);
  const shown = useRef(false);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("xom");
    if (code && /^[0-9a-f]{8}$/i.test(code)) useGame.getState().setInvite(code.toLowerCase());
  }, []);
  useEffect(() => {
    if (!invite || !roster || shown.current) return;
    if (invite === roster.code) {
      useGame.getState().setInvite(null);
      window.history.replaceState(null, "", "/play");
      return;
    }
    if (dialogue || sheet) return;
    shown.current = true;
    useGame.getState().openSheet("xom");
  }, [invite, roster, dialogue, sheet]);
}
