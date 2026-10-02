-- Cấp tiệm + nhiều nhân viên mỗi cửa hàng (docs/IA.md bước E).
ALTER TABLE "Business" ADD COLUMN "level" INTEGER NOT NULL DEFAULT 1;
DROP INDEX IF EXISTS "Employee_businessId_key";
CREATE INDEX "Employee_businessId_idx" ON "Employee"("businessId");
