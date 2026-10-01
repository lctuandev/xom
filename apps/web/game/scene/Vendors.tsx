"use client";

import { useFrame } from "@react-three/fiber";
import { content, type Vendor } from "@xom/content";
import { useEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import type { CharacterModel, CityModel } from "../assets";
import { useGame } from "../store";
import { vendorOpen, vendorSeats } from "../world";
import { registerAnchor } from "./anchors";
import { Character, Walker } from "./Character";
import { Instances } from "./CityKit";
import { Sign } from "./Sign";

// Sạp đồ ăn NPC theo giờ (docs/USECASES.md UC-B9, B10): tới giờ thì bày ra (xe/sạp, biển, người bán,
// ghế nhựa, vài người ngồi ăn), hết giờ thì dọn. Người chơi mua xong ngồi xuống ghế trống mà ăn.

const LOOKS: CharacterModel[] = ["character-female-a", "character-male-c", "character-female-d"];

function hash(s: string, n: number) {
  let h = n * 131;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/** Muỗng đưa lên xuống trước mặt người đang ăn. */
export function Spoon({ at }: { at: { x: number; z: number } }) {
  const g = useRef<Group>(null);
  useFrame(({ clock }) => {
    const el = g.current;
    if (!el) return;
    const t = (Math.sin(clock.elapsedTime * 4 + at.x) + 1) / 2;
    el.position.set(at.x + 0.25, 0.85 + t * 0.35, at.z);
  });
  return (
    <group ref={g}>
      <mesh rotation-z={0.4}>
        <cylinderGeometry args={[0.012, 0.012, 0.22, 5]} />
        <meshLambertMaterial color="#d9d9d9" />
      </mesh>
    </group>
  );
}

function Seated({
  x,
  z,
  yaw,
  model,
}: {
  x: number;
  z: number;
  yaw: number;
  model: CharacterModel;
}) {
  const w = useMemo(() => {
    const a = new Walker(x, z, 1);
    a.yaw = yaw;
    return a;
  }, [x, z, yaw]);
  return (
    <group>
      <Character model={model} walker={w} pose="sit" />
      <Spoon at={w.position} />
    </group>
  );
}

function Stall({ v, hour }: { v: Vendor; hour: number }) {
  const front = v.facing === 0 ? 1 : -1;
  const at = useMemo(() => [{ x: v.position.x, z: v.position.z, rot: v.facing }], [v]);
  const seats = vendorSeats(v.id);
  const stools = useMemo(() => seats.map((s) => ({ x: s.x, z: s.z, rot: s.yaw })), [seats]);
  const seller = useMemo(() => {
    const w = new Walker(v.position.x, v.position.z - front * 0.8, 1);
    w.yaw = v.facing;
    return w;
  }, [v, front]);
  useEffect(() => registerAnchor(`vendor:${v.id}`, () => seller.position), [v.id, seller]);
  // Mỗi giờ một nhóm khách khác nhau ngồi ăn (chừa một ghế cho người chơi).
  const patrons = seats
    .slice(0, Math.max(0, seats.length - 1))
    .filter((_, i) => hash(v.id, hour + i) % 3 !== 0);
  return (
    <group>
      <Instances model={v.model as CityModel} at={at} />
      <Instances model="ghe-nhua-do" at={stools} />
      <Sign
        text={v.sign}
        position={[v.position.x, 2.7, v.position.z]}
        rotationY={Math.PI / 2}
        bg={v.signColor}
        size={[2.2, 0.5]}
      />
      <Character model="character-male-c" walker={seller} />
      {patrons.map((s, i) => (
        <Seated
          key={`${hour}-${s.x}`}
          x={s.x}
          z={s.z}
          yaw={s.yaw}
          model={LOOKS[hash(v.id, hour * 7 + i) % LOOKS.length] ?? "character-female-a"}
        />
      ))}
    </group>
  );
}

export function Vendors() {
  // Chỉ render lại khi sang giờ mới hoặc có sạp bày/dọn (không phải mỗi phút).
  const hour = useGame((s) => Math.floor((s.clock?.minute ?? 0) / 60));
  const openKey = useGame((s) =>
    content.data.vendors
      .filter((v) => vendorOpen(v.id, s.clock?.minute ?? 0))
      .map((v) => v.id)
      .join(","),
  );
  const open = content.data.vendors.filter((v) => openKey.split(",").includes(v.id));
  return (
    <>
      {open.map((v) => (
        <Stall key={v.id} v={v} hour={hour} />
      ))}
    </>
  );
}
