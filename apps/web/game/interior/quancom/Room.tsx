"use client";

import { useFrame } from "@react-three/fiber";
import { content } from "@xom/content";
import { useMemo, useRef } from "react";
import { CanvasTexture, DoubleSide, type Group, RepeatWrapping, SRGBColorSpace } from "three";
import { Sign } from "../../scene/Sign";
import { Cutaway } from "../cam";
import { Model } from "../models";

// Quán cơm Cô Tư — phần nhà (docs/USECASES.md UC-W8): nền gạch bông, tường ốp gạch men nửa dưới,
// cửa kính ra phố, cửa sổ, bảng giá, quạt trần, bàn thờ Thần Tài, tủ nước ngọt, TV, bếp phía sau quầy.

const L = content.data.restaurant.layout;
export const ROOM = { minX: -5.2, maxX: 5.2, minZ: -8.4, maxZ: 2.4, height: 3.3 };
const DOOR_Z = L.door.z;
const DOOR_W = 1.5;

/** Gạch bông lát nền: vẽ một lần bằng canvas, lặp khắp sàn. */
function useTileTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    const g = c.getContext("2d");
    if (g) {
      g.fillStyle = "#e9dcc3";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#c9785a";
      g.fillRect(0, 0, 64, 64);
      g.fillRect(64, 64, 64, 64);
      g.fillStyle = "#f4ead6";
      g.beginPath();
      g.arc(32, 32, 14, 0, Math.PI * 2);
      g.arc(96, 96, 14, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(0,0,0,0.12)";
      g.lineWidth = 2;
      g.strokeRect(0, 0, 128, 128);
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.repeat.set((ROOM.maxX - ROOM.minX) / 0.8, (ROOM.maxZ - ROOM.minZ) / 0.8);
    return t;
  }, []);
}

function Wall({
  from,
  to,
  color = "#f3e2b8",
  tile = "#cfe3ea",
}: {
  from: [number, number];
  to: [number, number];
  color?: string;
  tile?: string;
}) {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const mid: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const rot = Math.atan2(to[0] - from[0], to[1] - from[1]) - Math.PI / 2;
  return (
    <group position={[mid[0], 0, mid[1]]} rotation-y={rot}>
      <mesh position={[0, ROOM.height / 2, 0]}>
        <planeGeometry args={[len, ROOM.height]} />
        <meshLambertMaterial color={color} side={DoubleSide} />
      </mesh>
      {/* Ốp gạch men nửa dưới */}
      <mesh position={[0, 0.55, 0.005]}>
        <planeGeometry args={[len, 1.1]} />
        <meshLambertMaterial color={tile} side={DoubleSide} />
      </mesh>
      <mesh position={[0, 1.11, 0.01]}>
        <planeGeometry args={[len, 0.04]} />
        <meshLambertMaterial color="#6d8b96" side={DoubleSide} />
      </mesh>
    </group>
  );
}

/** Quạt trần quay chầm chậm. */
function Fan({ x, z }: { x: number; z: number }) {
  const g = useRef<Group>(null);
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * 4;
  });
  return (
    <group ref={g} position={[x, ROOM.height - 0.55, z]}>
      <Model name="ceilingFan" />
    </group>
  );
}

function Window({ x, z, rot = 0 }: { x: number; z: number; rot?: number }) {
  return (
    <group position={[x, 1.75, z]} rotation-y={rot}>
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[1.5, 1.0]} />
        <meshBasicMaterial color="#cfeaf6" />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[0.05, 1.0]} />
        <meshLambertMaterial color="#6b4b35" />
      </mesh>
      <mesh position={[0, -0.52, 0.04]}>
        <boxGeometry args={[1.6, 0.06, 0.1]} />
        <meshLambertMaterial color="#6b4b35" />
      </mesh>
    </group>
  );
}

/** Đồ lặt vặt trên bàn ăn: ống đũa, hũ ớt, hộp khăn giấy. */
export function TableTop({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x + 0.25, 0.77, z - 0.18]}>
      <mesh position={[0, 0.07, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.14, 8]} />
        <meshLambertMaterial color="#b98c52" />
      </mesh>
      <mesh position={[0.1, 0.05, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.1, 8]} />
        <meshLambertMaterial color="#d8342a" />
      </mesh>
      <mesh position={[-0.12, 0.04, 0.02]}>
        <boxGeometry args={[0.13, 0.08, 0.08]} />
        <meshLambertMaterial color="#fafafa" />
      </mesh>
    </group>
  );
}

/** Bàn thờ Thần Tài ở góc: kệ gỗ, tượng, lư hương, nhang đỏ. */
function Altar() {
  return (
    <group position={[ROOM.maxX - 0.45, 0, ROOM.minZ + 0.5]} rotation-y={-Math.PI / 4}>
      <Model name="sideTable" />
      <mesh position={[0, 0.72, 0]}>
        <boxGeometry args={[0.55, 0.36, 0.3]} />
        <meshLambertMaterial color="#b3261e" />
      </mesh>
      <mesh position={[0, 0.98, 0.02]}>
        <sphereGeometry args={[0.08, 10, 8]} />
        <meshLambertMaterial color="#e7b53c" />
      </mesh>
      <mesh position={[0.15, 0.95, 0.08]}>
        <cylinderGeometry args={[0.05, 0.06, 0.08, 10]} />
        <meshLambertMaterial color="#c9a14a" />
      </mesh>
      {[-0.02, 0, 0.02].map((d) => (
        <mesh key={d} position={[0.15 + d, 1.07, 0.08]}>
          <cylinderGeometry args={[0.004, 0.004, 0.18, 4]} />
          <meshBasicMaterial color="#c0392b" />
        </mesh>
      ))}
    </group>
  );
}

export function Room() {
  const tiles = useTileTexture();
  const doorFrom = DOOR_Z - DOOR_W / 2;
  const doorTo = DOOR_Z + DOOR_W / 2;
  return (
    <group>
      {/* Sàn gạch bông + vỉa hè ngoài cửa */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, (ROOM.minZ + ROOM.maxZ) / 2]}>
        <planeGeometry args={[ROOM.maxX - ROOM.minX, ROOM.maxZ - ROOM.minZ]} />
        <meshLambertMaterial map={tiles} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[ROOM.minX - 2.5, -0.01, DOOR_Z]}>
        <planeGeometry args={[5, 5]} />
        <meshLambertMaterial color="#b9b2a6" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[ROOM.minX - 6, -0.02, DOOR_Z]}>
        <planeGeometry args={[4, 14]} />
        <meshLambertMaterial color="#5d6168" />
      </mesh>

      {/* Tường: camera ra phía ngoài bức nào thì bức đó (và đồ treo trên nó) ẩn đi. */}
      <Cutaway at={[0, ROOM.minZ]} inward={[0, 1]}>
        <Wall from={[ROOM.maxX, ROOM.minZ]} to={[ROOM.minX, ROOM.minZ]} />
        <Window x={-2.9} z={ROOM.minZ} />
        <Window x={0} z={ROOM.minZ} />
        <Window x={2.9} z={ROOM.minZ} />
        <Sign text="CƠM TẤM CÔ TƯ" position={[0, 2.85, ROOM.minZ + 0.02]} bg="#e4432d" />
      </Cutaway>
      <Cutaway at={[ROOM.maxX, 0]} inward={[-1, 0]}>
        <Wall from={[ROOM.maxX, ROOM.maxZ]} to={[ROOM.maxX, ROOM.minZ]} />
        <Sign
          text="SƯỜN 35K · SƯỜN BÌ CHẢ 45K"
          position={[ROOM.maxX - 0.02, 2.45, -3.6]}
          rotationY={-Math.PI / 2}
          bg="#1f3b2d"
          size={[2.6, 0.4]}
        />
        <Sign
          text="SƯỜN TRỨNG 40K · CHẢ TRỨNG 32K"
          position={[ROOM.maxX - 0.02, 2.0, -3.6]}
          rotationY={-Math.PI / 2}
          bg="#1f3b2d"
          size={[2.6, 0.4]}
        />
        <Sign
          text="TRÀ ĐÁ 3K · NƯỚC NGỌT 12K"
          position={[ROOM.maxX - 0.02, 1.55, -3.6]}
          rotationY={-Math.PI / 2}
          bg="#1f3b2d"
          size={[2.6, 0.4]}
        />
        <group position={[ROOM.maxX - 0.35, 1.95, -6.2]} rotation-y={-Math.PI / 2}>
          <Model name="televisionVintage" />
        </group>
      </Cutaway>
      <Cutaway at={[0, ROOM.maxZ]} inward={[0, -1]}>
        <Wall from={[ROOM.minX, ROOM.maxZ]} to={[ROOM.maxX, ROOM.maxZ]} color="#efe2c4" />
      </Cutaway>
      <Cutaway at={[ROOM.minX, 0]} inward={[1, 0]}>
        <Wall from={[ROOM.minX, ROOM.minZ]} to={[ROOM.minX, doorFrom]} />
        <Wall from={[ROOM.minX, doorTo]} to={[ROOM.minX, ROOM.maxZ]} />
        {/* Khung cửa + biển "ĐANG MỞ CỬA" */}
        <mesh position={[ROOM.minX, ROOM.height - 0.45, DOOR_Z]}>
          <boxGeometry args={[0.12, 0.9, DOOR_W]} />
          <meshLambertMaterial color="#f3e2b8" />
        </mesh>
        <Sign
          text="ĐANG MỞ CỬA"
          position={[ROOM.minX + 0.08, 2.55, DOOR_Z]}
          rotationY={Math.PI / 2}
          bg="#2f7d4f"
          size={[1.1, 0.26]}
        />
        <Window x={ROOM.minX} z={-6.4} rot={Math.PI / 2} />
      </Cutaway>
      <Model name="rugDoormat" position={[ROOM.minX + 0.6, 0, DOOR_Z]} rotation={Math.PI / 2} />
      <Model name="trashcan" position={[ROOM.minX + 0.35, 0, DOOR_Z + 1.3]} />
      <Model name="plantSmall1" position={[ROOM.minX + 0.35, 0, DOOR_Z - 1.2]} />

      <Fan x={-1.45} z={-5.1} />
      <Fan x={1.45} z={-5.1} />
      {[-2.9, 0, 2.9].map((x) => (
        <Model key={x} name="lampSquareCeiling" position={[x, ROOM.height - 0.05, -2.2]} />
      ))}

      <Altar />
      {/* Tủ nước ngọt cạnh quầy tính tiền */}
      <Model
        name="kitchenFridgeSmall"
        position={[ROOM.maxX - 0.4, 0, -1.2]}
        rotation={-Math.PI / 2}
      />
      <Model name="pottedPlant" position={[-4.7, 0, ROOM.minZ + 0.4]} />

      {/* Bếp sau quầy */}
      <Model name="kitchenStove" position={[-1.6, 0, 1.85]} rotation={Math.PI} />
      <group position={[-1.6, 1.75, 2.1]} rotation-y={Math.PI}>
        <Model name="hoodLarge" />
      </group>
      <Model name="kitchenSink" position={[-0.6, 0, 1.85]} rotation={Math.PI} />
      <Model name="kitchenCabinet" position={[0.4, 0, 1.85]} rotation={Math.PI} />
      <Model name="kitchenFridge" position={[1.5, 0, 1.9]} rotation={Math.PI} />
      <group position={[-0.1, 1.55, 2.2]} rotation-y={Math.PI}>
        <Model name="kitchenCabinetUpper" />
      </group>
      {/* Nồi cơm điện lớn */}
      <mesh position={[0.4, 1.12, 1.8]}>
        <cylinderGeometry args={[0.22, 0.2, 0.3, 16]} />
        <meshLambertMaterial color="#f1f1f1" />
      </mesh>

      {/* Quầy khay món + cửa bếp (dĩa chờ bưng) + quầy tính tiền */}
      <Model name="kitchenCabinet" position={[-0.5, 0, 0]} />
      <Model name="kitchenCabinet" position={[0.5, 0, 0]} />
      <Model name="kitchenBar" position={[L.pass.x, 0, 0.1]} />
      <Sign text="CỬA BẾP" position={[L.pass.x, 1.75, 0.35]} bg="#8a5a2b" size={[0.8, 0.2]} />
      <Model name="kitchenBar" position={[L.cashier.x, 0, 0]} />
      <Model
        name="computerScreen"
        position={[L.cashier.x + 0.05, 0.97, 0.05]}
        rotation={Math.PI}
        scale={0.5}
      />
      <Model name="radio" position={[L.cashier.x - 0.35, 0.97, 0.1]} rotation={Math.PI} />
    </group>
  );
}
