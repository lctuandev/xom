"use client";

import type { ShiftView } from "@xom/shared";
import { useEffect, useMemo } from "react";
import { registerAnchor } from "../scene/anchors";
import { Character, Walker } from "../scene/Character";
import { Sign } from "../scene/Sign";
import { Model } from "./models";

// Bưu cục Anh Tám (docs/USECASES.md UC-W5): kệ hàng dán mã phía trước, quầy nhận đơn bên trái,
// cửa ra xe bên phải. Người chơi đứng giữa phòng.

/** Vị trí các ô trên kệ (2 kệ × 3 tầng); gói hàng đặt theo thứ tự trên kệ. */
export const SHELF_SLOTS: [number, number, number][] = [
  [-0.95, 0.05, -2.2],
  [-0.95, 0.72, -2.2],
  [-0.95, 1.38, -2.2],
  [0.05, 0.05, -2.2],
  [0.05, 0.72, -2.2],
  [0.05, 1.38, -2.2],
];

function Room() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -1]}>
        <planeGeometry args={[8, 8]} />
        <meshLambertMaterial color="#d9d4c7" />
      </mesh>
      <mesh position={[0, 1.6, -2.6]}>
        <planeGeometry args={[8, 3.2]} />
        <meshLambertMaterial color="#dfeee3" />
      </mesh>
      <Sign text="BƯU CỤC ANH TÁM" position={[-0.45, 2.55, -2.5]} bg="#2f7d4f" />
      <Model name="bookcaseOpen" position={[-0.95, 0, -2.25]} />
      <Model name="bookcaseOpen" position={[0.05, 0, -2.25]} />
      {/* Quầy nhận đơn + Anh Tám */}
      <Model name="kitchenBar" position={[-2.2, 0, -0.9]} rotation={Math.PI / 2} />
      <Model name="kitchenBar" position={[-2.2, 0, 0.1]} rotation={Math.PI / 2} />
      <Model
        name="computerScreen"
        position={[-2.25, 0.97, -0.4]}
        rotation={Math.PI / 2}
        scale={0.5}
      />
      <Model name="cardboardBoxOpen" position={[1.5, 0, -1.9]} />
      <Model name="cardboardBoxClosed" position={[2.1, 0, -1.6]} />
      <Model name="cardboardBoxClosed" position={[1.9, 0.65, -1.8]} rotation={0.4} />
      <Sign text="🛵 RA XE" position={[2.3, 2.1, -0.6]} rotationY={-Math.PI / 2} bg="#f6b93b" />
    </group>
  );
}

function Keeper({ line }: { line: string | null }) {
  const walker = useMemo(() => {
    const w = new Walker(-2.85, -0.4, 1);
    w.yaw = Math.PI / 2;
    return w;
  }, []);
  useEffect(() => registerAnchor("buu_cuc", () => walker.position), [walker]);
  void line;
  return <Character model="character-male-a" walker={walker} />;
}

/** Gói hàng trên kệ: mã in trên nhãn, chạm để lấy. */
function Parcels({ codes, onPick }: { codes: string[]; onPick?: (code: string) => void }) {
  return (
    <group>
      {codes.slice(0, SHELF_SLOTS.length).map((code, i) => {
        const [x, y, z] = SHELF_SLOTS[i] ?? [0, 0, 0];
        return (
          <group key={code} position={[x, y, z]} onClick={() => onPick?.(code)}>
            <Model name="cardboardBoxClosed" scale={0.9} />
            <Sign text={code} position={[0, 0.3, 0.23]} bg="#fff6e5" dark size={[0.42, 0.11]} />
          </group>
        );
      })}
    </group>
  );
}

export function BuuCucScene({
  shift,
  onPick,
}: {
  shift: ShiftView | null;
  onPick?: (code: string) => void;
}) {
  const shelf = shift?.deliveries.find((d) => d.stage === "shelf")?.shelf ?? [];
  return (
    <group>
      <Room />
      <Keeper line={null} />
      <Parcels codes={shelf} onPick={onPick} />
    </group>
  );
}
