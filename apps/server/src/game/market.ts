import { Injectable } from "@nestjs/common";
import { content } from "@xom/content";
import type { PayMethod } from "@xom/shared";
import { marketPackPrice, type PaySource, resaleValue } from "@xom/sim";
import { LedgerService, playerWallet, SYSTEM } from "../economy/ledger.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { Broadcast } from "./broadcast.js";
import { BusinessRepo } from "./business-repo.js";
import { addItems } from "./inventory.js";
import { PaymentService } from "./payment.js";
import { addFriendship, friendship as friendshipOf, requireAt } from "./place.js";
import { addToReport } from "./report.js";
import { GameError, type IntentContext } from "./room.js";
import { StoryService } from "./story.js";

const EQUIPMENT_RESALE = 0.5;
/** Người bán ở chợ (thân thiết tăng khi mua hàng). */
const MARKET_KEEPER = "cho_dau_moi";

/** 🛒 Vựa xe Ông Sáu (mua xe hàng, đổi nghề) + 🧺 chợ đầu mối Bà Năm (nhập hàng, thanh lý). */
@Injectable()
export class MarketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly payment: PaymentService,
    private readonly businesses: BusinessRepo,
    private readonly story: StoryService,
    private readonly broadcast: Broadcast,
  ) {}

  async buyEquipment({ room, playerId }: IntentContext, equipmentId: string, pay?: PayMethod) {
    const eq = content.equipmentById.get(equipmentId);
    if (!eq) throw new GameError("invalid_payload", "Không có thiết bị này");
    requireAt(room, playerId, "vua_xe", "Tới vựa xe Ông Sáu mới mua xe được");
    const current = await this.businesses.of(playerId);
    if (current?.status === "OPEN")
      throw new GameError("invalid_state", "Đóng quầy trước khi đổi nghề");
    if (current?.equipmentId === equipmentId)
      throw new GameError("invalid_state", `Bạn đã có ${eq.name}`);
    let src: PaySource = "cash";
    await this.prisma.$transaction(async (tx) => {
      if (current) {
        // Đổi nghề: bán lại thiết bị cũ với nửa giá.
        const old = content.equipment(current.equipmentId);
        const resale = Math.round((old.price * EQUIPMENT_RESALE) / 1000) * 1000;
        await this.ledger.transfer(
          tx,
          SYSTEM.supplier,
          playerWallet(playerId),
          resale,
          "equipment_resale",
          current.id,
        );
        await tx.business.delete({ where: { id: current.id } });
      }
      src = await this.payment.payOut(
        tx,
        playerId,
        eq.price,
        SYSTEM.supplier,
        "equipment_buy",
        eq.id,
        pay,
      );
      await tx.business.create({
        data: {
          ownerId: playerId,
          equipmentId: eq.id,
          productId: eq.products[0] ?? "",
          reputation: content.economy.startingReputation,
        },
      });
      await tx.gameEvent.create({
        data: {
          playerId: playerId,
          type: "equipment_buy",
          payload: {
            equipmentId,
            replaced: current?.equipmentId ?? null,
          },
        },
      });
    });
    this.broadcast.paidBy(playerId, src, eq.price);
    // Chuyện của tôi: chiếc xe đầu tiên, hoặc đổi nghề (mỗi nghề ghi một lần).
    if (current)
      await this.story.note(
        playerId,
        "switch_trade",
        room.day,
        { equipment: eq.name },
        { suffix: eq.id },
      );
    else await this.story.note(playerId, "first_cart", room.day, { equipment: eq.name });
    this.broadcast.world(room);
  }

  /** Mua nguyên liệu theo gói (UC-E1): mua sỉ và thân với Bà Năm được bớt giá. */
  async marketBuy(
    { room, playerId }: IntentContext,
    itemId: string,
    packs: number,
    pay?: PayMethod,
  ) {
    const ing = content.ingredientById.get(itemId);
    if (!ing) throw new GameError("invalid_payload", "Chợ không bán món này");
    requireAt(room, playerId, MARKET_KEEPER, "Ra chợ Bà Năm mới mua được");
    const eco = content.economy;
    const friendship = await friendshipOf(this.prisma, playerId, MARKET_KEEPER);
    let total = marketPackPrice(ing, room.day, room.minute, eco) * packs;
    if (packs >= eco.bulkPacks) total *= 1 - eco.bulkDiscount;
    if (friendship >= eco.friendDiscountAt) total *= 1 - eco.friendDiscount;
    total = Math.max(500, Math.round(total / 500) * 500);
    let src: PaySource = "cash";
    await this.prisma.$transaction(async (tx) => {
      src = await this.payment.payOut(
        tx,
        playerId,
        total,
        SYSTEM.market,
        "market_buy",
        itemId,
        pay,
      );
      await addItems(tx, playerId, itemId, room.day, ing.packSize * packs);
      await addToReport(tx, playerId, room.day, { stockCost: total });
      await addFriendship(tx, playerId, MARKET_KEEPER, 1);
    });
    this.broadcast.paidBy(playerId, src, total);
    this.broadcast.stockChanged(room);
  }

  /**
   * Thanh lý hàng tồn (góp ý chơi thử: đổi nghề thì kẹt hàng cũ): bán hết một loại cho Bà Năm với giá thấp
   * (resaleRate × giá gốc), phải đứng ở chợ; tiền qua sổ cái, ghi bớt vào chi phí nhập hàng hôm nay.
   */
  async marketSell({ room, playerId }: IntentContext, itemId: string) {
    const ing = content.ingredientById.get(itemId);
    if (!ing) throw new GameError("invalid_payload", "Chợ không mua món này");
    requireAt(room, playerId, MARKET_KEEPER, "Ra chợ Bà Năm mới thanh lý được");
    const rows = await this.prisma.inventoryItem.findMany({ where: { playerId, itemId } });
    const qty = rows.reduce((s, r) => s + r.qty, 0);
    if (qty <= 0) throw new GameError("invalid_state", "Không còn hàng này trong kho");
    const value = resaleValue(ing.costPerUnit, qty, content.economy.resaleRate);
    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryItem.deleteMany({ where: { playerId, itemId } });
      if (value > 0)
        await this.ledger.transfer(
          tx,
          SYSTEM.market,
          playerWallet(playerId),
          value,
          "resale",
          itemId,
        );
    });
    void this.broadcast.log(playerId, "market_sell", { itemId, qty, value });
    this.broadcast.say(room.id, {
      who: MARKET_KEEPER,
      text:
        value > 0
          ? `Ừ, Bà lấy hết ${qty} ${ing.unit} ${ing.name.toLowerCase()}, gửi con ${value.toLocaleString("vi-VN")}đ.`
          : "Ít quá Bà lấy giùm, khỏi tính tiền nha.",
    });
    this.broadcast.stockChanged(room);
  }
}
