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

  /**
   * Mua đồ nghề ở vựa Ông Sáu (docs/IA.md bước D — nhiều cửa hàng):
   * - `new` (mặc định): mở THÊM một cửa hàng (không giới hạn), thành cửa hàng đang quản lý.
   * - `replace`: đổi nghề cửa hàng đang quản lý — bán lại đồ nghề cũ nửa giá, GIỮ cửa hàng (kho cũ còn để thanh lý,
   *   nhân viên, chỗ bán), đổi món + thực đơn, uy tín về mức khởi đầu.
   */
  async buyEquipment(
    { room, playerId }: IntentContext,
    equipmentId: string,
    pay?: PayMethod,
    mode: "new" | "replace" = "new",
  ) {
    const eq = content.equipmentById.get(equipmentId);
    if (!eq) throw new GameError("invalid_payload", "Không có thiết bị này");
    requireAt(room, playerId, "vua_xe", "Tới vựa xe Ông Sáu mới mua xe được");
    const shops = await this.businesses.list(playerId);
    const current = mode === "replace" ? await this.businesses.of(playerId) : null;
    if (mode === "replace") {
      if (!current) throw new GameError("invalid_state", "Chưa có quầy nào để đổi nghề");
      if (current.status === "OPEN")
        throw new GameError("invalid_state", "Đóng cửa trước khi đổi nghề");
      if (current.equipmentId === equipmentId)
        throw new GameError("invalid_state", `Quầy này đã là ${eq.name}`);
    }
    let src: PaySource = "cash";
    let createdId: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      src = await this.payment.payOut(
        tx,
        playerId,
        eq.price,
        SYSTEM.supplier,
        "equipment_buy",
        eq.id,
        pay,
      );
      if (current) {
        // Đổi nghề: bán lại thiết bị cũ với nửa giá, cửa hàng giữ nguyên.
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
        await tx.business.update({
          where: { id: current.id },
          data: {
            equipmentId: eq.id,
            productId: eq.products[0] ?? "",
            menu: {},
            reputation: content.economy.startingReputation,
            wear: 0,
          },
        });
      } else {
        const created = await tx.business.create({
          data: {
            ownerId: playerId,
            equipmentId: eq.id,
            productId: eq.products[0] ?? "",
            reputation: content.economy.startingReputation,
          },
        });
        createdId = created.id;
        await tx.player.update({ where: { id: playerId }, data: { activeBusinessId: created.id } });
      }
      await tx.gameEvent.create({
        data: {
          playerId,
          type: "equipment_buy",
          payload: {
            equipmentId,
            mode,
            replaced: current?.equipmentId ?? null,
            shops: shops.length,
          },
        },
      });
    });
    this.broadcast.paidBy(playerId, src, eq.price);
    // Chuyện của tôi: chiếc xe đầu tiên, đổi nghề (mỗi nghề một lần), mở thêm cửa hàng.
    if (current)
      await this.story.note(
        playerId,
        "switch_trade",
        room.day,
        { equipment: eq.name },
        { suffix: eq.id },
      );
    else if (shops.length === 0)
      await this.story.note(playerId, "first_cart", room.day, { equipment: eq.name });
    else
      await this.story.note(
        playerId,
        "more_shop",
        room.day,
        { equipment: eq.name, n: shops.length + 1 },
        { suffix: createdId ?? eq.id },
      );
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
    // Kho riêng từng cửa hàng: hàng nhập vào cửa hàng đang quản lý.
    const shop = await this.businesses.require(
      playerId,
      "Có quầy hàng rồi mới nhập hàng — mua xe ở vựa Ông Sáu trước",
    );
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
      await addItems(tx, shop, itemId, room.day, ing.packSize * packs);
      await addToReport(tx, playerId, room.day, { stockCost: total }, shop.id);
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
    const shop = await this.businesses.require(playerId, "Có quầy hàng rồi mới có hàng thanh lý");
    const rows = await this.prisma.inventoryItem.findMany({
      where: { businessId: shop.id, itemId },
    });
    const qty = rows.reduce((s, r) => s + r.qty, 0);
    if (qty <= 0) throw new GameError("invalid_state", "Không còn hàng này trong kho");
    const value = resaleValue(ing.costPerUnit, qty, content.economy.resaleRate);
    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryItem.deleteMany({ where: { businessId: shop.id, itemId } });
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
