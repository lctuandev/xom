"use client";

import { Instances, type Placement } from "./CityKit";

// Một con phố thử nghiệm: đường chạy theo trục X, vỉa hè hai bên, dãy nhà mặt tiền quay ra đường.
// 1 ô = 4 m (city kit đã được scale ×4 trong pipeline).
export const TILE = 4;
const HALF_TILES = 6; // x từ -24 đến 24
export const STREET_BOUNDS = {
  minX: -HALF_TILES * TILE,
  maxX: HALF_TILES * TILE,
  minZ: -5.5,
  maxZ: 5.5,
};

const xs = Array.from({ length: HALF_TILES * 2 + 1 }, (_, i) => (i - HALF_TILES) * TILE);
const NORTH = -2 * TILE;
const SOUTH = 2 * TILE;

const roads: Placement[] = xs.filter((x) => x !== 0).map((x) => ({ x, z: 0, rot: Math.PI / 2 }));
const sidewalks: Placement[] = xs.flatMap((x) => [
  { x, z: -TILE },
  { x, z: TILE },
]);
// Nền phía sau dãy nhà để không thấy mép bản đồ.
const backLots: Placement[] = xs.flatMap((x) => [
  { x, z: NORTH },
  { x, z: SOUTH },
  { x, z: NORTH - TILE },
  { x, z: SOUTH + TILE },
]);

const buildingModels = [
  "building-a",
  "building-b",
  "building-c",
  "building-d",
  "building-e",
  "building-f",
  "building-g",
  "building-h",
] as const;

// Dãy nhà phía bắc quay mặt về +Z (ra đường), phía nam xoay 180°.
const buildings = new Map<(typeof buildingModels)[number], Placement[]>();
xs.forEach((x, i) => {
  if (x === 0) return; // chừa ngã tư
  const north = buildingModels[i % buildingModels.length];
  const south = buildingModels[(i + 3) % buildingModels.length];
  if (!north || !south) return;
  buildings.set(north, [...(buildings.get(north) ?? []), { x, z: NORTH }]);
  buildings.set(south, [...(buildings.get(south) ?? []), { x, z: SOUTH, rot: Math.PI }]);
});

const lamps: Placement[] = xs
  .filter((_, i) => i % 2 === 1)
  .flatMap((x) => [
    { x: x + 1.5, z: -TILE + 1.6, rot: 0 },
    { x: x - 1.5, z: TILE - 1.6, rot: Math.PI },
  ]);
const poles: Placement[] = xs
  .filter((_, i) => i % 3 === 0)
  .map((x) => ({ x: x - 1.8, z: -TILE - 1.4, rot: 0 }));
const parasols: Placement[] = [
  { x: -8, z: -TILE + 0.5 },
  { x: -7, z: -TILE - 0.6 },
  { x: 12, z: TILE - 0.4 },
  { x: 16, z: TILE + 0.3 },
];
// Ghế nhựa đỏ trước quán bánh mì — asset tự làm trong Blender (art/blender/ghe_nhua.py).
const stools: Placement[] = [
  { x: -9.2, z: -3.2, rot: 0.2 },
  { x: -8.4, z: -2.7, rot: -0.3 },
  { x: -7.4, z: -3.4, rot: 0.5 },
  { x: -6.6, z: -2.9, rot: 0.1 },
  { x: -8.1, z: -4.1, rot: -0.1 },
];
const awnings: Placement[] = [
  { x: -8, z: NORTH + 1.9 },
  { x: 12, z: SOUTH - 1.9, rot: Math.PI },
  { x: -16, z: NORTH + 1.9 },
];
const cars: Record<"sedan" | "van" | "taxi" | "delivery", Placement[]> = {
  sedan: [{ x: -18, z: 1.6, rot: Math.PI / 2 }],
  van: [{ x: 6, z: -1.6, rot: -Math.PI / 2 }],
  taxi: [{ x: 18, z: -1.6, rot: -Math.PI / 2 }],
  delivery: [{ x: -4, z: 1.6, rot: Math.PI / 2 }],
};

export function Street() {
  return (
    <group>
      <Instances model="road-straight" at={roads} />
      <Instances model="road-crossroad" at={[{ x: 0, z: 0 }]} />
      <Instances model="tile-low" at={sidewalks} />
      <Instances model="tile-low" at={backLots} />
      {[...buildings].map(([model, at]) => (
        <Instances key={model} model={model} at={at} />
      ))}
      <Instances model="light-square" at={lamps} />
      <Instances model="electricity-pole" at={poles} />
      <Instances model="detail-parasol-a" at={parasols.slice(0, 2)} />
      <Instances model="detail-parasol-b" at={parasols.slice(2)} />
      <Instances model="detail-awning-wide" at={awnings} />
      <Instances model="ghe-nhua-do" at={stools} />
      <Instances model="dumpster" at={[{ x: 21, z: TILE + 1.2, rot: Math.PI }]} />
      {Object.entries(cars).map(([model, at]) => (
        <Instances key={model} model={model as keyof typeof cars} at={at} />
      ))}
    </group>
  );
}
