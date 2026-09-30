"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { type ReactNode, useEffect, useRef } from "react";
import { type Group, MathUtils, Vector3 } from "three";

// Camera trong nhà (docs/USECASES.md UC-W8, B7): mỗi vai một góc mặc định, nhìn rộng (thấy cả phòng, khách ra vào);
// người chơi kéo một ngón để xoay quanh, kéo lên/xuống để nghiêng, chụm hai ngón để thu/phóng.
// Chạm (không kéo) vẫn là chạm vào đồ vật: các handler bỏ qua cú chạm có `delta` lớn.

export interface CamPreset {
  focus: [number, number, number];
  dist: number;
  /** Góc so với phương thẳng đứng (0 = nhìn thẳng từ trên xuống). */
  pitch: number;
  yaw: number;
}

/** Ngón tay dịch quá chừng này (px) thì là kéo, không phải chạm. */
export const TAP_SLOP = 10;

export const cam = {
  yaw: 0,
  pitch: 0.9,
  dist: 10,
  focus: new Vector3(),
  /** Có đang kéo/chụm không (để bỏ qua chạm). */
  dragging: false,
};

const pos = new Vector3();

/**
 * Camera xoay quanh một điểm. `follow` (nếu có) là vị trí nhân vật để điểm nhìn trượt theo.
 * Đổi `preset` (đổi vai) thì về góc mặc định của vai đó.
 */
export function OrbitCam({
  preset,
  follow,
}: {
  preset: CamPreset;
  follow?: { x: number; z: number };
}) {
  const camera = useThree((s) => s.camera);
  const dom = useThree((s) => s.gl.domElement);
  const target = useRef({ yaw: preset.yaw, pitch: preset.pitch, dist: preset.dist });

  useEffect(() => {
    target.current = { yaw: preset.yaw, pitch: preset.pitch, dist: preset.dist };
    cam.yaw = preset.yaw;
    cam.pitch = preset.pitch;
    cam.dist = preset.dist;
    cam.focus.set(...preset.focus);
  }, [preset]);

  useEffect(() => {
    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinch = 0;
    const gap = () => {
      const [a, b] = [...pts.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const down = (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
      cam.dragging = false;
      if (pts.size === 2) pinch = gap();
    };
    const move = (e: PointerEvent) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const g = gap();
        if (pinch > 0 && g > 0) {
          target.current.dist = MathUtils.clamp((target.current.dist * pinch) / g, 4, 18);
          pinch = g;
        }
        cam.dragging = true;
        return;
      }
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved < TAP_SLOP) return;
      cam.dragging = true;
      target.current.yaw -= dx * 0.008;
      target.current.pitch = MathUtils.clamp(target.current.pitch - dy * 0.005, 0.25, 1.35);
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      // Giữ cờ kéo tới hết khung hình này để onClick của R3F (chạy sau pointerup) bỏ qua.
      if (pts.size === 0) setTimeout(() => (cam.dragging = false), 0);
    };
    const wheel = (e: WheelEvent) => {
      target.current.dist = MathUtils.clamp(target.current.dist * (1 + e.deltaY * 0.001), 4, 18);
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
    const k = 1 - Math.exp(-dt * 8);
    cam.yaw += (target.current.yaw - cam.yaw) * k;
    cam.pitch += (target.current.pitch - cam.pitch) * k;
    cam.dist += (target.current.dist - cam.dist) * k;
    if (follow) {
      cam.focus.x += (follow.x * 0.7 - cam.focus.x) * Math.min(1, dt * 3);
      cam.focus.z += (follow.z - cam.focus.z) * Math.min(1, dt * 3);
    }
    const h = Math.sin(cam.pitch) * cam.dist;
    pos.set(
      cam.focus.x + Math.sin(cam.yaw) * h,
      cam.focus.y + Math.cos(cam.pitch) * cam.dist,
      cam.focus.z + Math.cos(cam.yaw) * h,
    );
    camera.position.copy(pos);
    camera.lookAt(cam.focus);
  });
  return null;
}

/** Chạm hợp lệ (không phải cuối một cú kéo xoay camera). */
export function isTap(e: { delta: number }) {
  return e.delta <= TAP_SLOP && !cam.dragging;
}

/**
 * Tường "cắt": camera ra phía ngoài bức tường nào thì ẩn bức tường đó (và đồ treo trên nó)
 * để xoay kiểu gì cũng nhìn được vào trong.
 */
export function Cutaway({
  at,
  inward,
  children,
}: {
  at: [number, number];
  inward: [number, number];
  children: ReactNode;
}) {
  const g = useRef<Group>(null);
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    if (!g.current) return;
    const dx = camera.position.x - at[0];
    const dz = camera.position.z - at[1];
    g.current.visible = dx * inward[0] + dz * inward[1] > -0.2;
  });
  return <group ref={g}>{children}</group>;
}
