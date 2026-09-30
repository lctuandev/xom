"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { content } from "@xom/content";
import type { OrderResultEvent, SaleEvent } from "@xom/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CharacterModel } from "../assets";
import { orderResultBus, saleBus } from "../store";
import { Character, Walker } from "./Character";

/** Giới hạn NPC khách cùng lúc để giữ ngân sách draw call trên mobile. */
const MAX_CUSTOMERS = 6;
/** Sau khi có kết quả, khách đứng nói thêm một chút rồi mới đi. */
const LINGER_SECONDS = 1.6;

let side = 1;

/**
 * Mỗi đơn (sự kiện "sale") là một khách đi tới quầy, đứng chờ với bong bóng gọi món.
 * Chủ quầy "Đưa hàng" kịp → khách cảm ơn + boa; chậm → khách càu nhàu rồi đi (docs/PLAN.md Phase 1.5).
 */
export function Customers() {
  const [list, setList] = useState<SaleEvent[]>([]);

  useEffect(
    () =>
      saleBus.on((sale) =>
        setList((prev) => (prev.length >= MAX_CUSTOMERS ? prev : [...prev, sale])),
      ),
    [],
  );

  const remove = (orderId: string) => setList((prev) => prev.filter((c) => c.orderId !== orderId));

  return (
    <>
      {list.map((c) => (
        <Customer key={c.orderId} order={c} onDone={remove} />
      ))}
    </>
  );
}

function Customer({ order, onDone }: { order: SaleEvent; onDone: (id: string) => void }) {
  const lot = content.lot(order.lotId);
  const product = content.product(order.productId);
  const archetype = content.data.npcs.find((n) => n.id === order.archetype);
  const model = (archetype?.model ?? "character-male-c") as CharacterModel;
  // Quầy phía bắc (facing 0) mở mặt về +Z; khách đi dọc mép vỉa hè phía trước quầy rồi dừng trước mặt.
  const front = lot.facing === 0 ? 1 : -1;
  const { walker, exit } = useMemo(() => {
    side = -side;
    const lane = lot.position.z + front * 1.4;
    const w = new Walker(lot.position.x + side * 9, lane, 2 + Math.random() * 0.4);
    const stand = { x: lot.position.x + side * 0.4, z: lot.position.z + front * 1.1 };
    // Giao điểm đến ngay lúc tạo: frame đầu tiên không được coi là "đã tới quầy".
    w.moveTo(stand.x, stand.z, lot.facing + Math.PI);
    return { walker: w, exit: { x: lot.position.x - side * 10, z: lane } };
  }, [lot, front]);
  const phase = useRef<"come" | "wait" | "linger" | "leave">("come");
  const timer = useRef(0);
  const [bubble, setBubble] = useState<{ text: string; tone: "ask" | "good" | "bad" } | null>(null);

  useEffect(
    () =>
      orderResultBus.on((r: OrderResultEvent) => {
        if (r.orderId !== order.orderId) return;
        setBubble(
          r.served
            ? { text: `${r.line} +${Math.round(r.tip / 1000)}k`, tone: "good" }
            : { text: r.line, tone: "bad" },
        );
        phase.current = "linger";
        timer.current = 0;
      }),
    [order.orderId],
  );

  useFrame((_, dt) => {
    if (phase.current === "come" && !walker.target) {
      phase.current = "wait";
      setBubble({ text: `${order.line} · ${product.emoji}×${order.qty}`, tone: "ask" });
    } else if (phase.current === "linger") {
      timer.current += dt;
      if (timer.current >= LINGER_SECONDS) {
        phase.current = "leave";
        setBubble(null);
        walker.moveTo(exit.x, exit.z);
      }
    } else if (phase.current === "leave" && !walker.target) {
      onDone(order.orderId);
    } else if (phase.current === "wait" && Date.now() > order.expiresAt + 3000) {
      // Không nhận được kết quả (mất kết nối…): tự đi.
      phase.current = "leave";
      setBubble(null);
      walker.moveTo(exit.x, exit.z);
    }
  });

  return (
    <group>
      <Character model={model} walker={walker} />
      {bubble && <Bubble walker={walker} text={bubble.text} tone={bubble.tone} />}
    </group>
  );
}

const TONE = {
  ask: "bg-cream text-ink",
  good: "bg-leaf text-cream",
  bad: "bg-ink/80 text-cream",
} as const;

/** Bong bóng lời thoại bám theo đầu nhân vật. */
function Bubble({ walker, text, tone }: { walker: Walker; text: string; tone: keyof typeof TONE }) {
  const group = useRef<import("three").Group>(null);
  useFrame(() => {
    group.current?.position.set(walker.position.x, 2.2, walker.position.z);
  });
  return (
    <group ref={group}>
      <Html center style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
        <div
          className={`max-w-40 rounded-xl px-2.5 py-1 text-center text-xs leading-snug font-semibold whitespace-nowrap shadow-md ${TONE[tone]}`}
        >
          {text}
        </div>
      </Html>
    </group>
  );
}
