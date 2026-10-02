-- Nhiều cửa hàng + kho riêng từng tiệm (docs/IA.md bước D).

-- Cửa hàng đang quản lý.
ALTER TABLE "Player" ADD COLUMN "activeBusinessId" UUID;

-- Kho gắn theo cửa hàng: hàng cũ về cửa hàng (cũ nhất) của chủ; hàng không có cửa hàng nào thì bỏ (không dùng được).
ALTER TABLE "InventoryItem" ADD COLUMN "businessId" UUID;
UPDATE "InventoryItem" i
SET "businessId" = (
  SELECT b."id" FROM "Business" b WHERE b."ownerId" = i."playerId" ORDER BY b."createdAt" ASC LIMIT 1
);
DELETE FROM "InventoryItem" WHERE "businessId" IS NULL;
ALTER TABLE "InventoryItem" ALTER COLUMN "businessId" SET NOT NULL;

DROP INDEX IF EXISTS "InventoryItem_playerId_itemId_batchDay_key";
CREATE UNIQUE INDEX "InventoryItem_businessId_itemId_batchDay_key" ON "InventoryItem"("businessId", "itemId", "batchDay");
CREATE INDEX "InventoryItem_playerId_idx" ON "InventoryItem"("playerId");
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hàng đang chuyển giữa hai cửa hàng.
CREATE TABLE "StockTransfer" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "fromId" UUID NOT NULL,
    "toId" UUID NOT NULL,
    "itemId" TEXT NOT NULL,
    "batchDay" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "arriveAt" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StockTransfer_ownerId_idx" ON "StockTransfer"("ownerId");
