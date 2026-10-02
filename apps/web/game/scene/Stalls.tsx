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

/** Chùm bong bóng khi quầy đang khai trương (vài mesh nhỏ, chỉ hiện trong lúc khai trương). */
function Balloons({ x, z }: { x: number; z: number }) {
  const colors = ["#e4432d", "#f5b82e", "#2f7d4f", "#3a7bd5", "#e86fb0"];
  return (
    <group position={[x, 0, z]}>
      {colors.map((c, i) => {
        const a = (i / colors.length) * Math.PI * 2;
        const px = Math.cos(a) * 0.35 + 0.9;
        const pz = Math.sin(a) * 0.35;
        return (
          <group key={c}>
            <mesh position={[px, 3.6 + (i % 2) * 0.3, pz]}>
              <sphereGeometry args={[0.28, 10, 8]} />
              <meshLambertMaterial color={c} />
            </mesh>
            <mesh position={[(px + 0.9) / 2, 1.8 + (i % 2) * 0.15, pz / 2]}>
              <cylinderGeometry args={[0.01, 0.01, 3.4, 3]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function Stall({ occupant }: { occupant: LotOccupant }) {
  const lot = content.lot(occupant.lotId);
  const minute = useGame((s) => s.clock?.minute ?? 0);
  const promo = useGame((s) =>
    s.events.some((e) => e.businessId === occupant.businessId && minute >= e.from && minute < e.to),
  );
  const product = content.product(occupant.productId);
  const model = content.equipment(occupant.equipmentId).model as CityModel;
  const at = useMemo(() => [{ x: lot.position.x, z: lot.position.z, rot: lot.facing }], [lot]);
  // Tiệm đã đăng ký + treo biển (UC-F12): biển ghi tên quán; chưa có thì "BÁNH MÌ <TÊN>".
  const text = occupant.shopName
    ? occupant.shopName.toLocaleUpperCase("vi")
    : `${product.sign} ${occupant.ownerName.toLocaleUpperCase("vi")}`;
  if (lot.kind === "house") {
    // Tiệm trong nhà: biển hiệu lớn trên cửa, mái hiên; khách vào trong (không đứng ngoài vỉa hè).
    const out = lot.facing === 0 ? -1 : 1;
    return (
      <group>
        <Instances
          model="detail-awning-wide"
          at={[{ x: lot.position.x, z: lot.position.z + out * 1.3, rot: lot.facing }]}
        />
        {/* Biển chính trên mặt tiền: đưa ra trước + cao hơn mái hiên để không bị mái che. */}
        <Sign
          text={`🏪 ${text}`}
          position={[lot.position.x, 3.7, lot.position.z + out * 1.75]}
          rotationY={lot.facing}
          bg={occupant.open ? product.signColor : CLOSED_SIGN}
          size={[3.2, 0.7]}
        />
        {/* Biển vẫy vuông góc mặt tiền (như biển dọc các tiệm ngoài phố): nhìn dọc con đường (camera mặc định) vẫn đọc
            được tên quán — biển chính song song mặt tiền thì nhìn ngang chỉ thấy cạnh. */}
        <Sign
          text={text}
          position={[lot.position.x + 1.8, 3.1, lot.position.z + out * 2.2]}
          rotationY={Math.PI / 2}
          bg={occupant.open ? product.signColor : CLOSED_SIGN}
          size={[3, 0.7]}
        />
        {promo && <Balloons x={lot.position.x} z={lot.position.z + out * 1.3} />}
      </group>
    );
  }
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
      {promo && <Balloons x={lot.position.x} z={lot.position.z} />}
    </group>
  );
}
