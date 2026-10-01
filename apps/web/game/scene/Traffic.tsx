"use client";

import { useFrame } from "@react-three/fiber";
import { content } from "@xom/content";
import { congestion, seededRandom } from "@xom/sim";
import { useEffect, useMemo, useRef } from "react";
import { Color, type InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import { useGame } from "../store";

/** Tối đa xe trên đường (PLAN §1: ≤ 60, mỗi phần xe một draw call). */
const MAX = 60;

interface Lane {
  axis: "x" | "z";
  /** Toạ độ cố định (z của đường ngang, x của đường dọc). */
  fixed: number;
  dir: 1 | -1;
  min: number;
  max: number;
  /** Hệ số tốc độ riêng mỗi làn (xe cùng làn chạy đều nhau, không đè nhau). */
  pace: number;
}

interface Vehicle {
  lane: number;
  t: number;
  kind: "bike" | "car" | "bus";
  /** Thứ tự bật: mật độ thấp thì chỉ hiện xe có thứ tự nhỏ. */
  order: number;
}

const BIKE_COLORS = ["#2b2b33", "#b23a2f", "#1f4e8c", "#d8d2c4", "#3c6b3a"];
const SHIRTS = ["#e4432d", "#f6b93b", "#2f7d4f", "#3b6fb6", "#f1e6d0", "#8a5a9c"];
const CAR_COLORS = ["#f1f1f1", "#c8312b", "#2b5aa8", "#9aa3ab", "#2f2f35"];
const BUS_COLOR = "#2f8f5b";

/** Làn xe từ bản đồ ô: đường ngang "=" (mỗi hàng 2 làn ngược chiều), đường dọc "|" (mỗi cột 2 làn). */
function lanesFromMap(): Lane[] {
  const m = content.data.map;
  const lanes: Lane[] = [];
  const rand = seededRandom("lanes");
  const cols = m.rows[0]?.length ?? 0;
  const xMin = m.origin.x - m.tile;
  const xMax = m.origin.x + cols * m.tile;
  const zMin = m.origin.z - m.tile;
  const zMax = m.origin.z + m.rows.length * m.tile;
  m.rows.forEach((row, r) => {
    if (row.split("").filter((ch) => ch === "=").length < cols / 2) return;
    const z = m.origin.z + r * m.tile;
    lanes.push({ axis: "x", fixed: z + 1, dir: 1, min: xMin, max: xMax, pace: 0.9 + rand() * 0.2 });
    lanes.push({
      axis: "x",
      fixed: z - 1,
      dir: -1,
      min: xMin,
      max: xMax,
      pace: 0.9 + rand() * 0.2,
    });
  });
  for (let c = 0; c < cols; c++) {
    if (m.rows.filter((row) => row[c] === "|").length < m.rows.length / 2) continue;
    const x = m.origin.x + c * m.tile;
    lanes.push({ axis: "z", fixed: x - 1, dir: 1, min: zMin, max: zMax, pace: 0.9 + rand() * 0.2 });
    lanes.push({
      axis: "z",
      fixed: x + 1,
      dir: -1,
      min: zMin,
      max: zMax,
      pace: 0.9 + rand() * 0.2,
    });
  }
  return lanes;
}

/**
 * 🚦 Giao thông (docs/KIENTRUC.md §5, UC-N2): xe máy (nhiều nhất), ô tô, xe buýt chạy theo làn trên đường lớn. Mật độ và tốc
 * độ theo độ kẹt xe giờ cao điểm (sim `congestion`, cùng công thức với xe ôm); mưa thì bớt xe máy. 4 InstancedMesh = 4 draw call.
 */
export function Traffic() {
  const minute = useGame((s) => s.clock?.minute ?? 8 * 60);
  const sky = useGame((s) => s.clock?.weather.now ?? "sunny");
  const jam = useRef(0);
  const wet = useRef(false);
  useEffect(() => {
    jam.current = congestion(content, minute);
    wet.current = content.weatherKind(sky).rain > 0.3;
  }, [minute, sky]);

  const lanes = useMemo(lanesFromMap, []);
  const vehicles = useMemo<Vehicle[]>(() => {
    const rand = seededRandom("traffic");
    const perLane = Math.floor(MAX / Math.max(1, lanes.length));
    const out: Vehicle[] = [];
    lanes.forEach((lane, li) => {
      const span = lane.max - lane.min;
      for (let k = 0; k < perLane; k++) {
        const r = rand();
        const kind = r < 0.72 ? "bike" : r < 0.94 || lane.axis === "z" ? "car" : "bus";
        out.push({
          lane: li,
          t: lane.min + ((k + rand() * 0.5) / perLane) * span,
          kind,
          order: rand(),
        });
      }
    });
    return out;
  }, [lanes]);

  // Bản dev: kịch bản Playwright đọc số xe đang chạy (giờ cao điểm phải đông hơn giữa trưa).
  const shownCount = useRef(0);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { xomTraffic?: () => number };
    w.xomTraffic = () => shownCount.current;
    return () => {
      w.xomTraffic = undefined;
    };
  }, []);

  const bikeBody = useRef<InstancedMesh>(null);
  const rider = useRef<InstancedMesh>(null);
  const carBody = useRef<InstancedMesh>(null);
  const cabin = useRef<InstancedMesh>(null);

  // Màu từng xe (một lần).
  useEffect(() => {
    const rand = seededRandom("traffic-colors");
    const c = new Color();
    vehicles.forEach((v, i) => {
      const pick = (list: string[]) => list[Math.floor(rand() * list.length)] ?? "#888888";
      bikeBody.current?.setColorAt(i, c.set(pick(BIKE_COLORS)));
      rider.current?.setColorAt(i, c.set(pick(SHIRTS)));
      carBody.current?.setColorAt(i, c.set(v.kind === "bus" ? BUS_COLOR : pick(CAR_COLORS)));
      cabin.current?.setColorAt(i, c.set("#9cc3d8"));
    });
    for (const m of [bikeBody, rider, carBody, cabin])
      if (m.current?.instanceColor) m.current.instanceColor.needsUpdate = true;
  }, [vehicles]);

  const tmp = useMemo(
    () => ({
      m: new Matrix4(),
      q: new Quaternion(),
      p: new Vector3(),
      s: new Vector3(),
      up: new Vector3(0, 1, 0),
    }),
    [],
  );
  useFrame((_, dt) => {
    const step = Math.min(dt, 0.1);
    const j = jam.current;
    // Vắng: ~12 xe; kẹt cứng: đủ 60. Mưa bớt xe máy.
    const density = 0.2 + 0.8 * j;
    const speedBase = 7 * (1 - 0.6 * j);
    const { m, q, p, s, up } = tmp;
    let count = 0;
    vehicles.forEach((v, i) => {
      const lane = lanes[v.lane];
      if (!lane) return;
      const span = lane.max - lane.min;
      const kindPace = v.kind === "bus" ? 0.75 : 1;
      v.t += lane.dir * speedBase * lane.pace * kindPace * step;
      if (v.t > lane.max) v.t -= span;
      if (v.t < lane.min) v.t += span;
      const shown =
        v.order < density && !(wet.current && v.kind === "bike" && v.order > density * 0.6);
      const x = lane.axis === "x" ? v.t : lane.fixed;
      const z = lane.axis === "x" ? lane.fixed : v.t;
      const yaw =
        lane.axis === "x"
          ? lane.dir === 1
            ? Math.PI / 2
            : -Math.PI / 2
          : lane.dir === 1
            ? 0
            : Math.PI;
      q.setFromAxisAngle(up, yaw);
      if (shown) count++;
      const bike = shown && v.kind === "bike";
      const car = shown && v.kind !== "bike";
      // Xe máy: thân + người lái.
      p.set(x, 0.38, z);
      s.setScalar(bike ? 1 : 0);
      bikeBody.current?.setMatrixAt(i, m.compose(p, q, s));
      p.set(x, 0.92, z - (lane.axis === "z" ? 0.12 * lane.dir : 0));
      rider.current?.setMatrixAt(i, m.compose(p, q, s));
      // Ô tô / xe buýt: thân + cabin (xe buýt: thân cao, dài, không cabin riêng).
      const bus = v.kind === "bus";
      p.set(x, bus ? 1 : 0.5, z);
      s.set(car ? 1 : 0, car ? (bus ? 2.6 : 1) : 0, car ? (bus ? 2.2 : 1) : 0);
      carBody.current?.setMatrixAt(i, m.compose(p, q, s));
      p.set(x, 1.1, z);
      s.setScalar(car && !bus ? 1 : 0);
      cabin.current?.setMatrixAt(i, m.compose(p, q, s));
    });
    for (const ref of [bikeBody, rider, carBody, cabin])
      if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
    shownCount.current = count;
  });

  const n = vehicles.length;
  return (
    <group name="traffic">
      <instancedMesh ref={bikeBody} args={[undefined, undefined, n]} frustumCulled={false}>
        <boxGeometry args={[0.32, 0.4, 1.15]} />
        <meshLambertMaterial />
      </instancedMesh>
      <instancedMesh ref={rider} args={[undefined, undefined, n]} frustumCulled={false}>
        <boxGeometry args={[0.42, 0.62, 0.36]} />
        <meshLambertMaterial />
      </instancedMesh>
      <instancedMesh ref={carBody} args={[undefined, undefined, n]} frustumCulled={false}>
        <boxGeometry args={[1.5, 0.7, 2.6]} />
        <meshLambertMaterial />
      </instancedMesh>
      <instancedMesh ref={cabin} args={[undefined, undefined, n]} frustumCulled={false}>
        <boxGeometry args={[1.3, 0.55, 1.3]} />
        <meshLambertMaterial />
      </instancedMesh>
    </group>
  );
}
