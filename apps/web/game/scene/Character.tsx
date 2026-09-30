"use client";

import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { type Group, MathUtils, Vector3 } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { CHARACTER_URLS, type CharacterModel } from "../assets";
import { toLambert } from "./materials";

/** Trạng thái di chuyển của một nhân vật; tách khỏi React để cập nhật mỗi frame không gây re-render. */
export class Walker {
  readonly position: Vector3;
  target: Vector3 | null = null;
  yaw = 0;

  constructor(
    x: number,
    z: number,
    public speed = 3,
  ) {
    this.position = new Vector3(x, 0, z);
  }

  /** Hướng quay mặt khi tới nơi (ví dụ đứng sau quầy nhìn ra khách). */
  arriveYaw: number | null = null;

  moveTo(x: number, z: number, arriveYaw: number | null = null) {
    this.target = new Vector3(x, 0, z);
    this.arriveYaw = arriveYaw;
  }

  /** Trả về true nếu đang di chuyển. */
  step(dt: number): boolean {
    if (!this.target) return false;
    const dx = this.target.x - this.position.x;
    const dz = this.target.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) {
      this.target = null;
      if (this.arriveYaw !== null) this.yaw = this.arriveYaw;
      return false;
    }
    const move = Math.min(dist, this.speed * dt);
    this.position.x += (dx / dist) * move;
    this.position.z += (dz / dist) * move;
    this.yaw = Math.atan2(dx, dz);
    return true;
  }
}

const FADE = 0.2;

export function Character({
  model,
  walker,
  pose = "auto",
}: {
  model: CharacterModel;
  walker: Walker;
  /** "sit" = ngồi (khách trong quán); mặc định đi/đứng theo chuyển động. */
  pose?: "auto" | "sit";
}) {
  const group = useRef<Group>(null);
  const { scene, animations } = useGLTF(CHARACTER_URLS[model]);
  // Nhân vật có skeleton nên phải clone bằng SkeletonUtils để mỗi bản sao có xương riêng.
  const instance = useMemo(() => {
    const c = clone(scene);
    toLambert(c);
    return c;
  }, [scene]);
  const { actions } = useAnimations(animations, group);
  const current = useRef<string>("");

  const play = (name: "idle" | "walk" | "sit") => {
    if (current.current === name) return;
    actions[current.current]?.fadeOut(FADE);
    actions[name]?.reset().fadeIn(FADE).play();
    current.current = name;
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: chỉ khởi động animation một lần khi actions sẵn sàng
  useEffect(() => {
    play("idle");
  }, [actions]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const moving = walker.step(Math.min(dt, 0.1));
    g.position.copy(walker.position);
    // Xoay mượt về hướng đi, đi theo đường ngắn nhất quanh vòng tròn.
    const diff = Math.atan2(
      Math.sin(walker.yaw - g.rotation.y),
      Math.cos(walker.yaw - g.rotation.y),
    );
    g.rotation.y += diff * Math.min(1, dt * 12);
    play(moving ? "walk" : pose === "sit" ? "sit" : "idle");
  });

  return (
    <group ref={group}>
      <primitive object={instance} />
      <mesh rotation-x={-Math.PI / 2} position-y={0.03} renderOrder={1}>
        <circleGeometry args={[0.45, 16]} />
        <meshBasicMaterial color="#000" transparent opacity={0.22} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** NPC đi dạo ngẫu nhiên trong vùng cho phép, dừng nghỉ vài giây giữa các chặng. */
export function useWanderer(
  walker: Walker,
  bounds: { minX: number; maxX: number; zones: [number, number][] },
) {
  const rest = useRef(Math.random() * 3);
  useFrame((_, dt) => {
    if (walker.target) return;
    rest.current -= dt;
    if (rest.current > 0) return;
    rest.current = 1 + Math.random() * 4;
    const zone = bounds.zones[Math.floor(Math.random() * bounds.zones.length)] ?? [0, 0];
    const x = MathUtils.clamp(
      walker.position.x + MathUtils.randFloatSpread(16),
      bounds.minX,
      bounds.maxX,
    );
    walker.moveTo(x, MathUtils.randFloat(zone[0], zone[1]));
  });
}

for (const url of Object.values(CHARACTER_URLS)) useGLTF.preload(url);
