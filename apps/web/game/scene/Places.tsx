"use client";

import { useFrame } from "@react-three/fiber";
import { content, type Place } from "@xom/content";
import { useMemo, useRef } from "react";
import type { CharacterModel, CityModel } from "../assets";
import { useGame } from "../store";
import { addressSpot, placeSpot, standBehind } from "../world";
import { Character, Walker } from "./Character";
import { Instances, type Placement } from "./CityKit";
import { speakerWalker } from "./guide";
import { distanceTo, getPlayer } from "./player";
import { Sign } from "./Sign";

/** Các địa điểm có người đứng quầy + NPC dẫn đường (docs/PLAN.md Phase 1.5). */
export function Places() {
  // Gom prop cùng model để vẽ bằng một InstancedMesh.
  const props = useMemo(() => {
    const byModel = new Map<string, Placement[]>();
    for (const place of content.data.places) {
      for (const p of place.props) {
        const list = byModel.get(p.model) ?? [];
        list.push({ x: place.position.x + p.dx, z: place.position.z + p.dz, rot: p.rot });
        byModel.set(p.model, list);
      }
    }
    return [...byModel];
  }, []);

  return (
    <>
      {props.map(([model, at]) => (
        <Instances key={model} model={model as CityModel} at={at} />
      ))}
      {content.data.places.map((place) => (
        <PlaceKeeper key={place.id} place={place} />
      ))}
      {content.data.speakers.map((sp) => (
        <Character key={sp.id} model={sp.model as CharacterModel} walker={speakerWalker(sp.id)} />
      ))}
    </>
  );
}

function PlaceKeeper({ place }: { place: Place }) {
  return (
    <group>
      <StaticNpc
        model={place.keeper.model as CharacterModel}
        x={place.position.x}
        z={place.position.z}
        yaw={place.facing}
      />
      <Sign
        text={place.sign}
        position={[place.position.x, 3.1, place.position.z + (place.facing === 0 ? -0.6 : 0.6)]}
        rotationY={Math.PI / 2}
        bg={place.signColor}
      />
    </group>
  );
}

function StaticNpc({
  model,
  x,
  z,
  yaw,
}: {
  model: CharacterModel;
  x: number;
  z: number;
  yaw: number;
}) {
  const walker = useMemo(() => {
    const w = new Walker(x, z, 1);
    w.yaw = yaw;
    return w;
  }, [x, z, yaw]);
  return <Character model={model} walker={walker} />;
}

/**
 * 4 lần/giây: người chơi đang ở gần địa điểm nào, có đứng ở quầy không; tới goal thì mở sheet.
 * Chỉ ghi store khi có thay đổi để không re-render thừa.
 */
export function ProximityWatcher() {
  const acc = useRef(0);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 0.25) return;
    acc.current = 0;
    const s = useGame.getState();
    const radius = content.economy.interactRadius;
    let near: string | null = null;
    for (const place of content.data.places) {
      const spot = placeSpot(place.id);
      if (distanceTo(spot.x, spot.z) <= radius) near = place.id;
    }
    const lotId = s.me?.business?.lotId;
    const behind = lotId ? standBehind(lotId) : null;
    const atStall = behind ? distanceTo(behind.x, behind.z) <= radius : false;
    if (near !== s.nearPlace || atStall !== s.atStall) s.setProximity(near, atStall);
    // Trước cửa nhà nào (giao hàng).
    let door: string | null = null;
    for (const a of content.data.delivery.addresses) {
      const spot = addressSpot(a.id);
      if (spot && distanceTo(spot.x, spot.z) <= radius) door = a.id;
    }
    if (door !== s.nearAddress) s.setNearAddress(door);

    const g = s.goal;
    const arrived =
      g?.kind === "place" ? near === g.id : g?.kind === "address" ? door === g.id : atStall;
    if (g && !getPlayer().target && arrived) {
      s.setGoal(null);
      if ("open" in g && g.open) s.openSheet(g.open);
    }
  });
  return null;
}
