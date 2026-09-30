"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { MathUtils, type OrthographicCamera, Vector3 } from "three";
import type { Walker } from "./Character";

// Góc nhìn cố định bám theo người chơi. Camera nhìn dọc theo con phố (trục X) và chỉ lệch nhẹ
// sang bên: trên màn hình dọc, phố chạy từ dưới lên và dãy nhà hai bên không che vỉa hè.
const OFFSET = new Vector3(22, 26, 6);
const MIN_VIEW = 10; // mét theo chiều ngang màn hình khi zoom gần nhất
const MAX_VIEW = 32;

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
    const dist = () => {
      const [a, b] = [...pointers.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        pinchState.active = true;
        startDist = dist();
        startView = viewWidth.current;
      }
    };
    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && startDist > 0) {
        viewWidth.current = MathUtils.clamp((startView * startDist) / dist(), MIN_VIEW, MAX_VIEW);
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
    camera.position.copy(focus.current).add(OFFSET);
    camera.lookAt(focus.current);
    const zoom = size.width / viewWidth.current;
    if (Math.abs(camera.zoom - zoom) > 0.01) {
      camera.zoom = MathUtils.lerp(camera.zoom, zoom, 1 - Math.exp(-dt * 12));
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
