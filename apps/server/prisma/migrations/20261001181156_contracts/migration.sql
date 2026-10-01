-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('OPEN', 'TAKEN', 'READY', 'DONE', 'FAILED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "WalletKind" ADD VALUE 'ESCROW';

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "trust" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "trustLockDay" INTEGER;

-- CreateTable
CREATE TABLE "Contract" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "day" INTEGER NOT NULL,
    "templateId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "reward" INTEGER NOT NULL,
    "deposit" INTEGER NOT NULL,
    "deadline" INTEGER NOT NULL,
    "takerId" UUID,
    "status" "ContractStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contract_roomId_day_idx" ON "Contract"("roomId", "day");

-- CreateIndex
CREATE INDEX "Contract_takerId_status_idx" ON "Contract"("takerId", "status");
