-- Bản đồ mở bước E: xây tiệm trên ô đất của mình.
ALTER TABLE "Plot" ADD COLUMN "building" TEXT;
ALTER TABLE "Plot" ADD COLUMN "buildDone" INTEGER;
ALTER TABLE "Plot" ADD COLUMN "level" INTEGER NOT NULL DEFAULT 1;
