"use client";

import { useFrame } from "@react-three/fiber";
import { content } from "@xom/content";
import type { OrderEvent } from "@xom/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CharacterModel } from "../assets";
import { orderBus, orderResultBus, orderUpdateBus, useGame } from "../store";
import { registerAnchor } from "./anchors";
import { Character, Walker } from "./Character";

/** Giới hạn NPC khách cùng lúc để giữ ngân sách draw call trên mobile. */
const MAX_CUSTOMERS = 8;
/** Sau khi có kết quả, khách đứng nói thêm một chút rồi mới đi. */
const LINGER_SECONDS = 1.8;

/**
 * Mỗi đơn là một khách: đi tới quầy, xếp hàng, khung thoại dặn món (UC-F3); phàn nàn khi món sai;
 * cảm ơn/than phiền khi tính tiền xong rồi đi tiếp.
 */
export function Customers() {
  const [list, setList] = useState<OrderEvent[]>(() =>
    useGame.getState().orders.filter((o) => !o.buyerId),
  );

  useEffect(
    () =>
      orderBus.on((o) => {
        // Khách là người chơi thật thì chính nhân vật của họ đứng ở quầy — không sinh NPC.
        if (o.buyerId) return;
        // Tiệm trong nhà: khách vào tận trong tiệm (ShopInterior), không đứng ngoài phố.
        if (content.findLot(o.lotId)?.kind === "house") return;
        setList((prev) => (prev.length >= MAX_CUSTOMERS ? prev : [...prev, o]));
      }),
    [],
  );
  const remove = (orderId: string) => setList((prev) => prev.filter((c) => c.orderId !== orderId));

  return (
    <>
      {list.map((c) => (
        <Customer key={c.orderId} order={c} slot={slotOf(list, c)} onDone={remove} />
      ))}
    </>
  );
}

/** Vị trí trong hàng chờ trước quầy (0 = đứng đầu). */
function slotOf(list: OrderEvent[], o: OrderEvent) {
  return list.filter((x) => x.lotId === o.lotId).findIndex((x) => x.orderId === o.orderId);
}

type Tone = "ask" | "good" | "bad";

function Customer({
  order,
  slot,
  onDone,
}: {
  order: OrderEvent;
  slot: number;
  onDone: (id: string) => void;
}) {
  const lot = content.lot(order.lotId);
  const archetype = content.data.npcs.find((n) => n.id === order.archetype);
  const model = (archetype?.model ?? "character-male-c") as CharacterModel;
  // Quầy phía bắc (facing 0) mở mặt về +Z; khách đi dọc mép vỉa hè phía trước quầy.
  const front = lot.facing === 0 ? 1 : -1;
  const side = order.orderId.charCodeAt(0) % 2 ? 1 : -1;
  const lane = lot.position.z + front * 1.6;
  const walker = useMemo(() => new Walker(lot.position.x + side * 7, lane, 2.8), [lot, side, lane]);
  const phase = useRef<"come" | "wait" | "linger" | "leave">("come");
  const timer = useRef(0);
  const key = `order:${order.orderId}`;
  const setBubble = useMemo(
    () => (b: { text: string; tone: Tone } | null) => useGame.getState().setBubble(key, b),
    [key],
  );

  // Khung thoại của khách bám theo vị trí khách.
  useEffect(() => {
    const off = registerAnchor(key, () => walker.position);
    return () => {
      off();
      useGame.getState().setBubble(key, null);
    };
  }, [key, walker]);

  // Đứng vào hàng: người đầu đứng sát quầy, người sau xếp dọc mép vỉa hè.
  useEffect(() => {
    if (phase.current !== "come" && phase.current !== "wait") return;
    const x = lot.position.x + (slot === 0 ? 0.4 : side * (0.6 + slot * 0.8));
    const z = lot.position.z + front * (slot === 0 ? 1.1 : 1.6);
    walker.moveTo(x, z, lot.facing + Math.PI);
  }, [slot, walker, lot, front, side]);

  useEffect(() => {
    const offUpdate = orderUpdateBus.on((u) => {
      if (u.orderId === order.orderId)
        setBubble({ text: u.line, tone: u.stage === "correct" ? "good" : "bad" });
    });
    const offResult = orderResultBus.on((r) => {
      if (r.orderId !== order.orderId) return;
      const tip = r.tip > 0 ? ` +${Math.round(r.tip / 1000)}k boa` : "";
      setBubble({ text: `${r.line}${tip}`, tone: r.served ? "good" : "bad" });
      phase.current = "linger";
      timer.current = 0;
    });
    return () => {
      offUpdate();
      offResult();
    };
  }, [order.orderId, setBubble]);

  useFrame((_, dt) => {
    const leave = () => {
      phase.current = "leave";
      setBubble(null);
      walker.moveTo(lot.position.x - side * 10, lane);
    };
    if (phase.current === "come" && !walker.target) {
      phase.current = "wait";
      setBubble({ text: order.ask, tone: "ask" });
    } else if (phase.current === "linger") {
      timer.current += dt;
      if (timer.current >= LINGER_SECONDS) leave();
    } else if (phase.current === "leave" && !walker.target) {
      onDone(order.orderId);
    } else if (phase.current !== "leave" && Date.now() > order.expiresAt + 30_000) {
      // Không nhận được kết quả (mất kết nối…): tự đi.
      leave();
    }
  });

  return <Character model={model} walker={walker} />;
}
