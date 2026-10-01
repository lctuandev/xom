-- CreateTable
CREATE TABLE "Review" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "productId" TEXT NOT NULL,
    "authorId" UUID,
    "authorName" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "reply" TEXT,
    "repliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Review_ownerId_createdAt_idx" ON "Review"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_authorId_ownerId_day_key" ON "Review"("authorId", "ownerId", "day");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
