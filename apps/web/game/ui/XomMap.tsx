"use client";

import { useEffect, useRef } from "react";
import { grid } from "../nav";
import { getPlayer } from "../scene/player";
import { useMapKey } from "../scene/Street";

// 🗺️ Bản đồ xóm thu nhỏ (docs/BANDO.md bước C): lưới hiện tại của xóm (cả các khu đã mở) vẽ bằng một canvas 2D — đường,
// vỉa hè, nhà, công viên, chợ, đất trống — kèm các chỗ bán tô màu theo trạng thái. Chạm vào một chỗ để chọn.

export type MapLotState = "mine" | "free" | "taken" | "house";

export interface MapLot {
  id: string;
  x: number;
  z: number;
  state: MapLotState;
}

const TILE_COLOR: Record<string, string> = {
  "=": "#5b5d66",
  "|": "#5b5d66",
  "+": "#5b5d66",
  c: "#5b5d66",
  s: "#c9c4b8",
  a: "#d8cfbd",
  N: "#c9c4b8",
  B: "#d98b6a",
  H: "#e0a57e",
  T: "#b9a07a",
  K: "#c8b28c",
  P: "#8fbf6f",
  M: "#e9c46a",
  S: "#a8c98a",
  L: "#9aa3ab",
  ".": "#b8cf8f",
};

const LOT_COLOR: Record<MapLotState, string> = {
  mine: "#d23c2f",
  free: "#2f7d4f",
  taken: "#7d7a74",
  house: "#3b6fb6",
};

export function XomMap({
  lots,
  focus,
  onPick,
}: {
  lots: MapLot[];
  focus?: string | null;
  onPick?: (id: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const mapKey = useMapKey();
  const cols = grid.cols;
  const rows = grid.rows;

  // biome-ignore lint/correctness/useExhaustiveDependencies: lưới đổi theo mapKey (biến sống trong nav)
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const cell = w / cols;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(cell * rows * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = TILE_COLOR[grid.charAt(c, r)] ?? "#b8cf8f";
        ctx.fillRect(c * cell, r * cell, cell + 0.5, cell + 0.5);
      }
    const m = grid.map;
    const at = (x: number, z: number) => ({
      px: ((x - m.origin.x) / m.tile + 0.5) * cell,
      py: ((z - m.origin.z) / m.tile + 0.5) * cell,
    });
    for (const l of lots) {
      const { px, py } = at(l.x, l.z);
      const big = l.id === focus || l.state === "mine";
      ctx.beginPath();
      ctx.arc(px, py, Math.max(3, cell * (big ? 0.55 : 0.4)), 0, Math.PI * 2);
      ctx.fillStyle = LOT_COLOR[l.state];
      ctx.fill();
      ctx.lineWidth = l.id === focus ? 2.5 : 1.2;
      ctx.strokeStyle = l.id === focus ? "#f6b93b" : "#fff";
      ctx.stroke();
    }
    // Mình đang đứng đâu.
    const me = getPlayer().position;
    const { px, py } = at(me.x, me.z);
    ctx.beginPath();
    ctx.arc(px, py, Math.max(3, cell * 0.35), 0, Math.PI * 2);
    ctx.fillStyle = "#f6b93b";
    ctx.fill();
    ctx.strokeStyle = "#2b2b33";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [mapKey, lots, focus, cols, rows]);

  return (
    <figure className="mb-3" aria-label="Bản đồ xóm">
      <canvas
        ref={ref}
        data-xom-map={`${cols}x${rows}`}
        className="block w-full touch-manipulation rounded-xl shadow-sm"
        style={{ aspectRatio: `${cols} / ${rows}` }}
        onClick={(e) => {
          if (!onPick) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const cell = rect.width / cols;
          const m = grid.map;
          const x = m.origin.x + ((e.clientX - rect.left) / cell - 0.5) * m.tile;
          const z = m.origin.z + ((e.clientY - rect.top) / cell - 0.5) * m.tile;
          let best: MapLot | null = null;
          let bestD = (m.tile * 1.6) ** 2;
          for (const l of lots) {
            const d = (l.x - x) ** 2 + (l.z - z) ** 2;
            if (d < bestD) {
              best = l;
              bestD = d;
            }
          }
          if (best) onPick(best.id);
        }}
      />
      <figcaption className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink/60">
        <Dot color={LOT_COLOR.mine} label="Chỗ của mình" />
        <Dot color={LOT_COLOR.free} label="Còn trống" />
        <Dot color={LOT_COLOR.taken} label="Có người" />
        <Dot color={LOT_COLOR.house} label="Nhà mặt tiền" />
        <Dot color="#f6b93b" label="Mình đang đứng" />
      </figcaption>
    </figure>
  );
}

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="size-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
