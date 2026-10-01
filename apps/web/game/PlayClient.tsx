"use client";

import dynamic from "next/dynamic";
import { LoadingScreen } from "./ui/XomArt";

// Game chỉ chạy phía client (WebGL); tách chunk để trang chủ không phải tải three.js.
const GameShell = dynamic(() => import("./GameShell"), {
  ssr: false,
  loading: () => <LoadingScreen />,
});

export function PlayClient() {
  return <GameShell />;
}
