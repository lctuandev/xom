-- CreateEnum
CREATE TYPE "LeaseStatus" AS ENUM ('ACTIVE', 'ENDED', 'EVICTED');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "certified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "inspectAt" INTEGER,
ADD COLUMN     "licenseAt" INTEGER,
ADD COLUMN     "shopName" TEXT,
ADD COLUMN     "signed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trained" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Lease" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "lotId" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "deposit" INTEGER NOT NULL,
    "signedDay" INTEGER NOT NULL,
    "endedDay" INTEGER,
    "status" "LeaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lease_roomId_lotId_status_idx" ON "Lease"("roomId", "lotId", "status");

-- CreateIndex
CREATE INDEX "Lease_ownerId_status_idx" ON "Lease"("ownerId", "status");
