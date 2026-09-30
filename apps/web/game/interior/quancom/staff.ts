import { content } from "@xom/content";
import { Walker } from "../../scene/Character";

// Nhân vật của người chơi trong quán (bưng bê tự đi lại; vai khác đứng tại chỗ làm).
// Một bản duy nhất cho cảnh nội thất; có "việc chờ" chạy khi đi tới nơi (đi tới bàn rồi mới đặt dĩa).

const L = content.data.restaurant.layout;
/** Tốc độ đi trong quán (m/s) ở đồng hồ thường; server kiểm theo cùng con số (floor.ts FLOOR.walkSpeed). */
export const WALK_SPEED = 2.2;

export const staff = {
  walker: new Walker(L.pass.x, L.pass.z, WALK_SPEED),
  pending: null as null | (() => void),
};

/** Đi tới (x, z); tới nơi thì làm `then`. Chạm chỗ khác giữa đường thì bỏ việc cũ. */
export function goTo(x: number, z: number, then?: () => void, face?: number) {
  staff.walker.moveTo(x, z, face ?? null);
  staff.pending = then ?? null;
}

/** Chỗ đứng phục vụ một bàn: bên phải bàn, mặt nhìn vào bàn. */
export function tableStand(table: number) {
  const t = L.tables[table - 1] ?? { x: 0, z: -4 };
  return { x: t.x + 0.9, z: t.z, face: -Math.PI / 2 };
}

/** Chỗ đứng lấy dĩa ở cửa bếp. */
export const passStand = { x: L.pass.x, z: L.pass.z, face: 0 };

/** Ghế khách ngồi (bên trái bàn, mặt nhìn vào bàn). */
export function seat(table: number) {
  const t = L.tables[table - 1] ?? { x: 0, z: -4 };
  return { x: t.x - 0.62, z: t.z + 0.05, face: Math.PI / 2 };
}

export function queueSlot(i: number) {
  return { x: L.queue.x + L.queueStep.x * i, z: L.queue.z + L.queueStep.z * i, face: 0 };
}

export function cashierSlot(i: number) {
  return { x: L.cashier.x + L.cashierStep.x * i, z: L.cashier.z + L.cashierStep.z * i, face: 0 };
}

export function resetStaff() {
  staff.walker.position.set(L.pass.x, 0, L.pass.z);
  staff.walker.target = null;
  staff.pending = null;
}
