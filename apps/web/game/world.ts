import { content } from "@xom/content";
import type { MeView } from "@xom/shared";
import type { Goal } from "./store";

export interface Spot {
  x: number;
  z: number;
  /** Hướng quay mặt khi đứng đó. */
  yaw: number;
}

/** Chỗ người chơi đứng bán: sau quầy, mặt nhìn ra khách. */
export function standBehind(lotId: string): Spot {
  const lot = content.lot(lotId);
  const back = lot.facing === 0 ? -1 : 1;
  return { x: lot.position.x, z: lot.position.z + back * 0.9, yaw: lot.facing };
}

/** Chỗ đứng để nói chuyện/giao dịch ở một địa điểm: trước mặt người đứng quầy. */
export function placeSpot(placeId: string): Spot {
  const place = content.place(placeId);
  const front = place.facing === 0 ? 1 : -1;
  return { x: place.position.x, z: place.position.z + front * 1.4, yaw: place.facing + Math.PI };
}

export function speakerSpot(speakerId: string): Spot {
  const sp = content.speaker(speakerId);
  return { x: sp.position.x - 1.3, z: sp.position.z + 0.3, yaw: Math.PI / 2 };
}

/** Chỗ đứng trước cửa một nhà giao hàng (phía vỉa hè), mặt nhìn vào nhà. */
export function addressSpot(addressId: string): Spot | null {
  const a = content.data.delivery.addresses.find((x) => x.id === addressId);
  if (!a) return null;
  const out = a.facing === 0 ? 1 : -1;
  return { x: a.position.x, z: a.position.z + out * 1.3, yaw: a.facing + Math.PI };
}

/** Chỗ khách đứng gọi món trước một quầy (lệch sang bên để khỏi chắn hàng khách NPC). */
export function shopSpot(lotId: string): Spot {
  const lot = content.lot(lotId);
  const front = lot.facing === 0 ? 1 : -1;
  return { x: lot.position.x - 0.8, z: lot.position.z + front * 1.3, yaw: lot.facing + Math.PI };
}

/** Chỗ đứng mua ở sạp đồ ăn NPC (trước mặt người bán). */
export function vendorSpot(id: string): Spot | null {
  const v = content.data.vendors.find((x) => x.id === id);
  if (!v) return null;
  const front = v.facing === 0 ? 1 : -1;
  return { x: v.position.x + 0.6, z: v.position.z + front * 1.3, yaw: v.facing + Math.PI };
}

/** Ghế nhựa trước sạp (khách ngồi ăn). */
export function vendorSeats(id: string): Spot[] {
  const v = content.data.vendors.find((x) => x.id === id);
  if (!v) return [];
  const front = v.facing === 0 ? 1 : -1;
  return Array.from({ length: v.seats }, (_, i) => ({
    x: v.position.x - 1.6 + i * 0.85,
    z: v.position.z + front * 2.2,
    yaw: v.facing,
  }));
}

/** Chỗ đứng dùng cây ATM: trước màn hình (UC-I6). */
export function atmSpot(id: string): Spot | null {
  const a = content.atms.find((x) => x.id === id);
  if (!a) return null;
  const front = a.facing === 0 ? 1 : -1;
  return { x: a.x, z: a.z + front * 0.9, yaw: a.facing + Math.PI };
}

/** Cây ATM gần một điểm nhất. */
export function nearestAtm(x: number, z: number) {
  let best = content.atms[0];
  for (const a of content.atms)
    if (best && Math.hypot(a.x - x, a.z - z) < Math.hypot(best.x - x, best.z - z)) best = a;
  return best;
}

/** Sạp đang bày hàng lúc này. */
export function vendorOpen(id: string, minute: number): boolean {
  const v = content.data.vendors.find((x) => x.id === id);
  return !!v && minute >= v.open && minute < v.close;
}

/** Vị trí của một mục tiêu kịch bản / goal; null nếu chưa xác định (ví dụ chưa chọn chỗ bán). */
export function spotFor(target: string | Goal, me: MeView | null): Spot | null {
  const kind = typeof target === "string" ? (target === "stall" ? "stall" : "place") : target.kind;
  if (kind === "stall") {
    const lotId = me?.business?.lotId;
    return lotId ? standBehind(lotId) : null;
  }
  if (typeof target !== "string" && target.kind === "address") return addressSpot(target.id);
  if (typeof target !== "string" && (target.kind === "shop" || target.kind === "drop"))
    return shopSpot(target.lotId);
  if (typeof target !== "string" && target.kind === "vendor") return vendorSpot(target.id);
  if (typeof target !== "string" && target.kind === "atm") return atmSpot(target.id);
  if (typeof target !== "string" && target.kind === "point")
    return { x: target.x, z: target.z, yaw: 0 };
  const id = typeof target === "string" ? target : target.kind === "place" ? target.id : "";
  return content.placeById.has(id) ? placeSpot(id) : null;
}

/** Sheet mở khi tương tác với một địa điểm. */
export function sheetForPlace(placeId: string) {
  const kind = content.place(placeId).kind;
  return kind === "market"
    ? "market"
    : kind === "equipment_shop"
      ? "equipment"
      : kind === "ride"
        ? "ride"
        : "jobs";
}
