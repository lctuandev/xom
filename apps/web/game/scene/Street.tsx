"use client";

import { content } from "@xom/content";
import type { CityModel } from "../assets";
import { grid } from "../nav";
import { Instances, type Placement } from "./CityKit";

// Xóm vẽ từ bản đồ trong content (docs/USECASES.md UC-B6): mỗi ô 4 m. Đường tự xoay theo hướng,
// ngã tư có đèn giao thông, vỉa hè có đèn đường + cây, nhà quay mặt ra ô đi được gần nhất,
// công viên, chợ, sân trường, bãi xe có đồ trang trí riêng. Mỗi loại model = một InstancedMesh.

export const TILE = content.data.map.tile;
const ROAD = "=|+c";
const WALK = "=|+csaPMSL";

const BUILDINGS: CityModel[] = [
  "building-a",
  "building-b",
  "building-c",
  "building-d",
  "building-e",
  "building-f",
  "building-g",
  "building-h",
  "building-i",
  "building-j",
  "building-k",
  "building-l",
  "building-m",
  "building-n",
];
const TOWERS: CityModel[] = [
  "building-skyscraper-a",
  "building-skyscraper-b",
  "building-skyscraper-c",
  "building-skyscraper-d",
  "building-skyscraper-e",
];
const HOUSES: CityModel[] = [
  "low-detail-building-a",
  "low-detail-building-b",
  "low-detail-building-c",
  "low-detail-building-d",
  "low-detail-building-e",
  "low-detail-building-f",
  "low-detail-building-g",
  "low-detail-building-h",
];
const TREES: CityModel[] = ["tree_default", "tree_oak", "tree_detailed", "tree_fat"];
const FLOWERS: CityModel[] = ["flower_redA", "flower_yellowA", "flower_purpleA"];
const CARS: CityModel[] = ["sedan", "van", "taxi", "suv", "hatchback-sports"];

/** Số giả ngẫu nhiên cố định theo ô (cùng bản đồ → cùng cảnh). */
function hash(c: number, r: number, salt = 0) {
  let h = (c * 73856093) ^ (r * 19349663) ^ (salt * 83492791);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

type Out = Map<CityModel, Placement[]>;
const put = (out: Out, model: CityModel, p: Placement) => {
  const list = out.get(model);
  if (list) list.push(p);
  else out.set(model, [p]);
};

/** Hướng mặt tiền: quay về ô đi được bên cạnh (ưu tiên phía nam/bắc như phố chính). */
function facing(c: number, r: number): number {
  const ok = (dc: number, dr: number) => WALK.includes(grid.charAt(c + dc, r + dr));
  if (ok(0, 1)) return 0;
  if (ok(0, -1)) return Math.PI;
  if (ok(1, 0)) return Math.PI / 2;
  if (ok(-1, 0)) return -Math.PI / 2;
  return 0;
}

export interface BuildingPlacement extends Placement {
  model: CityModel;
}

function layout() {
  const out: Out = new Map();
  const buildings: BuildingPlacement[] = [];
  const lamps: Placement[] = [];
  const isRoad = (c: number, r: number) => ROAD.includes(grid.charAt(c, r));
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const ch = grid.charAt(c, r);
      const { x, z } = grid.center(c, r);
      const h = hash(c, r);
      if (ch === "=") put(out, "road-straight", { x, z, rot: Math.PI / 2 });
      else if (ch === "|") put(out, "road-straight", { x, z, rot: 0 });
      else if (ch === "c") put(out, "road-crossing", { x, z, rot: Math.PI / 2 });
      else if (ch === "+") {
        const n = [isRoad(c, r - 1), isRoad(c + 1, r), isRoad(c, r + 1), isRoad(c - 1, r)];
        const count = n.filter(Boolean).length;
        if (count >= 4) put(out, "road-crossroad", { x, z });
        else if (count === 3) {
          const missing = n.indexOf(false);
          put(out, "road-intersection", { x, z, rot: (missing * -Math.PI) / 2 });
        } else put(out, "road-bend", { x, z });
        // Đèn giao thông ở hai góc chéo.
        put(out, "traffic-light", { x: x + 1.7, z: z + 1.7, rot: Math.PI });
        put(out, "traffic-light", { x: x - 1.7, z: z - 1.7, rot: 0 });
      } else if ("saMSL".includes(ch)) {
        put(out, "tile-low", { x, z });
        if (ch === "s") {
          // Đèn đường sát mép đường (so le), cây phía trong vỉa hè.
          const roadS = isRoad(c, r + 1);
          const roadN = isRoad(c, r - 1);
          if ((roadS || roadN) && c % 2 === 1) {
            const lamp = { x, z: z + (roadS ? 1.6 : -1.6), rot: roadS ? 0 : Math.PI };
            put(out, "light-square", lamp);
            lamps.push(lamp);
          }
          if ((roadS || roadN) && c % 3 === 0 && h < 0.7)
            put(out, TREES[Math.floor(h * 10) % TREES.length] as CityModel, {
              x: x + 1.2,
              z: z + (roadS ? -1.4 : 1.4),
            });
          if (roadN && c % 4 === 2) put(out, "electricity-pole", { x: x - 1.8, z: z - 1.4 });
        } else if (ch === "a") {
          // Hẻm: chậu cây trước nhà.
          if (h < 0.5) put(out, "pot_large", { x: x + 1.5, z: z + (h - 0.25) * 6 });
          if (h > 0.6) put(out, "plant_bush", { x: x - 1.5, z });
        } else if (ch === "M") {
          // Chợ: dù che, ghế nhựa.
          put(out, h < 0.5 ? "detail-parasol-a" : "detail-parasol-b", { x, z });
          put(out, "ghe-nhua-do", { x: x + 1, z: z + 0.8, rot: h * 6 });
          put(out, "ghe-nhua-do", { x: x - 1, z: z - 0.6, rot: h * 3 });
        } else if (ch === "S") {
          // Sân trường: cây bóng mát, hàng rào ra phố.
          if (c % 2 === 0) put(out, "tree_oak", { x, z: z - 1 });
          if (isRoad(c, r + 2) || grid.charAt(c, r + 1) === "s")
            put(out, "fence_simple", { x, z: z + 1.9 });
        } else if (ch === "L") {
          // Bãi xe: xe đậu thành hàng.
          put(out, CARS[Math.floor(h * CARS.length)] as CityModel, { x: x - 0.9, z, rot: 0 });
          if (h > 0.4)
            put(out, CARS[Math.floor(h * 7) % CARS.length] as CityModel, { x: x + 1, z, rot: 0 });
        }
      } else if (ch === "P") {
        // Công viên: cỏ, cây, bụi, hoa, ghế đá.
        put(out, TREES[Math.floor(h * 17) % TREES.length] as CityModel, { x: x - 1, z: z - 1 });
        put(out, FLOWERS[Math.floor(h * 5) % FLOWERS.length] as CityModel, {
          x: x + 1.2,
          z: z + 1,
        });
        if (h > 0.5) put(out, "plant_bushLarge", { x: x + 1.3, z: z - 1.3 });
        if (h < 0.4) put(out, "bench", { x, z: z + 1.5, rot: Math.PI });
      } else if (ch === "B" || ch === "T" || ch === "H" || ch === "K") {
        const list = ch === "T" ? TOWERS : ch === "H" ? HOUSES : ch === "K" ? HOUSES : BUILDINGS;
        const model = list[Math.floor(h * list.length)] as CityModel;
        const p = { x, z, rot: facing(c, r) };
        put(out, model, p);
        buildings.push({ ...p, model });
      }
    }
  }
  // Xe đậu ven phố chính.
  put(out, "sedan", { x: -18, z: 1.6, rot: Math.PI / 2 });
  put(out, "van", { x: 6, z: -1.6, rot: -Math.PI / 2 });
  put(out, "taxi", { x: 18, z: -1.6, rot: -Math.PI / 2 });
  put(out, "delivery", { x: -4, z: 1.6, rot: Math.PI / 2 });
  put(out, "dumpster", { x: 21, z: TILE + 1.2, rot: Math.PI });
  return { out, buildings, lamps };
}

const LAYOUT = layout();
export const buildingPlacements = LAYOUT.buildings;
export const lampPlacements = LAYOUT.lamps;

/** Vùng cỏ (công viên + ven xóm) nằm dưới các ô. */
function Ground() {
  const b = grid.map;
  const w = grid.cols * b.tile;
  const h = grid.rows * b.tile;
  return (
    <group>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[b.origin.x - b.tile / 2 + w / 2, -0.03, b.origin.z - b.tile / 2 + h / 2]}
      >
        <planeGeometry args={[w + 80, h + 80]} />
        <meshLambertMaterial color="#9bb57f" />
      </mesh>
    </group>
  );
}

export function Street() {
  return (
    <group>
      <Ground />
      {[...LAYOUT.out].map(([model, at]) => (
        <Instances key={model} model={model} at={at} />
      ))}
    </group>
  );
}
