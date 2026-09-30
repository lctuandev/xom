"use client";

import { PerformanceMonitor } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { MathUtils, type Mesh } from "three";
import type { CharacterModel } from "../assets";
import { useGame } from "../store";
import { standBehind } from "../world";
import { AddressSigns, DeliveryPins, DoorPeople } from "./Addresses";
import { BubbleProjector } from "./BubbleProjector";
import { CameraRig, pinchState } from "./CameraRig";
import { Character, useWanderer, Walker } from "./Character";
import { Customers } from "./Customers";
import { DayNight } from "./DayNight";
import { NightLights } from "./NightLights";
import { Peers } from "./Peers";
import { Places, ProximityWatcher } from "./Places";
import { getPlayer } from "./player";
import { Stalls } from "./Stalls";
import { STREET_BOUNDS, Street, TILE } from "./Street";
import { TargetArrow } from "./TargetArrow";

const NPC_MODELS: CharacterModel[] = [
  "character-male-c",
  "character-female-a",
  "character-female-d",
  "character-male-a",
];
const NPC_COUNT = 6;
// NPC đi trên hai dải vỉa hè.
const SIDEWALK_ZONES: [number, number][] = [
  [-TILE - 1.4, -TILE + 1.4],
  [TILE - 1.4, TILE + 1.4],
];

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
        walker: new Walker(
          MathUtils.randFloat(STREET_BOUNDS.minX, STREET_BOUNDS.maxX),
          i % 2 ? TILE : -TILE,
          MathUtils.randFloat(1.1, 1.6),
        ),
      })),
    [],
  );

  const onGroundClick = (e: ThreeEvent<MouseEvent>) => {
    // Bỏ qua nếu là kéo/pinch chứ không phải chạm.
    if (e.delta > 12 || pinchState.active || performance.now() - pinchState.lastPinchEnd < 300)
      return;
    const x = MathUtils.clamp(e.point.x, STREET_BOUNDS.minX, STREET_BOUNDS.maxX);
    const z = MathUtils.clamp(e.point.z, STREET_BOUNDS.minZ, STREET_BOUNDS.maxZ);
    useGame.getState().setGoal(null);
    player.moveTo(x, z);
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
      <Customers />
      <ProximityWatcher />
      <BubbleProjector />
      <TargetArrow />
      <TargetMarker walker={player} />
      <Character model="character-male-a" walker={player} />
      {npcs.map((npc, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: danh sách NPC cố định
        <Npc key={i} model={npc.model} walker={npc.walker} />
      ))}
      <CameraRig follow={player} />
    </>
  );
}

function Npc({ model, walker }: { model: CharacterModel; walker: Walker }) {
  useWanderer(walker, {
    minX: STREET_BOUNDS.minX,
    maxX: STREET_BOUNDS.maxX,
    zones: SIDEWALK_ZONES,
  });
  return <Character model={model} walker={walker} />;
}

/** Vòng tròn đánh dấu điểm đến — phản hồi thị giác cho thao tác chạm. */
function TargetMarker({ walker }: { walker: Walker }) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    m.visible = walker.target !== null;
    if (walker.target) {
      m.position.set(walker.target.x, 0.04, walker.target.z);
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
