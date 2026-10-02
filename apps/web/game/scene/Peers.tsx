"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { modelFor } from "../looks";
import { peerTargets } from "../net/presence";
import { useGame } from "../store";
import { registerAnchor } from "./anchors";
import { Character, Walker } from "./Character";

// Hàng xóm là người chơi thật (docs/USECASES.md UC-J2): đi theo vị trí server phát 10 Hz,
// nội suy mượt giữa các gói; đang ở trong quán/bưu cục thì không hiện ngoài phố.

/** Xa quá (vừa vào xóm, mạng giật lâu) thì dịch chuyển thẳng thay vì chạy qua. */
const SNAP_DIST = 8;

export function Peers() {
  const roster = useGame((s) => s.roster);
  const myId = useGame((s) => s.me?.playerId);
  const peers = roster?.peers.filter((p) => p.id !== myId && !p.inside) ?? [];
  return (
    <>
      {peers.map((p) => (
        <Peer key={p.id} id={p.id} />
      ))}
    </>
  );
}

function Peer({ id }: { id: string }) {
  const walker = useMemo(() => {
    const t = peerTargets.get(id);
    const w = new Walker(t?.x ?? 0, t?.z ?? 0, 4);
    w.yaw = t?.yaw ?? 0;
    return w;
  }, [id]);
  useEffect(() => registerAnchor(id, () => walker.position), [id, walker]);

  useFrame(() => {
    const t = peerTargets.get(id);
    if (!t) return;
    const d = Math.hypot(t.x - walker.position.x, t.z - walker.position.z);
    if (d > SNAP_DIST) {
      walker.position.set(t.x, 0, t.z);
      walker.target = null;
      walker.yaw = t.yaw;
      return;
    }
    // Đuổi theo vị trí mới nhất trong ~0,15 giây để trễ mạng không làm nhân vật chậm dần.
    walker.speed = Math.min(10, Math.max(3, d / 0.15));
    if (d > 0.02) walker.moveTo(t.x, t.z, t.moving ? null : t.yaw);
    else if (!t.moving) walker.yaw = t.yaw;
  });

  return <Character model={modelFor(id)} walker={walker} />;
}
