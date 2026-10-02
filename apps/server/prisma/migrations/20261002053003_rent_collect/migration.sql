-- Đòi tiền nhà (UC-F13): tiền nhà không tự trừ cuối ngày nữa mà chủ nhà tới đòi; hẹn ngày, phí trễ, số lần trễ.
ALTER TABLE "Lease" ADD COLUMN     "lateFee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paidDay" INTEGER,
ADD COLUMN     "promiseDay" INTEGER,
ADD COLUMN     "strikes" INTEGER NOT NULL DEFAULT 0;

-- Bản cũ trừ tiền nhà mỗi cuối ngày (từ ngày sau ngày ký) → hợp đồng đang thuê coi như đã trả tới hết hôm qua.
UPDATE "Lease" l
SET "paidDay" = GREATEST(l."signedDay", r."day" - 1)
FROM "Room" r
WHERE r."id" = l."roomId" AND l."status" = 'ACTIVE';

UPDATE "Lease" SET "paidDay" = COALESCE("endedDay", "signedDay") WHERE "paidDay" IS NULL;

ALTER TABLE "Lease" ALTER COLUMN "paidDay" SET NOT NULL;
