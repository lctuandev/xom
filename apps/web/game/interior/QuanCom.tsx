"use client";

import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { content } from "@xom/content";
import type { DinerView, ShiftView } from "@xom/shared";
import { useEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import type { CharacterModel } from "../assets";
import { registerAnchor } from "../scene/anchors";
import { Character, Walker } from "../scene/Character";
import { Sign } from "../scene/Sign";
import { useGame } from "../store";
import { Model } from "./models";
import { ROOM, Room, TableTop } from "./quancom/Room";
import {
  cashierSlot,
  passStand,
  queueSlot,
  seat,
  staff,
  tableStand,
  WALK_SPEED,
} from "./quancom/staff";

// Quán cơm Cô Tư sống động (docs/USECASES.md UC-W8): khách vào cửa, xếp hàng, ngồi bàn, ăn, trả tiền,
// ra về; đồng nghiệp làm những vị trí mình không làm; mình thấy mình đứng quầy / cầm dĩa đi tới bàn.

const R = content.data.restaurant;
const L = R.layout;
/** Lưới khay trên quầy: 4 khay hàng trước, 3 khay hàng sau. */
export const TRAY_POS: [number, number][] = [
  [-0.75, -0.2],
  [-0.25, -0.2],
  [0.25, -0.2],
  [0.75, -0.2],
  [-0.5, 0.25],
  [0, 0.25],
  [0.5, 0.25],
];
const COUNTER_Y = 1.03;
/** Dĩa đang múc: đặt ở mép quầy phía khách. */
const PLATE_POS: [number, number, number] = [0, COUNTER_Y, -0.62];

const FOOD_SCALE: Record<string, number> = {
  suon: 1.3,
  bi: 1,
  cha: 1.6,
  trung: 1.4,
  dua: 2.2,
  canh: 1.2,
};

const LOOKS: CharacterModel[] = [
  "character-female-a",
  "character-male-c",
  "character-female-d",
  "character-male-a",
];

/** Một phần món: cơm là chén cơm trắng; món khác lấy model Kenney. */
export function Food({
  id,
  position,
  scale = 1,
}: {
  id: string;
  position: [number, number, number];
  scale?: number;
}) {
  if (id === "com") {
    return (
      <mesh position={position} scale={scale}>
        <sphereGeometry args={[0.07, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshLambertMaterial color="#fbf6ec" />
      </mesh>
    );
  }
  const food = R.foods.find((f) => f.id === id);
  if (!food) return null;
  return (
    <Model name={food.model as never} position={position} scale={(FOOD_SCALE[id] ?? 1) * scale} />
  );
}

/** Dĩa cơm tấm đầy đủ (dĩa + cơm + sườn). */
function FullPlate({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Model name="plate" />
      <Food id="com" position={[-0.05, 0.02, 0]} scale={0.8} />
      <Food id="suon" position={[0.06, 0.02, 0]} scale={0.8} />
    </group>
  );
}

function Trays({ shift, onScoop }: { shift: ShiftView; onScoop?: (foodId: string) => void }) {
  return (
    <group>
      {R.foods.map((f, i) => {
        const [x, z] = TRAY_POS[i] ?? [0, 0];
        const left = shift.trays[f.id] ?? 0;
        return (
          <group key={f.id} position={[x, COUNTER_Y, z]} onClick={() => onScoop?.(f.id)}>
            <mesh position={[0, 0.03, 0]}>
              <boxGeometry args={[0.44, 0.06, 0.36]} />
              <meshLambertMaterial color="#b9c2c9" />
            </mesh>
            {left > 0 &&
              Array.from({ length: Math.min(3, Math.ceil(left / 4)) }, (_, k) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: số phần hiển thị cố định
                <Food key={k} id={f.id} position={[(k - 1) * 0.12, 0.06, 0]} />
              ))}
          </group>
        );
      })}
    </group>
  );
}

/** Dĩa đang múc: mỗi thứ múc vào hiện một phần trên dĩa. */
function PlateOnCounter({ items }: { items: string[] }) {
  return (
    <group position={PLATE_POS}>
      <Model name="plate" scale={1.2} />
      {items.map((id, i) => {
        const a = (i / Math.max(1, items.length)) * Math.PI * 2;
        const r = items.length > 1 ? 0.09 : 0;
        return (
          <Food
            // biome-ignore lint/suspicious/noArrayIndexKey: thứ tự múc
            key={i}
            id={id}
            position={[Math.cos(a) * r, 0.03 + i * 0.004, Math.sin(a) * r]}
            scale={0.7}
          />
        );
      })}
    </group>
  );
}

// ───────────────────────── Khách ─────────────────────────

/** Chỗ khách cần tới theo bước hiện tại. */
function targetOf(d: DinerView, all: DinerView[]) {
  switch (d.stage) {
    case "entering":
    case "queue": {
      const line = all.filter((x) => x.stage === "entering" || x.stage === "queue");
      return queueSlot(Math.max(0, line.indexOf(d)));
    }
    case "to_table":
    case "seated":
    case "eating":
      return seat(d.table);
    case "to_cashier":
    case "paying": {
      const line = all.filter((x) => x.stage === "to_cashier" || x.stage === "paying");
      return cashierSlot(Math.max(0, line.indexOf(d)));
    }
    default:
      return { x: L.door.x, z: L.door.z, face: -Math.PI / 2 };
  }
}

function DinerActor({ d, all, scale }: { d: DinerView; all: DinerView[]; scale: number }) {
  // Mới vào thì xuất hiện ngoài cửa; thấy giữa chừng (vào lại ca) thì đặt thẳng vào chỗ.
  const start = useRef(d.stage === "entering" ? { x: L.door.x, z: L.door.z } : targetOf(d, all));
  const walker = useMemo(() => new Walker(start.current.x, start.current.z, 1.6), []);
  const key = `diner:${d.id}`;
  const t = targetOf(d, all);
  // Khách quỵt tiền đi nhanh; đồng hồ tăng tốc thì đi nhanh theo.
  walker.speed = (d.incident === "dash" ? 2.6 : 1.6) / scale;
  useEffect(() => {
    walker.moveTo(t.x, t.z, t.face);
  }, [walker, t.x, t.z, t.face]);
  useEffect(() => {
    const off = registerAnchor(key, () => walker.position);
    return () => {
      off();
      useGame.getState().setBubble(key, null);
    };
  }, [key, walker]);
  useEffect(() => {
    const game = useGame.getState();
    if (d.say) game.setBubble(key, { text: d.say.text, tone: d.say.tone });
    else if (d.incident === "dash") game.setBubble(key, { text: "🏃 …", tone: "bad" });
    else game.setBubble(key, null);
  }, [key, d.say, d.incident]);

  const sitting = d.stage === "seated" || d.stage === "eating";
  const model = LOOKS[d.look % LOOKS.length] ?? "character-male-c";
  return <SitWhenArrived walker={walker} model={model} sitting={sitting} />;
}

/** Ngồi xuống khi đã tới ghế (đang đi thì vẫn đi). */
function SitWhenArrived({
  walker,
  model,
  sitting,
}: {
  walker: Walker;
  model: CharacterModel;
  sitting: boolean;
}) {
  const pose = sitting && !walker.target ? "sit" : "auto";
  return <Character model={model} walker={walker} pose={pose} />;
}

// ───────────────────────── Nhân viên ─────────────────────────

/** Người đứng tại chỗ (Cô Tư ở quầy, chị thu ngân, chú đầu bếp); có neo khung thoại nếu cần. */
function Worker({
  x,
  z,
  yaw,
  model,
  anchor,
}: {
  x: number;
  z: number;
  yaw: number;
  model: CharacterModel;
  anchor?: string;
}) {
  const walker = useMemo(() => {
    const w = new Walker(x, z, 1.5);
    w.yaw = yaw;
    return w;
  }, [x, z, yaw]);
  useEffect(
    () => (anchor ? registerAnchor(anchor, () => walker.position) : undefined),
    [anchor, walker],
  );
  return <Character model={model} walker={walker} />;
}

/** Bé Út bưng bê (khi mình làm vai khác): cầm dĩa đi tới bàn rồi quay về cửa bếp. */
function NpcWaiter({ shift }: { shift: ShiftView }) {
  const walker = useMemo(() => new Walker(passStand.x + 0.6, passStand.z, 2), []);
  const carrying = shift.pass.filter((p) => p.npc);
  const first = carrying[0];
  walker.speed = 2 / shift.scale;
  useEffect(() => {
    if (first) {
      const s = tableStand(first.table);
      walker.moveTo(s.x, s.z, s.face);
    } else walker.moveTo(passStand.x + 0.6, passStand.z, 0);
  }, [walker, first]);
  return (
    <group>
      <Character model="character-female-d" walker={walker} />
      <Carried walker={walker} count={carrying.length} />
    </group>
  );
}

/** Dĩa trên tay một người (theo vị trí + hướng của họ). */
function Carried({ walker, count }: { walker: Walker; count: number }) {
  const g = useRef<Group>(null);
  useFrame(() => {
    const el = g.current;
    if (!el) return;
    el.position.set(
      walker.position.x + Math.sin(walker.yaw) * 0.32,
      0.95,
      walker.position.z + Math.cos(walker.yaw) * 0.32,
    );
    el.rotation.y = walker.yaw;
  });
  if (count === 0) return null;
  return (
    <group ref={g}>
      {Array.from({ length: Math.min(2, count) }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: tối đa hai dĩa trên tay
        <FullPlate key={i} position={[(i - (count - 1) / 2) * 0.3, 0, 0]} />
      ))}
    </group>
  );
}

/** Mình (bưng bê): tự đi lại theo chỗ chạm, tới nơi thì làm việc đang chờ. */
function StaffActor({ holding, scale }: { holding: number; scale: number }) {
  const w = staff.walker;
  w.speed = WALK_SPEED / scale;
  const myId = useGame((s) => s.me?.playerId);
  useEffect(() => (myId ? registerAnchor(myId, () => w.position) : undefined), [myId]);
  useFrame(() => {
    if (!w.target && staff.pending) {
      const run = staff.pending;
      staff.pending = null;
      run();
    }
  });
  return (
    <group>
      <Character model="character-male-a" walker={w} />
      <Carried walker={w} count={holding} />
    </group>
  );
}

// ───────────────────────── Bàn, cửa bếp ─────────────────────────

function Tables({
  shift,
  onTable,
}: {
  shift: ShiftView;
  onTable?: (table: number, e: ThreeEvent<MouseEvent>) => void;
}) {
  const eating = new Set(shift.diners.filter((d) => d.stage === "eating").map((d) => d.table));
  const arguing = new Set(shift.diners.filter((d) => d.incident === "argue").map((d) => d.table));
  return (
    <group>
      {L.tables.map(({ x, z }, i) => {
        const n = i + 1;
        const state = shift.tables[i] ?? "free";
        return (
          <group key={n}>
            <group onClick={(e) => onTable?.(n, e)}>
              <Model name="table" position={[x, 0, z]} />
            </group>
            <Model name="chair" position={[x - 0.6, 0, z + 0.1]} rotation={Math.PI / 2} />
            <Model name="chair" position={[x + 0.6, 0, z + 0.1]} rotation={-Math.PI / 2} />
            <TableTop x={x} z={z} />
            <Sign
              text={arguing.has(n) ? `BÀN ${n} ⚠` : `BÀN ${n}`}
              position={[x, 1.55, z]}
              bg={arguing.has(n) ? "#e4432d" : state === "dirty" ? "#8a8f96" : "#2f7d4f"}
              size={[0.9, 0.24]}
            />
            {eating.has(n) && (
              <group>
                <FullPlate position={[x - 0.2, 0.77, z]} />
                <Model name="cup-tea" position={[x - 0.2, 0.77, z - 0.28]} />
              </group>
            )}
            {state === "dirty" && (
              <group position={[x - 0.15, 0.77, z]}>
                <Model name="plate" />
                <Model name="bowl" position={[0.18, 0.02, 0.06]} />
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}

/** Dĩa đã múc chờ ở cửa bếp, kẹp số bàn; chạm để cầm (bưng bê). */
function PassPlates({
  shift,
  onPass,
}: {
  shift: ShiftView;
  onPass?: (id: string, e: ThreeEvent<MouseEvent>) => void;
}) {
  const waiting = shift.pass.filter((p) => !p.npc && !shift.holding.includes(p.id));
  return (
    <group>
      {waiting.slice(0, 4).map((p, i) => (
        <group
          key={p.id}
          position={[L.pass.x - 0.45 + i * 0.3, 1.0, 0.0]}
          onClick={(e) => onPass?.(p.id, e)}
        >
          <FullPlate position={[0, 0, 0]} />
          <Sign
            text={`${p.table}`}
            position={[0, 0.22, -0.12]}
            bg="#fff6e5"
            dark
            size={[0.16, 0.12]}
          />
        </group>
      ))}
    </group>
  );
}

export function QuanComScene({
  shift,
  plate,
  onScoop,
  onTable,
  onPass,
  onFloor,
}: {
  shift: ShiftView | null;
  plate: string[];
  onScoop?: (foodId: string) => void;
  onTable?: (table: number, e: ThreeEvent<MouseEvent>) => void;
  onPass?: (id: string, e: ThreeEvent<MouseEvent>) => void;
  onFloor?: (x: number, z: number) => void;
}) {
  const role = shift?.role;
  const scale = shift?.scale ?? 1;
  const diners = shift?.diners ?? [];
  return (
    <group>
      <Room />
      {/* Sàn bắt chạm để tự đi (bưng bê): phòng ăn phía trước quầy */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, 0.01, (ROOM.minZ - 0.8) / 2]}
        visible={false}
        onClick={(e) => {
          e.stopPropagation();
          onFloor?.(e.point.x, e.point.z);
        }}
      >
        <planeGeometry args={[ROOM.maxX - ROOM.minX - 0.6, -ROOM.minZ - 0.8]} />
        <meshBasicMaterial />
      </mesh>
      {shift && <Trays shift={shift} onScoop={onScoop} />}
      {role === "dung_quay" && <PlateOnCounter items={plate} />}
      {shift && <Tables shift={shift} onTable={onTable} />}
      {shift && <PassPlates shift={shift} onPass={onPass} />}
      {diners.map((d) => (
        <DinerActor key={d.id} d={d} all={diners} scale={scale} />
      ))}

      {/* Mình và đồng nghiệp: vị trí nào mình không làm thì có người làm thay */}
      {/* Đứng quầy / thu ngân: camera là mắt mình nên không vẽ chính mình */}
      {role !== "dung_quay" && (
        <Worker x={0} z={0.62} yaw={Math.PI} model="character-female-a" anchor="quan_com" />
      )}
      {role !== "thu_ngan" && (
        <Worker x={L.cashier.x} z={0.62} yaw={Math.PI} model="character-female-d" />
      )}
      {role === "bung_be"
        ? shift && <StaffActor holding={shift.holding.length} scale={scale} />
        : shift && <NpcWaiter shift={shift} />}
      <Worker x={-1.6} z={1.35} yaw={Math.PI} model="character-male-c" />
      {role === "dung_quay" && (
        <Worker x={-2.9} z={1.2} yaw={Math.PI} model="character-female-a" anchor="quan_com" />
      )}
    </group>
  );
}
