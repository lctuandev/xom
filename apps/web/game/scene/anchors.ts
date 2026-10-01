import { content } from "@xom/content";
import { speakerWalker } from "./guide";
import { getPlayer } from "./player";

/**
 * Điểm neo của khung thoại trên đầu nhân vật: key → vị trí (x, z) trong thế giới.
 * Nhân vật động (khách) tự đăng ký; người chơi / người đứng quầy / NPC dẫn đường tra theo id.
 */
type Pos = { x: number; z: number };
const dynamic = new Map<string, () => Pos>();

export function registerAnchor(key: string, pos: () => Pos): () => void {
  dynamic.set(key, pos);
  return () => {
    if (dynamic.get(key) === pos) dynamic.delete(key);
  };
}

/** `localOnly`: cảnh trong nhà — chỉ nhân vật có mặt trong cảnh, bỏ vị trí ngoài phố. */
export function anchorOf(key: string, myId: string | undefined, localOnly = false): Pos | null {
  const d = dynamic.get(key);
  if (d) return d();
  if (localOnly) return null;
  if (key === myId) return getPlayer().position;
  const place = content.placeById.get(key);
  if (place) return place.position;
  // Khách réo ở quầy vắng chủ (UC-B11): khung thoại hiện ngay trước quầy.
  if (key.startsWith("lot:")) {
    const lot = content.lotById.get(key.slice(4));
    if (lot) return { x: lot.position.x, z: lot.position.z - 1.2 };
  }
  if (content.speakerById.has(key)) return speakerWalker(key).position;
  return null;
}

/** Phần tử DOM của khung thoại đang hiện, để lớp chiếu toạ độ cập nhật vị trí mỗi frame. */
export const bubbleEls = new Map<string, HTMLElement>();
