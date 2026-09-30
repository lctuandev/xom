"use client";

import dynamic from "next/dynamic";

// Game chỉ chạy phía client (WebGL); tách chunk để trang chủ không phải tải three.js.
const GameShell = dynamic(() => import("./GameShell"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-lg font-semibold">
      Đang vào xóm…
    </div>
  ),
});

export function PlayClient() {
  return <GameShell />;
}
