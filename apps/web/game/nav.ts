import { content } from "@xom/content";
import type { WorldView } from "@xom/shared";
import { chunksKey, composeMap, Grid, type MapDef } from "@xom/sim";
import type { Walker } from "./scene/Character";

/**
 * Lưới đi lại của xóm (docs/USECASES.md UC-B6): đi theo vỉa hè, đường, hẻm — không xuyên nhà. Xóm mở thêm khu (docs/BANDO.md)
 * thì dựng lại lưới ghép — `grid` / `MAP_BOUNDS` là biến sống (live binding), nơi import luôn thấy bản mới.
 */
export let grid = new Grid(content.data.map);
let gridKey = "";

/** Ghép lại lưới theo các khu đã mở; trả về true nếu lưới đổi. */
export function setMapChunks(chunks: WorldView["chunks"]): boolean {
  const key = chunksKey(chunks);
  if (key === gridKey) return false;
  gridKey = key;
  grid = new Grid(composeMap(content.data.map, content.data.chunks, chunks));
  MAP_BOUNDS = boundsOf(grid.map);
  return true;
}

/** Cho một người đi tới (x, z) theo đường xá; chạm vào nhà thì đi tới vỉa hè trước nhà. */
export function walkTo(
  w: Walker,
  x: number,
  z: number,
  arriveYaw: number | null = null,
  weights?: Readonly<Record<string, number>>,
) {
  w.follow(grid.path({ x: w.position.x, z: w.position.z }, { x, z }, weights), arriveYaw);
}

/** Điểm đi được ngẫu nhiên quanh một chỗ (NPC đi dạo). */
export function randomSpotNear(x: number, z: number, radius: number): { x: number; z: number } {
  for (let i = 0; i < 12; i++) {
    const p = { x: x + (Math.random() * 2 - 1) * radius, z: z + (Math.random() * 2 - 1) * radius };
    if (grid.canStand(p)) return p;
  }
  return grid.nearest({ x, z });
}

function boundsOf(m: MapDef) {
  const w = (m.rows[0]?.length ?? 1) * m.tile;
  const h = m.rows.length * m.tile;
  return {
    minX: m.origin.x - m.tile / 2,
    maxX: m.origin.x - m.tile / 2 + w,
    minZ: m.origin.z - m.tile / 2,
    maxZ: m.origin.z - m.tile / 2 + h,
  };
}

/** Giới hạn bản đồ (mét). */
export let MAP_BOUNDS = boundsOf(content.data.map);
