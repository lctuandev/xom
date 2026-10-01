-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('VOTING', 'FUNDING', 'BUILDING', 'DONE', 'REJECTED');

-- AlterEnum
ALTER TYPE "WalletKind" ADD VALUE 'ROOM_FUND';

-- CreateTable
CREATE TABLE "RoomProject" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'VOTING',
    "proposerId" UUID NOT NULL,
    "votes" JSONB NOT NULL DEFAULT '{}',
    "voteDay" INTEGER NOT NULL,
    "voteMinute" INTEGER NOT NULL,
    "doneDay" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomProject_roomId_status_idx" ON "RoomProject"("roomId", "status");

-- AddForeignKey
ALTER TABLE "RoomProject" ADD CONSTRAINT "RoomProject_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
