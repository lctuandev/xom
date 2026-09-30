"use client";

import { content } from "@xom/content";
import { useMemo } from "react";
import { useGame } from "../store";
import { useModelBox, useModelBoxes } from "./CityKit";
import { type GlowPoint, Glows } from "./DayNight";
import { buildingPlacements, lampPlacements } from "./Street";

// Đèn ban đêm của phố (docs/USECASES.md UC-B8): đèn đường có vầng sáng dưới đất, cửa sổ nhà sáng đèn,
// bóng đèn treo ở quầy đang mở và ở các địa điểm có người đứng quầy.

function rotate(x: number, z: number, rot: number) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return { x: x * c + z * s, z: -x * s + z * c };
}

const BUILDINGS = [
  "building-a",
  "building-b",
  "building-c",
  "building-d",
  "building-e",
  "building-f",
  "building-g",
  "building-h",
] as const;

export function NightLights() {
  const lampBox = useModelBox("light-square");
  const boxes = useModelBoxes(BUILDINGS);
  const lots = useGame((s) => s.world.lots);

  const lamps = useMemo<GlowPoint[]>(() => {
    // Bóng đèn ở đầu cần đèn: điểm xa trụ nhất theo chiều ngang, sát đỉnh.
    const hx = Math.abs(lampBox.max.x) > Math.abs(lampBox.min.x) ? lampBox.max.x : lampBox.min.x;
    const hz = Math.abs(lampBox.max.z) > Math.abs(lampBox.min.z) ? lampBox.max.z : lampBox.min.z;
    const off = Math.abs(hx) > Math.abs(hz) ? { x: hx * 0.85, z: 0 } : { x: 0, z: hz * 0.85 };
    return lampPlacements.map((p) => {
      const o = rotate(off.x, off.z, p.rot ?? 0);
      return { x: p.x + o.x, y: lampBox.max.y - 0.2, z: p.z + o.z, pool: 3.2 };
    });
  }, [lampBox]);

  const windows = useMemo<GlowPoint[]>(() => {
    const out: GlowPoint[] = [];
    let k = 0;
    for (const [model, list] of buildingPlacements) {
      const box = boxes[model];
      for (const p of list) {
        // Mặt tiền quay ra đường: north (rot 0) mặt ở +z, south (rot π) mặt ở −z.
        const face = (p.rot ?? 0) === 0 ? box.max.z : -box.max.z;
        for (let y = 3.6; y < box.max.y - 0.8; y += 2.6) {
          for (const dx of [-1.1, 1.1]) {
            k++;
            if (k % 5 === 0 || k % 7 === 0) continue; // vài phòng tắt đèn
            out.push({ x: p.x + dx, y, z: p.z + face + ((p.rot ?? 0) === 0 ? 0.06 : -0.06) });
          }
        }
      }
    }
    return out;
  }, [boxes]);

  const stalls = useMemo<GlowPoint[]>(
    () => [
      ...lots
        .filter((o) => o.open)
        .map((o) => {
          const p = content.lot(o.lotId).position;
          return { x: p.x, y: 2.3, z: p.z, pool: 2.4 };
        }),
      ...content.data.places.map((pl) => ({
        x: pl.position.x,
        y: 2.4,
        z: pl.position.z + (pl.facing === 0 ? 1 : -1),
        pool: 2.6,
      })),
    ],
    [lots],
  );

  return (
    <>
      <Glows points={lamps} bulb={0.22} />
      <Glows points={windows} box />
      <Glows points={stalls} bulb={0.14} />
    </>
  );
}
