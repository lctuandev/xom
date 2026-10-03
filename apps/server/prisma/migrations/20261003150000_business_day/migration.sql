-- Góp ý đợt 4: sổ ngày theo cửa hàng.
-- CreateTable
CREATE TABLE "BusinessDay" (
    "businessId" UUID NOT NULL,
    "day" INTEGER NOT NULL,
    "revenue" INTEGER NOT NULL DEFAULT 0,
    "tips" INTEGER NOT NULL DEFAULT 0,
    "stockCost" INTEGER NOT NULL DEFAULT 0,
    "rent" INTEGER NOT NULL DEFAULT 0,
    "fees" INTEGER NOT NULL DEFAULT 0,
    "staffWages" INTEGER NOT NULL DEFAULT 0,
    "utilities" INTEGER NOT NULL DEFAULT 0,
    "served" INTEGER NOT NULL DEFAULT 0,
    "lost" INTEGER NOT NULL DEFAULT 0,
    "wrong" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BusinessDay_pkey" PRIMARY KEY ("businessId","day")
);

-- AddForeignKey
ALTER TABLE "BusinessDay" ADD CONSTRAINT "BusinessDay_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

