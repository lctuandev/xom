"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { content } from "@xom/content";
import type { OrderEvent } from "@xom/shared";
import { formatClock } from "@xom/sim";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { CharacterModel } from "../assets";
import { vnd } from "../format";
import { registerAnchor } from "../scene/anchors";
import { BubbleProjector } from "../scene/BubbleProjector";
import { Character, Walker } from "../scene/Character";
import { Sign } from "../scene/Sign";
import { orderBus, orderResultBus, orderUpdateBus, useGame } from "../store";
import { BubbleLayer } from "../ui/BubbleLayer";
import { Toasts } from "../ui/Hud";
import { Kitchen } from "../ui/Kitchen";
import { Cutaway, OrbitCam } from "./cam";
import { Model } from "./models";

// Tiệm riêng của người chơi (docs/USECASES.md UC-W6): thuê nhà mặt tiền thì có không gian quán —
// quầy của mình, khách đi từ cửa vào xếp hàng gọi món, mình làm món (bếp/quầy như ngoài xe), khách nhận rồi ra.
// Đứng trong tiệm = đang đứng quầy.

const W = 4.2; // nửa bề ngang
const D_MIN = -6.5; // tường sau
const D_MAX = 1.8; // tường sau quầy
const DOOR: [number, number] = [-W - 1.5, -4.5];
const H = 3.1;
const LOOKS: CharacterModel[] = ["character-female-a", "character-male-c", "character-female-d"];

function Wall({
  from,
  to,
  color = "#f6e7c8",
}: {
  from: [number, number];
  to: [number, number];
  color?: string;
}) {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const rot = Math.atan2(to[0] - from[0], to[1] - from[1]) - Math.PI / 2;
  return (
    <group position={[(from[0] + to[0]) / 2, 0, (from[1] + to[1]) / 2]} rotation-y={rot}>
      <mesh position={[0, H / 2, 0]}>
        <planeGeometry args={[len, H]} />
        <meshLambertMaterial color={color} side={2} />
      </mesh>
      <mesh position={[0, 0.5, 0.005]}>
        <planeGeometry args={[len, 1]} />
        <meshLambertMaterial color="#d7e6ea" side={2} />
      </mesh>
    </group>
  );
}

function ShopRoom({ sign, color, productId }: { sign: string; color: string; productId: string }) {
  const drink = productId === "tra_sua";
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, (D_MIN + D_MAX) / 2]}>
        <planeGeometry args={[W * 2, D_MAX - D_MIN]} />
        <meshLambertMaterial color="#e8d8bd" />
      </mesh>
      <Cutaway at={[0, D_MIN]} inward={[0, 1]}>
        <Wall from={[W, D_MIN]} to={[-W, D_MIN]} />
        <Sign text={sign} position={[0, 2.6, D_MIN + 0.02]} bg={color} />
      </Cutaway>
      <Cutaway at={[W, 0]} inward={[-1, 0]}>
        <Wall from={[W, D_MAX]} to={[W, D_MIN]} />
      </Cutaway>
      <Cutaway at={[0, D_MAX]} inward={[0, -1]}>
        <Wall from={[-W, D_MAX]} to={[W, D_MAX]} color="#efe0c2" />
      </Cutaway>
      <Cutaway at={[-W, 0]} inward={[1, 0]}>
        <Wall from={[-W, D_MIN]} to={[-W, -5.3]} />
        <Wall from={[-W, -3.7]} to={[-W, D_MAX]} />
        <Sign
          text="MỜI VÀO"
          position={[-W + 0.06, 2.4, -4.5]}
          rotationY={Math.PI / 2}
          bg="#2f7d4f"
          size={[1, 0.25]}
        />
      </Cutaway>
      {/* Quầy + đồ bày */}
      <Model name="kitchenBar" position={[-1, 0, 0]} />
      <Model name="kitchenBar" position={[0, 0, 0]} />
      <Model name="kitchenBar" position={[1, 0, 0]} />
      <Model name="computerScreen" position={[1.1, 0.97, 0.05]} rotation={Math.PI} scale={0.5} />
      {[-1.2, -0.8, -0.4, 0, 0.4].map((x) => (
        <Model key={x} name={drink ? "cup-tea" : "plate"} position={[x, 1.0, -0.15]} />
      ))}
      <Model name="kitchenCabinet" position={[-1.6, 0, 1.4]} rotation={Math.PI} />
      <Model name="kitchenFridgeSmall" position={[1.6, 0, 1.4]} rotation={Math.PI} />
      {/* Bàn cho khách ngồi */}
      {[
        [-2.4, -4.6],
        [2.4, -4.6],
      ].map(([x, z]) => (
        <group key={x}>
          <Model name="table" position={[x ?? 0, 0, z ?? 0]} />
          <Model
            name="chair"
            position={[(x ?? 0) - 0.6, 0, (z ?? 0) + 0.1]}
            rotation={Math.PI / 2}
          />
          <Model
            name="chair"
            position={[(x ?? 0) + 0.6, 0, (z ?? 0) + 0.1]}
            rotation={-Math.PI / 2}
          />
        </group>
      ))}
      <Model name="pottedPlant" position={[W - 0.4, 0, D_MIN + 0.4]} />
    </group>
  );
}

/** Khách theo đơn của quầy mình: vào cửa → xếp hàng trước quầy → nhận món/không → ra cửa. */
function Customer({
  order,
  slot,
  onDone,
}: {
  order: OrderEvent;
  slot: number;
  onDone: (id: string) => void;
}) {
  const walker = useMemo(() => new Walker(DOOR[0], DOOR[1], 2), []);
  const leaving = useRef(false);
  const key = `order:${order.orderId}`;
  useEffect(() => {
    if (!leaving.current) walker.moveTo(-0.2 - slot * 0.75, -1.0 - slot * 0.35, 0);
  }, [walker, slot]);
  useEffect(() => {
    const off = registerAnchor(key, () => walker.position);
    const t = setTimeout(
      () => useGame.getState().setBubble(key, { text: order.ask, tone: "ask" }),
      1500,
    );
    const offU = orderUpdateBus.on((u) => {
      if (u.orderId === order.orderId)
        useGame
          .getState()
          .setBubble(key, { text: u.line, tone: u.stage === "correct" ? "good" : "bad" });
    });
    const offR = orderResultBus.on((r) => {
      if (r.orderId !== order.orderId) return;
      useGame.getState().setBubble(key, { text: r.line, tone: r.served ? "good" : "bad" });
      leaving.current = true;
      walker.moveTo(DOOR[0], DOOR[1]);
    });
    return () => {
      clearTimeout(t);
      off();
      offU();
      offR();
      useGame.getState().setBubble(key, null);
    };
  }, [key, walker, order]);
  useFrame(() => {
    if (leaving.current && !walker.target) onDone(order.orderId);
  });
  const model = LOOKS[order.orderId.charCodeAt(0) % LOOKS.length] ?? "character-male-c";
  return <Character model={model} walker={walker} />;
}

function Customers() {
  const myId = useGame((s) => s.me?.playerId);
  const [list, setList] = useState<OrderEvent[]>(() => useGame.getState().orders);
  useEffect(
    () =>
      orderBus.on((o) => {
        if (o.ownerId === myId && !o.buyerId) setList((p) => (p.length >= 6 ? p : [...p, o]));
      }),
    [myId],
  );
  const done = (id: string) => setList((p) => p.filter((o) => o.orderId !== id));
  const waiting = list.filter((o) =>
    useGame.getState().orders.some((x) => x.orderId === o.orderId),
  );
  return (
    <>
      {list.map((o) => (
        <Customer key={o.orderId} order={o} slot={Math.max(0, waiting.indexOf(o))} onDone={done} />
      ))}
    </>
  );
}

function Me() {
  const w = useMemo(() => {
    const a = new Walker(0, 0.75, 1);
    a.yaw = Math.PI;
    return a;
  }, []);
  const myId = useGame((s) => s.me?.playerId);
  useEffect(() => (myId ? registerAnchor(myId, () => w.position) : undefined), [myId, w]);
  return <Character model="character-male-a" walker={w} />;
}

/** Cảnh trong tiệm + bảng điều khiển phía dưới. */
export default function ShopInterior({ lotId }: { lotId: string }) {
  const me = useGame((s) => s.me);
  const clock = useGame((s) => s.clock);
  const orders = useGame((s) => s.orders);
  const kitchen = useGame((s) => s.kitchen);
  const openKitchen = useGame((s) => s.openKitchen);
  const openSheet = useGame((s) => s.openSheet);
  const setInside = useGame((s) => s.setInside);
  const biz = me?.business;
  const lot = content.lot(lotId);
  const product = biz ? content.product(biz.productId) : null;

  // Đứng trong tiệm = đang đứng quầy (khách mới ghé).
  useEffect(() => {
    useGame.getState().setProximity(null, true);
  }, []);

  if (!biz || !product) return null;
  const sign = `${product.sign} ${me?.displayName.toLocaleUpperCase("vi") ?? ""}`;
  return (
    <div className="relative h-full w-full overflow-hidden bg-ink select-none">
      <Canvas
        camera={{ fov: 58, near: 0.05, far: 80 }}
        dpr={[1, 1.5]}
        flat
        gl={{ antialias: false }}
        style={{ touchAction: "none" }}
      >
        <color attach="background" args={["#2b2118"]} />
        <hemisphereLight args={["#fff6e5", "#8a7f70", 1.7]} />
        <directionalLight position={[3, 6, 4]} intensity={1.1} />
        <OrbitCam preset={{ focus: [0, 0.6, -2.6], dist: 11.5, pitch: 0.8, yaw: 0.25 }} />
        <Suspense fallback={null}>
          <ShopRoom sign={sign} color={product.signColor} productId={product.id} />
          <Me />
          <Customers />
          <BubbleProjector fallbackTop={96} />
        </Suspense>
      </Canvas>
      <BubbleLayer />

      <header className="pt-safe pointer-events-auto absolute inset-x-0 top-0 flex items-center gap-2 px-3">
        <div className="rounded-full bg-cream/95 px-3 py-1.5 text-sm font-extrabold tabular-nums shadow-sm">
          {vnd(me?.money ?? 0)}
        </div>
        <div className="rounded-full bg-cream/95 px-3 py-1.5 text-sm font-semibold tabular-nums shadow-sm">
          {clock ? formatClock(clock.minute) : "…"}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            useGame.getState().setProximity(null, false);
            setInside(null);
          }}
          className="h-9 rounded-full bg-cream/95 px-3 text-sm font-semibold shadow-sm"
        >
          🚪 Ra ngoài
        </button>
      </header>
      <Toasts />

      <section
        aria-label="Tiệm của tôi"
        className="pb-safe pointer-events-auto absolute inset-x-0 bottom-0 rounded-t-3xl bg-cream px-3 pt-3 shadow-[0_-8px_30px_rgba(0,0,0,0.25)]"
      >
        <p className="text-xs font-semibold text-ink/60">
          {lot.name} · {biz.open ? "đang mở tiệm" : "đang đóng — mở tiệm ở Làm ăn"} ·{" "}
          {orders.length} khách chờ
        </p>
        <div className="mt-2 grid grid-cols-[2fr_1fr] gap-2">
          <button
            type="button"
            disabled={orders.length === 0}
            onClick={() => orders[0] && openKitchen(orders[0].orderId)}
            className="h-12 rounded-2xl bg-leaf font-semibold text-cream disabled:opacity-40"
          >
            👨‍🍳 Làm món cho khách
          </button>
          <button
            type="button"
            onClick={() => openSheet("recipes")}
            className="h-12 rounded-2xl bg-white font-semibold shadow-sm"
          >
            📖 Công thức
          </button>
        </div>
      </section>
      {kitchen && <Kitchen />}
    </div>
  );
}
