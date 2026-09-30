"use client";

import { useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import type { Object3D } from "three";
import { INTERIOR_URL, type InteriorModel } from "../assets";
import { toLambert } from "../scene/materials";

/** Nạp bundle nội thất một lần; trả về node gốc của từng model theo tên. */
function useInterior(): Record<string, Object3D> {
  const gltf = useGLTF(INTERIOR_URL);
  return useMemo(() => {
    toLambert(gltf.scene);
    return Object.fromEntries(gltf.scene.children.map((c) => [c.name, c]));
  }, [gltf]);
}

/**
 * Một món nội thất (quầy, bàn, khay, dĩa…). Cảnh nội thất ít đồ nên clone từng cái, không cần instancing;
 * đổi lại chạm (onClick) được vào từng món.
 */
export function Model({
  name,
  position = [0, 0, 0],
  rotation = 0,
  scale = 1,
  onClick,
}: {
  name: InteriorModel;
  position?: [number, number, number];
  rotation?: number;
  scale?: number;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const nodes = useInterior();
  const obj = useMemo(() => nodes[name]?.clone(true), [nodes, name]);
  if (!obj) return null;
  // Bọc trong group: node gốc đã có scale riêng (bake từ pipeline), không được ghi đè.
  return (
    <group position={position} rotation-y={rotation} scale={scale} onClick={onClick}>
      <primitive object={obj} />
    </group>
  );
}

useGLTF.preload(INTERIOR_URL);
