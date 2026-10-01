-- CreateTable
CREATE TABLE "ResidentVisit" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "residentId" TEXT NOT NULL,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "lastDay" INTEGER NOT NULL DEFAULT 0,
    "streakWrong" INTEGER NOT NULL DEFAULT 0,
    "regularSince" INTEGER,

    CONSTRAINT "ResidentVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResidentVisit_ownerId_residentId_key" ON "ResidentVisit"("ownerId", "residentId");

-- AddForeignKey
ALTER TABLE "ResidentVisit" ADD CONSTRAINT "ResidentVisit_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
