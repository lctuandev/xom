"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { MathUtils, type OrthographicCamera, Vector3 } from "three";
import type { Walker } from "./Character";

// Camera bám theo người chơi (docs/USECASES.md UC-B1, B7). Mặc định nhìn dọc con phố (trục X), lệch nhẹ
// sang bên: trên màn hình dọc phố chạy từ dưới lên. Người chơi xoay (2 ngón vặn / nút ↺ ↻),
// nghiêng (2 ngón kéo lên xuống) và zoom (chụm 2 ngón).
const DISTANCE = 34.6;
const DEFAULT_YAW = Math.atan2(22, 6);
const DEFAULT_PITCH = 0.72; // góc so với phương thẳng đứng (0 = nhìn thẳng từ trên xuống)
const MIN_PITCH = 0.3;
const MAX_PITCH = 1.12;
const MIN_VIEW = 10; // mét theo chiều ngang màn hình khi zoom gần nhất
const MAX_VIEW = 32;

/** Hướng nhìn hiện tại (UI đọc để vẽ la bàn, nút bấm đổi hướng). */
export const camView = {
  yaw: DEFAULT_YAW,
  pitch: DEFAULT_PITCH,
  targetYaw: DEFAULT_YAW,
  targetPitch: DEFAULT_PITCH,
};

export function rotateView(delta: number) {
  camView.targetYaw += delta;
}
export function tiltView(delta: number) {
  camView.targetPitch = MathUtils.clamp(camView.targetPitch + delta, MIN_PITCH, MAX_PITCH);
}
export function resetView() {
  // Quay về hướng mặc định theo đường ngắn nhất.
  const d = Math.atan2(
    Math.sin(DEFAULT_YAW - camView.targetYaw),
    Math.cos(DEFAULT_YAW - camView.targetYaw),
  );
  camView.targetYaw += d;
  camView.targetPitch = DEFAULT_PITCH;
}

const offset = new Vector3();

/** Thời điểm kết thúc pinch gần nhất — dùng để bỏ qua "tap" giả phát sinh khi nhấc hai ngón. */
export const pinchState = { lastPinchEnd: 0, active: false };

export function CameraRig({ follow }: { follow: Walker }) {
  const camera = useThree((s) => s.camera) as OrthographicCamera;
  const size = useThree((s) => s.size);
  const dom = useThree((s) => s.gl.domElement);
  const viewWidth = useRef(16);
  const focus = useRef(new Vector3().copy(follow.position));

  // Pinch zoom (2 ngón) và lăn chuột (desktop).
  useEffect(() => {
    const pointers = new Map<number, { x: number; y: number }>();
    let startDist = 0;
    let startView = viewWidth.current;
    let lastAngle = 0;
    let lastMidY = 0;
    const two = () => {
      const [a, b] = [...pointers.values()];
      return a && b ? { a, b } : null;
    };
    const dist = () => {
      const t = two();
      return t ? Math.hypot(t.a.x - t.b.x, t.a.y - t.b.y) : 0;
    };
    const angle = () => {
      const t = two();
      return t ? Math.atan2(t.b.y - t.a.y, t.b.x - t.a.x) : 0;
    };
    const midY = () => {
      const t = two();
      return t ? (t.a.y + t.b.y) / 2 : 0;
    };
    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        pinchState.active = true;
        startDist = dist();
        startView = viewWidth.current;
        lastAngle = angle();
        lastMidY = midY();
      }
    };
    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && startDist > 0) {
        // Chụm: zoom. Vặn: xoay quanh nhân vật. Hai ngón cùng kéo lên/xuống: nghiêng.
        viewWidth.current = MathUtils.clamp((startView * startDist) / dist(), MIN_VIEW, MAX_VIEW);
        const a = angle();
        const da = Math.atan2(Math.sin(a - lastAngle), Math.cos(a - lastAngle));
        lastAngle = a;
        camView.targetYaw -= da;
        const my = midY();
        tiltView((my - lastMidY) * -0.004);
        lastMidY = my;
      }
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pinchState.active && pointers.size < 2) {
        pinchState.active = false;
        pinchState.lastPinchEnd = performance.now();
      }
    };
    const wheel = (e: WheelEvent) => {
      viewWidth.current = MathUtils.clamp(
        viewWidth.current * (1 + e.deltaY * 0.001),
        MIN_VIEW,
        MAX_VIEW,
      );
    };
    dom.addEventListener("pointerdown", down);
    dom.addEventListener("pointermove", move);
    dom.addEventListener("pointerup", up);
    dom.addEventListener("pointercancel", up);
    dom.addEventListener("wheel", wheel, { passive: true });
    return () => {
      dom.removeEventListener("pointerdown", down);
      dom.removeEventListener("pointermove", move);
      dom.removeEventListener("pointerup", up);
      dom.removeEventListener("pointercancel", up);
      dom.removeEventListener("wheel", wheel);
    };
  }, [dom]);

  useFrame((_, dt) => {
    focus.current.lerp(follow.position, 1 - Math.exp(-dt * 6));
    const k = 1 - Math.exp(-dt * 8);
    camView.yaw += (camView.targetYaw - camView.yaw) * k;
    camView.pitch += (camView.targetPitch - camView.pitch) * k;
    const h = Math.sin(camView.pitch) * DISTANCE;
    offset.set(
      Math.sin(camView.yaw) * h,
      Math.cos(camView.pitch) * DISTANCE,
      Math.cos(camView.yaw) * h,
    );
    camera.position.copy(focus.current).add(offset);
    camera.lookAt(focus.current);
    const zoom = size.width / viewWidth.current;
    if (Math.abs(camera.zoom - zoom) > 0.01) {
      camera.zoom = MathUtils.lerp(camera.zoom, zoom, 1 - Math.exp(-dt * 12));
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
