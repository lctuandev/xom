"use client";

import { content } from "@xom/content";
import { formatClock } from "@xom/sim";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  setAmbient,
  setMusicMood,
  setRain,
  sfx,
  startMusic,
  stopMusic,
  unlockAudio,
} from "./audio";
import { refreshAccessToken, useAuth } from "./auth/store";
import Interior from "./interior/Interior";
import ShopInterior from "./interior/ShopInterior";
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
import { ProfileSheet, QuestsSheet, RecipeSheet, SettingsSheet } from "./ui/HubSheets";
import { Hud } from "./ui/Hud";
import { JobsSheet } from "./ui/JobsSheet";
import { Kitchen } from "./ui/Kitchen";
import { MarketSheet } from "./ui/MarketSheet";
import { QuickChat } from "./ui/QuickChat";
import { ShopSheet } from "./ui/ShopSheet";
import { TalkSheet } from "./ui/TalkSheet";
import { FoodSheet, VendorSheet } from "./ui/VendorSheet";
import { DoorSheet } from "./ui/work/DoorSheet";
import { Payslip } from "./ui/work/Payslip";
import { LoadingScreen } from "./ui/XomArt";
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
  useNews();
  useSound();

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

  if (!authed || !me) return <LoadingScreen />;

  // Vào nơi làm: cảnh nội thất riêng thay cho bản đồ (bản đồ tắt hẳn để tiết kiệm GPU).
  if (inside) {
    return (
      <div className="relative h-full w-full overflow-hidden select-none">
        {inside.startsWith("shop:") ? (
          <ShopInterior lotId={inside.slice(5)} />
        ) : (
          <Interior placeId={inside} />
        )}
        {sheet === "recipes" && <RecipeSheet />}
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
      {sheet === "shop" && <ShopSheet />}
      {sheet === "vendor" && <VendorSheet />}
      {sheet === "food" && <FoodSheet />}
      {sheet === "quests" && <QuestsSheet />}
      {sheet === "profile" && <ProfileSheet />}
      {sheet === "settings" && <SettingsSheet />}
      {sheet === "recipes" && <RecipeSheet />}
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

/**
 * Dải tin chuyện trong xóm: sạp bày hàng, sang ngày mới, trời đổi + báo trước trời sắp đổi (UC-B4)
 * để người chơi kịp thích nghi (tin hàng xóm vào/ra đẩy từ socket).
 */
function useNews() {
  const minute = useGame((s) => s.clock?.minute ?? -1);
  const day = useGame((s) => s.clock?.day ?? 0);
  const sky = useGame((s) => s.clock?.weather.now ?? null);
  const nextSky = useGame((s) => s.clock?.weather.next?.kind ?? null);
  const nextAt = useGame((s) => s.clock?.weather.next?.at ?? null);
  const last = useRef<{ open: Set<string>; day: number } | null>(null);
  const lastSky = useRef<string | null>(null);
  const warned = useRef<string | null>(null);
  useEffect(() => {
    if (!sky) return;
    const push = useGame.getState().pushNews;
    if (lastSky.current && lastSky.current !== sky) {
      const k = content.weatherKind(sky);
      push(k.news);
      useGame.getState().toast({ kind: "info", text: k.news });
    }
    lastSky.current = sky;
  }, [sky]);
  useEffect(() => {
    if (!nextSky || nextAt === null) return;
    const key = `${day}:${nextSky}:${nextAt}`;
    if (warned.current === key) return;
    warned.current = key;
    const k = content.weatherKind(nextSky);
    useGame.getState().pushNews(k.forecast.replace("{time}", formatClock(nextAt)));
  }, [nextSky, nextAt, day]);
  useEffect(() => {
    if (minute < 0) return;
    const push = useGame.getState().pushNews;
    const open = new Set(
      content.data.vendors.filter((v) => minute >= v.open && minute < v.close).map((v) => v.id),
    );
    const prev = last.current;
    if (prev && prev.day !== day) push(`☀️ Sang ngày ${day} — xóm lại nhộn nhịp`);
    if (prev)
      for (const v of content.data.vendors) {
        if (open.has(v.id) && !prev.open.has(v.id)) push(`🍜 ${v.sign} vừa bày hàng`);
        if (!open.has(v.id) && prev.open.has(v.id)) push(`🧹 ${v.sign} dọn hàng rồi`);
      }
    last.current = { open, day };
  }, [minute, day]);
}

/**
 * Âm thanh: mở khoá ở cú chạm đầu tiên (chính sách trình duyệt), bật nhạc nền, nhạc đổi theo ngày/đêm;
 * mọi nút bấm có tiếng "tách" nhỏ.
 */
function useSound() {
  const minute = useGame((s) => s.clock?.minute ?? 600);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      unlockAudio();
      startMusic();
      if ((e.target as Element | null)?.closest?.("button")) sfx("click");
    };
    window.addEventListener("pointerdown", onDown, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", onDown, { capture: true });
      stopMusic();
    };
  }, []);
  const inside = useGame((s) => s.inside);
  useEffect(() => {
    setMusicMood(minute >= 1080 || minute < 330 ? "night" : "day");
    // Giờ cao điểm (sáng đi làm, trưa, tan tầm) phố ồn hơn; khuya vắng.
    const h = minute / 60;
    const rush = (h >= 7 && h < 9) || (h >= 11 && h < 13) || (h >= 17 && h < 19.5);
    const crowd = rush ? 1 : h >= 21 || h < 6 ? 0.25 : 0.55;
    setAmbient(inside ? "inside" : "street", crowd);
  }, [minute, inside]);
  const sky = useGame((s) => s.clock?.weather.now ?? "sunny");
  useEffect(() => {
    setRain(content.weatherKind(sky).rain, !!inside);
  }, [sky, inside]);
}
