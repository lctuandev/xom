import { Injectable } from "@nestjs/common";
import { content } from "@xom/content";
import type { PayMethod } from "@xom/shared";
import { choosePayment, type PaySource } from "@xom/sim";
import {
  bankWallet,
  InsufficientFundsError,
  LedgerService,
  playerWallet,
  type Tx,
} from "../economy/ledger.service.js";
import { GameError } from "./room.js";

/**
 * Người chơi trả tiền (DESIGN §2) — một chỗ cho mọi khoản: 💵 / 🏦 theo lựa chọn, hoặc tự chọn (lặt vặt trả tiền mặt,
 * khoản lớn chuyển khoản). Thiếu tiền thì báo cách gỡ (rút ATM, chọn ví kia). Luật chọn ví nằm ở sim (`choosePayment`),
 * client dùng cùng luật để báo trước.
 */
@Injectable()
export class PaymentService {
  constructor(private readonly ledger: LedgerService) {}

  /** Chọn ví sẽ trả `amount` (không chuyển tiền) — trả về khoá ví. */
  async walletFor(
    tx: Tx,
    playerId: string,
    amount: number,
    method: PayMethod = "auto",
    cashOnly = false,
  ): Promise<{ wallet: string; source: PaySource }> {
    const [cash, bank] = await Promise.all([
      this.ledger.balance(tx, playerWallet(playerId)),
      this.ledger.balance(tx, bankWallet(playerId)),
    ]);
    const src = choosePayment({
      amount,
      cash,
      bank,
      method,
      cashOnly,
      cashFirstBelow: content.economy.bank.cashFirstBelow,
    });
    if (typeof src !== "string") throw new GameError("insufficient_funds", src.error);
    return { wallet: src === "cash" ? playerWallet(playerId) : bankWallet(playerId), source: src };
  }

  /** Trả `amount` cho ví `to`; trả về nguồn đã dùng (💵 / 🏦). */
  async payOut(
    tx: Tx,
    playerId: string,
    amount: number,
    to: string,
    reason: string,
    refId?: string,
    method: PayMethod = "auto",
    cashOnly = false,
  ): Promise<PaySource> {
    const { wallet, source } = await this.walletFor(tx, playerId, amount, method, cashOnly);
    await this.ledger.transfer(tx, wallet, to, amount, reason, refId);
    return source;
  }

  /** Khoản tự trừ (không có bước chọn ví): tiền mặt trước, thiếu thì trừ tài khoản; cả hai thiếu → `broke`. */
  async cashThenBank(
    tx: Tx,
    playerId: string,
    amount: number,
    to: string,
    reason: string,
    broke: string,
    refId?: string,
  ) {
    try {
      await this.ledger.transfer(tx, playerWallet(playerId), to, amount, reason, refId);
    } catch (err) {
      if (!(err instanceof InsufficientFundsError)) throw err;
      try {
        await this.ledger.transfer(tx, bankWallet(playerId), to, amount, reason, refId);
      } catch (err2) {
        if (err2 instanceof InsufficientFundsError)
          throw new GameError("insufficient_funds", broke);
        throw err2;
      }
    }
  }
}
