import { content } from "@xom/content";
import type { InventoryView } from "@xom/shared";
import { takeFifo } from "@xom/sim";
import type { Tx } from "../economy/ledger.service.js";

/** Tồn kho nguyên liệu của người chơi: itemId → tổng số phần. */
export async function stockMap(tx: Tx, playerId: string): Promise<Map<string, number>> {
  const rows = await tx.inventoryItem.groupBy({
    by: ["itemId"],
    where: { playerId },
    _sum: { qty: true },
  });
  return new Map(rows.map((r) => [r.itemId, r._sum.qty ?? 0]));
}

export async function addItems(tx: Tx, playerId: string, itemId: string, day: number, qty: number) {
  await tx.inventoryItem.upsert({
    where: { playerId_itemId_batchDay: { playerId, itemId, batchDay: day } },
    create: { playerId, itemId, batchDay: day, qty },
    update: { qty: { increment: qty } },
  });
}

/** Trừ nguyên liệu theo FIFO (lô cũ trước). Gọi sau khi đã kiểm tra đủ hàng. */
export async function consume(tx: Tx, playerId: string, need: Map<string, number>) {
  for (const [itemId, qty] of need) {
    const rows = await tx.inventoryItem.findMany({ where: { playerId, itemId } });
    const { batches } = takeFifo(rows, qty);
    for (const row of rows) {
      const left = batches.find((b) => b.batchDay === row.batchDay)?.qty ?? 0;
      if (left === 0) await tx.inventoryItem.delete({ where: { id: row.id } });
      else if (left !== row.qty)
        await tx.inventoryItem.update({ where: { id: row.id }, data: { qty: left } });
    }
  }
}

/** Kho hiển thị cho client: tổng số phần và số phần sẽ hỏng cuối hôm nay. */
export async function inventoryView(
  tx: Tx,
  playerId: string,
  day: number,
): Promise<InventoryView[]> {
  const rows = await tx.inventoryItem.findMany({ where: { playerId } });
  const byItem = new Map<string, InventoryView>();
  for (const r of rows) {
    const v = byItem.get(r.itemId) ?? { itemId: r.itemId, qty: 0, expiring: 0 };
    v.qty += r.qty;
    const life = content.ingredientById.get(r.itemId)?.shelfLifeDays ?? null;
    if (life !== null && day - r.batchDay + 1 >= life) v.expiring += r.qty;
    byItem.set(r.itemId, v);
  }
  return [...byItem.values()].filter((v) => v.qty > 0);
}
