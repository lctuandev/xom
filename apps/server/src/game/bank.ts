import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { content } from "@xom/content";
import type { AtmReceipt } from "@xom/shared";
import { atmAmountError, pinError } from "@xom/sim";
import {
  bankWallet,
  InsufficientFundsError,
  LedgerService,
  playerWallet,
  SYSTEM,
} from "../economy/ledger.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { Broadcast } from "./broadcast.js";
import { GameError, type IntentContext, type RoomRuntime } from "./room.js";

/** Khoảng cách tối đa (m) tới cây ATM. */
const ATM_REACH = 3;
/** Băm PIN ATM kèm id người chơi (không lưu PIN thô). */
const pinHash = (playerId: string, pin: string) =>
  createHash("sha256").update(`xom-atm:${playerId}:${pin}`).digest("hex");

/** 🏧 Ngân hàng (UC-I6): cây ATM, PIN, rút / nộp tiền giữa 💵 ví và 🏦 tài khoản của chính mình. */
@Injectable()
export class BankService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly broadcast: Broadcast,
  ) {}

  /**
   * Rút / gửi tiền ở cây ATM (DESIGN §2, UC-I6): phải đứng ngay cây ATM (server kiểm vị trí), số tiền là bội số
   * mệnh giá; tiền chỉ chuyển giữa 💵 ví và 🏦 tài khoản của chính mình qua sổ cái (không sinh tiền).
   */
  /** Phải đứng ở cây ATM (server kiểm vị trí). */
  private requireAtm(room: RoomRuntime, playerId: string, atmId: string) {
    const atm = content.atms.find((a) => a.id === atmId);
    if (!atm) throw new GameError("invalid_payload", "Không có cây ATM này");
    const pos = room.members.get(playerId)?.pos;
    if (pos && (pos.inside || Math.hypot(pos.x - atm.x, pos.z - atm.z) > ATM_REACH))
      throw new GameError("invalid_state", "Tới tận cây ATM mới rút/gửi tiền được");
    return atm;
  }

  /**
   * Kiểm PIN thẻ ATM (UC-I6): chưa tạo PIN thì báo; sai thì trừ lượt, hết lượt thì máy giữ thẻ tới hết ngày game.
   * Đúng thì xoá đếm sai.
   */
  private async checkPin(room: RoomRuntime, playerId: string, pin: string) {
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    if (player.atmLockDay !== null && player.atmLockDay >= room.day)
      throw new GameError("invalid_state", "Máy đang giữ thẻ của bạn — mai thẻ mới được trả lại");
    if (!player.atmPin) throw new GameError("invalid_state", "Thẻ chưa có mã PIN — tạo PIN trước");
    if (player.atmPin === pinHash(playerId, pin)) {
      room.atmTries.delete(playerId);
      return;
    }
    const max = content.economy.bank.pinTries;
    const tries = (room.atmTries.get(playerId) ?? 0) + 1;
    room.atmTries.set(playerId, tries);
    if (tries >= max) {
      room.atmTries.delete(playerId);
      await this.prisma.player.update({ where: { id: playerId }, data: { atmLockDay: room.day } });
      this.broadcast.me(playerId);
      throw new GameError("invalid_state", `Sai PIN ${max} lần — máy giữ thẻ, mai mới trả lại`);
    }
    throw new GameError("invalid_state", `Sai mã PIN — còn ${max - tries} lần thử`);
  }

  /** Nhập PIN ở màn hình ATM. */
  async atmAuth({ room, playerId }: IntentContext, atmId: string, pin: string) {
    this.requireAtm(room, playerId, atmId);
    await this.checkPin(room, playerId, pin);
  }

  /** Tạo PIN lần đầu (không cần PIN cũ) hoặc đổi PIN (phải nhập đúng PIN cũ). */
  async atmSetPin({ room, playerId }: IntentContext, atmId: string, pin: string, old?: string) {
    this.requireAtm(room, playerId, atmId);
    const bad = pinError(pin);
    if (bad) throw new GameError("invalid_payload", bad);
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    if (player.atmPin) {
      if (!old) throw new GameError("invalid_state", "Nhập mã PIN cũ để đổi");
      await this.checkPin(room, playerId, old);
    }
    await this.prisma.player.update({
      where: { id: playerId },
      data: { atmPin: pinHash(playerId, pin) },
    });
    void this.broadcast.log(playerId, player.atmPin ? "atm_pin_change" : "atm_pin_set", {});
  }

  /** Rút / nộp tiền ở cây ATM (UC-I6): phải đứng ở cây, đúng PIN; rút mất phí; trả biên lai. */
  async useAtm(
    { room, playerId }: IntentContext,
    p: { atmId: string; action: "deposit" | "withdraw"; amount: number; pin: string },
  ): Promise<AtmReceipt> {
    const atm = this.requireAtm(room, playerId, p.atmId);
    await this.checkPin(room, playerId, p.pin);
    const bank = content.economy.bank;
    const step = p.action === "withdraw" ? bank.withdrawStep : bank.depositStep;
    const bad = atmAmountError(p.amount, step);
    if (bad) throw new GameError("invalid_payload", bad);
    const deposit = p.action === "deposit";
    const fee = deposit ? 0 : bank.withdrawFee;
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.ledger.transfer(
          tx,
          deposit ? playerWallet(playerId) : bankWallet(playerId),
          deposit ? bankWallet(playerId) : playerWallet(playerId),
          p.amount,
          deposit ? "atm_deposit" : "atm_withdraw",
          atm.id,
        );
        if (fee > 0)
          await this.ledger.transfer(tx, bankWallet(playerId), SYSTEM.bank, fee, "atm_fee", atm.id);
      });
    } catch (err) {
      if (err instanceof InsufficientFundsError)
        throw new GameError(
          "insufficient_funds",
          deposit
            ? "Không đủ tiền mặt để nộp"
            : `Tài khoản không đủ số dư (cần thêm phí ${fee.toLocaleString("vi-VN")}đ)`,
        );
      throw err;
    }
    void this.broadcast.log(playerId, deposit ? "atm_deposit" : "atm_withdraw", {
      amount: p.amount,
      fee,
    });
    const balance = await this.ledger.balance(this.prisma, bankWallet(playerId));
    return {
      code: `FT${room.day.toString().padStart(3, "0")}${randomUUID().slice(0, 6).toUpperCase()}`,
      atmId: atm.id,
      action: p.action,
      amount: p.amount,
      fee,
      balance,
      day: room.day,
      minute: room.minute,
    };
  }
}
