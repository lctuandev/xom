"use client";

import { PerformanceMonitor } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { content } from "@xom/content";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { type Group, MathUtils, type Mesh } from "three";
import type { CharacterModel } from "../assets";
import { MAP_BOUNDS, randomSpotNear, walkTo } from "../nav";
import { useGame } from "../store";
import { placeSpot, standBehind, vendorOpen, vendorSpot } from "../world";
import { AddressSigns, DeliveryPins, DoorPeople } from "./Addresses";
import { registerAnchor } from "./anchors";
import { BubbleProjector } from "./BubbleProjector";
import { CameraRig, pinchState } from "./CameraRig";
import { Character, useWanderer, Walker } from "./Character";
import { Customers } from "./Customers";
import { DayNight } from "./DayNight";
import { NightLights } from "./NightLights";
import { Peers } from "./Peers";
import { Places, ProximityWatcher } from "./Places";
import { getPlayer } from "./player";
import { Rain } from "./Rain";
import { Stalls } from "./Stalls";
import { Street } from "./Street";
import { TargetArrow } from "./TargetArrow";
import { Spoon, Vendors } from "./Vendors";

const NPC_MODELS: CharacterModel[] = [
  "character-male-c",
  "character-female-a",
  "character-female-d",
  "character-male-a",
];
const NPC_COUNT = 10;

export function Scene() {
  const [dpr, setDpr] = useState(1.5);
  const setContextLost = useGame((s) => s.setContextLost);
  // Vào quán thì canvas phố bị gỡ và R3F chủ động bỏ context — không phải lỗi đồ họa.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  return (
    <Canvas
      orthographic
      camera={{ position: [22, 26, 6], zoom: 25, near: 0.1, far: 200 }}
      dpr={dpr}
      flat
      gl={{ antialias: false, powerPreference: "high-performance" }}
      style={{ touchAction: "none" }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          if (alive.current) setContextLost(true);
        });
      }}
    >
      <DayNight />
      {/* Tự hạ độ phân giải khi FPS tụt (docs/PLAN.md §1). */}
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} />
      <PerfProbe />
      <Suspense fallback={null}>
        <World />
      </Suspense>
    </Canvas>
  );
}

function World() {
  const player = useMemo(() => {
    const p = getPlayer();
    // Vào lại game khi quầy đang mở: đứng sẵn sau quầy.
    const biz = useGame.getState().me?.business;
    if (biz?.open && biz.lotId) {
      const spot = standBehind(biz.lotId);
      p.position.set(spot.x, 0, spot.z);
      p.yaw = spot.yaw;
    }
    return p;
  }, []);
  const npcs = useMemo(
    () =>
      Array.from({ length: NPC_COUNT }, (_, i) => ({
        model: NPC_MODELS[i % NPC_MODELS.length] ?? "character-male-c",
        walker: (() => {
          const p = randomSpotNear(MathUtils.randFloat(-40, 40), MathUtils.randFloat(-20, 20), 6);
          return new Walker(p.x, p.z, MathUtils.randFloat(1.1, 1.6));
        })(),
      })),
    [],
  );

  const onGroundClick = (e: ThreeEvent<MouseEvent>) => {
    // Bỏ qua nếu là kéo/pinch chứ không phải chạm.
    if (e.delta > 12 || pinchState.active || performance.now() - pinchState.lastPinchEnd < 300)
      return;
    const x = MathUtils.clamp(e.point.x, MAP_BOUNDS.minX, MAP_BOUNDS.maxX);
    const z = MathUtils.clamp(e.point.z, MAP_BOUNDS.minZ, MAP_BOUNDS.maxZ);
    useGame.getState().setGoal(null);
    walkTo(player, x, z);
  };

  return (
    <>
      <Street />
      {/* Nền đất rộng để không thấy mép bản đồ. */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02}>
        <planeGeometry args={[400, 400]} />
        <meshLambertMaterial color="#a9b89c" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.02} onClick={onGroundClick} visible={false}>
        <planeGeometry args={[200, 200]} />
      </mesh>
      <Places />
      <AddressSigns />
      <DoorPeople />
      <DeliveryPins />
      <Peers />
      <NightLights />
      <Stalls />
      <Vendors />
      <Customers />
      <ProximityWatcher />
      <BubbleProjector />
      <TargetArrow />
      <TargetMarker walker={player} />
      <Rain follow={player} />
      <PlayerCharacter walker={player} />
      {npcs.map((npc, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: danh sách NPC cố định
        <Npc key={i} model={npc.model} walker={npc.walker} />
      ))}
      <CameraRig follow={player} />
    </>
  );
}

/** Nhân vật của mình: ngồi xuống ăn khi đang ăn ở sạp (tới ghế rồi mới ngồi). */
function PlayerCharacter({ walker }: { walker: Walker }) {
  const eating = useGame((s) => s.eating);
  const sit = !!eating && !walker.target;
  return (
    <group>
      <Character model="character-male-a" walker={walker} pose={sit ? "sit" : "auto"} />
      {sit && <Spoon at={walker.position} />}
    </group>
  );
}

/** Nơi NPC hay vào (biến mất vào trong một lúc rồi ra). */
const ENTERABLE = ["quan_com", "cho_dau_moi", "buu_cuc"];

/**
 * Người trong xóm có việc để làm (docs/USECASES.md UC-B10): ghé sạp đang bày mua đồ ăn, vào quán cơm / chợ /
 * bưu cục một lúc rồi đi ra, hoặc đi dạo. Chỉ diễn phía client (không ảnh hưởng kinh tế).
 */
function Npc({ model, walker }: { model: CharacterModel; walker: Walker }) {
  const plan = useRef<{ kind: "walk" | "buy" | "enter"; until: number }>({
    kind: "walk",
    until: 0,
  });
  const g = useRef<Group>(null);
  const bubble = useRef(`npc:${Math.random().toString(36).slice(2, 8)}`);
  useEffect(() => registerAnchor(bubble.current, () => walker.position), [walker]);
  useFrame(() => {
    // Đang ở trong quán thì ẩn đi; hết giờ thì bước ra.
    const inside =
      plan.current.kind === "enter" && !walker.target && Date.now() < plan.current.until;
    if (g.current) g.current.visible = !inside;
  });
  useWanderer(walker, (w) => {
    const now = Date.now();
    const p = plan.current;
    if (p.kind === "buy" && !w.target && p.until > now) return; // đứng chờ mua
    if (p.kind === "enter" && p.until > now) return;
    const r = Math.random();
    const minute = useGame.getState().clock?.minute ?? 0;
    const open = content.data.vendors.filter((v) => vendorOpen(v.id, minute));
    if (r < 0.3 && open.length) {
      const v = open[Math.floor(Math.random() * open.length)];
      const spot = v ? vendorSpot(v.id) : null;
      if (spot) {
        walkTo(w, spot.x + (Math.random() - 0.5) * 1.2, spot.z, spot.yaw);
        plan.current = { kind: "buy", until: now + 9000 };
        if (Math.random() < 0.5)
          useGame
            .getState()
            .say(
              { who: bubble.current, text: `Cho một phần ${v?.items[0]?.name.toLowerCase()}!` },
              3000,
            );
        return;
      }
    }
    if (r < 0.45) {
      const id = ENTERABLE[Math.floor(Math.random() * ENTERABLE.length)] ?? "quan_com";
      const spot = placeSpot(id);
      walkTo(w, spot.x, spot.z, spot.yaw);
      plan.current = { kind: "enter", until: now + 25_000 };
      return;
    }
    const q = randomSpotNear(w.position.x, w.position.z, 16);
    walkTo(w, q.x, q.z);
    plan.current = { kind: "walk", until: 0 };
  });
  return (
    <group ref={g}>
      <Character model={model} walker={walker} />
    </group>
  );
}

/** Vòng tròn đánh dấu điểm đến — phản hồi thị giác cho thao tác chạm. */
function TargetMarker({ walker }: { walker: Walker }) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    m.visible = walker.dest !== null;
    if (walker.dest) {
      m.position.set(walker.dest.x, 0.04, walker.dest.z);
      m.scale.setScalar(1 + Math.sin(clock.elapsedTime * 8) * 0.1);
    }
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[0.35, 0.5, 24]} />
      <meshBasicMaterial color="#e4432d" transparent opacity={0.85} depthWrite={false} />
    </mesh>
  );
}

/** Đo FPS, draw call, triangles; đẩy lên store 2 lần/giây để HUD hiển thị. */
function PerfProbe() {
  const gl = useThree((s) => s.gl);
  const setPerf = useGame((s) => s.setPerf);
  const acc = useRef({ frames: 0, time: 0 });
  useFrame((_, dt) => {
    acc.current.frames++;
    acc.current.time += dt;
    if (acc.current.time < 0.5) return;
    setPerf({
      fps: Math.round(acc.current.frames / acc.current.time),
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      dpr: gl.getPixelRatio(),
    });
    acc.current = { frames: 0, time: 0 };
  });
  return null;
}
