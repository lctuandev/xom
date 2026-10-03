"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { content } from "@xom/content";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  type DirectionalLight,
  type HemisphereLight,
  type InstancedMesh,
  Matrix4,
  type MeshBasicMaterial,
  Quaternion,
  Vector3,
} from "three";
import { thunder } from "../audio";
import { useGame } from "../store";

// Ngày và đêm (docs/USECASES.md UC-B8): trời, nắng, ánh sáng môi trường chạy theo phút game của xóm;
// tối thì đèn đường, cửa sổ, sạp hàng sáng lên. Không dùng đèn thật (tốn GPU trên điện thoại):
// bóng đèn là vật tự phát sáng, vầng sáng dưới đất là tấm mờ cộng màu.

/** 0 = ban ngày, 1 = tối hẳn; dim = trời u ám do mây/mưa (0–1). Các vật phát sáng đọc mỗi khung hình (không qua React). */
export const env = { night: 0, dim: 0 };

const GLOOM = new Color("#6f7a86");

type Key = [minute: number, sky: string, ambient: number, sun: number, sunColor: string];
const KEYS: Key[] = [
  [300, "#141b33", 0.45, 0.05, "#6b7bd6"],
  [345, "#6f5a78", 0.8, 0.35, "#ff9e7a"],
  [390, "#f3c6a0", 1.2, 0.9, "#ffc48a"],
  [480, "#bfe3f2", 1.6, 1.4, "#fff3dc"],
  [720, "#aad8f0", 1.75, 1.55, "#ffffff"],
  [960, "#e8d6a8", 1.5, 1.2, "#ffd29a"],
  [1050, "#f0a574", 1.15, 0.8, "#ff9a60"],
  [1110, "#5b4c78", 0.8, 0.3, "#b68cd6"],
  [1170, "#1a2447", 0.48, 0.08, "#7f8fe0"],
  [1440, "#101630", 0.4, 0.05, "#6b7bd6"],
];

function sample(minute: number) {
  let a = KEYS[0] as Key;
  let b = KEYS[KEYS.length - 1] as Key;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const k = KEYS[i] as Key;
    const n = KEYS[i + 1] as Key;
    if (minute >= k[0] && minute <= n[0]) {
      a = k;
      b = n;
      break;
    }
  }
  const t = b[0] === a[0] ? 0 : (minute - a[0]) / (b[0] - a[0]);
  return { a, b, t };
}

/** Tối dần từ 17:40 tới 19:10; sáng dần từ 5:20 tới 6:30. */
export function nightAt(minute: number) {
  if (minute >= 1060) return Math.min(1, (minute - 1060) / 90);
  if (minute <= 320) return 1;
  if (minute < 390) return 1 - (minute - 320) / 70;
  return 0;
}

const skyA = new Color();
const skyB = new Color();
const sunA = new Color();
const sunB = new Color();
const FLASH = new Color("#e8ecff");

export function DayNight() {
  const scene = useThree((s) => s.scene);
  const hemi = useRef<HemisphereLight>(null);
  const sun = useRef<DirectionalLight>(null);
  const bg = useMemo(() => new Color("#bfe3f2"), []);
  // Đồng hồ server nhảy từng phút: nội suy mượt giữa hai lần cập nhật.
  const smooth = useRef<number | null>(null);
  const flash = useRef(0);

  useFrame((_, dt) => {
    const clock = useGame.getState().clock;
    if (!clock) return;
    const target = clock.minute;
    smooth.current =
      smooth.current === null || Math.abs(target - smooth.current) > 30
        ? target
        : smooth.current + (target - smooth.current) * Math.min(1, dt * 2);
    const m = smooth.current;
    // Mây/mưa làm trời tối và xám lại (UC-B4); đổi trời thì chuyển dần.
    const sky = content.weatherKind(clock.weather.now);
    env.dim += (sky.dim - env.dim) * Math.min(1, dt * 0.6);
    // Giông: thỉnh thoảng chớp loé rồi sấm.
    if (clock.weather.now === "storm" && Math.random() < dt / 9) {
      flash.current = 1;
      thunder(0.4 + Math.random() * 1.2);
    }
    flash.current = Math.max(0, flash.current - dt * 4);
    const { a, b, t } = sample(m);
    skyA.set(a[1]);
    skyB.set(b[1]);
    bg.copy(skyA)
      .lerp(skyB, t)
      .lerp(GLOOM, env.dim * 0.7);
    if (flash.current > 0) bg.lerp(FLASH, flash.current * 0.6);
    scene.background = bg;
    const light = 1 - env.dim * 0.45 + flash.current;
    if (hemi.current) hemi.current.intensity = (a[2] + (b[2] - a[2]) * t) * light;
    if (sun.current) {
      sun.current.intensity = (a[3] + (b[3] - a[3]) * t) * (1 - env.dim * 0.8);
      sunA.set(a[4]);
      sunB.set(b[4]);
      sun.current.color.copy(sunA).lerp(sunB, t);
      // Mặt trời đi từ đông (sáng) sang tây (chiều).
      const k = Math.min(1, Math.max(0, (m - 360) / 720));
      sun.current.position.set(30 - 60 * k, 12 + 18 * Math.sin(Math.PI * k), 8);
    }
    // Trời tối sầm vì giông thì đèn đường cũng bật.
    env.night = Math.max(nightAt(m), env.dim > 0.4 ? (env.dim - 0.4) * 2 : 0);
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={["#fff6e5", "#8a7f70", 1.6]} />
      <directionalLight ref={sun} position={[12, 20, 6]} intensity={1.4} />
    </>
  );
}

/** Vầng sáng tròn mờ (vẽ một lần). */
function useGlowTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d");
    if (g) {
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,214,140,1)");
      grad.addColorStop(0.45, "rgba(255,190,110,0.45)");
      grad.addColorStop(1, "rgba(255,170,90,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
    return new CanvasTexture(c);
  }, []);
}

const OFF = new Color("#5b5b5b");
const ON = new Color("#ffd98a");
const tmp = new Color();
const mtx = new Matrix4();
const q = new Quaternion();
const flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
const one = new Vector3(1, 1, 1);

export interface GlowPoint {
  /** Vị trí bóng đèn. */
  x: number;
  y: number;
  z: number;
  /** Bán kính vầng sáng dưới đất (0 = không có). */
  pool?: number;
}

/** Độ cao vầng sáng dưới đất: trên mặt vỉa hè (0,08 m) một chút. */
const POOL_Y = 0.12;

/**
 * Bóng đèn + vầng sáng dưới đất cho nhiều điểm (2 draw call cho tất cả): tối thì sáng lên.
 * Dùng cho đèn đường, bóng đèn treo ở sạp, cửa sổ nhà.
 */
export function Glows({
  points,
  bulb = 0.18,
  box = false,
}: {
  points: GlowPoint[];
  bulb?: number;
  /** Cửa sổ: ô chữ nhật đứng thay cho bóng tròn. */
  box?: boolean;
}) {
  const bulbs = useRef<InstancedMesh>(null);
  const pools = useRef<InstancedMesh>(null);
  const bulbMat = useRef<MeshBasicMaterial>(null);
  const poolMat = useRef<MeshBasicMaterial>(null);
  const glow = useGlowTexture();
  const withPool = points.filter((p) => (p.pool ?? 0) > 0);

  useLayoutEffect(() => {
    points.forEach((p, i) => {
      mtx.compose(new Vector3(p.x, p.y, p.z), q.identity(), one);
      bulbs.current?.setMatrixAt(i, mtx);
    });
    if (bulbs.current) bulbs.current.instanceMatrix.needsUpdate = true;
    withPool.forEach((p, i) => {
      const r = p.pool ?? 0;
      // Trên mọi mặt nền: gạch vỉa hè / đường Kenney dày 0,02 × scale 4 = 0,08 m. Trước đây đặt 0,04 m → nằm dưới mặt
      // vỉa hè (vỉa hè không sáng) và sát mặt đường (z-fighting → chớp nháy khi xoay góc nhìn) — góp ý đợt 3.
      mtx.compose(new Vector3(p.x, POOL_Y, p.z), flat, new Vector3(r * 2, r * 2, 1));
      pools.current?.setMatrixAt(i, mtx);
    });
    if (pools.current) pools.current.instanceMatrix.needsUpdate = true;
  }, [points, withPool]);

  useFrame(() => {
    const n = env.night;
    if (bulbMat.current) bulbMat.current.color.copy(tmp.copy(OFF).lerp(ON, n));
    if (poolMat.current) {
      poolMat.current.opacity = 0.85 * n;
      poolMat.current.visible = n > 0.02;
    }
  });

  return (
    <>
      <instancedMesh ref={bulbs} args={[undefined, undefined, points.length]} frustumCulled={false}>
        {box ? <boxGeometry args={[0.7, 0.9, 0.05]} /> : <sphereGeometry args={[bulb, 8, 6]} />}
        <meshBasicMaterial ref={bulbMat} toneMapped={false} />
      </instancedMesh>
      {withPool.length > 0 && (
        <instancedMesh
          ref={pools}
          args={[undefined, undefined, withPool.length]}
          frustumCulled={false}
          renderOrder={2}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            ref={poolMat}
            map={glow}
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </instancedMesh>
      )}
    </>
  );
}
