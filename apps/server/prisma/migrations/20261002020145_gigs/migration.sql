-- CreateEnum
CREATE TYPE "GigStatus" AS ENUM ('OPEN', 'TAKEN', 'SUBMITTED', 'DONE', 'REFUNDED', 'CANCELLED', 'EXPIRED', 'FAILED');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "adDay" INTEGER,
ADD COLUMN     "adMul" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "adUntil" INTEGER;

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "gigStars" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gigs" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Gig" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "day" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "posterId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "lotId" TEXT NOT NULL,
    "reward" INTEGER NOT NULL,
    "deposit" INTEGER NOT NULL,
    "fee" INTEGER NOT NULL,
    "deadline" INTEGER NOT NULL,
    "takerId" UUID,
    "status" "GigStatus" NOT NULL DEFAULT 'OPEN',
    "cameraPaid" BOOLEAN NOT NULL DEFAULT false,
    "shots" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "quality" INTEGER,
    "stars" INTEGER,
    "reviewBy" INTEGER,
    "verdict" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "Gig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Gig_roomId_day_idx" ON "Gig"("roomId", "day");

-- CreateIndex
CREATE INDEX "Gig_takerId_status_idx" ON "Gig"("takerId", "status");

-- CreateIndex
CREATE INDEX "Gig_posterId_status_idx" ON "Gig"("posterId", "status");
