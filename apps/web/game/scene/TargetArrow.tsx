"use client";

import { useFrame } from "@react-three/fiber";
import { content } from "@xom/content";
import { useRef } from "react";
import type { Group } from "three";
import { useGame } from "../store";
import { spotFor } from "../world";

/** Mũi tên nhảy nhảy chỉ tới nơi cần đến của bước kịch bản hiện tại. */
export function TargetArrow() {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const s = useGame.getState();
    const step = s.me ? content.stepById.get(s.me.tutorial) : undefined;
    const target = step?.target;
    const spot = target && !s.dialogue ? spotFor(target, s.me) : null;
    // Đã tới nơi thì thôi chỉ.
    const arrived = target === "stall" ? s.atStall : s.nearPlace === target;
    g.visible = !!spot && !arrived;
    if (spot) g.position.set(spot.x, 2.4 + Math.sin(clock.elapsedTime * 4) * 0.25, spot.z);
  });
  return (
    <group ref={ref} visible={false}>
      <mesh rotation-x={Math.PI}>
        <coneGeometry args={[0.35, 0.7, 4]} />
        <meshBasicMaterial color="#f6b93b" />
      </mesh>
    </group>
  );
}
