import { randomUUID } from "node:crypto";
import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { content } from "@xom/content";
import type {
  ClockView,
  DayReportView,
  JobTaskEvent,
  MarketView,
  MeView,
  NotifyEvent,
  OrderResultEvent,
  SaleEvent,
  Snapshot,
  WorldView,
} from "@xom/shared";
import {
  LOST_WEIGHT,
  marketPrice,
  nextReputation,
  pickArchetype,
  seededRandom,
  simulateTick,
  spoilage,
  takeFifo,
} from "@xom/sim";
import {
  InsufficientFundsError,
  LedgerService,
  playerWallet,
  SYSTEM,
  type Tx,
} from "../economy/ledger.service.js";
import type { Business } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { GameError, RoomRuntime } from "./room.js";

/** 1 giây thật = 1 phút game (docs/PLAN.md §3.2). */
const TICK_MS = Number(process.env.GAME_TICK_MS ?? 1000);
/** Rời game quá thời gian này thì quầy tự đóng. */
const LEAVE_GRACE_MS = 30_000;
const EQUIPMENT_RESALE = 0.5;

/** Cổng phát sự kiện ra socket; gateway cung cấp để service không phụ thuộc Socket.IO. */
export interface GameEmitter {
  toRoom(roomId: string, event: "clock", data: ClockView): void;
  toRoom(roomId: string, event: "world", data: WorldView): void;
  toRoom(roomId: string, event: "sale", data: SaleEvent): void;
  toRoom(roomId: string, event: "notify", data: NotifyEvent): void;
  toRoom(roomId: string, event: "orderResult", data: OrderResultEvent): void;
  toPlayer(playerId: string, event: "me", data: MeView): void;
  toPlayer(playerId: string, event: "dayEnd", data: DayReportView): void;
  toPlayer(playerId: string, event: "snapshot", data: Snapshot): void;
  toPlayer(playerId: string, event: "notify", data: NotifyEvent): void;
  toPlayer(playerId: string, event: "jobTask", data: JobTaskEvent): void;
}

const pick = <T>(list: readonly T[], rand: () => number): T =>
  list[Math.floor(rand() * list.length)] ?? (list[0] as T);

@Injectable()
export class GameService implements OnModuleDestroy {
  private readonly logger = new Logger(GameService.name);
  private readonly rooms = new Map<string, RoomRuntime>();
  private readonly roomOfPlayer = new Map<string, string>();
  private emitter?: GameEmitter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  setEmitter(emitter: GameEmitter) {
    this.emitter = emitter;
  }

  // ───────────────────────── Vòng đời xóm ─────────────────────────

  /** Người chơi kết nối: nạp xóm (nếu chưa chạy), gắn socket, trả snapshot. */
  async join(playerId: string, socketId: string): Promise<{ roomId: string; snapshot: Snapshot }> {
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    if (!player.roomId) throw new GameError("invalid_state", "Người chơi chưa có xóm");
    const room = await this.loadRoom(player.roomId);
    let member = room.members.get(playerId);
    if (!member) {
      member = { playerId, displayName: player.displayName, sockets: new Set() };
      room.members.set(playerId, member);
    }
    clearTimeout(member.leaveTimer);
    member.sockets.add(socketId);
    this.roomOfPlayer.set(playerId, room.id);
    const snapshot = await room.run(() => this.snapshot(room, playerId));
    return { roomId: room.id, snapshot };
  }

  leave(playerId: string, socketId: string) {
    const room = this.roomFor(playerId);
    const member = room?.members.get(playerId);
    if (!room || !member) return;
    member.sockets.delete(socketId);
    if (member.sockets.size > 0) return;
    // Mất kết nối = không còn đứng ở quầy: ngừng bán ngay, đóng quầy sau thời gian ân hạn.
    room.attending.delete(playerId);
    member.leaveTimer = setTimeout(() => {
      void room.run(async () => {
        if (member.sockets.size > 0) return;
        await this.closeAllFor(playerId);
        await this.prisma.player.update({ where: { id: playerId }, data: { jobId: null } });
        room.members.delete(playerId);
        this.roomOfPlayer.delete(playerId);
        this.emitWorld(room);
        if (room.members.size === 0) await this.unloadRoom(room);
      });
    }, LEAVE_GRACE_MS);
  }

  async onModuleDestroy() {
    for (const room of this.rooms.values()) {
      clearInterval(room.timer);
      await this.persistClock(room);
    }
  }

  private async loadRoom(roomId: string): Promise<RoomRuntime> {
    const existing = this.rooms.get(roomId);
    if (existing) return existing;
    const row = await this.prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    const room = new RoomRuntime(row.id, row.day, row.minute);
    this.rooms.set(room.id, room);
    room.timer = setInterval(() => room.runTick(() => this.tick(room)), TICK_MS);
    this.logger.log(`xóm ${room.id} chạy (ngày ${room.day})`);
    return room;
  }

  private async unloadRoom(room: RoomRuntime) {
    clearInterval(room.timer);
    await this.persistClock(room);
    this.rooms.delete(room.id);
    this.logger.log(`xóm ${room.id} nghỉ`);
  }

  private persistClock(room: RoomRuntime) {
    return this.prisma.room.update({
      where: { id: room.id },
      data: { day: room.day, minute: room.minute },
    });
  }

  private roomFor(playerId: string): RoomRuntime | undefined {
    const id = this.roomOfPlayer.get(playerId);
    return id ? this.rooms.get(id) : undefined;
  }

  // ───────────────────────── Intent ─────────────────────────

  /** Chạy một intent của người chơi trong hàng đợi của xóm, trả về MeView mới. */
  async intent(playerId: string, fn: (ctx: IntentContext) => Promise<void>): Promise<MeView> {
    const room = this.roomFor(playerId);
    if (!room) throw new GameError("invalid_state", "Chưa vào xóm");
    return room.run(async () => {
      try {
        await fn({ room, playerId });
      } catch (err) {
        if (err instanceof InsufficientFundsError) {
          throw new GameError("insufficient_funds", "Không đủ tiền");
        }
        throw err;
      }
      return this.me(room, playerId);
    });
  }

  async buyEquipment({ room, playerId }: IntentContext, equipmentId: string) {
    const eq = content.equipmentById.get(equipmentId);
    if (!eq) throw new GameError("invalid_payload", "Không có thiết bị này");
    const current = await this.businessOf(playerId);
    if (current?.status === "OPEN")
      throw new GameError("invalid_state", "Đóng quầy trước khi đổi nghề");
    if (current?.equipmentId === equipmentId)
      throw new GameError("invalid_state", `Bạn đã có ${eq.name}`);
    const productId = eq.products[0] ?? "";
    const product = content.product(productId);
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
      await this.ledger.transfer(
        tx,
        playerWallet(playerId),
        SYSTEM.supplier,
        eq.price,
        "equipment_buy",
        eq.id,
      );
      await tx.business.create({
        data: {
          ownerId: playerId,
          equipmentId: eq.id,
          productId,
          price: product.refPrice,
          reputation: content.economy.startingReputation,
        },
      });
      await this.event(tx, playerId, "equipment_buy", {
        equipmentId,
        replaced: current?.equipmentId ?? null,
      });
    });
    this.emitWorld(room);
  }

  async marketBuy({ room, playerId }: IntentContext, productId: string, qty: number) {
    const product = content.productById.get(productId);
    if (!product) throw new GameError("invalid_payload", "Không có mặt hàng này");
    const unit = marketPrice(product, room.day, content.economy.marketPriceSwing);
    const total = unit * qty;
    await this.prisma.$transaction(async (tx) => {
      await this.ledger.transfer(
        tx,
        playerWallet(playerId),
        SYSTEM.market,
        total,
        "market_buy",
        productId,
      );
      await tx.inventoryItem.upsert({
        where: { playerId_productId_batchDay: { playerId, productId, batchDay: room.day } },
        create: { playerId, productId, batchDay: room.day, qty },
        update: { qty: { increment: qty } },
      });
      await this.addToReport(tx, playerId, room.day, { stockCost: total });
    });
  }

  async updateBusiness(
    { room, playerId }: IntentContext,
    patch: { price?: number; lotId?: string },
  ) {
    const biz = await this.requireBusiness(playerId);
    if (patch.lotId !== undefined && patch.lotId !== biz.lotId) {
      if (!content.lotById.has(patch.lotId))
        throw new GameError("invalid_payload", "Không có chỗ này");
      if (biz.status === "OPEN")
        throw new GameError("invalid_state", "Đóng quầy rồi mới chuyển chỗ");
      const taken = this.occupants(room).find((o) => o.lotId === patch.lotId);
      if (taken) throw new GameError("invalid_state", `Chỗ này ${taken.ownerName} đang dùng`);
    }
    await this.prisma.business.update({ where: { id: biz.id }, data: patch });
    this.emitWorld(room);
  }

  async openBusiness({ room, playerId }: IntentContext) {
    const biz = await this.requireBusiness(playerId);
    if (biz.status === "OPEN") return;
    if (!biz.lotId) throw new GameError("invalid_state", "Chọn chỗ bán trước đã");
    if (!room.attending.has(playerId))
      throw new GameError("invalid_state", "Tới tận quầy rồi mới mở hàng được");
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    if (player.jobId)
      throw new GameError("invalid_state", "Bạn đang đi làm thuê — nghỉ việc rồi mới mở quầy");
    const stock = await this.stockOf(playerId, biz.productId);
    if (stock <= 0) throw new GameError("invalid_state", "Chưa có hàng — ra chợ nhập hàng trước");
    const lot = content.lot(biz.lotId);
    await this.prisma.$transaction(async (tx) => {
      const paid = biz.rentPaidDay === room.day && biz.rentLotId === lot.id;
      if (!paid) {
        await this.ledger.transfer(
          tx,
          playerWallet(playerId),
          SYSTEM.landlord,
          lot.rentPerDay,
          "rent",
          lot.id,
        );
        await this.addToReport(tx, playerId, room.day, { rent: lot.rentPerDay });
      }
      await tx.business.update({
        where: { id: biz.id },
        data: { status: "OPEN", rentPaidDay: room.day, rentLotId: lot.id },
      });
    });
    this.emitWorld(room);
  }

  async closeBusiness({ room, playerId }: IntentContext) {
    const biz = await this.requireBusiness(playerId);
    await this.prisma.business.update({ where: { id: biz.id }, data: { status: "CLOSED" } });
    this.emitWorld(room);
  }

  async startJob({ playerId }: IntentContext, jobId: string) {
    if (!content.jobById.has(jobId)) throw new GameError("invalid_payload", "Không có việc này");
    const biz = await this.businessOf(playerId);
    if (biz?.status === "OPEN")
      throw new GameError("invalid_state", "Đóng quầy rồi mới đi làm thuê được");
    await this.prisma.player.update({ where: { id: playerId }, data: { jobId } });
  }

  async stopJob({ room, playerId }: IntentContext) {
    await this.prisma.player.update({ where: { id: playerId }, data: { jobId: null } });
    for (const [id, t] of room.jobTasks) if (t.playerId === playerId) room.jobTasks.delete(id);
  }

  /** Client báo nhân vật đang đứng ở quầy hay đã đi chỗ khác. */
  async attend({ room, playerId }: IntentContext, on: boolean) {
    if (on) room.attending.add(playerId);
    else room.attending.delete(playerId);
  }

  /** "Đưa hàng" cho khách đang chờ: kịp giờ thì có tiền boa và uy tín. */
  async serveOrder({ room, playerId }: IntentContext, orderId: string) {
    const order = room.orders.get(orderId);
    if (!order || order.ownerId !== playerId)
      throw new GameError("invalid_state", "Khách này không còn chờ");
    room.orders.delete(orderId);
    if (order.expiresAt < Date.now()) throw new GameError("invalid_state", "Khách đã bỏ đi rồi");
    if (!room.attending.has(playerId))
      throw new GameError("invalid_state", "Phải đứng ở quầy mới đưa hàng được");
    const eco = content.economy;
    const tip = Math.max(1_000, Math.round((order.value * eco.tipRate) / 500) * 500);
    await this.prisma.$transaction(async (tx) => {
      await this.ledger.transfer(
        tx,
        SYSTEM.customers,
        playerWallet(playerId),
        tip,
        "tip",
        order.businessId,
      );
      const biz = await tx.business.findUnique({ where: { id: order.businessId } });
      if (biz) {
        await tx.business.update({
          where: { id: biz.id },
          data: { reputation: Math.min(1, biz.reputation + eco.serveReputationBonus) },
        });
      }
      await this.addToReport(tx, playerId, room.day, { tips: tip });
    });
    const rand = seededRandom("thanks", orderId);
    this.emitter?.toRoom(room.id, "orderResult", {
      orderId,
      served: true,
      tip,
      line: pick(content.data.customerLines.thanks, rand),
    });
  }

  /** Làm kịp việc vặt khi đang làm thuê: thưởng thêm. */
  async completeJobTask({ room, playerId }: IntentContext, taskId: string) {
    const task = room.jobTasks.get(taskId);
    if (!task || task.playerId !== playerId)
      throw new GameError("invalid_state", "Việc này xong rồi");
    room.jobTasks.delete(taskId);
    if (task.expiresAt < Date.now())
      throw new GameError("invalid_state", "Chậm mất rồi, người khác làm thay");
    const bonus = content.economy.jobTaskBonus;
    await this.prisma.$transaction(async (tx) => {
      await this.ledger.transfer(
        tx,
        SYSTEM.employer,
        playerWallet(playerId),
        bonus,
        "job_bonus",
        taskId,
      );
      await this.addToReport(tx, playerId, room.day, { wages: bonus });
    });
  }

  /** Lưu tiến độ kịch bản người mới. */
  async setTutorial({ playerId }: IntentContext, step: string) {
    if (!content.stepById.has(step))
      throw new GameError("invalid_payload", "Bước kịch bản không tồn tại");
    await this.prisma.player.update({ where: { id: playerId }, data: { tutorial: step } });
  }

  // ───────────────────────── Tick ─────────────────────────

  private async tick(room: RoomRuntime) {
    try {
      room.minute += 1;
      const eco = content.economy;
      if (room.minute >= eco.dayEndMinute) {
        await this.endDay(room);
      } else {
        if (room.minute % eco.economyTickMinutes === 0) await this.economyTick(room);
        if (room.minute % 60 === 0) await this.payWages(room);
        if (room.minute % eco.jobTaskEveryMinutes === eco.jobTaskEveryMinutes / 2) {
          await this.spawnJobTasks(room);
        }
        this.expirePending(room);
        if (room.minute % 10 === 0) await this.persistClock(room);
      }
      this.emitter?.toRoom(room.id, "clock", { day: room.day, minute: room.minute });
    } catch (err) {
      this.logger.error(`tick xóm ${room.id} lỗi`, err as Error);
    }
  }

  private async economyTick(room: RoomRuntime) {
    const eco = content.economy;
    const memberIds = [...room.members.keys()];
    // Quầy chỉ bán khi chủ đang đứng ở quầy (docs/PLAN.md Phase 1.5).
    const businesses = await this.prisma.business.findMany({
      where: {
        ownerId: { in: memberIds.filter((id) => room.attending.has(id)) },
        status: "OPEN",
        lotId: { not: null },
      },
    });
    if (businesses.length === 0) return;
    const stock = new Map<string, number>();
    for (const b of businesses) stock.set(b.id, await this.stockOf(b.ownerId, b.productId));

    const results = simulateTick({
      content,
      day: room.day,
      minuteOfDay: room.minute,
      minutes: eco.economyTickMinutes,
      shops: businesses.map((b) => ({
        id: b.id,
        productId: b.productId,
        lotId: b.lotId ?? "",
        price: b.price,
        reputation: b.reputation,
        stock: stock.get(b.id) ?? 0,
        capacityPerHour: content.equipment(b.equipmentId).capacityPerHour,
        demandCarry: b.demandCarry,
      })),
    });

    for (const r of results) {
      const b = businesses.find((x) => x.id === r.id);
      if (!b) continue;
      const lost = r.lostStock + r.lostCapacity;
      const customers = r.sold + lost;
      const weight = r.sold + lost * LOST_WEIGHT;
      // Bán hết thì tự dọn quầy: không để khách tới rồi về tay không cả ngày.
      const soldOut = (stock.get(b.id) ?? 0) - r.sold <= 0;
      const reputation = nextReputation(b.reputation, r.satisfaction, weight, eco.reputationRate);
      await this.prisma.$transaction(async (tx) => {
        if (r.sold > 0) {
          await this.removeStock(tx, b.ownerId, b.productId, r.sold);
          await this.ledger.transfer(
            tx,
            SYSTEM.customers,
            playerWallet(b.ownerId),
            r.sold * b.price,
            "sale",
            b.id,
          );
        }
        await tx.business.update({
          where: { id: b.id },
          data: {
            reputation,
            demandCarry: r.demandCarry,
            ...(soldOut ? { status: "CLOSED" as const } : {}),
          },
        });
        if (customers > 0) {
          await this.addToReport(tx, b.ownerId, room.day, {
            revenue: r.sold * b.price,
            served: r.sold,
            lost,
            satisfaction: { value: r.satisfaction, weight },
          });
        }
      });
      if (r.sold > 0) {
        // Mỗi lượt bán thành một "đơn" chờ chủ quầy đưa hàng — kịp thì khách boa thêm.
        const product = content.product(b.productId);
        const rand = seededRandom("npc", b.id, room.day, room.minute);
        const ratio = b.price / product.refPrice;
        const lines = content.data.customerLines;
        const line = pick(
          ratio < 0.9 ? lines.cheap : ratio > 1.15 ? lines.pricey : lines.fair,
          rand,
        );
        const order = {
          id: randomUUID(),
          ownerId: b.ownerId,
          businessId: b.id,
          qty: r.sold,
          value: r.sold * b.price,
          expiresAt: Date.now() + eco.serveWindowMs,
        };
        room.orders.set(order.id, order);
        this.emitter?.toRoom(room.id, "sale", {
          orderId: order.id,
          businessId: b.id,
          ownerId: b.ownerId,
          lotId: b.lotId ?? "",
          productId: b.productId,
          qty: r.sold,
          archetype: pickArchetype(content, product.category, rand),
          line,
          expiresAt: order.expiresAt,
        });
      }
      if (soldOut) {
        this.emitter?.toPlayer(b.ownerId, "notify", {
          kind: "good",
          text: "Bán hết hàng! Quầy tạm dọn — ra chợ nhập thêm rồi mở lại.",
        });
        this.emitWorld(room);
      }
      if (customers > 0) this.emitter?.toPlayer(b.ownerId, "me", await this.me(room, b.ownerId));
    }
  }

  /** Làm thuê: định kỳ có việc vặt, làm kịp được thưởng. */
  private async spawnJobTasks(room: RoomRuntime) {
    const workers = await this.prisma.player.findMany({
      where: { id: { in: [...room.members.keys()] }, jobId: { not: null } },
    });
    for (const w of workers) {
      const jobId = w.jobId ?? "";
      const texts = content.data.jobTasks[jobId];
      if (!texts) continue;
      const task = {
        id: randomUUID(),
        playerId: w.id,
        expiresAt: Date.now() + content.economy.serveWindowMs,
      };
      room.jobTasks.set(task.id, task);
      const text = pick(texts, seededRandom("job", w.id, room.day, room.minute));
      this.emitter?.toPlayer(w.id, "jobTask", {
        id: task.id,
        jobId,
        text,
        expiresAt: task.expiresAt,
      });
    }
  }

  /** Khách chờ quá lâu thì bỏ đi (tiền đã trả, chỉ mất boa); việc vặt quá hạn thì hủy. */
  private expirePending(room: RoomRuntime) {
    const now = Date.now();
    for (const [id, order] of room.orders) {
      if (order.expiresAt > now) continue;
      room.orders.delete(id);
      this.emitter?.toRoom(room.id, "orderResult", {
        orderId: id,
        served: false,
        tip: 0,
        line: pick(content.data.customerLines.impatient, seededRandom("late", id)),
      });
    }
    for (const [id, task] of room.jobTasks) if (task.expiresAt <= now) room.jobTasks.delete(id);
  }

  private async payWages(room: RoomRuntime) {
    const workers = await this.prisma.player.findMany({
      where: { id: { in: [...room.members.keys()] }, jobId: { not: null } },
    });
    for (const w of workers) {
      const job = content.job(w.jobId ?? "");
      await this.prisma.$transaction(async (tx) => {
        await this.ledger.transfer(
          tx,
          SYSTEM.employer,
          playerWallet(w.id),
          job.wagePerHour,
          "wage",
          job.id,
        );
        await this.addToReport(tx, w.id, room.day, { wages: job.wagePerHour });
      });
      this.emitter?.toPlayer(w.id, "me", await this.me(room, w.id));
    }
  }

  /** Cuối ngày: đóng quầy, hủy hàng hỏng, chốt báo cáo, sang ngày mới lúc 6:00. */
  private async endDay(room: RoomRuntime) {
    const day = room.day;
    room.orders.clear();
    room.jobTasks.clear();
    for (const playerId of room.members.keys()) {
      await this.closeAllFor(playerId);
      const report = await this.prisma.$transaction(async (tx) => {
        await tx.player.update({ where: { id: playerId }, data: { jobId: null } });
        const batches = await tx.inventoryItem.findMany({ where: { playerId } });
        const { spoiled } = spoilage(content, batches, day);
        let spoiledQty = 0;
        let spoiledValue = 0;
        for (const s of spoiled) {
          spoiledQty += s.qty;
          spoiledValue += s.qty * content.product(s.productId).unitCost;
        }
        if (spoiled.length) {
          await tx.inventoryItem.deleteMany({
            where: { id: { in: batches.filter((b) => spoiled.includes(b)).map((b) => b.id) } },
          });
        }
        const biz = await tx.business.findFirst({ where: { ownerId: playerId } });
        const moneyEnd = BigInt(await this.ledger.balance(tx, playerWallet(playerId)));
        const row = await tx.dailyReport.upsert({
          where: { playerId_day: { playerId, day } },
          create: {
            ...emptyReport(),
            playerId,
            day,
            spoiledQty,
            spoiledValue,
            reputation: biz?.reputation ?? 0,
            moneyEnd,
          },
          update: { spoiledQty, spoiledValue, reputation: biz?.reputation ?? 0, moneyEnd },
        });
        await this.event(tx, playerId, "day_end", {
          day,
          revenue: row.revenue,
          moneyEnd: Number(moneyEnd),
        });
        return row;
      });
      this.emitter?.toPlayer(playerId, "dayEnd", {
        day,
        revenue: report.revenue,
        tips: report.tips,
        stockCost: report.stockCost,
        rent: report.rent,
        wages: report.wages,
        spoiledQty: report.spoiledQty,
        spoiledValue: report.spoiledValue,
        served: report.served,
        lost: report.lost,
        satisfaction: report.satisfaction,
        reputation: report.reputation,
        profit: report.revenue + report.tips + report.wages - report.stockCost - report.rent,
        moneyEnd: Number(report.moneyEnd),
      });
    }
    room.day += 1;
    room.minute = content.economy.dayStartMinute;
    await this.persistClock(room);
    this.emitWorld(room);
    for (const playerId of room.members.keys()) {
      this.emitter?.toPlayer(playerId, "snapshot", await this.snapshot(room, playerId));
    }
  }

  // ───────────────────────── View ─────────────────────────

  async snapshot(room: RoomRuntime, playerId: string): Promise<Snapshot> {
    return {
      me: await this.me(room, playerId),
      clock: { day: room.day, minute: room.minute },
      world: { lots: this.occupantsCache.get(room.id) ?? (await this.refreshOccupants(room)) },
      market: this.market(room.day),
    };
  }

  async me(room: RoomRuntime, playerId: string): Promise<MeView> {
    const [player, biz, inventory, report, money] = await Promise.all([
      this.prisma.player.findUniqueOrThrow({ where: { id: playerId } }),
      this.businessOf(playerId),
      this.prisma.inventoryItem.groupBy({
        by: ["productId"],
        where: { playerId },
        _sum: { qty: true },
      }),
      this.prisma.dailyReport.findUnique({ where: { playerId_day: { playerId, day: room.day } } }),
      this.ledger.balance(this.prisma, playerWallet(playerId)),
    ]);
    return {
      playerId,
      displayName: player.displayName,
      money,
      jobId: player.jobId,
      tutorial: player.tutorial,
      attending: room.attending.has(playerId),
      business: biz
        ? {
            id: biz.id,
            equipmentId: biz.equipmentId,
            productId: biz.productId,
            lotId: biz.lotId,
            price: biz.price,
            open: biz.status === "OPEN",
            reputation: biz.reputation,
            rentPaidToday: biz.rentPaidDay === room.day && biz.rentLotId === biz.lotId,
          }
        : null,
      inventory: inventory
        .map((i) => ({ productId: i.productId, qty: i._sum.qty ?? 0 }))
        .filter((i) => i.qty > 0),
      today: {
        sold: report?.served ?? 0,
        revenue: report?.revenue ?? 0,
        tips: report?.tips ?? 0,
        lost: report?.lost ?? 0,
        stockCost: report?.stockCost ?? 0,
        wages: report?.wages ?? 0,
      },
    };
  }

  market(day: number): MarketView {
    const prices: Record<string, number> = {};
    for (const p of content.data.products) {
      prices[p.id] = marketPrice(p, day, content.economy.marketPriceSwing);
    }
    return { day, prices };
  }

  // ───────────────────────── Tiện ích ─────────────────────────

  private readonly occupantsCache = new Map<string, WorldView["lots"]>();

  private occupants(room: RoomRuntime): WorldView["lots"] {
    return this.occupantsCache.get(room.id) ?? [];
  }

  private async refreshOccupants(room: RoomRuntime): Promise<WorldView["lots"]> {
    const businesses = await this.prisma.business.findMany({
      where: { ownerId: { in: [...room.members.keys()] }, lotId: { not: null } },
      include: { owner: true },
    });
    const lots = businesses.map((b) => ({
      lotId: b.lotId ?? "",
      businessId: b.id,
      ownerName: b.owner.displayName,
      equipmentId: b.equipmentId,
      productId: b.productId,
      open: b.status === "OPEN",
    }));
    this.occupantsCache.set(room.id, lots);
    return lots;
  }

  private emitWorld(room: RoomRuntime) {
    void this.refreshOccupants(room).then((lots) =>
      this.emitter?.toRoom(room.id, "world", { lots }),
    );
  }

  private async closeAllFor(playerId: string) {
    await this.prisma.business.updateMany({
      where: { ownerId: playerId, status: "OPEN" },
      data: { status: "CLOSED" },
    });
  }

  private businessOf(playerId: string): Promise<Business | null> {
    return this.prisma.business.findFirst({ where: { ownerId: playerId } });
  }

  private async requireBusiness(playerId: string): Promise<Business> {
    const biz = await this.businessOf(playerId);
    if (!biz) throw new GameError("invalid_state", "Bạn chưa có quầy hàng");
    return biz;
  }

  private async stockOf(playerId: string, productId: string): Promise<number> {
    const agg = await this.prisma.inventoryItem.aggregate({
      where: { playerId, productId },
      _sum: { qty: true },
    });
    return agg._sum.qty ?? 0;
  }

  /** Xuất kho FIFO theo lô nhập. */
  private async removeStock(tx: Tx, playerId: string, productId: string, qty: number) {
    const rows = await tx.inventoryItem.findMany({ where: { playerId, productId } });
    const { batches } = takeFifo(rows, qty);
    for (const row of rows) {
      const left = batches.find((b) => b.batchDay === row.batchDay)?.qty ?? 0;
      if (left === 0) await tx.inventoryItem.delete({ where: { id: row.id } });
      else if (left !== row.qty)
        await tx.inventoryItem.update({ where: { id: row.id }, data: { qty: left } });
    }
  }

  private async addToReport(
    tx: Tx,
    playerId: string,
    day: number,
    add: {
      revenue?: number;
      tips?: number;
      stockCost?: number;
      rent?: number;
      wages?: number;
      served?: number;
      lost?: number;
      satisfaction?: { value: number; weight: number };
    },
  ) {
    const current = await tx.dailyReport.findUnique({ where: { playerId_day: { playerId, day } } });
    let satisfaction = current?.satisfaction ?? 0;
    if (add.satisfaction) {
      const before = (current?.served ?? 0) + (current?.lost ?? 0) * LOST_WEIGHT;
      satisfaction =
        (satisfaction * before + add.satisfaction.value * add.satisfaction.weight) /
        (before + add.satisfaction.weight);
    }
    const inc = {
      revenue: add.revenue ?? 0,
      tips: add.tips ?? 0,
      stockCost: add.stockCost ?? 0,
      rent: add.rent ?? 0,
      wages: add.wages ?? 0,
      served: add.served ?? 0,
      lost: add.lost ?? 0,
    };
    await tx.dailyReport.upsert({
      where: { playerId_day: { playerId, day } },
      create: { ...emptyReport(), ...inc, satisfaction, playerId, day },
      update: {
        revenue: { increment: inc.revenue },
        tips: { increment: inc.tips },
        stockCost: { increment: inc.stockCost },
        rent: { increment: inc.rent },
        wages: { increment: inc.wages },
        served: { increment: inc.served },
        lost: { increment: inc.lost },
        satisfaction,
      },
    });
  }

  private event(tx: Tx, playerId: string, type: string, payload: Record<string, unknown>) {
    return tx.gameEvent.create({ data: { playerId, type, payload: payload as object } });
  }
}

export interface IntentContext {
  room: RoomRuntime;
  playerId: string;
}

function emptyReport() {
  return {
    revenue: 0,
    tips: 0,
    stockCost: 0,
    rent: 0,
    wages: 0,
    spoiledQty: 0,
    spoiledValue: 0,
    served: 0,
    lost: 0,
    satisfaction: 0,
    reputation: 0,
    moneyEnd: 0n,
  };
}
