-- Bản đồ mở (docs/BANDO.md bước A): khu đã mở của xóm.
ALTER TABLE "Room" ADD COLUMN "chunks" JSONB NOT NULL DEFAULT '[]';
