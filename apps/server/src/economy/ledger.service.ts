import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";

export type Tx = Prisma.TransactionClient;

/** Ví hệ thống đại diện "thế giới bên ngoài"; số dư được phép âm. */
export const SYSTEM = {
  bank: "system:bank",
  market: "system:market",
  customers: "system:customers",
  landlord: "system:landlord",
  employer: "system:employer",
  supplier: "system:supplier",
} as const;

/** 💵 Tiền mặt của người chơi. */
export const playerWallet = (playerId: string) => `player:${playerId}`;
/** 🏦 Tài khoản ngân hàng của người chơi (nhận chuyển khoản, rút/gửi ở ATM). */
export const bankWallet = (playerId: string) => `bank:${playerId}`;

export class InsufficientFundsError extends Error {}

/**
 * Sổ cái kép (docs/PLAN.md D5): mọi thay đổi tiền là một giao dịch có tổng bằng 0,
 * số dư Wallet chỉ được cập nhật cùng transaction với LedgerEntry.
 */
@Injectable()
export class LedgerService {
  async transfer(
    tx: Tx,
    from: string,
    to: string,
    amount: number,
    reason: string,
    refId?: string,
  ): Promise<void> {
    if (!Number.isInteger(amount) || amount <= 0)
      throw new Error(`Số tiền không hợp lệ: ${amount}`);
    const [src, dst] = await Promise.all([this.wallet(tx, from), this.wallet(tx, to)]);
    const value = BigInt(amount);
    if (src.kind !== "SYSTEM") {
      // Trừ có điều kiện trong một câu lệnh để hai giao dịch đồng thời không làm âm ví.
      const updated = await tx.wallet.updateMany({
        where: { id: src.id, balance: { gte: value } },
        data: { balance: { decrement: value } },
      });
      if (updated.count === 0) throw new InsufficientFundsError();
    } else {
      await tx.wallet.update({ where: { id: src.id }, data: { balance: { decrement: value } } });
    }
    await tx.wallet.update({ where: { id: dst.id }, data: { balance: { increment: value } } });
    const txId = randomUUID();
    await tx.ledgerEntry.createMany({
      data: [
        { txId, walletId: src.id, amount: -value, reason, refId },
        { txId, walletId: dst.id, amount: value, reason, refId },
      ],
    });
  }

  async balance(tx: Tx, key: string): Promise<number> {
    const w = await tx.wallet.findUnique({ where: { key } });
    return w ? Number(w.balance) : 0;
  }

  private wallet(tx: Tx, key: string) {
    return tx.wallet.upsert({
      where: { key },
      create: {
        key,
        kind: key.startsWith("system:")
          ? "SYSTEM"
          : key.startsWith("bank:")
            ? "PLAYER_BANK"
            : "PLAYER",
      },
      update: {},
    });
  }
}
