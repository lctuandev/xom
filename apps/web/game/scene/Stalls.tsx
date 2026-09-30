"use client";

import { content } from "@xom/content";
import type { LotOccupant } from "@xom/shared";
import { useMemo } from "react";
import type { CityModel } from "../assets";
import { useGame } from "../store";
import { Instances } from "./CityKit";
import { Sign } from "./Sign";

const CLOSED_SIGN = "#8a8f96";

/** Quầy hàng của người chơi tại các lô đang thuê, kèm biển hiệu "BÁNH MÌ <TÊN>". */
export function Stalls() {
  const lots = useGame((s) => s.world.lots);
  return (
    <>
      {lots.map((o) => (
        <Stall key={o.businessId} occupant={o} />
      ))}
    </>
  );
}

function Stall({ occupant }: { occupant: LotOccupant }) {
  const lot = content.lot(occupant.lotId);
  const product = content.product(occupant.productId);
  const model = content.equipment(occupant.equipmentId).model as CityModel;
  const at = useMemo(() => [{ x: lot.position.x, z: lot.position.z, rot: lot.facing }], [lot]);
  const text = `${product.sign} ${occupant.ownerName.toLocaleUpperCase("vi")}`;
  return (
    <group>
      <Instances model={model} at={at} />
      {/* Biển hộp đèn quay về phía camera (+X), cao hơn dù/mái của quầy. */}
      <Sign
        text={text}
        position={[lot.position.x, 3, lot.position.z]}
        rotationY={Math.PI / 2}
        bg={occupant.open ? product.signColor : CLOSED_SIGN}
      />
    </group>
  );
}
