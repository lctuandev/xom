-- Đánh giá riêng từng cửa hàng: gắn đánh giá cũ vào cửa hàng cùng món của chủ (không có thì cửa hàng mở sớm nhất).
ALTER TABLE "Review" ADD COLUMN "businessId" UUID;

UPDATE "Review" r SET "businessId" = (
  SELECT b."id" FROM "Business" b
  WHERE b."ownerId" = r."ownerId"
  ORDER BY (b."productId" = r."productId") DESC, b."createdAt" ASC
  LIMIT 1
);

DROP INDEX "Review_authorId_ownerId_day_key";

CREATE UNIQUE INDEX "Review_authorId_businessId_day_key" ON "Review"("authorId", "businessId", "day");

CREATE INDEX "Review_businessId_createdAt_idx" ON "Review"("businessId", "createdAt");

ALTER TABLE "Review" ADD CONSTRAINT "Review_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
