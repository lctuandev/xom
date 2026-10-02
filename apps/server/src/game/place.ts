import { content } from "@xom/content";
import type { Tx } from "../economy/ledger.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { GameError, type RoomRuntime } from "./room.js";

/** Khoảng cách tối đa (m) tới quầy / sạp / người đứng quầy để mua bán. */
export const ORDER_REACH = 6;

/** Người chơi phải đứng ở địa điểm này (gần người đứng quầy, hoặc đang ở trong) — server kiểm, không tin client. */
export function requireAt(room: RoomRuntime, playerId: string, placeId: string, message: string) {
  const pos = room.members.get(playerId)?.pos;
  if (!pos) return; // chưa báo vị trí (vừa kết nối) — các bước sau vẫn kiểm tiền, hàng
  const p = content.place(placeId).position;
  if (pos.inside === placeId) return;
  if (pos.inside || Math.hypot(pos.x - p.x, pos.z - p.z) > ORDER_REACH)
    throw new GameError("invalid_state", message);
}

/** Độ thân với một NPC (0–100). */
export async function friendship(db: PrismaService | Tx, playerId: string, npcId: string) {
  const rel = await db.npcRelation.findUnique({
    where: { playerId_npcId: { playerId, npcId } },
  });
  return rel?.friendship ?? 0;
}

/** Cộng thân thiết (tối đa 100); `greetDay` ghi nhận ngày đã chào. Trả về mức mới. */
export async function addFriendship(
  tx: Tx,
  playerId: string,
  npcId: string,
  amount: number,
  greetDay?: number,
) {
  const rel = await tx.npcRelation.upsert({
    where: { playerId_npcId: { playerId, npcId } },
    create: { playerId, npcId, friendship: Math.min(100, amount), lastGreetDay: greetDay ?? 0 },
    update: {
      friendship: { increment: amount },
      ...(greetDay ? { lastGreetDay: greetDay } : {}),
    },
  });
  if (rel.friendship > 100)
    await tx.npcRelation.update({
      where: { playerId_npcId: { playerId, npcId } },
      data: { friendship: 100 },
    });
  return Math.min(100, rel.friendship);
}
