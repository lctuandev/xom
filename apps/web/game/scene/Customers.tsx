"use client";

import { useFrame } from "@react-three/fiber";
import { content } from "@xom/content";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CharacterModel } from "../assets";
import { saleBus } from "../store";
import { Character, Walker } from "./Character";

/** Giới hạn NPC khách cùng lúc để giữ ngân sách draw call trên mobile. */
const MAX_CUSTOMERS = 6;
const WAIT_SECONDS = 1.4;

interface CustomerSpec {
  id: number;
  model: CharacterModel;
  lotId: string;
  /** Đi tới từ bên trái (-1) hay bên phải (+1) của quầy. */
  side: 1 | -1;
}

let nextId = 0;

/**
 * NPC khách chỉ là minh họa cho doanh số server đã tính (docs/PLAN.md §3.3):
 * mỗi sự kiện "sale" sinh 1–2 khách đi tới quầy, đứng chờ, rồi đi tiếp.
 */
export function Customers() {
  const [list, setList] = useState<CustomerSpec[]>([]);

  useEffect(
    () =>
      saleBus.on((sale) => {
        const archetype = content.data.npcs.find((n) => n.id === sale.archetype);
        const model = (archetype?.model ?? "character-male-c") as CharacterModel;
        const count = Math.min(2, sale.qty);
        setList((prev) => {
          const room = MAX_CUSTOMERS - prev.length;
          const added = Array.from({ length: Math.min(count, room) }, (_, i) => ({
            id: nextId++,
            model,
            lotId: sale.lotId,
            side: (i % 2 === 0 ? -1 : 1) as 1 | -1,
          }));
          return added.length ? [...prev, ...added] : prev;
        });
      }),
    [],
  );

  const remove = (id: number) => setList((prev) => prev.filter((c) => c.id !== id));

  return (
    <>
      {list.map((c) => (
        <Customer key={c.id} spec={c} onDone={remove} />
      ))}
    </>
  );
}

function Customer({ spec, onDone }: { spec: CustomerSpec; onDone: (id: number) => void }) {
  const lot = content.lot(spec.lotId);
  // Quầy phía bắc (facing 0) mở mặt về +Z; khách đứng trước mặt quầy.
  const front = lot.facing === 0 ? 1 : -1;
  const { walker, stand, exit } = useMemo(() => {
    // Đi dọc mép vỉa hè phía trước quầy để không băng qua xe hàng.
    const lane = lot.position.z + front * 1.4;
    const w = new Walker(lot.position.x + spec.side * 9, lane, 1.6 + Math.random() * 0.4);
    return {
      walker: w,
      stand: { x: lot.position.x + spec.side * 0.35, z: lot.position.z + front * 1.1 },
      exit: { x: lot.position.x - spec.side * 10, z: lane },
    };
  }, [lot, front, spec.side]);
  const phase = useRef<"come" | "wait" | "leave">("come");
  const waited = useRef(0);

  useEffect(() => {
    walker.moveTo(stand.x, stand.z, lot.facing + Math.PI);
  }, [walker, stand, lot.facing]);

  useFrame((_, dt) => {
    if (walker.target) return;
    if (phase.current === "come") {
      phase.current = "wait";
    } else if (phase.current === "wait") {
      waited.current += dt;
      if (waited.current >= WAIT_SECONDS) {
        phase.current = "leave";
        walker.moveTo(exit.x, exit.z);
      }
    } else {
      onDone(spec.id);
    }
  });

  return <Character model={spec.model} walker={walker} />;
}
