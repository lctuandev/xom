import { content } from "@xom/content";
import { Grid } from "@xom/sim";
import type { Walker } from "./scene/Character";

/** Lưới đi lại của xóm (docs/USECASES.md UC-B6): đi theo vỉa hè, đường, hẻm — không xuyên nhà. */
export const grid = new Grid(content.data.map);

/** Cho một người đi tới (x, z) theo đường xá; chạm vào nhà thì đi tới vỉa hè trước nhà. */
export function walkTo(w: Walker, x: number, z: number, arriveYaw: number | null = null) {
  w.follow(grid.path({ x: w.position.x, z: w.position.z }, { x, z }), arriveYaw);
}

/** Điểm đi được ngẫu nhiên quanh một chỗ (NPC đi dạo). */
export function randomSpotNear(x: number, z: number, radius: number): { x: number; z: number } {
  for (let i = 0; i < 12; i++) {
    const p = { x: x + (Math.random() * 2 - 1) * radius, z: z + (Math.random() * 2 - 1) * radius };
    if (grid.canStand(p)) return p;
  }
  return grid.nearest({ x, z });
}

/** Giới hạn bản đồ (mét). */
export const MAP_BOUNDS = (() => {
  const m = content.data.map;
  const w = (m.rows[0]?.length ?? 1) * m.tile;
  const h = m.rows.length * m.tile;
  return {
    minX: m.origin.x - m.tile / 2,
    maxX: m.origin.x - m.tile / 2 + w,
    minZ: m.origin.z - m.tile / 2,
    maxZ: m.origin.z - m.tile / 2 + h,
  };
})();
