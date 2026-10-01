"use client";

import { useGLTF } from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  Box3,
  type BufferGeometry,
  type InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  type Object3D,
  Quaternion,
  Vector3,
} from "three";
import { CITY_URL, type CityModel, VILLAGE_URL } from "../assets";
import { toLambert } from "./materials";

export interface Placement {
  x: number;
  z: number;
  /** Góc xoay quanh trục Y, đơn vị radian. */
  rot?: number;
  y?: number;
}

interface Part {
  geometry: BufferGeometry;
  material: Material | Material[];
  /** Transform của mesh so với node gốc của model (đã gồm scale bake từ pipeline). */
  local: Matrix4;
}

function collectParts(root: Object3D): Part[] {
  root.updateWorldMatrix(true, true);
  const rootInverse = new Matrix4().copy(root.parent?.matrixWorld ?? new Matrix4()).invert();
  const parts: Part[] = [];
  root.traverse((obj) => {
    if (obj instanceof Mesh) {
      parts.push({
        geometry: obj.geometry,
        material: obj.material,
        local: new Matrix4().multiplyMatrices(rootInverse, obj.matrixWorld),
      });
    }
  });
  return parts;
}

/** Tải bundle city + village một lần; trả về các phần (geometry + material) của từng model theo tên. */
function useCityParts(): Record<string, Part[]> {
  const [city, village] = useGLTF([CITY_URL, VILLAGE_URL]);
  return useMemo(() => {
    const byName: Record<string, Part[]> = {};
    for (const gltf of [city, village]) {
      if (!gltf) continue;
      toLambert(gltf.scene);
      for (const child of gltf.scene.children) byName[child.name] = collectParts(child);
    }
    return byName;
  }, [city, village]);
}

const up = new Vector3(0, 1, 0);

function boxOf(parts: Part[] | undefined): Box3 {
  const box = new Box3();
  for (const p of parts ?? []) {
    p.geometry.computeBoundingBox();
    const b = p.geometry.boundingBox;
    if (b) box.union(b.clone().applyMatrix4(p.local));
  }
  return box;
}

/** Hộp bao của một model (mét, gốc của model) — để đặt đồ kèm theo (bóng đèn trên đầu cột…). */
export function useModelBox(model: CityModel): Box3 {
  const parts = useCityParts()[model];
  return useMemo(() => boxOf(parts), [parts]);
}

/** Hộp bao của nhiều model một lúc. */
export function useModelBoxes<M extends CityModel>(models: readonly M[]): Record<M, Box3> {
  const all = useCityParts();
  return useMemo(
    () => Object.fromEntries(models.map((m) => [m, boxOf(all[m])])) as Record<M, Box3>,
    [all, models],
  );
}

/**
 * Vẽ nhiều bản sao của một model bằng InstancedMesh: mỗi mesh con = 1 draw call bất kể số bản sao.
 * Đây là cách chính để giữ draw call < 100 trên mobile (docs/PLAN.md §1).
 */
export function Instances({ model, at }: { model: CityModel; at: Placement[] }) {
  const parts = useCityParts()[model];
  if (!parts) throw new Error(`Không có model "${model}" trong city bundle`);
  return (
    <>
      {parts.map((part, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: danh sách part cố định theo model
        <InstancedPart key={i} part={part} at={at} />
      ))}
    </>
  );
}

function InstancedPart({ part, at }: { part: Part; at: Placement[] }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const one = new Vector3(1, 1, 1);
    at.forEach((p, i) => {
      q.setFromAxisAngle(up, p.rot ?? 0);
      m.compose(new Vector3(p.x, p.y ?? 0, p.z), q, one).multiply(part.local);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [at, part]);
  return <instancedMesh ref={ref} args={[part.geometry, part.material, at.length]} />;
}

useGLTF.preload(CITY_URL);
useGLTF.preload(VILLAGE_URL);
