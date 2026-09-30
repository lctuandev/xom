-- Phase 1.6 "làm thật": kho chứa nguyên liệu (không còn hàng thành phẩm), thực đơn nhiều món,
-- thân thiết với NPC, đếm món làm sai.

-- Hàng thành phẩm cũ (bánh mì/trà sữa làm sẵn) không còn ý nghĩa với mô hình nguyên liệu.
DELETE FROM "InventoryItem";
DROP INDEX "InventoryItem_playerId_productId_batchDay_key";
ALTER TABLE "InventoryItem" RENAME COLUMN "productId" TO "itemId";
CREATE UNIQUE INDEX "InventoryItem_playerId_itemId_batchDay_key" ON "InventoryItem"("playerId", "itemId", "batchDay");

-- Giá một món → thực đơn nhiều món (rỗng = dùng thực đơn mặc định theo công thức).
ALTER TABLE "Business" DROP COLUMN "price",
ADD COLUMN "menu" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "DailyReport" ADD COLUMN "wrong" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "NpcRelation" (
    "playerId" UUID NOT NULL,
    "npcId" TEXT NOT NULL,
    "friendship" INTEGER NOT NULL DEFAULT 0,
    "lastGreetDay" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NpcRelation_pkey" PRIMARY KEY ("playerId","npcId")
);
ALTER TABLE "NpcRelation" ADD CONSTRAINT "NpcRelation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
