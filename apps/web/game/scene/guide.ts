import { content } from "@xom/content";
import { Walker } from "./Character";
import { getPlayer } from "./player";

/**
 * Chú Bảy xe ôm: bình thường đứng góc phố; khi bắt chuyện thì "chạy xe tới" đứng cạnh người chơi
 * để khung thoại trên đầu luôn nằm trong màn hình (docs/USECASES.md UC-D1).
 */
const walkers = new Map<string, Walker>();

export function speakerWalker(id: string): Walker {
  let w = walkers.get(id);
  if (!w) {
    const sp = content.speaker(id);
    w = new Walker(sp.position.x, sp.position.z, 5);
    w.yaw = sp.facing;
    walkers.set(id, w);
  }
  return w;
}

/** Đưa NPC tới đứng cạnh người chơi, quay mặt vào người chơi. */
export function comeToPlayer(id: string) {
  const w = speakerWalker(id);
  const p = getPlayer().position;
  const tx = p.x - 1.2;
  const tz = p.z + 0.2;
  if (Math.hypot(w.position.x - tx, w.position.z - tz) > 12) {
    // Ở xa quá: xuất hiện đầu phố gần đó rồi chạy tới.
    w.position.set(tx - 8, 0, tz);
  }
  w.moveTo(tx, tz, Math.PI / 2);
}
