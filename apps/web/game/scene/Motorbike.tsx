"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import type { Walker } from "./Character";

const PAINT = "#b23a2f";
const DARK = "#26262b";
const CHROME = "#c9ccd1";
/** Phóng to so với kích thước thật để cân với nhân vật. */
export const SCALE = 1.4;

/**
 * 🛵 Xe Wave thuê của Chú Lực (UC-N1): dựng bằng vài khối đơn giản (cùng phong cách xe trong `Traffic`), bám theo người
 * lái. Mặt trước xe hướng +z như nhân vật. ~10 mesh, chỉ một chiếc nên không cần instancing.
 */
export function Motorbike({ walker }: { walker: Walker }) {
  const group = useRef<Group>(null);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    g.position.copy(walker.position);
    const diff = Math.atan2(
      Math.sin(walker.yaw - g.rotation.y),
      Math.cos(walker.yaw - g.rotation.y),
    );
    g.rotation.y += diff * Math.min(1, dt * 12);
  });
  return (
    // Nhân vật kiểu chibi to đầu nên xe phóng to cho cân (không thì người che hết xe).
    <group ref={group} name="motorbike">
      <group scale={SCALE}>
        {/* Bánh trước / sau */}
        {[0.62, -0.58].map((z) => (
          <mesh key={z} position={[0, 0.27, z]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.27, 0.27, 0.12, 14]} />
            <meshLambertMaterial color={DARK} />
          </mesh>
        ))}
        {/* Thân xe + ốp yếm */}
        <mesh position={[0, 0.42, 0.02]}>
          <boxGeometry args={[0.26, 0.2, 1.05]} />
          <meshLambertMaterial color={PAINT} />
        </mesh>
        <mesh position={[0, 0.62, 0.42]} rotation-x={-0.35}>
          <boxGeometry args={[0.34, 0.5, 0.16]} />
          <meshLambertMaterial color={PAINT} />
        </mesh>
        {/* Yên dài (đủ chỗ chở thêm một người) */}
        <mesh position={[0, 0.6, -0.28]}>
          <boxGeometry args={[0.32, 0.1, 0.78]} />
          <meshLambertMaterial color={DARK} />
        </mesh>
        {/* Phuộc + ghi đông + đèn */}
        <mesh position={[0, 0.62, 0.6]} rotation-x={-0.3}>
          <boxGeometry args={[0.06, 0.72, 0.06]} />
          <meshLambertMaterial color={CHROME} />
        </mesh>
        <mesh position={[0, 0.98, 0.5]}>
          <boxGeometry args={[0.66, 0.05, 0.05]} />
          <meshLambertMaterial color={DARK} />
        </mesh>
        <mesh position={[0, 0.92, 0.6]}>
          <boxGeometry args={[0.18, 0.12, 0.1]} />
          <meshLambertMaterial color="#fff6c8" />
        </mesh>
        {/* Pô xe */}
        <mesh position={[0.18, 0.3, -0.32]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.05, 0.05, 0.5, 8]} />
          <meshLambertMaterial color={CHROME} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position-y={0.03} renderOrder={1}>
          <planeGeometry args={[0.7, 1.7]} />
          <meshBasicMaterial color="#000" transparent opacity={0.2} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}
