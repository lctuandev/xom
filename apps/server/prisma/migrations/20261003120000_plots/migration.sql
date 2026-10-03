-- Bản đồ mở bước D: ô đất mua đứt.
-- CreateTable
CREATE TABLE "Plot" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "lotId" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "price" INTEGER NOT NULL,
    "boughtDay" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Plot_ownerId_idx" ON "Plot"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Plot_roomId_lotId_key" ON "Plot"("roomId", "lotId");

-- AddForeignKey
ALTER TABLE "Plot" ADD CONSTRAINT "Plot_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plot" ADD CONSTRAINT "Plot_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

