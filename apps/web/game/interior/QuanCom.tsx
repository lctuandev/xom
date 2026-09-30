"use client";

import { content } from "@xom/content";
import type { ShiftView } from "@xom/shared";
import { useEffect, useMemo } from "react";
import type { CharacterModel } from "../assets";
import { registerAnchor } from "../scene/anchors";
import { Character, Walker } from "../scene/Character";
import { Sign } from "../scene/Sign";
import { useGame } from "../store";
import { Model } from "./models";

// Quán cơm Cô Tư (docs/USECASES.md UC-W2…W4): quầy khay món ở giữa, khách xếp hàng phía trước,
// phòng ăn 6 bàn phía sau, bếp sau lưng người đứng quầy. Đơn vị mét, quầy ở z = 0.

const R = content.data.restaurant;
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
export const PLATE_POS: [number, number, number] = [0, COUNTER_Y, -0.62];
export const TABLES: [number, number][] = [
  [-2.6, -3.4],
  [0, -3.4],
  [2.6, -3.4],
  [-2.6, -5.8],
  [0, -5.8],
  [2.6, -5.8],
];

const FOOD_SCALE: Record<string, number> = {
  suon: 1.3,
  bi: 1,
  cha: 1.6,
  trung: 1.4,
  dua: 2.2,
  canh: 1.2,
};

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

function Room() {
  return (
    <group>
      {/* Sàn gạch, tường vàng kem */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -3]}>
        <planeGeometry args={[10, 12]} />
        <meshLambertMaterial color="#e8d9bd" />
      </mesh>
      <mesh position={[0, 1.6, -7.6]}>
        <planeGeometry args={[10, 3.2]} />
        <meshLambertMaterial color="#f3e2b8" />
      </mesh>
      <mesh position={[-4.2, 1.6, -3]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[12, 3.2]} />
        <meshLambertMaterial color="#efdcae" />
      </mesh>
      <mesh position={[4.2, 1.6, -3]} rotation-y={-Math.PI / 2}>
        <planeGeometry args={[12, 3.2]} />
        <meshLambertMaterial color="#efdcae" />
      </mesh>
      <Sign text="CƠM TẤM CÔ TƯ" position={[0, 2.6, -7.5]} bg="#e4432d" />
      <Model name="pottedPlant" position={[-3.7, 0, -7]} />
      <Model name="pottedPlant" position={[3.7, 0, -7]} />
      {/* Bếp sau lưng quầy */}
      <Model name="kitchenStove" position={[-1.6, 0, 1.5]} rotation={Math.PI} />
      <Model name="kitchenCabinet" position={[-0.6, 0, 1.5]} rotation={Math.PI} />
      <Model name="kitchenCabinet" position={[1.5, 0, 1.5]} rotation={Math.PI} />
      {/* Quầy khay món (2 tủ bếp ghép) + quầy thu ngân bên phải */}
      <Model name="kitchenCabinet" position={[-0.5, 0, 0]} />
      <Model name="kitchenCabinet" position={[0.5, 0, 0]} />
      <Model name="kitchenBar" position={[1.6, 0, 0]} />
      <Model name="computerScreen" position={[1.65, 0.97, 0.05]} rotation={Math.PI} scale={0.5} />
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
export function PlateOnCounter({ items }: { items: string[] }) {
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

const MODELS: CharacterModel[] = [
  "character-female-a",
  "character-male-c",
  "character-female-d",
  "character-male-a",
];

/** Khách đứng xếp hàng trước quầy; khung thoại trên đầu là lời gọi món. */
function Queue({ ids, texts, x0 }: { ids: string[]; texts: Record<string, string>; x0: number }) {
  return (
    <>
      {ids.slice(0, 4).map((id, i) => (
        <QueueCustomer
          key={id}
          id={id}
          text={texts[id] ?? ""}
          x={x0 + i * 0.75}
          z={-1.35 - i * 0.35}
          first={i === 0}
        />
      ))}
    </>
  );
}

function QueueCustomer({
  id,
  text,
  x,
  z,
  first,
}: {
  id: string;
  text: string;
  x: number;
  z: number;
  first: boolean;
}) {
  const walker = useMemo(() => {
    const w = new Walker(x + 3, z - 2, 2.4);
    w.moveTo(x, z, 0);
    return w;
  }, [x, z]);
  useEffect(() => {
    walker.moveTo(x, z, 0);
  }, [walker, x, z]);
  const key = `task:${id}`;
  useEffect(() => {
    const off = registerAnchor(key, () => walker.position);
    if (first) useGame.getState().setBubble(key, { text, tone: "ask" });
    return () => {
      off();
      useGame.getState().setBubble(key, null);
    };
  }, [key, walker, text, first]);
  const model = MODELS[id.charCodeAt(1) % MODELS.length] ?? "character-male-c";
  return <Character model={model} walker={walker} />;
}

/** Khách ngồi bàn (bưng bê). */
function Diner({ table, eating }: { table: number; eating: boolean }) {
  const [x, z] = TABLES[table - 1] ?? [0, 0];
  const walker = useMemo(() => {
    const w = new Walker(x - 0.55, z + 0.1, 1);
    w.yaw = Math.PI / 2;
    return w;
  }, [x, z]);
  return (
    <group>
      <Character
        model={MODELS[table % MODELS.length] ?? "character-male-c"}
        walker={walker}
        pose="sit"
      />
      {eating && <PlateOnTable x={x} z={z} full />}
    </group>
  );
}

function PlateOnTable({ x, z, full }: { x: number; z: number; full: boolean }) {
  return (
    <group position={[x - 0.2, 0.76, z]}>
      <Model name="plate" />
      {full ? (
        <Food id="suon" position={[0, 0.02, 0]} />
      ) : (
        <Model name="bowl" position={[0.15, 0.02, 0.05]} />
      )}
    </group>
  );
}

function DiningRoom({ shift, onTable }: { shift: ShiftView; onTable?: (table: number) => void }) {
  return (
    <group>
      {TABLES.map(([x, z], i) => {
        const n = i + 1;
        const state = shift.tables[i] ?? "free";
        return (
          <group key={n}>
            <group onClick={() => onTable?.(n)}>
              <Model name="table" position={[x, 0, z]} />
            </group>
            <Model name="chair" position={[x - 0.6, 0, z + 0.1]} rotation={Math.PI / 2} />
            <Model name="chair" position={[x + 0.6, 0, z + 0.1]} rotation={-Math.PI / 2} />
            <Sign
              text={`BÀN ${n}`}
              position={[x, 1.45, z]}
              bg={state === "dirty" ? "#8a8f96" : "#2f7d4f"}
              size={[0.9, 0.24]}
            />
            {(state === "waiting" || state === "eating") && (
              <Diner table={n} eating={state === "eating"} />
            )}
            {state === "dirty" && <PlateOnTable x={x} z={z} full={false} />}
          </group>
        );
      })}
    </group>
  );
}

export function QuanComScene({
  shift,
  plate,
  onScoop,
  onTable,
}: {
  shift: ShiftView | null;
  plate: string[];
  onScoop?: (foodId: string) => void;
  onTable?: (table: number) => void;
}) {
  const role = shift?.role;
  const plateQueue = shift?.plates ?? [];
  const cashQueue = shift?.cashier ?? [];
  return (
    <group>
      <Room />
      {shift && <Trays shift={shift} onScoop={onScoop} />}
      {role === "dung_quay" && <PlateOnCounter items={plate} />}
      {role === "dung_quay" && (
        <Queue
          ids={plateQueue.map((p) => p.id)}
          texts={Object.fromEntries(plateQueue.map((p) => [p.id, p.text]))}
          x0={0}
        />
      )}
      {role === "thu_ngan" && (
        <Queue
          ids={cashQueue.map((c) => c.id)}
          texts={Object.fromEntries(cashQueue.map((c) => [c.id, "Tính tiền giùm nha!"]))}
          x0={1.6}
        />
      )}
      {shift && <DiningRoom shift={shift} onTable={onTable} />}
    </group>
  );
}
