import { Injectable } from "@nestjs/common";
import { content } from "@xom/content";
import type { PayMethod, WorldView } from "@xom/shared";
import {
  absMinute,
  canHost,
  feeToFund,
  hostCost,
  levelOf,
  nextShopLevel,
  onDutyTeam,
  openDue,
  type PaySource,
  repairCost,
  takeFifo,
  unlockLevel,
  wearState,
} from "@xom/sim";
import {
  bankWallet,
  fundWallet,
  InsufficientFundsError,
  LedgerService,
  playerWallet,
  SYSTEM,
} from "../economy/ledger.service.js";
import type { Business } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { Broadcast } from "./broadcast.js";
import { BusinessRepo } from "./business-repo.js";
import { addItems, consume, stockMap } from "./inventory.js";
import { availableMenu, menuOf, patchMenu } from "./menu.js";
import { OrderService } from "./orders.js";
import { PaymentService } from "./payment.js";
import { requireAt } from "./place.js";
import { PlotService } from "./plots.js";
import { addToReport } from "./report.js";
import { GameError, type IntentContext, type RoomRuntime } from "./room.js";
import { ShopService } from "./shop.js";
import { StoryService } from "./story.js";

/**
 * 🏪 Vận hành cửa hàng của mình (UC-F*): chọn chỗ, thực đơn, mở / đóng quầy (tiền chỗ, phí ngày, quỹ xóm), đứng quầy,
 * sửa xe, điện nước tiệm, nhân viên tới ca tự mở cửa, khai trương. (Thuê nhà + giấy tờ: ShopService.)
 */
@Injectable()
export class BusinessService {
  /** Nhân viên đã tự mở cửa hôm nay (`businessId:day`) — chủ đóng giữa chừng thì không mở lại. */
  private readonly staffOpened = new Set<string>();
  private occupantsOf: (roomId: string) => WorldView["lots"] = () => [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly payment: PaymentService,
    private readonly businesses: BusinessRepo,
    private readonly orders: OrderService,
    private readonly shops: ShopService,
    private readonly story: StoryService,
    private readonly broadcast: Broadcast,
    private readonly plots: PlotService,
  ) {}

  /** GameService giữ danh sách quầy đang chiếm chỗ trong xóm (để chặn hai người một chỗ). */
  bindOccupants(fn: (roomId: string) => WorldView["lots"]) {
    this.occupantsOf = fn;
  }

  private occupants(roomId: string) {
    return this.occupantsOf(roomId);
  }

  async updateLot({ room, playerId }: IntentContext, lotId: string, pay?: PayMethod) {
    const biz = await this.businesses.require(playerId);
    if (lotId === biz.lotId) return;
    // Chỗ gốc hoặc chỗ của khu xóm mình đã mở (docs/BANDO.md bước B).
    if (!content.lotsIn(room.chunks).some((l) => l.id === lotId))
      throw new GameError("invalid_payload", "Không có chỗ này");
    // Nhà mặt tiền: phải ký hợp đồng thuê trước (UC-F12) — mở bằng vốn, không khoá theo cấp.
    if (content.lot(lotId).kind === "house") await this.shops.requireLease(playerId, lotId);
    // Đang thuê nhà mà dọn ra vỉa hè: tiền nhà vẫn tính mỗi ngày + trả thêm tiền chỗ — chặn, trả nhà trước.
    else await this.shops.requireNoLease(playerId, biz.lotId);
    if (biz.status === "OPEN") throw new GameError("invalid_state", "Đóng cửa rồi mới chuyển chỗ");
    const taken = this.occupants(room.id).find((o) => o.lotId === lotId);
    if (taken) throw new GameError("invalid_state", `Chỗ này ${taken.ownerName} đang dùng`);
    const lot = content.lot(lotId);
    // Ô đất có chủ (bước D): chỉ chủ dùng; chủ dọn về ô của mình thì sạp vẫn còn, không phải dựng lại.
    const plot = this.plots.ownerOf(room, lotId);
    if (plot && plot.ownerId !== playerId)
      throw new GameError("invalid_state", `Ô đất này của ${plot.ownerName}`);
    if (lot.kind !== "stall" || plot) {
      await this.prisma.business.update({ where: { id: biz.id }, data: { lotId } });
      this.broadcast.world(room);
      return;
    }
    // Sạp có mái (docs/BANDO.md bước C): dọn tới ô đất thì trả tiền dựng sạp (vật liệu + công) — money sink.
    const cost = content.economy.stallBuild;
    let src: PaySource = "cash";
    await this.prisma.$transaction(async (tx) => {
      src = await this.payment.payOut(
        tx,
        playerId,
        cost,
        SYSTEM.supplier,
        "stall_build",
        biz.id,
        pay,
      );
      await tx.business.update({ where: { id: biz.id }, data: { lotId } });
      await addToReport(tx, playerId, room.day, { fees: cost });
    });
    this.broadcast.paidBy(playerId, src, cost);
    this.broadcast.notify(playerId, {
      kind: "good",
      text: `⛺ Dựng sạp xong ở ${lot.name.replace(/^⛺ /, "")} — mưa vẫn bán được`,
    });
    this.broadcast.world(room);
  }

  /** Bật/tắt món, đổi giá trong thực đơn (UC-F2). */
  async setMenu(
    { room, playerId }: IntentContext,
    variantId: string,
    patch: { on?: boolean; price?: number },
  ) {
    const biz = await this.businesses.require(playerId);
    const recipe = content.product(biz.productId).recipe;
    if (!recipe.variants.some((v) => v.id === variantId))
      throw new GameError("invalid_payload", "Không có món này");
    const next = patchMenu(biz, variantId, patch);
    if (!menuOf({ ...biz, menu: next }).some((m) => m.on)) {
      throw new GameError("invalid_state", "Phải bán ít nhất một món");
    }
    await this.prisma.business.update({ where: { id: biz.id }, data: { menu: next } });
    // Hàng xóm thấy thực đơn/giá mới.
    this.broadcast.world(room);
  }

  /**
   * Người chơi tự tổ chức sự kiện (DESIGN §9, UC-B5): khai trương — phải đang đứng quầy đang mở; trả tiền pháo, bong bóng,
   * băng rôn (money sink, Luật 2.2); đổi lại quầy đông khách + giảm giá trong X giờ game, cả xóm thấy tin.
   */
  async hostEvent({ room, playerId }: IntentContext, eventId: string, pay?: PayMethod) {
    const def = content.data.events.find((e) => e.id === eventId);
    if (!def || def.trigger.kind !== "player")
      throw new GameError("invalid_payload", "Không có sự kiện này");
    const biz = await this.businesses.require(playerId);
    if (biz.status !== "OPEN" || !biz.lotId || !room.attending.has(playerId))
      throw new GameError("invalid_state", "Mở cửa và đứng ở cửa hàng rồi mới khai trương được");
    if (room.activeEvents(biz.id).length)
      throw new GameError("invalid_state", "Quầy đang khai trương rồi mà");
    await this.requireLevel(playerId, "event_host");
    const why = canHost(def, biz.promoDay, room.day);
    if (why) throw new GameError("invalid_state", why);
    const end = Math.min(content.economy.dayEndMinute, room.minute + def.minutes);
    if (end - room.minute < 30)
      throw new GameError("invalid_state", "Sắp hết ngày rồi — mai khai trương cho đông");
    const cost = hostCost(def);
    let src: PaySource = "cash";
    await this.prisma.$transaction(async (tx) => {
      src = await this.payment.payOut(tx, playerId, cost, SYSTEM.market, "event", def.id, pay);
      await tx.business.update({ where: { id: biz.id }, data: { promoDay: room.day } });
      await addToReport(tx, playerId, room.day, { fees: cost });
      await tx.gameEvent.create({
        data: {
          playerId: playerId,
          type: "event_host",
          payload: { eventId: def.id, cost, lotId: biz.lotId },
        },
      });
    });
    this.broadcast.paidBy(playerId, src, cost);
    const name = room.members.get(playerId)?.displayName ?? "Hàng xóm";
    room.events.push({
      key: `${def.id}:${biz.id}:${room.day}`,
      eventId: def.id,
      from: room.minute,
      to: end,
      ownerId: playerId,
      ownerName: name,
      businessId: biz.id,
      lotId: biz.lotId,
    });
    this.broadcast.events(room);
    this.broadcast.say(room.id, {
      who: playerId,
      text: "🎉 Khai trương! Ghé ủng hộ nha!",
    });
  }

  /** Hệ số khách + giảm giá từ sự kiện đang diễn ra ở một quầy. */
  promoOf(room: RoomRuntime, businessId: string) {
    let demand = 1;
    let discount = 0;
    for (const e of room.activeEvents(businessId)) {
      const fx = content.event(e.eventId).effects;
      demand *= fx.demand ?? 1;
      discount = Math.max(discount, fx.discount ?? 0);
    }
    return { demand, discount };
  }

  private async requireLevel(playerId: string, id: "event_host") {
    const need = unlockLevel(content, id);
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    const level = levelOf(player.xp).level;
    if (level < need) {
      const label = content.data.unlocks.find((u) => u.id === id)?.label ?? "Việc này";
      throw new GameError(
        "invalid_state",
        `${label}: cần cấp ${need} (đang cấp ${level}) — làm thêm cho lên cấp nha`,
      );
    }
  }

  async openBusiness({ room, playerId }: IntentContext) {
    const biz = await this.businesses.require(playerId);
    if (biz.status === "OPEN") return;
    if (!biz.lotId) throw new GameError("invalid_state", "Chọn chỗ bán trước đã");
    if (!room.attending.has(playerId))
      throw new GameError("invalid_state", "Tới tận cửa hàng rồi mới mở hàng được");
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    if (player.jobId || room.shifts.has(playerId))
      throw new GameError("invalid_state", "Bạn đang đi làm thuê — nghỉ việc rồi mới mở cửa hàng");
    await this.doOpen(room, playerId, biz);
  }

  /** Có nhân viên trong ca: chủ tự đứng bán hay để nhân viên bán (chủ vẫn ở tiệm coi). */
  async setSelfSell({ room, playerId }: IntentContext, on: boolean) {
    if (on) room.selfSell.add(playerId);
    else room.selfSell.delete(playerId);
  }

  /**
   * Nhân viên tới ca thì mở cửa giúp chủ (KIENTRUC §2): quầy đã có chỗ, đủ giấy tờ (tiệm), còn hàng làm được ít nhất một
   * món, chủ đang online. Tiền chỗ / phí ngày trừ như chủ tự mở; thiếu tiền thì thôi, báo chủ.
   */
  async staffAutoOpen(room: RoomRuntime) {
    const online = [...room.members.values()]
      .filter((m) => m.sockets.size > 0)
      .map((m) => m.playerId);
    if (!online.length) return;
    const closed = await this.prisma.business.findMany({
      where: {
        ownerId: { in: online },
        status: "CLOSED",
        lotId: { not: null },
        employees: { some: {} },
      },
      include: { employees: true },
    });
    for (const biz of closed) {
      const e = onDutyTeam(content, biz.employees, room.minute)[0];
      if (!e) continue;
      const key = `${biz.id}:${room.day}`;
      // Mỗi ngày nhân viên chỉ mở một lần (chủ đóng giữa chừng thì thôi).
      if (this.staffOpened.has(key)) continue;
      this.staffOpened.add(key);
      const stock = await stockMap(this.prisma, biz.id);
      if (!availableMenu(biz.productId, menuOf(biz), stock).length) continue;
      const name = content.data.staff.people.find((p) => p.id === e.staffId)?.name ?? "Nhân viên";
      try {
        // Mở cửa lặng lẽ (góp ý đợt 3: nhiều cửa hàng thì thông báo "làm dùm" thành ồn) — chủ xem ở 🏬 Các cửa hàng.
        await this.doOpen(room, biz.ownerId, biz);
        this.broadcast.me(biz.ownerId);
      } catch (err) {
        if (!(err instanceof GameError)) throw err;
        this.broadcast.notify(biz.ownerId, {
          kind: "warn",
          text: `🔒 ${name} tới ca mà không mở cửa được: ${err.message}`,
        });
      }
    }
  }

  /** Mở cửa: trả tiền chỗ (xe đẩy) / tiền nhà hôm nay (tiệm) + phí ngày nếu chưa trả hôm nay. */
  private async doOpen(room: RoomRuntime, playerId: string, biz: Business) {
    if (!biz.lotId) throw new GameError("invalid_state", "Chọn chỗ bán trước đã");
    const lot = content.lot(biz.lotId);
    if (lot.kind === "house") await this.shops.requireReady(room, biz, lot.id);
    const site = this.plots.building(room, lot.id);
    if (site)
      throw new GameError(
        "invalid_state",
        `Đang xây tiệm trên ô này — xong ngày ${site.buildDone}`,
      );
    const eco = content.economy;
    if (wearState(biz.wear, eco.maintenance) === "broken")
      throw new GameError("invalid_state", "Xe hư rồi — đẩy tới vựa xe Ông Sáu sửa đã");
    await this.prisma.$transaction(async (tx) => {
      const paid = biz.rentPaidDay === room.day && biz.rentLotId === lot.id;
      if (!paid) {
        // Xe đẩy trả tiền chỗ vỉa hè theo ngày khi mở; tiệm trong nhà thì tiền nhà đã tính theo hợp đồng (UC-F12).
        // Phí chợ/vệ sinh (xe đẩy) hoặc thuế khoán (tiệm) mỗi ngày — Luật 2.2.
        const { rent, fee } = openDue(content, lot.id, this.plots.owns(room, playerId, lot.id));
        if (rent > 0)
          await this.payment.payOut(tx, playerId, rent, SYSTEM.landlord, "rent", lot.id);
        // Phí chợ thu tận tay; một phần vào quỹ xóm làm công trình chung (UC-J5), còn lại cho ban quản lý chợ.
        if (fee > 0) {
          const toFund = feeToFund(fee, content.data.fund.feeShare);
          if (toFund > 0)
            await this.payment.payOut(tx, playerId, toFund, fundWallet(room.id), "fee", lot.id);
          if (fee - toFund > 0)
            await this.payment.payOut(tx, playerId, fee - toFund, SYSTEM.landlord, "fee", lot.id);
        }
        await addToReport(tx, playerId, room.day, { rent, fees: fee });
      }
      await tx.business.update({
        where: { id: biz.id },
        data: { status: "OPEN", rentPaidDay: room.day, rentLotId: lot.id },
      });
    });
    void this.broadcast.log(playerId, "biz_open", {
      lotId: lot.id,
      productId: biz.productId,
      kind: lot.kind,
    });
    // Chuyện của tôi: lần đầu mở quầy; lần đầu mở tiệm trong nhà mặt tiền.
    const product = content.product(biz.productId).name.toLowerCase();
    await this.story.note(playerId, "first_open", room.day, { product, lot: lot.name });
    if (lot.kind === "house")
      await this.story.note(playerId, "first_shop", room.day, { lot: lot.name });
    this.broadcast.world(room);
  }

  /**
   * Sửa xe/quầy ở vựa xe Ông Sáu (Luật 2.2): tiền sửa theo độ mòn; sửa xong như mới.
   */
  async repair({ room, playerId }: IntentContext, pay?: PayMethod) {
    requireAt(room, playerId, "vua_xe", "Đẩy xe tới vựa xe Ông Sáu mới sửa được");
    const biz = await this.businesses.require(playerId);
    if (biz.status === "OPEN")
      throw new GameError("invalid_state", "Đóng cửa rồi mới đem đồ nghề đi sửa");
    const m = content.economy.maintenance;
    const cost = repairCost(content.equipment(biz.equipmentId).price, biz.wear, m);
    if (cost <= 0) throw new GameError("invalid_state", "Xe còn tốt mà, chưa cần sửa đâu con");
    let src: PaySource = "cash";
    await this.prisma.$transaction(async (tx) => {
      src = await this.payment.payOut(tx, playerId, cost, SYSTEM.supplier, "repair", biz.id, pay);
      await tx.business.update({ where: { id: biz.id }, data: { wear: 0 } });
      await addToReport(tx, playerId, room.day, { fees: cost });
    });
    this.broadcast.paidBy(playerId, src, cost);
    void this.broadcast.log(playerId, "repair", { cost, wear: biz.wear });
    this.broadcast.say(room.id, {
      who: "vua_xe",
      text: `Sửa xong rồi, chạy ngon như mới! Hết ${cost.toLocaleString("vi-VN")}đ nha con.`,
    });
  }

  /**
   * Điện nước của tiệm (Luật 2.2): mỗi giờ tiệm (nhà mặt tiền) mở cửa trả một khoản; hết tiền mặt thì trừ tài khoản;
   * hết cả hai thì tiệm phải đóng cửa.
   */
  async chargeUtilities(room: RoomRuntime) {
    const perHour = content.economy.fees.utilitiesPerHour;
    if (perHour <= 0) return;
    const open = await this.prisma.business.findMany({
      where: { ownerId: { in: [...room.members.keys()] }, status: "OPEN", lotId: { not: null } },
    });
    for (const b of open) {
      if (content.lot(b.lotId ?? "").kind !== "house") continue;
      let paid = false;
      for (const from of [playerWallet(b.ownerId), bankWallet(b.ownerId)]) {
        try {
          await this.prisma.$transaction(async (tx) => {
            await this.ledger.transfer(tx, from, SYSTEM.landlord, perHour, "utilities", b.id);
            await addToReport(tx, b.ownerId, room.day, { utilities: perHour });
          });
          paid = true;
          break;
        } catch (err) {
          if (!(err instanceof InsufficientFundsError)) throw err;
        }
      }
      if (!paid) {
        await this.closeAllFor(room, b.ownerId);
        this.broadcast.world(room);
        this.broadcast.notify(b.ownerId, {
          kind: "warn",
          text: "Hết tiền đóng điện nước — tiệm phải tạm đóng cửa.",
        });
      }
      this.broadcast.me(b.ownerId);
    }
  }

  async closeBusiness({ room, playerId }: IntentContext) {
    const biz = await this.businesses.require(playerId);
    // Chủ tự đóng thì nhân viên không mở lại trong ngày (tới ca hôm sau mới mở).
    this.staffOpened.add(`${biz.id}:${room.day}`);
    await this.prisma.business.update({ where: { id: biz.id }, data: { status: "CLOSED" } });
    this.orders.dropFor(room, biz.id);
    this.broadcast.world(room);
  }

  /** Client báo nhân vật đang đứng ở quầy hay đã đi chỗ khác. */
  async attend({ room, playerId }: IntentContext, on: boolean) {
    // Đứng ở quầy = đứng ở cửa hàng đang quản lý (client báo khi tới đúng chỗ của cửa hàng đó).
    const biz = on ? await this.businesses.of(playerId) : null;
    if (biz) room.attending.set(playerId, biz.id);
    else room.attending.delete(playerId);
  }

  async closeAllFor(room: RoomRuntime, playerId: string) {
    const open = await this.prisma.business.findMany({
      where: { ownerId: playerId, status: "OPEN" },
    });
    for (const b of open) this.orders.dropFor(room, b.id);
    await this.prisma.business.updateMany({
      where: { ownerId: playerId, status: "OPEN" },
      data: { status: "CLOSED" },
    });
  }

  /** Ghi sự kiện đo lường (DESIGN §16), không chặn luồng chơi nếu lỗi. */
  /** Gửi MeView mới cho người chơi (sau intent không trả MeView mà đổi tiền / kho). */

  // ───────────── Nhiều cửa hàng (docs/IA.md bước D) ─────────────

  /** Chọn cửa hàng đang quản lý; đang đứng quầy cửa hàng cũ thì thôi đứng (đứng quầy theo đúng cửa hàng). */
  async select({ room, playerId }: IntentContext, businessId: string) {
    const biz = await this.businesses.select(playerId, businessId);
    if (room.attending.has(playerId) && room.attending.get(playerId) !== biz.id)
      room.attending.delete(playerId);
  }

  /**
   * Chuyển hàng từ cửa hàng đang quản lý sang cửa hàng khác của mình: lấy lô cũ trước (giữ ngày nhập để hạn dùng
   * đúng), hàng tới sau `transferMinutes` phút game — đang chở thì cửa hàng nào cũng chưa bán được.
   */
  async transferStock(
    { room, playerId }: IntentContext,
    p: { toId: string; itemId: string; qty: number },
  ) {
    const from = await this.businesses.require(playerId);
    const to = await this.prisma.business.findUnique({ where: { id: p.toId } });
    if (!to || to.ownerId !== playerId)
      throw new GameError("invalid_payload", "Không phải cửa hàng của bạn");
    if (to.id === from.id) throw new GameError("invalid_payload", "Chọn cửa hàng khác để chuyển");
    const arriveAt = absMinute(room.day, room.minute) + content.economy.transferMinutes;
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.inventoryItem.findMany({
        where: { businessId: from.id, itemId: p.itemId },
      });
      const have = rows.reduce((n, r) => n + r.qty, 0);
      if (have < p.qty)
        throw new GameError("invalid_state", `Kho chỉ còn ${have} — không đủ ${p.qty} để chuyển`);
      const { taken } = takeFifo(rows, p.qty);
      await consume(tx, from.id, new Map([[p.itemId, p.qty]]));
      for (const b of taken)
        await tx.stockTransfer.create({
          data: {
            ownerId: playerId,
            fromId: from.id,
            toId: to.id,
            itemId: p.itemId,
            batchDay: b.batchDay,
            qty: b.qty,
            arriveAt,
          },
        });
    });
    void this.broadcast.log(playerId, "stock_transfer", { itemId: p.itemId, qty: p.qty });
    this.broadcast.stockChanged(room);
  }

  /** Mỗi phút: hàng chuyển đã tới nơi thì nhập kho cửa hàng nhận, báo chủ. */
  async deliverTransfers(room: RoomRuntime) {
    const now = absMinute(room.day, room.minute);
    const due = await this.prisma.stockTransfer.findMany({
      where: { ownerId: { in: [...room.members.keys()] }, arriveAt: { lte: now } },
    });
    if (!due.length) return;
    const owners = new Set<string>();
    for (const t of due) {
      await this.prisma.$transaction(async (tx) => {
        const to = await tx.business.findUnique({ where: { id: t.toId } });
        if (to) await addItems(tx, to, t.itemId, t.batchDay, t.qty);
        await tx.stockTransfer.delete({ where: { id: t.id } });
      });
      owners.add(t.ownerId);
    }
    for (const id of owners) {
      this.broadcast.notify(id, { kind: "good", text: "📦 Hàng chuyển kho đã tới cửa hàng" });
      this.broadcast.me(id);
    }
    this.broadcast.stockChanged(room);
  }

  /**
   * ⬆️ Nâng cấp tiệm (docs/IA.md bước E): mở rộng, sửa sang — tốn tiền (money sink) → đông khách hơn, thuê thêm người.
   * Chỉ nhà mặt tiền đang thuê, đóng cửa mới sửa được.
   */
  async upgrade({ room, playerId }: IntentContext, pay?: PayMethod) {
    const biz = await this.businesses.require(playerId);
    const lotKind = biz.lotId ? content.lot(biz.lotId).kind : null;
    const next = nextShopLevel(content, biz.level, lotKind);
    if (!next)
      throw new GameError(
        "invalid_state",
        lotKind === "house"
          ? "Tiệm đã ở cấp cao nhất rồi"
          : lotKind === "stall"
            ? "Sạp trên ô đất: mua đứt ô rồi xây tiệm (📍 Chỗ bán) để lên cấp"
            : "Xe đẩy vỉa hè không nâng cấp được — thuê nhà mặt tiền trước (🏠 Thuê nhà & giấy tờ)",
      );
    if (biz.status === "OPEN")
      throw new GameError("invalid_state", "Đóng cửa rồi mới sửa sang tiệm");
    let src: PaySource = "cash";
    await this.prisma.$transaction(async (tx) => {
      src = await this.payment.payOut(
        tx,
        playerId,
        next.upgradeCost,
        SYSTEM.supplier,
        "shop_upgrade",
        biz.id,
        pay,
      );
      await tx.business.update({ where: { id: biz.id }, data: { level: next.level } });
      await addToReport(tx, playerId, room.day, { fees: next.upgradeCost });
      await tx.gameEvent.create({
        data: {
          playerId,
          type: "shop_upgrade",
          payload: { level: next.level, cost: next.upgradeCost },
        },
      });
    });
    this.broadcast.paidBy(playerId, src, next.upgradeCost);
    this.broadcast.notify(playerId, {
      kind: "good",
      text: `${next.emoji} Tiệm lên cấp ${next.level}: ${next.name} — khách đông hơn, thuê được ${next.maxStaff} người`,
    });
    await this.story.note(
      playerId,
      "shop_level",
      room.day,
      { name: next.name },
      { suffix: `${biz.id}:${next.level}` },
    );
    this.broadcast.world(room);
  }
}
