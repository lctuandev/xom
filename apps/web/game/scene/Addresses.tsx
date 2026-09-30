"use client";

import { content } from "@xom/content";
import { useEffect, useMemo } from "react";
import { useGame } from "../store";
import { registerAnchor } from "./anchors";
import { Character, Walker } from "./Character";
import { Sign } from "./Sign";

const A = () => content.data.delivery.addresses;
const NONE: never[] = [];

/** Biển số nhà trên mặt tiền (địa chỉ giao hàng, UC-W5). */
export function AddressSigns() {
  return (
    <>
      {A().map((a) => (
        <Sign
          key={a.id}
          text={a.label.replace("Nhà ", "").toLocaleUpperCase("vi")}
          position={[a.position.x - 0.9, 2.3, a.position.z + (a.facing === 0 ? -0.55 : 0.55)]}
          rotationY={Math.PI / 2}
          bg="#1f5fa8"
          size={[0.9, 0.24]}
        />
      ))}
    </>
  );
}

/** Người ra mở cửa khi shipper gọi (đơn đang ở bước "at_door"). */
export function DoorPeople() {
  const deliveries = useGame((s) => s.shift?.deliveries ?? NONE);
  const atDoor = deliveries.filter((d) => d.stage === "at_door");
  return (
    <>
      {atDoor.map((d) => (
        <DoorPerson key={d.id} addressId={d.addressId} stranger={d.door?.relation === "stranger"} />
      ))}
    </>
  );
}

function DoorPerson({ addressId, stranger }: { addressId: string; stranger: boolean }) {
  const a = A().find((x) => x.id === addressId);
  const walker = useMemo(() => {
    if (!a) return null;
    const w = new Walker(a.position.x, a.position.z, 1.5);
    w.yaw = a.facing;
    const out = a.facing === 0 ? 1 : -1;
    w.moveTo(a.position.x, a.position.z + out * 0.4, a.facing);
    return w;
  }, [a]);
  useEffect(
    () => (walker ? registerAnchor(`door:${addressId}`, () => walker.position) : undefined),
    [walker, addressId],
  );
  if (!walker) return null;
  return <Character model={stranger ? "character-male-a" : "character-female-d"} walker={walker} />;
}

/** Ghim địa chỉ đơn cần giao tiếp theo. */
export function DeliveryPins() {
  const deliveries = useGame((s) => s.shift?.deliveries ?? NONE);
  const next = deliveries
    .filter((d) => d.stage === "picked" || d.stage === "later")
    .map((d) => d.addressId);
  return (
    <>
      {A()
        .filter((a) => next.includes(a.id))
        .map((a) => (
          <mesh
            key={a.id}
            position={[a.position.x, 3.1, a.position.z + (a.facing === 0 ? 0.8 : -0.8)]}
            rotation-x={Math.PI}
          >
            <coneGeometry args={[0.3, 0.6, 4]} />
            <meshBasicMaterial color="#1f5fa8" />
          </mesh>
        ))}
    </>
  );
}
