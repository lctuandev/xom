"use client";

import { content } from "@xom/content";
import { useMemo } from "react";
import { Instances } from "./CityKit";
import { Sign } from "./Sign";

// Cây ATM trên vỉa hè (docs/USECASES.md UC-I6): ô "N" của bản đồ. Model Blender "cay-atm" (bệ đá, thân tủ xanh
// ngân hàng, màn hình, bàn phím, khe thẻ/tiền, mái che + đèn LED) — vẽ instanced, 1 draw call cho mọi cây.
export function Atms() {
  const at = useMemo(() => content.atms.map((a) => ({ x: a.x, z: a.z, rot: a.facing })), []);
  return (
    <>
      <Instances model="cay-atm" at={at} />
      {content.atms.map((a) => (
        <group key={a.id} position={[a.x, 0, a.z]} rotation-y={a.facing}>
          <Sign text="🏧 XÓM BANK" position={[0, 2.35, -0.1]} bg="#1f5aa6" size={[1.3, 0.34]} />
        </group>
      ))}
    </>
  );
}
