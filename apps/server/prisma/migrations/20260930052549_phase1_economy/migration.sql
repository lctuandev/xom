-- CreateEnum
CREATE TYPE "WalletKind" AS ENUM ('PLAYER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "Player" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "roomId" UUID,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "day" INTEGER NOT NULL DEFAULT 1,
    "minute" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" UUID NOT NULL,
    "kind" "WalletKind" NOT NULL,
    "key" TEXT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" UUID NOT NULL,
    "txId" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "lotId" TEXT,
    "price" INTEGER NOT NULL,
    "status" "BusinessStatus" NOT NULL DEFAULT 'CLOSED',
    "reputation" DOUBLE PRECISION NOT NULL,
    "demandCarry" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "productId" TEXT NOT NULL,
    "batchDay" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReport" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "day" INTEGER NOT NULL,
    "revenue" INTEGER NOT NULL,
    "stockCost" INTEGER NOT NULL,
    "rent" INTEGER NOT NULL,
    "wages" INTEGER NOT NULL,
    "spoiledQty" INTEGER NOT NULL,
    "spoiledValue" INTEGER NOT NULL,
    "served" INTEGER NOT NULL,
    "lost" INTEGER NOT NULL,
    "satisfaction" DOUBLE PRECISION NOT NULL,
    "reputation" DOUBLE PRECISION NOT NULL,
    "moneyEnd" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameEvent" (
    "id" UUID NOT NULL,
    "playerId" UUID,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_userId_key" ON "Player"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_code_key" ON "Room"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_key_key" ON "Wallet"("key");

-- CreateIndex
CREATE INDEX "LedgerEntry_walletId_createdAt_idx" ON "LedgerEntry"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_txId_idx" ON "LedgerEntry"("txId");

-- CreateIndex
CREATE INDEX "Business_ownerId_idx" ON "Business"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_playerId_productId_batchDay_key" ON "InventoryItem"("playerId", "productId", "batchDay");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReport_playerId_day_key" ON "DailyReport"("playerId", "day");

-- CreateIndex
CREATE INDEX "GameEvent_type_createdAt_idx" ON "GameEvent"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
