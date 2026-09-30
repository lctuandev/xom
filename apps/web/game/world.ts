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

/** Vị trí của một mục tiêu kịch bản / goal; null nếu chưa xác định (ví dụ chưa chọn chỗ bán). */
export function spotFor(target: string | Goal, me: MeView | null): Spot | null {
  const kind = typeof target === "string" ? (target === "stall" ? "stall" : "place") : target.kind;
  if (kind === "stall") {
    const lotId = me?.business?.lotId;
    return lotId ? standBehind(lotId) : null;
  }
  if (typeof target !== "string" && target.kind === "address") return addressSpot(target.id);
  const id = typeof target === "string" ? target : target.kind === "place" ? target.id : "";
  return content.placeById.has(id) ? placeSpot(id) : null;
}

/** Sheet mở khi tương tác với một địa điểm. */
export function sheetForPlace(placeId: string) {
  const kind = content.place(placeId).kind;
  return kind === "market" ? "market" : kind === "equipment_shop" ? "equipment" : "jobs";
}
