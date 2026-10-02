"use client";

import { content } from "@xom/content";
import { useMemo } from "react";
import { useGame } from "../store";
import { Character, Walker } from "./Character";
import { Sign } from "./Sign";

/**
 * 🏗️ Công trường (UC-J6): công trình xóm đang thi công dựng ở cạnh chỗ bán liên quan — đống cát, bao xi măng, xe rùa, rào
 * chắn sọc và Cai Lâm đứng chỉ việc. Dựng bằng khối, chỉ hiện khi đang thi công (thường 0–1 công trường).
 */
export function Sites() {
  const sites = useGame((s) => s.world.sites ?? []);
  return (
    <>
      {sites.map((s) => (
        <Site key={s.id} x={s.x} z={s.z} projectId={s.projectId} mixes={s.mixes} need={s.need} />
      ))}
    </>
  );
}

function Site({
  x,
  z,
  projectId,
  mixes,
  need,
}: {
  x: number;
  z: number;
  projectId: string;
  mixes: number;
  need: number;
}) {
  const def = content.data.projects.find((p) => p.id === projectId);
  const keeper = useMemo(() => new Walker(x + 1.2, z + 0.9), [x, z]);
  return (
    <group>
      <group position={[x, 0, z]}>
        {/* Đống cát */}
        <mesh position={[-0.6, 0.3, -0.4]}>
          <coneGeometry args={[0.75, 0.6, 10]} />
          <meshLambertMaterial color="#d9b77a" />
        </mesh>
        {/* Bao xi măng xếp chồng */}
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0.55, 0.11 + (i === 2 ? 0.2 : 0), -0.5 + (i === 1 ? 0.42 : 0)]}>
            <boxGeometry args={[0.5, 0.2, 0.38]} />
            <meshLambertMaterial color="#e9e6dc" />
          </mesh>
        ))}
        {/* Thùng trộn hồ */}
        <mesh position={[0, 0.18, 0.5]}>
          <cylinderGeometry args={[0.35, 0.3, 0.36, 12]} />
          <meshLambertMaterial color="#5b6670" />
        </mesh>
        <mesh position={[0, 0.34, 0.5]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.31, 12]} />
          <meshLambertMaterial color="#8d8a84" />
        </mesh>
        {/* Rào chắn sọc */}
        {[-1.3, 1.3].map((dx) => (
          <group key={dx} position={[dx, 0, 0]}>
            <mesh position={[0, 0.45, 0]}>
              <boxGeometry args={[0.08, 0.9, 1.6]} />
              <meshLambertMaterial color="#f2a516" />
            </mesh>
            <mesh position={[0, 0.62, 0]}>
              <boxGeometry args={[0.1, 0.12, 1.62]} />
              <meshLambertMaterial color="#2a2a2a" />
            </mesh>
          </group>
        ))}
        <Sign
          text={`🏗️ ${def?.name ?? "Công trình xóm"} · ${mixes}/${need} mẻ`}
          position={[0, 1.7, 0]}
          bg="#c97a0a"
          size={[2.4, 0.34]}
        />
      </group>
      <Character model="character-male-c" walker={keeper} />
    </group>
  );
}
