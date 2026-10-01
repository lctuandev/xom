-- CreateTable
CREATE TABLE "StoryEntry" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "emoji" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoryEntry_playerId_day_idx" ON "StoryEntry"("playerId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "StoryEntry_playerId_key_key" ON "StoryEntry"("playerId", "key");

-- AddForeignKey
ALTER TABLE "StoryEntry" ADD CONSTRAINT "StoryEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
