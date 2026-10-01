"use client";

import { content } from "@xom/content";
import { Sign } from "./Sign";

// Cây ATM trên vỉa hè (docs/USECASES.md UC-I6): ô "N" của bản đồ. Khối trụ + màn hình + bàn phím + biển "ATM",
// vài mesh nhỏ (chỉ 2 cây trong xóm).
export function Atms() {
  return (
    <>
      {content.atms.map((a) => (
        <group key={a.id} position={[a.x, 0, a.z]} rotation-y={a.facing}>
          <mesh position={[0, 0.85, 0]}>
            <boxGeometry args={[0.8, 1.7, 0.6]} />
            <meshLambertMaterial color="#2c5aa0" />
          </mesh>
          <mesh position={[0, 1.15, 0.31]}>
            <boxGeometry args={[0.5, 0.36, 0.02]} />
            <meshBasicMaterial color="#9fd7ff" />
          </mesh>
          <mesh position={[0, 0.82, 0.36]} rotation-x={-0.5}>
            <boxGeometry args={[0.5, 0.06, 0.2]} />
            <meshLambertMaterial color="#d6dbe0" />
          </mesh>
          {/* Mái che nhỏ. */}
          <mesh position={[0, 1.78, 0.12]}>
            <boxGeometry args={[1, 0.08, 0.9]} />
            <meshLambertMaterial color="#e8edf2" />
          </mesh>
          <Sign text="🏧 ATM" position={[0, 2.15, 0.1]} bg="#2c5aa0" size={[1.2, 0.36]} />
        </group>
      ))}
    </>
  );
}
