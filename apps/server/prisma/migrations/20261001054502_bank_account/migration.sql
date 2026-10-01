-- Tách 💵 tiền mặt / 🏦 ngân hàng (DESIGN §2): ví "player:<id>" có sẵn GIỮ NGUYÊN là tiền mặt (không đổi số dư);
-- tài khoản ngân hàng "bank:<id>" (kind PLAYER_BANK) được tạo dần khi có giao dịch đầu tiên, số dư bắt đầu từ 0.

-- AlterEnum
ALTER TYPE "WalletKind" ADD VALUE 'PLAYER_BANK';

-- AlterTable
ALTER TABLE "DailyReport" ADD COLUMN     "interest" INTEGER NOT NULL DEFAULT 0;
