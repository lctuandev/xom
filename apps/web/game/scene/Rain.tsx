"use client";

import { useFrame } from "@react-three/fiber";
import { content } from "@xom/content";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  InstancedBufferAttribute,
  type InstancedMesh,
  Matrix4,
  PlaneGeometry,
  ShaderMaterial,
  type Vector3,
} from "three";
import { useGame } from "../store";

// Mưa (docs/USECASES.md UC-B4): một InstancedMesh vệt mưa mảnh (1 draw call, 2 tam giác/vệt), rơi hoàn toàn
// trên GPU (shader tự tính vị trí theo thời gian) — CPU chỉ đổi 2 uniform mỗi khung hình. Vùng mưa đi theo nhân vật.
// Trời khô thì ẩn hẳn (không tốn draw call).

const COUNT = 700;
const AREA = 36; // cạnh vùng mưa quanh nhân vật (m)
const HEIGHT = 16;

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uDensity;
  attribute float aSeed;
  varying float vAlpha;
  void main() {
    // Gốc của vệt nằm trong instanceMatrix; rơi theo thời gian, quay vòng trong cột cao HEIGHT.
    vec4 base = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float speed = 14.0 + aSeed * 6.0;
    base.y = mod(base.y - uTime * speed, ${HEIGHT.toFixed(1)});
    // Mưa nhẹ thì bớt vệt (ẩn những vệt có seed cao hơn mật độ).
    float on = step(aSeed, uDensity);
    vec4 view = viewMatrix * modelMatrix * base;
    // Vệt dựng đứng trên màn hình, hơi xiên theo gió.
    view.xy += vec2(position.x * 0.035 + position.y * 0.12, position.y * 0.9) * on;
    vAlpha = on * (0.3 + 0.35 * aSeed);
    gl_Position = projectionMatrix * view;
  }
`;

const fragment = /* glsl */ `
  varying float vAlpha;
  void main() {
    if (vAlpha <= 0.0) discard;
    gl_FragColor = vec4(0.8, 0.87, 0.96, vAlpha);
  }
`;

const mtx = new Matrix4();

/** Mật độ mưa 0–1 của trời hiện tại (content). */
export function rainDensity(): number {
  const w = useGame.getState().clock?.weather.now;
  return w ? content.weatherKind(w).rain : 0;
}

export function Rain({ follow }: { follow: { position: Vector3 } }) {
  const mesh = useRef<InstancedMesh>(null);
  const density = useRef(0);
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(1, 1);
    const seeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) seeds[i] = Math.random();
    g.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 1));
    return g;
  }, []);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: { uTime: { value: 0 }, uDensity: { value: 0 } },
        transparent: true,
        depthWrite: false,
      }),
    [],
  );

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    for (let i = 0; i < COUNT; i++) {
      mtx.makeTranslation(
        (Math.random() - 0.5) * AREA,
        Math.random() * HEIGHT,
        (Math.random() - 0.5) * AREA,
      );
      m.setMatrixAt(i, mtx);
    }
    m.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame(({ clock }, dt) => {
    const m = mesh.current;
    if (!m) return;
    // Mưa nặng/nhẹ dần chứ không bật tắt cái rụp.
    density.current += (rainDensity() - density.current) * Math.min(1, dt * 0.8);
    const d = density.current;
    m.visible = d > 0.02;
    if (!m.visible) return;
    const u = material.uniforms;
    if (u.uTime) u.uTime.value = clock.elapsedTime;
    if (u.uDensity) u.uDensity.value = d;
    m.position.set(follow.position.x, 0, follow.position.z);
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, COUNT]}
      frustumCulled={false}
      renderOrder={3}
      visible={false}
    />
  );
}
