"use client";

import { PerformanceMonitor } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { content } from "@xom/content";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { MathUtils, type Mesh } from "three";
import type { CharacterModel } from "../assets";
import { useGame } from "../store";
import { CameraRig, pinchState } from "./CameraRig";
import { Character, useWanderer, Walker } from "./Character";
import { Customers } from "./Customers";
import { Stalls } from "./Stalls";
import { STREET_BOUNDS, Street, TILE } from "./Street";

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
          setContextLost(true);
        });
      }}
    >
      <color attach="background" args={["#bfe3f2"]} />
      <hemisphereLight args={["#fff6e5", "#8a7f70", 1.6]} />
      <directionalLight position={[12, 20, 6]} intensity={1.4} />
      {/* Tự hạ độ phân giải khi FPS tụt (docs/PLAN.md §1). */}
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} />
      <PerfProbe />
      <Suspense fallback={null}>
        <World />
      </Suspense>
    </Canvas>
  );
}

/** Chỗ người chơi đứng bán: sau quầy, mặt nhìn ra khách. */
function standBehind(lotId: string) {
  const lot = content.lot(lotId);
  const back = lot.facing === 0 ? -1 : 1;
  return { x: lot.position.x, z: lot.position.z + back * 0.9, yaw: lot.facing };
}

function World() {
  const player = useMemo(() => {
    // Vào game: đứng sẵn sau quầy nếu đã có chỗ bán.
    const lotId = useGame.getState().me?.business?.lotId;
    const spot = lotId ? standBehind(lotId) : { x: -11, z: -TILE };
    return new Walker(spot.x, spot.z, 3.2);
  }, []);
  const lotId = useGame((s) => s.me?.business?.lotId ?? null);
  const open = useGame((s) => s.me?.business?.open ?? false);

  // Chọn chỗ mới hoặc mở quầy: tự đi tới đứng sau quầy.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mở quầy (open) cũng phải gọi người chơi về quầy
  useEffect(() => {
    if (!lotId) return;
    const spot = standBehind(lotId);
    player.moveTo(spot.x, spot.z, spot.yaw);
  }, [lotId, open, player]);
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
      <Stalls />
      <Customers />
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
