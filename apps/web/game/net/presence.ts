import type { PeerPos, RosterView } from "@xom/shared";
import { getPlayer } from "../scene/player";
import { useGame } from "../store";
import type { GameSocket } from "./socket";

/**
 * Vị trí mới nhất của hàng xóm (server phát 10 Hz). Cảnh 3D đọc mỗi khung hình, không đi qua
 * React/zustand để không render lại 10 lần mỗi giây.
 */
export const peerTargets = new Map<string, PeerPos>();

export function applyPeers(list: PeerPos[]) {
  for (const p of list) peerTargets.set(p.id, p);
}

/** Người mới vào xóm: lấy vị trí từ danh sách (có thể chưa có gói vị trí nào). */
export function seedPeers(roster: RosterView) {
  const ids = new Set(roster.peers.map((p) => p.id));
  for (const id of peerTargets.keys()) if (!ids.has(id)) peerTargets.delete(id);
  for (const p of roster.peers) if (!peerTargets.has(p.id)) peerTargets.set(p.id, p);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Báo vị trí của mình khi có thay đổi, tối đa 10 lần/giây. Trả về hàm dừng. */
export function startPresence(s: GameSocket): () => void {
  let last = "";
  const onConnect = () => {
    last = ""; // kết nối lại → gửi lại vị trí hiện tại
  };
  s.on("connect", onConnect);
  const id = setInterval(() => {
    if (!s.connected) return;
    const p = getPlayer();
    const yaw = Math.atan2(Math.sin(p.yaw), Math.cos(p.yaw));
    const payload = {
      x: r2(p.position.x),
      z: r2(p.position.z),
      yaw: r2(yaw),
      moving: p.target !== null,
      inside: useGame.getState().inside,
    };
    const key = `${payload.x},${payload.z},${payload.yaw},${payload.moving},${payload.inside}`;
    if (key === last) return;
    last = key;
    s.emit("move", payload);
  }, 100);
  return () => {
    clearInterval(id);
    s.off("connect", onConnect);
  };
}
