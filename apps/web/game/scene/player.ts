import { Walker } from "./Character";

/**
 * Nhân vật người chơi (một bản duy nhất): scene điều khiển di chuyển, UI đọc vị trí để biết
 * đang ở gần đâu. Phase 1 vị trí chỉ ở client; Phase 2 server sẽ đồng bộ.
 */
let walker: Walker | null = null;

export function getPlayer(): Walker {
  walker ??= new Walker(-9.6, -3.9, 4);
  return walker;
}

export function distanceTo(x: number, z: number): number {
  const p = getPlayer().position;
  return Math.hypot(p.x - x, p.z - z);
}
