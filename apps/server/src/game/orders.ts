import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { content, type GameEventDef } from "@xom/content";
import type { DishView, OrderEvent, OrderResultEvent, OrderUpdateEvent } from "@xom/shared";
import {
  addSkill,
  customOrder,
  generateOrder,
  hasIngredients,
  ingredientsFor,
  LOST_WEIGHT,
  nextReputation,
  patienceFactor,
  pickArchetype,
  pickPayment,
  priceScore,
  type SkillPoints,
  scoreDish,
  seededRandom,
  settleCash,
  validateBuild,
  wearAfter,
  XP,
} from "@xom/sim";
import {
  bankWallet,
  InsufficientFundsError,
  LedgerService,
  playerWallet,
  SYSTEM,
  type Tx,
} from "../economy/ledger.service.js";
import type { Business } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { consume, stockMap } from "./inventory.js";
import { availableMenu, menuOf } from "./menu.js";
import { addToReport } from "./report.js";
import { GameError, type RoomRuntime } from "./room.js";

/** Khách đã có món đúng thì đợi thêm chừng này để tính tiền (ms). */
const PAY_WAIT_MS = 20_000;
/** Chủ quầy bắt tay làm món thì khách chờ thêm ít nhất chừng này (ms). */
const MAKING_WAIT_MS = 45_000;
/** Người chơi thật chờ món lâu hơn khách NPC (họ còn đứng nhìn chủ quầy làm). */
const PLAYER_PATIENCE_MS = 180_000;
const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

const pick = <T>(list: readonly T[], rand: () => number): T =>
  list[Math.floor(rand() * list.length)] ?? (list[0] as T);
const round500 = (n: number) => Math.round(n / 500) * 500;
type VipFx = NonNullable<GameEventDef["effects"]["vip"]>;

export interface OrderEmitter {
  order(roomId: string, e: OrderEvent): void;
  update(roomId: string, e: OrderUpdateEvent): void;
  result(roomId: string, e: OrderResultEvent): void;
  /** Ví của một người chơi vừa đổi (khách là người chơi bị trừ tiền). */
  charged(playerId: string): void;
}

/**
 * Vòng đời một đơn khách (docs/USECASES.md UC-F3…F7):
 * khách tới gọi món → chủ quầy làm món (server chấm, trừ nguyên liệu) → tính tiền, thối tiền → khách đi.
 * Tiền chỉ vào ví khi tính tiền xong — đứng im không có thu nhập.
 */
@Injectable()
export class OrderService {
  private emit?: OrderEmitter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  setEmitter(emit: OrderEmitter) {
    this.emit = emit;
  }

  waitingAt(room: RoomRuntime, businessId: string): number {
    let n = 0;
    for (const o of room.orders.values()) if (o.event.businessId === businessId) n++;
    return n;
  }

  /** Khách dừng lại ở quầy: xếp hàng nếu còn chỗ và có món để gọi, không thì bỏ đi. */
  async spawn(
    room: RoomRuntime,
    biz: Business,
    arrivals: number,
    opts: { discount?: number; vip?: VipFx } = {},
  ): Promise<{ created: number; lost: number }> {
    const product = content.product(biz.productId);
    const queueSize = content.equipment(biz.equipmentId).queueSize;
    const stock = await stockMap(this.prisma, biz.ownerId);
    const menu = availableMenu(biz.productId, menuOf(biz), stock);
    let waiting = this.waitingAt(room, biz.id);
    // Ăn nói khéo (kỹ năng) thì khách kiên nhẫn hơn.
    const owner = await this.prisma.player.findUnique({ where: { id: biz.ownerId } });
    const patienceMul = patienceFactor(content, (owner?.skills ?? {}) as SkillPoints);
    let created = 0;
    let lost = 0;
    for (let k = 0; k < arrivals; k++) {
      const rand = seededRandom("order", biz.id, room.day, room.minute, k);
      const order =
        waiting < queueSize
          ? generateOrder(product.recipe, menu, rand, stock, opts.vip?.minMods ?? 0)
          : null;
      if (!order) {
        // Hàng chờ đông quá hoặc quầy hết món: khách đi thẳng.
        lost++;
        continue;
      }
      const archetype = opts.vip ? "vip" : pickArchetype(content, product.category, rand);
      const npc = content.data.npcs.find((n) => n.id === archetype);
      const patienceMs = (npc?.patienceSec ?? 45) * 1000 * (opts.vip?.patience ?? 1) * patienceMul;
      // Khai trương giảm giá: làm tròn 500đ, không dưới 1.000đ.
      const price = opts.discount
        ? Math.max(1_000, round500(order.price * (1 - opts.discount)))
        : order.price;
      const now = Date.now();
      const event: OrderEvent = {
        orderId: randomUUID(),
        businessId: biz.id,
        ownerId: biz.ownerId,
        lotId: biz.lotId ?? "",
        productId: biz.productId,
        variantId: order.variantId,
        archetype,
        ask: order.ask,
        dish: order.dish,
        spec: order.spec,
        price,
        pay: pickPayment(price, npc?.transferRate ?? 0.2, rand),
        createdAt: now,
        expiresAt: now + patienceMs,
        ...(opts.vip ? { vip: true } : {}),
        ...(opts.discount ? { promo: true } : {}),
      };
      room.orders.set(event.orderId, { event, patienceMs, dish: null, vip: opts.vip });
      this.emit?.order(room.id, event);
      waiting++;
      created++;
    }
    if (lost > 0) await this.recordLost(room, biz.ownerId, biz.id, lost);
    return { created, lost };
  }

  /**
   * Người chơi gọi món ở quầy hàng xóm (UC-J3): chủ quầy phải đang đứng quầy; món phải đang bán và đủ
   * nguyên liệu; khách phải đủ tiền. Đơn vào hàng chờ như khách thường, trả bằng chuyển khoản khi tính tiền.
   */
  async playerOrder(
    room: RoomRuntime,
    buyer: { id: string; name: string },
    biz: Business,
    choice: { variantId: string; picks: Record<string, string>; mods: string[] },
  ) {
    if (biz.ownerId === buyer.id) throw new GameError("invalid_state", "Quầy của mình mà");
    if (biz.status !== "OPEN" || !biz.lotId)
      throw new GameError("invalid_state", "Quầy chưa mở hàng");
    if (!room.attending.has(biz.ownerId))
      throw new GameError("invalid_state", "Chủ quầy đang vắng, đợi chút nha");
    for (const o of room.orders.values())
      if (o.event.buyerId === buyer.id)
        throw new GameError("invalid_state", "Bạn đang chờ một món rồi");
    const product = content.product(biz.productId);
    if (this.waitingAt(room, biz.id) >= content.equipment(biz.equipmentId).queueSize)
      throw new GameError("invalid_state", "Quầy đang đông, đợi bớt khách nha");
    const stock = await stockMap(this.prisma, biz.ownerId);
    const menu = availableMenu(biz.productId, menuOf(biz), stock);
    const order = customOrder(product.recipe, menu, choice.variantId, choice.picks, choice.mods);
    if (typeof order === "string") throw new GameError("invalid_state", order);
    // Hàng xóm trả bằng chuyển khoản nếu tài khoản đủ, không thì đưa tiền mặt.
    const [cash, bank] = await Promise.all([
      this.ledger.balance(this.prisma, playerWallet(buyer.id)),
      this.ledger.balance(this.prisma, bankWallet(buyer.id)),
    ]);
    if (Math.max(cash, bank) < order.price)
      throw new GameError("insufficient_funds", "Không đủ tiền");
    const now = Date.now();
    const event: OrderEvent = {
      orderId: randomUUID(),
      businessId: biz.id,
      ownerId: biz.ownerId,
      lotId: biz.lotId,
      productId: biz.productId,
      variantId: order.variantId,
      archetype: "nguoi_choi",
      ask: order.ask,
      dish: order.dish,
      spec: order.spec,
      price: order.price,
      pay: { kind: "transfer" },
      createdAt: now,
      expiresAt: now + PLAYER_PATIENCE_MS,
      buyerId: buyer.id,
      buyerName: buyer.name,
    };
    room.orders.set(event.orderId, { event, patienceMs: PLAYER_PATIENCE_MS, dish: null });
    this.emit?.order(room.id, event);
  }

  /**
   * Chủ quầy bắt tay làm món: khách thấy người ta đang làm cho mình thì chờ thêm một lúc (một lần) — như ngoài đời,
   * không bỏ đi giữa chừng khi món sắp xong (góp ý chơi thử).
   */
  async start(room: RoomRuntime, playerId: string, orderId: string) {
    const order = this.requireOrder(room, playerId, orderId);
    if (order.started) return;
    order.started = true;
    order.event.expiresAt = Math.max(order.event.expiresAt, Date.now() + MAKING_WAIT_MS);
    this.emit?.update(room.id, {
      orderId,
      stage: "making",
      line: "",
      mistakes: [],
      expiresAt: order.event.expiresAt,
    });
  }

  /** Người chơi làm xong một món: kiểm tra, trừ nguyên liệu, chấm điểm; sai thì khách phàn nàn. */
  async make(room: RoomRuntime, playerId: string, orderId: string, build: DishView) {
    const order = this.requireOrder(room, playerId, orderId);
    if (order.dish && order.dish.mistakes.length === 0) {
      throw new GameError("invalid_state", "Món này làm xong rồi, tính tiền cho khách đi");
    }
    const recipe = content.product(order.event.productId).recipe;
    const invalid = validateBuild(recipe, build);
    if (invalid) throw new GameError("invalid_payload", invalid);
    const need = ingredientsFor(recipe, build);
    const missing = hasIngredients(need, await stockMap(this.prisma, playerId));
    if (missing.length) {
      const names = missing.map((id) => content.ingredient(id).name.toLowerCase()).join(", ");
      throw new GameError("invalid_state", `Thiếu ${names} — ra chợ mua thêm hoặc xin lỗi khách`);
    }
    await this.prisma.$transaction((tx) => consume(tx, playerId, need));

    const { score, mistakes } = scoreDish(recipe, order.event.spec, build);
    order.dish = { build, score, mistakes };
    const correct = mistakes.length === 0;
    const rand = seededRandom("dish", orderId, score);
    let line: string;
    const step = recipe.steps.find((s) => s.id === mistakes[0]);
    const part = step?.label.toLowerCase() ?? "này";
    if (correct) {
      order.event.expiresAt = Math.max(order.event.expiresAt, Date.now() + PAY_WAIT_MS);
      // Khách là người thật: không nói thay họ, chỉ báo kết quả.
      line = order.event.buyerId
        ? "✅ Đúng món mình gọi"
        : pick(["Đúng ý con luôn!", "Nhìn ngon ghê!", "Lẹ ghê ta!"], rand);
    } else {
      line = order.event.buyerId
        ? `❌ Sai phần ${part} rồi`
        : `Ơ, phần ${part} sai rồi, con dặn rồi mà!`;
    }
    this.emit?.update(room.id, {
      orderId,
      stage: correct ? "correct" : "wrong",
      line,
      mistakes,
      expiresAt: order.event.expiresAt,
    });
    return { correct, score, mistakes };
  }

  /**
   * Tính tiền (UC-F7). Chuyển khoản: nhận đúng giá. Tiền mặt: thối thiếu → khách đòi đủ (mất uy tín);
   * thối dư → khách trả lại hoặc cầm luôn. Món sai chỉ đưa được khi giảm 50%.
   */
  async pay(
    room: RoomRuntime,
    playerId: string,
    orderId: string,
    change: number | null,
    discount: boolean,
  ) {
    const order = this.requireOrder(room, playerId, orderId);
    if (!order.dish) throw new GameError("invalid_state", "Chưa làm món mà tính tiền gì con");
    const correct = order.dish.mistakes.length === 0;
    if (!correct && !discount)
      throw new GameError("invalid_state", "Món sai — làm lại hoặc giảm giá cho khách");

    const e = order.event;
    // Giảm 50%, làm tròn nghìn cho dễ thối tiền.
    const price = discount ? Math.round(e.price / 2 / 1000) * 1000 : e.price;
    const rand = seededRandom("pay", orderId);
    let received = price;
    let outcome: OrderResultEvent["outcome"] = "transfer";
    if (e.pay.kind === "cash") {
      const res = settleCash(price, e.pay.bill, change ?? 0, rand);
      received = res.received;
      outcome = res.outcome;
    }

    const eco = content.economy;
    const variant = content.variant(e.productId, e.variantId);
    const ratio = e.price / variant.refPrice;
    const fast = Date.now() - e.createdAt <= order.patienceMs * 0.6;
    // Khách là người chơi: không có tiền boa tự động (boa là chuyện của họ).
    const vip = order.vip;
    const tip =
      correct && !discount && fast && !e.buyerId
        ? Math.max(1_000, round500(price * eco.tipRate * (vip?.tipMult ?? 1)))
        : 0;
    const short = outcome === "short";
    const satisfaction = Math.max(
      0,
      (correct ? 1 : 0.4) * (fast ? 1 : 0.8) * (0.6 + 0.4 * priceScore(ratio)) - (short ? 0.3 : 0),
    );

    try {
      await this.prisma.$transaction(async (tx) => {
        if (received > 0) await this.collect(tx, e, received);
        if (tip > 0)
          await this.ledger.transfer(
            tx,
            SYSTEM.customers,
            playerWallet(playerId),
            tip,
            "tip",
            e.businessId,
          );
        const biz = await tx.business.findUnique({ where: { id: e.businessId } });
        if (biz) {
          let rep = nextReputation(biz.reputation, satisfaction, 1, eco.reputationRate);
          if (correct && fast) rep += eco.serveReputationBonus;
          if (short) rep -= 0.02;
          // Khách VIP: làm hoàn hảo thì tiếng tốt lan nhanh, làm hỏng thì bị chê khắp xóm.
          if (vip) rep += correct && fast && !short ? vip.repWin : -vip.repLose;
          await tx.business.update({
            where: { id: biz.id },
            data: {
              reputation: Math.min(1, Math.max(0, rep)),
              wear: wearAfter(biz.wear, 1, eco.maintenance),
            },
          });
        }
        // Kỹ năng (DESIGN §4): kịp giờ → tay nhanh; đúng lời dặn → nhớ món; khách vui → ăn nói.
        const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
        let skills = (player.skills ?? {}) as SkillPoints;
        if (correct && fast) skills = addSkill(content, skills, "tay_nhanh");
        if (correct && e.dish.includes(",")) skills = addSkill(content, skills, "nho_mon");
        if (satisfaction >= 0.8) skills = addSkill(content, skills, "an_noi");
        await tx.player.update({
          where: { id: playerId },
          data: { xp: { increment: discount ? XP.serveDiscount : XP.serve }, skills },
        });
        await addToReport(tx, playerId, room.day, {
          revenue: received,
          tips: tip,
          served: 1,
          wrong: discount ? 1 : 0,
          satisfaction: { value: satisfaction, weight: 1 },
        });
      });
    } catch (err) {
      if (!(err instanceof InsufficientFundsError)) throw err;
      throw new GameError("invalid_state", "Khách không đủ tiền chuyển khoản — xin lỗi khách thôi");
    }
    room.orders.delete(orderId);
    if (e.buyerId) {
      this.emit?.charged(e.buyerId);
      const line = `📱 Chuyển ${vnd(received)} cho quầy — nhận ${e.dish}`;
      this.emit?.result(room.id, { orderId, served: true, tip: 0, line, outcome, received });
      return;
    }

    const lines = content.data.customerLines;
    const line = vip
      ? correct && fast && !short
        ? `Chuẩn! Lâu lắm mới gặp quầy làm kỹ vậy — boa ${vnd(tip)} nè!`
        : "Tạm được… lần sau làm kỹ hơn nha."
      : short
        ? "Thối thiếu rồi con ơi, đưa đủ đây!"
        : outcome === "over_returned"
          ? "Con thối dư nè, trả lại nè."
          : discount
            ? "Thôi được, lần sau làm kỹ nha."
            : ratio > 1.15
              ? pick(lines.pricey, rand)
              : ratio < 0.9
                ? pick(lines.cheap, rand)
                : pick(lines.thanks, rand);
    this.emit?.result(room.id, { orderId, served: true, tip, line, outcome, received });
  }

  /**
   * Thu tiền một đơn (DESIGN §2): khách trả chuyển khoản → vào 🏦 tài khoản chủ quầy; tiền mặt → 💵 ví.
   * Khách là hàng xóm: chuyển khoản nếu tài khoản đủ, không thì trả tiền mặt.
   */
  private async collect(tx: Tx, e: OrderEvent, amount: number) {
    if (e.buyerId) {
      const bank = await this.ledger.balance(tx, bankWallet(e.buyerId));
      const viaBank = bank >= amount;
      await this.ledger.transfer(
        tx,
        viaBank ? bankWallet(e.buyerId) : playerWallet(e.buyerId),
        viaBank ? bankWallet(e.ownerId) : playerWallet(e.ownerId),
        amount,
        "sale",
        e.businessId,
      );
      return;
    }
    await this.ledger.transfer(
      tx,
      SYSTEM.customers,
      e.pay.kind === "transfer" ? bankWallet(e.ownerId) : playerWallet(e.ownerId),
      amount,
      "sale",
      e.businessId,
    );
  }

  /** "Xin lỗi, hết rồi": khách đi, không mất tiền nhưng hơi buồn. */
  async decline(room: RoomRuntime, playerId: string, orderId: string) {
    const order = this.requireOrder(room, playerId, orderId);
    room.orders.delete(orderId);
    await this.recordLost(room, playerId, order.event.businessId, 1, order.vip);
    const line = order.event.buyerId
      ? "🙏 Quầy xin lỗi, không bán được món này"
      : "Vậy thôi, để bữa khác.";
    this.emit?.result(room.id, { orderId, served: false, tip: 0, line });
  }

  /** Khách hết kiên nhẫn: có món đúng thì trả đúng tiền rồi đi; chưa có thì bỏ đi. */
  async expire(room: RoomRuntime) {
    const now = Date.now();
    for (const [id, order] of room.orders) {
      if (order.event.expiresAt > now) continue;
      const e = order.event;
      if (order.dish && order.dish.mistakes.length === 0) {
        room.orders.delete(id);
        try {
          await this.prisma.$transaction(async (tx) => {
            await this.collect(tx, e, e.price);
            await addToReport(tx, e.ownerId, room.day, {
              revenue: e.price,
              served: 1,
              satisfaction: { value: 0.6, weight: 1 },
            });
          });
        } catch (err) {
          if (!(err instanceof InsufficientFundsError)) throw err;
          this.emit?.result(room.id, {
            orderId: id,
            served: false,
            tip: 0,
            line: "💸 Không đủ tiền trả, đành thôi",
          });
          continue;
        }
        if (e.buyerId) this.emit?.charged(e.buyerId);
        this.emit?.result(room.id, {
          orderId: id,
          served: true,
          tip: 0,
          line: e.buyerId
            ? `📱 Tự chuyển ${vnd(e.price)} rồi lấy món`
            : "Trả đúng tiền nè, lâu quá à.",
          outcome: "exact",
          received: e.price,
        });
        continue;
      }
      room.orders.delete(id);
      await this.recordLost(room, e.ownerId, e.businessId, 1, order.vip);
      this.emit?.result(room.id, {
        orderId: id,
        served: false,
        tip: 0,
        line: e.buyerId
          ? "⌛ Chờ lâu quá, thôi để bữa khác"
          : pick(content.data.customerLines.impatient, seededRandom("late", id)),
      });
    }
  }

  /** Bỏ mọi đơn của một quầy (đóng quầy, hết ngày). */
  dropFor(room: RoomRuntime, businessId: string) {
    for (const [id, o] of room.orders) {
      if (o.event.businessId !== businessId) continue;
      room.orders.delete(id);
      this.emit?.result(room.id, {
        orderId: id,
        served: false,
        tip: 0,
        line: "Dọn hàng rồi hả, thôi đi.",
      });
    }
  }

  private requireOrder(room: RoomRuntime, playerId: string, orderId: string) {
    const order = room.orders.get(orderId);
    if (!order || order.event.ownerId !== playerId)
      throw new GameError("invalid_state", "Khách này không còn ở quầy");
    if (order.event.expiresAt < Date.now())
      throw new GameError("invalid_state", "Khách đã bỏ đi rồi");
    if (!room.attending.has(playerId))
      throw new GameError("invalid_state", "Phải đứng ở quầy mới phục vụ được");
    return order;
  }

  /** Khách hụt: tính vào báo cáo và kéo uy tín xuống nhẹ. */
  private async recordLost(
    room: RoomRuntime,
    ownerId: string,
    businessId: string,
    lost: number,
    vip?: VipFx,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const biz = await tx.business.findUnique({ where: { id: businessId } });
      if (biz) {
        const rep = Math.max(
          0,
          nextReputation(biz.reputation, 0, lost * LOST_WEIGHT, content.economy.reputationRate) -
            (vip?.repLose ?? 0),
        );
        await tx.business.update({ where: { id: biz.id }, data: { reputation: rep } });
      }
      await addToReport(tx, ownerId, room.day, {
        lost,
        satisfaction: { value: 0, weight: lost * LOST_WEIGHT },
      });
    });
  }
}
