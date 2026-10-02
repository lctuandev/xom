import { Injectable } from "@nestjs/common";
import { content } from "@xom/content";
import type { ContractBoardView, ContractView, NotifyEvent } from "@xom/shared";
import {
  type ContractTemplate,
  contractIngredients,
  contractOffers,
  contractPay,
  contractText,
  type TrustEvent,
  trustAfter,
  trustLevel,
} from "@xom/sim";
import {
  bankWallet,
  InsufficientFundsError,
  LedgerService,
  playerWallet,
  SYSTEM,
} from "../economy/ledger.service.js";
import type { Contract } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { BusinessRepo } from "./business-repo.js";
import { consume, stockMap } from "./inventory.js";
import { addToReport } from "./report.js";
import { GameError, type RoomRuntime } from "./room.js";
import { StoryService } from "./story.js";

/** Phải đứng cách nơi giao trong khoảng này (mét). */
const DROP_REACH = 6;

export const escrowWallet = (contractId: string) => `escrow:${contractId}`;

/**
 * Bảng việc xóm + điểm tin cậy (docs/KIENTRUC.md §3). Mỗi ngày Chú Hai dán vài việc NPC đặt (giao N phần món tới một chỗ
 * trước giờ hẹn). Nhận việc: tiền thưởng của người đặt + cọc của mình vào ví giữ hộ (escrow). Làm đủ hàng ở quầy mình
 * (tốn nguyên liệu thật) → mang tới nơi trước hạn → nhận thưởng + lại cọc, tin cậy tăng. Trễ / bỏ ngang: thưởng hoàn
 * người đặt, mất cọc, tin cậy giảm; xuống quá thấp thì bị khoá nhận việc vài ngày.
 */
@Injectable()
export class ContractService {
  private notify?: (playerId: string, n: NotifyEvent) => void;

  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessRepo,
    private readonly ledger: LedgerService,
    private readonly story: StoryService,
  ) {}

  setNotifier(fn: (playerId: string, n: NotifyEvent) => void) {
    this.notify = fn;
  }

  private template(id: string): ContractTemplate {
    const t = content.data.contracts.templates.find((x) => x.id === id);
    if (!t) throw new GameError("invalid_state", "Mẫu việc không còn");
    return t;
  }

  /** Dán việc của hôm nay lên bảng (một lần mỗi ngày mỗi xóm). */
  private async ensureOffers(room: RoomRuntime) {
    const count = await this.prisma.contract.count({ where: { roomId: room.id, day: room.day } });
    if (count > 0) return;
    await this.prisma.contract.createMany({
      data: contractOffers(content, room.day, room.id).map((o) => ({
        roomId: room.id,
        day: room.day,
        templateId: o.templateId,
        qty: o.qty,
        reward: o.reward,
        deposit: o.deposit,
        deadline: o.deadline,
      })),
    });
  }

  async board(room: RoomRuntime, playerId: string): Promise<ContractBoardView> {
    await this.ensureOffers(room);
    const [player, rows] = await Promise.all([
      this.prisma.player.findUniqueOrThrow({ where: { id: playerId } }),
      this.prisma.contract.findMany({
        where: {
          roomId: room.id,
          OR: [{ day: room.day }, { takerId: playerId, status: { in: ["TAKEN", "READY"] } }],
        },
        orderBy: [{ deadline: "asc" }, { createdAt: "asc" }],
      }),
    ]);
    const takers = await this.prisma.player.findMany({
      where: { id: { in: rows.map((r) => r.takerId).filter((x): x is string => !!x) } },
      select: { id: true, displayName: true },
    });
    const nameOf = new Map(takers.map((t) => [t.id, t.displayName]));
    return {
      day: room.day,
      trust: player.trust,
      lockedUntil:
        player.trustLockDay !== null && player.trustLockDay >= room.day
          ? player.trustLockDay
          : null,
      offers: rows.map((r) => this.view(r, playerId, nameOf)),
    };
  }

  private view(r: Contract, playerId: string, nameOf: Map<string, string>): ContractView {
    const t = this.template(r.templateId);
    return {
      id: r.id,
      templateId: r.templateId,
      poster: t.poster,
      text: contractText(content, t, r.qty),
      productId: t.productId,
      variantId: t.variantId,
      lotId: t.lotId,
      qty: r.qty,
      reward: r.reward,
      deposit: r.deposit,
      deadline: r.deadline,
      minTrust: t.minTrust,
      status: r.status,
      takerName: r.takerId ? (nameOf.get(r.takerId) ?? null) : null,
      mine: r.takerId === playerId,
    };
  }

  /** Nhận việc: kiểm tin cậy, khoá, đồ nghề làm được món; tiền thưởng + cọc vào escrow. */
  async take(room: RoomRuntime, playerId: string, id: string) {
    await this.ensureOffers(room);
    const c = await this.prisma.contract.findFirst({ where: { id, roomId: room.id } });
    if (!c || c.status !== "OPEN" || c.day !== room.day)
      throw new GameError("invalid_state", "Việc này không còn trên bảng");
    if (room.minute >= c.deadline) throw new GameError("invalid_state", "Quá giờ hẹn rồi");
    const t = this.template(c.templateId);
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    const keeper = content.data.contracts.keeper;
    if (player.trustLockDay !== null && player.trustLockDay >= room.day)
      throw new GameError(
        "invalid_state",
        `${keeper}: "Bỏ việc nhiều quá, nghỉ tới hết ngày ${player.trustLockDay} rồi tính nghen."`,
      );
    if (player.trust < t.minTrust)
      throw new GameError(
        "invalid_state",
        `${keeper}: "Việc này cần tin cậy ${t.minTrust} — làm mấy việc nhỏ cho đàng hoàng trước đã."`,
      );
    const active = await this.prisma.contract.count({
      where: { takerId: playerId, status: { in: ["TAKEN", "READY"] } },
    });
    if (active > 0)
      throw new GameError("invalid_state", "Xong việc đang nhận rồi hẵng nhận việc mới");
    const biz = await this.businesses.of(playerId);
    if (!biz || !content.equipment(biz.equipmentId).products.includes(t.productId))
      throw new GameError(
        "invalid_state",
        `Cần đồ nghề làm ${content.product(t.productId).name.toLowerCase()} mới nhận được việc này`,
      );
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.contract.updateMany({
        where: { id, status: "OPEN" },
        data: { status: "TAKEN", takerId: playerId },
      });
      if (claimed.count === 0) throw new GameError("invalid_state", "Có người nhận mất rồi");
      await this.ledger.transfer(
        tx,
        SYSTEM.customers,
        escrowWallet(id),
        c.reward,
        "contract_escrow",
        id,
      );
      try {
        await this.ledger.transfer(
          tx,
          playerWallet(playerId),
          escrowWallet(id),
          c.deposit,
          "contract_deposit",
          id,
        );
      } catch (err) {
        if (!(err instanceof InsufficientFundsError)) throw err;
        try {
          await this.ledger.transfer(
            tx,
            bankWallet(playerId),
            escrowWallet(id),
            c.deposit,
            "contract_deposit",
            id,
          );
        } catch (err2) {
          if (err2 instanceof InsufficientFundsError)
            throw new GameError("insufficient_funds", "Không đủ tiền đặt cọc");
          throw err2;
        }
      }
      await tx.gameEvent.create({
        data: {
          playerId,
          type: "contract_take",
          payload: { templateId: c.templateId, reward: c.reward },
        },
      });
    });
    return this.board(room, playerId);
  }

  /** Làm đủ hàng ở quầy mình: trừ nguyên liệu thật cho đủ số phần món chuẩn. */
  async prepare(room: RoomRuntime, playerId: string, id: string) {
    const c = await this.mineActive(playerId, id);
    if (c.status !== "TAKEN") throw new GameError("invalid_state", "Hàng đã làm xong rồi");
    const biz = await this.businesses.require(playerId);
    const pos = room.members.get(playerId)?.pos;
    const lot = biz?.lotId ? content.lot(biz.lotId).position : null;
    const atStall =
      room.attending.has(playerId) ||
      (!!lot && !!pos && !pos.inside && Math.hypot(pos.x - lot.x, pos.z - lot.z) <= DROP_REACH);
    if (!atStall) throw new GameError("invalid_state", "Về quầy mình mới làm hàng được");
    const t = this.template(c.templateId);
    const need = contractIngredients(content, t, c.qty);
    await this.prisma.$transaction(async (tx) => {
      const stock = await stockMap(tx, biz.id);
      const missing = [...need].filter(([itemId, q]) => (stock.get(itemId) ?? 0) < q);
      if (missing.length)
        throw new GameError(
          "invalid_state",
          `Thiếu ${missing.map(([itemId, q]) => `${content.ingredient(itemId).name.toLowerCase()} (cần ${q})`).join(", ")} — ra chợ mua thêm`,
        );
      await consume(tx, biz.id, need);
      await tx.contract.update({ where: { id }, data: { status: "READY" } });
    });
    return this.board(room, playerId);
  }

  /** Giao tận nơi trước hạn: escrow trả thưởng + cọc, tin cậy tăng. */
  async deliver(room: RoomRuntime, playerId: string, id: string) {
    const c = await this.mineActive(playerId, id);
    if (c.status !== "READY")
      throw new GameError("invalid_state", "Chưa làm hàng — về quầy làm đủ trước");
    if (c.day !== room.day || room.minute > c.deadline)
      throw new GameError("invalid_state", "Trễ giờ hẹn mất rồi");
    const t = this.template(c.templateId);
    const lot = content.lot(t.lotId);
    const pos = room.members.get(playerId)?.pos;
    if (
      !pos ||
      pos.inside ||
      Math.hypot(pos.x - lot.position.x, pos.z - lot.position.z) > DROP_REACH
    )
      throw new GameError("invalid_state", `Phải mang tới tận ${lot.name} mới giao được`);
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    await this.prisma.$transaction(async (tx) => {
      await this.ledger.transfer(
        tx,
        escrowWallet(id),
        playerWallet(playerId),
        c.reward,
        "contract_reward",
        id,
      );
      await this.ledger.transfer(
        tx,
        escrowWallet(id),
        playerWallet(playerId),
        c.deposit,
        "contract_deposit_back",
        id,
      );
      await tx.contract.update({ where: { id }, data: { status: "DONE", doneAt: new Date() } });
      await tx.player.update({
        where: { id: playerId },
        data: { trust: trustAfter(content, player.trust, "done") },
      });
      await addToReport(tx, playerId, room.day, { revenue: c.reward });
      await tx.gameEvent.create({
        data: {
          playerId,
          type: "contract_done",
          payload: { templateId: c.templateId, reward: c.reward },
        },
      });
    });
    this.notify?.(playerId, {
      kind: "good",
      text: `📋 ${t.poster} nhận đủ hàng — trả ${c.reward.toLocaleString("vi-VN")}đ, hoàn cọc. 🤝 +${content.data.contracts.trust.done}`,
    });
    await this.story.note(playerId, "first_contract", room.day, {
      text: contractText(content, t, c.qty),
    });
    return this.board(room, playerId);
  }

  /** Bỏ ngang: như trễ hạn (mất cọc, trừ tin cậy). */
  async drop(room: RoomRuntime, playerId: string, id: string) {
    const c = await this.mineActive(playerId, id);
    await this.fail(room, c, "bỏ ngang");
    return this.board(room, playerId);
  }

  /** Mỗi nhịp: việc đã nhận mà quá hạn → hỏng; việc chưa ai nhận quá hạn → gỡ khỏi bảng. */
  async tick(room: RoomRuntime) {
    const late = { OR: [{ day: { lt: room.day } }, { deadline: { lt: room.minute } }] };
    await this.prisma.contract.updateMany({
      where: { roomId: room.id, status: "OPEN", ...late },
      data: { status: "EXPIRED" },
    });
    const overdue = await this.prisma.contract.findMany({
      where: { roomId: room.id, status: { in: ["TAKEN", "READY"] }, ...late },
    });
    for (const c of overdue) await this.fail(room, c, "trễ hạn");
  }

  /** Dev/test: dán ngay một việc theo mẫu (số lượng thấp nhất, hạn theo mẫu hoặc muộn hơn giờ hiện tại). */
  async debugPost(room: RoomRuntime, templateId: string) {
    await this.ensureOffers(room);
    const t = this.template(templateId);
    const qty = t.qty[0];
    await this.prisma.contract.create({
      data: {
        roomId: room.id,
        day: room.day,
        templateId,
        qty,
        deadline: Math.max(t.deadline, room.minute + 60),
        ...contractPay(content, t, qty),
      },
    });
  }

  /** Bị khách bắt thối thiếu (và các chuyện mất lòng tin khác). */
  async trustEvent(playerId: string, event: TrustEvent) {
    const p = await this.prisma.player.findUnique({ where: { id: playerId } });
    if (!p) return;
    await this.prisma.player.update({
      where: { id: playerId },
      data: { trust: trustAfter(content, p.trust, event) },
    });
  }

  private async mineActive(playerId: string, id: string) {
    const c = await this.prisma.contract.findUnique({ where: { id } });
    if (!c || c.takerId !== playerId || (c.status !== "TAKEN" && c.status !== "READY"))
      throw new GameError("invalid_state", "Không phải việc mình đang nhận");
    return c;
  }

  private async fail(room: RoomRuntime, c: Contract, why: string) {
    if (!c.takerId) return;
    const takerId = c.takerId;
    const t = this.template(c.templateId);
    const rule = content.data.contracts.trust;
    let trust = 0;
    let locked = false;
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.contract.updateMany({
        where: { id: c.id, status: { in: ["TAKEN", "READY"] } },
        data: { status: "FAILED" },
      });
      if (moved.count === 0) return;
      await this.ledger.transfer(
        tx,
        escrowWallet(c.id),
        SYSTEM.customers,
        c.reward,
        "contract_refund",
        c.id,
      );
      await this.ledger.transfer(
        tx,
        escrowWallet(c.id),
        SYSTEM.market,
        c.deposit,
        "penalty:contract",
        c.id,
      );
      const p = await tx.player.findUniqueOrThrow({ where: { id: takerId } });
      trust = trustAfter(content, p.trust, "fail");
      locked = trustLevel(content, trust) === "lock";
      await tx.player.update({
        where: { id: takerId },
        data: { trust, ...(locked ? { trustLockDay: room.day + rule.lockDays - 1 } : {}) },
      });
      await addToReport(tx, takerId, room.day, { fees: c.deposit });
      await tx.gameEvent.create({
        data: {
          playerId: takerId,
          type: "contract_fail",
          payload: { templateId: c.templateId, why },
        },
      });
    });
    this.notify?.(takerId, {
      kind: "warn",
      text: `📋 ${why[0]?.toUpperCase()}${why.slice(1)} việc của ${t.poster}: mất cọc ${c.deposit.toLocaleString("vi-VN")}đ, 🤝 −${rule.fail}${
        locked ? ` · ${content.data.contracts.keeper} khoá nhận việc ${rule.lockDays} ngày` : ""
      }`,
    });
  }
}
