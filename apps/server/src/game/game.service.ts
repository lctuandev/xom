import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { content } from "@xom/content";
import type {
  ClockView,
  DayReportView,
  MeView,
  MovePayload,
  NotifyEvent,
  PeerPos,
  RosterView,
  SayEvent,
  Snapshot,
  TalkResult,
  WorldView,
} from "@xom/shared";
import {
  customerArrivals,
  marketPackPrice,
  menuPriceRatio,
  seededRandom,
  spoilage,
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
import { addItems, inventoryView } from "./inventory.js";
import { menuOf, patchMenu } from "./menu.js";
import { OrderService } from "./orders.js";
import { addToReport, emptyReport } from "./report.js";
import { GameError, RoomRuntime } from "./room.js";
import { WorkService } from "./work.js";

/** 1 giây thật = 1 phút game (docs/PLAN.md §3.2). */
const TICK_MS = Number(process.env.GAME_TICK_MS ?? 1000);
/** Rời game quá thời gian này thì quầy tự đóng. */
const LEAVE_GRACE_MS = 30_000;
const EQUIPMENT_RESALE = 0.5;
/** Người bán ở chợ (thân thiết tăng khi mua hàng). */
const MARKET_KEEPER = "cho_dau_moi";
/** Tối đa người online trong một xóm (docs/PLAN.md Phase 2). */
export const MAX_MEMBERS = 8;
/** Nhịp phát vị trí người chơi cho cả xóm. */
const PEER_FLUSH_MS = 100;

/** Cổng phát sự kiện ra socket; gateway cung cấp để service không phụ thuộc Socket.IO. */
export interface GameEmitter {
  toRoom(roomId: string, event: "clock", data: ClockView): void;
  toRoom(roomId: string, event: "world", data: WorldView): void;
  toRoom(roomId: string, event: "notify", data: NotifyEvent): void;
  toRoom(roomId: string, event: "say", data: SayEvent): void;
  toRoom(roomId: string, event: "roster", data: RosterView): void;
  toRoom(roomId: string, event: "peers", data: PeerPos[]): void;
  toPlayer(playerId: string, event: "me", data: MeView): void;
  toPlayer(playerId: string, event: "dayEnd", data: DayReportView): void;
  toPlayer(playerId: string, event: "snapshot", data: Snapshot): void;
  toPlayer(playerId: string, event: "notify", data: NotifyEvent): void;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Dời mọi mốc "ngày" của người chơi theo độ lệch ngày giữa hai xóm (khóa unique → dời qua số âm). */
async function rebaseDays(tx: Tx, playerId: string, offset: number) {
  await tx.$executeRaw`UPDATE "InventoryItem" SET "batchDay" = -("batchDay" + ${offset}) WHERE "playerId" = ${playerId}::uuid`;
  await tx.$executeRaw`UPDATE "InventoryItem" SET "batchDay" = -"batchDay" WHERE "playerId" = ${playerId}::uuid`;
  await tx.$executeRaw`UPDATE "DailyReport" SET "day" = -("day" + ${offset}) WHERE "playerId" = ${playerId}::uuid`;
  await tx.$executeRaw`UPDATE "DailyReport" SET "day" = -"day" WHERE "playerId" = ${playerId}::uuid`;
  await tx.$executeRaw`UPDATE "Business" SET "rentPaidDay" = "rentPaidDay" + ${offset} WHERE "ownerId" = ${playerId}::uuid AND "rentPaidDay" IS NOT NULL`;
  await tx.$executeRaw`UPDATE "NpcRelation" SET "lastGreetDay" = "lastGreetDay" + ${offset} WHERE "playerId" = ${playerId}::uuid`;
}

const pick = <T>(list: readonly T[], rand: () => number): T =>
  list[Math.floor(rand() * list.length)] ?? (list[0] as T);

export interface IntentContext {
  room: RoomRuntime;
  playerId: string;
}

@Injectable()
export class GameService implements OnModuleDestroy {
  private readonly logger = new Logger(GameService.name);
  private readonly rooms = new Map<string, RoomRuntime>();
  private readonly roomOfPlayer = new Map<string, string>();
  private readonly occupantsCache = new Map<string, WorldView["lots"]>();
  private emitter?: GameEmitter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    readonly orders: OrderService,
    readonly work: WorkService,
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
    const isNew = !member;
    if (!member) {
      member = { playerId, displayName: player.displayName, sockets: new Set() };
      room.members.set(playerId, member);
    }
    clearTimeout(member.leaveTimer);
    const wasOffline = member.sockets.size === 0;
    member.sockets.add(socketId);
    this.roomOfPlayer.set(playerId, room.id);
    const snapshot = await room.run(async () => {
      // Hàng xóm thấy người mới (và quầy của họ) ngay.
      if (isNew) await this.refreshOccupants(room);
      return this.snapshot(room, playerId);
    });
    if (isNew) this.emitWorld(room);
    if (wasOffline) this.emitRoster(room);
    return { roomId: room.id, snapshot };
  }

  leave(playerId: string, socketId: string) {
    const room = this.roomFor(playerId);
    const member = room?.members.get(playerId);
    if (!room || !member) return;
    member.sockets.delete(socketId);
    if (member.sockets.size > 0) return;
    // Mất kết nối = không còn đứng ở quầy: ngừng có khách ngay, đóng quầy sau thời gian ân hạn.
    room.attending.delete(playerId);
    this.emitRoster(room);
    member.leaveTimer = setTimeout(() => {
      void room.run(async () => {
        if (member.sockets.size > 0) return;
        await this.closeAllFor(room, playerId);
        await this.work.end(room, playerId, "left");
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
      clearInterval(room.peerTimer);
      await this.persistClock(room);
    }
  }

  private async loadRoom(roomId: string): Promise<RoomRuntime> {
    const existing = this.rooms.get(roomId);
    if (existing) return existing;
    const row = await this.prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    const room = new RoomRuntime(row.id, row.code, row.day, row.minute);
    this.rooms.set(room.id, room);
    room.timer = setInterval(() => room.runTick(() => this.tick(room)), TICK_MS);
    room.peerTimer = setInterval(() => this.flushPeers(room), PEER_FLUSH_MS);
    this.logger.log(`xóm ${room.id} chạy (ngày ${room.day})`);
    return room;
  }

  private async unloadRoom(room: RoomRuntime) {
    clearInterval(room.timer);
    clearInterval(room.peerTimer);
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

  // ───────────────────────── Xóm chung ─────────────────────────

  /** Client báo vị trí; chỉ lưu để phát cho người khác (không đi qua hàng đợi, không đụng DB). */
  move(playerId: string, p: MovePayload) {
    const room = this.roomFor(playerId);
    const m = room?.members.get(playerId);
    if (!room || !m) return;
    const insideChanged = (m.pos?.inside ?? null) !== p.inside;
    m.pos = p;
    room.dirtyPeers.add(playerId);
    if (insideChanged) this.emitRoster(room);
  }

  private flushPeers(room: RoomRuntime) {
    if (room.dirtyPeers.size === 0) return;
    const list: PeerPos[] = [];
    for (const id of room.dirtyPeers) {
      const p = room.members.get(id)?.pos;
      if (p)
        list.push({ id, x: round2(p.x), z: round2(p.z), yaw: round2(p.yaw), moving: p.moving });
    }
    room.dirtyPeers.clear();
    if (list.length) this.emitter?.toRoom(room.id, "peers", list);
  }

  roster(room: RoomRuntime): RosterView {
    const peers = [...room.members.values()]
      .filter((m) => m.sockets.size > 0)
      .map((m) => ({
        id: m.playerId,
        name: m.displayName,
        x: m.pos?.x ?? 0,
        z: m.pos?.z ?? 0,
        yaw: m.pos?.yaw ?? 0,
        moving: false,
        inside: m.pos?.inside ?? null,
      }));
    return { code: room.code, max: MAX_MEMBERS, peers };
  }

  private emitRoster(room: RoomRuntime) {
    this.emitter?.toRoom(room.id, "roster", this.roster(room));
  }

  /**
   * Chuyển sang xóm của bạn bằng mã (UC-J1). Phải đóng quầy, ra ca trước. Ngày của mỗi xóm khác nhau
   * nên mọi dữ liệu tính theo ngày của người chơi được dời theo độ lệch (hàng tồn không tự nhiên hỏng/tươi lại).
   */
  async switchRoom(playerId: string, code: string): Promise<{ from: string; to: string }> {
    const from = this.roomFor(playerId);
    if (!from) throw new GameError("invalid_state", "Chưa vào xóm");
    const target = await this.prisma.room.findUnique({ where: { code } });
    if (!target) throw new GameError("invalid_payload", "Không có xóm nào mã này");
    if (target.id === from.id) throw new GameError("invalid_state", "Bạn đang ở xóm này rồi");
    const loaded = this.rooms.get(target.id);
    const online = loaded ? this.roster(loaded).peers.length : 0;
    if (online >= MAX_MEMBERS)
      throw new GameError("invalid_state", `Xóm đã đủ ${MAX_MEMBERS} người, đợi chút nha`);
    const to = loaded ?? (await this.loadRoom(target.id));
    // Ngày của xóm đích lấy từ bộ nhớ nếu đang chạy (DB có thể chưa kịp lưu).
    const offset = to.day - from.day;

    await from.run(async () => {
      const biz = await this.businessOf(playerId);
      if (biz?.status === "OPEN")
        throw new GameError("invalid_state", "Dọn quầy (đóng quầy) trước khi chuyển xóm");
      if (from.shifts.has(playerId))
        throw new GameError("invalid_state", "Ra ca trước khi chuyển xóm");
      const m = from.members.get(playerId);
      clearTimeout(m?.leaveTimer);
      from.attending.delete(playerId);
      from.members.delete(playerId);
      from.dirtyPeers.delete(playerId);
      this.roomOfPlayer.delete(playerId);
      await this.prisma.$transaction(async (tx) => {
        await tx.player.update({ where: { id: playerId }, data: { roomId: to.id, jobId: null } });
        if (offset !== 0) await rebaseDays(tx, playerId, offset);
      });
      this.emitWorld(from);
      this.emitRoster(from);
    });
    if (from.members.size === 0) await this.unloadRoom(from);

    await to.run(async () => {
      // Chỗ bán đã có hàng xóm dùng → phải chọn chỗ khác.
      const biz = await this.businessOf(playerId);
      if (!biz?.lotId) return;
      const lots = await this.refreshOccupants(to);
      if (lots.some((o) => o.lotId === biz.lotId && o.businessId !== biz.id)) {
        await this.prisma.business.update({ where: { id: biz.id }, data: { lotId: null } });
      }
    });
    this.logger.log(`người chơi ${playerId} chuyển xóm ${from.id} → ${to.id}`);
    return { from: from.id, to: to.id };
  }

  // ───────────────────────── Intent ─────────────────────────

  /** Chạy một intent trong hàng đợi của xóm; trả về kết quả của fn (mặc định MeView mới). */
  async intentWith<T>(playerId: string, fn: (ctx: IntentContext) => Promise<T>): Promise<T> {
    const room = this.roomFor(playerId);
    if (!room) throw new GameError("invalid_state", "Chưa vào xóm");
    return room.run(async () => {
      try {
        return await fn({ room, playerId });
      } catch (err) {
        if (err instanceof InsufficientFundsError)
          throw new GameError("insufficient_funds", "Không đủ tiền");
        throw err;
      }
    });
  }

  intent(playerId: string, fn: (ctx: IntentContext) => Promise<void>): Promise<MeView> {
    return this.intentWith(playerId, async (ctx) => {
      await fn(ctx);
      return this.me(ctx.room, ctx.playerId);
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
          productId: eq.products[0] ?? "",
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

  /** Mua nguyên liệu theo gói (UC-E1): mua sỉ và thân với Bà Năm được bớt giá. */
  async marketBuy({ room, playerId }: IntentContext, itemId: string, packs: number) {
    const ing = content.ingredientById.get(itemId);
    if (!ing) throw new GameError("invalid_payload", "Chợ không bán món này");
    const eco = content.economy;
    const friendship = await this.friendship(playerId, MARKET_KEEPER);
    let total = marketPackPrice(ing, room.day, room.minute, eco) * packs;
    if (packs >= eco.bulkPacks) total *= 1 - eco.bulkDiscount;
    if (friendship >= eco.friendDiscountAt) total *= 1 - eco.friendDiscount;
    total = Math.max(500, Math.round(total / 500) * 500);
    await this.prisma.$transaction(async (tx) => {
      await this.ledger.transfer(
        tx,
        playerWallet(playerId),
        SYSTEM.market,
        total,
        "market_buy",
        itemId,
      );
      await addItems(tx, playerId, itemId, room.day, ing.packSize * packs);
      await addToReport(tx, playerId, room.day, { stockCost: total });
      await this.addFriendship(tx, playerId, MARKET_KEEPER, 1);
    });
  }

  async updateLot({ room, playerId }: IntentContext, lotId: string) {
    const biz = await this.requireBusiness(playerId);
    if (lotId === biz.lotId) return;
    if (!content.lotById.has(lotId)) throw new GameError("invalid_payload", "Không có chỗ này");
    if (biz.status === "OPEN") throw new GameError("invalid_state", "Đóng quầy rồi mới chuyển chỗ");
    const taken = (this.occupantsCache.get(room.id) ?? []).find((o) => o.lotId === lotId);
    if (taken) throw new GameError("invalid_state", `Chỗ này ${taken.ownerName} đang dùng`);
    await this.prisma.business.update({ where: { id: biz.id }, data: { lotId } });
    this.emitWorld(room);
  }

  /** Bật/tắt món, đổi giá trong thực đơn (UC-F2). */
  async setMenu(
    { playerId }: IntentContext,
    variantId: string,
    patch: { on?: boolean; price?: number },
  ) {
    const biz = await this.requireBusiness(playerId);
    const recipe = content.product(biz.productId).recipe;
    if (!recipe.variants.some((v) => v.id === variantId))
      throw new GameError("invalid_payload", "Không có món này");
    const next = patchMenu(biz, variantId, patch);
    if (!menuOf({ ...biz, menu: next }).some((m) => m.on)) {
      throw new GameError("invalid_state", "Phải bán ít nhất một món");
    }
    await this.prisma.business.update({ where: { id: biz.id }, data: { menu: next } });
  }

  async openBusiness({ room, playerId }: IntentContext) {
    const biz = await this.requireBusiness(playerId);
    if (biz.status === "OPEN") return;
    if (!biz.lotId) throw new GameError("invalid_state", "Chọn chỗ bán trước đã");
    if (!room.attending.has(playerId))
      throw new GameError("invalid_state", "Tới tận quầy rồi mới mở hàng được");
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    if (player.jobId || room.shifts.has(playerId))
      throw new GameError("invalid_state", "Bạn đang đi làm thuê — nghỉ việc rồi mới mở quầy");
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
        await addToReport(tx, playerId, room.day, { rent: lot.rentPerDay });
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
    this.orders.dropFor(room, biz.id);
    this.emitWorld(room);
  }

  /** Client báo nhân vật đang đứng ở quầy hay đã đi chỗ khác. */
  async attend({ room, playerId }: IntentContext, on: boolean) {
    if (on) room.attending.add(playerId);
    else room.attending.delete(playerId);
  }

  /** Lưu tiến độ kịch bản người mới. */
  async setTutorial({ playerId }: IntentContext, step: string) {
    if (!content.stepById.has(step))
      throw new GameError("invalid_payload", "Bước kịch bản không tồn tại");
    await this.prisma.player.update({ where: { id: playerId }, data: { tutorial: step } });
  }

  /**
   * Nói chuyện với người đứng quầy (UC-D2). Chào hỏi mỗi ngày +2 thân thiết (một lần/ngày).
   * Lời NPC hiện trên đầu NPC qua sự kiện "say".
   */
  async talk(
    { room, playerId }: IntentContext,
    npcId: string,
    topic: "greet" | "price" | "gossip",
  ): Promise<TalkResult> {
    const place = content.placeById.get(npcId);
    if (!place) throw new GameError("invalid_payload", "Không có người này");
    const rand = seededRandom("talk", playerId, npcId, room.day, room.minute, topic);
    let friendship = await this.friendship(playerId, npcId);
    let line: string;
    if (topic === "greet") {
      const rel = await this.prisma.npcRelation.findUnique({
        where: { playerId_npcId: { playerId, npcId } },
      });
      if (!rel || rel.lastGreetDay !== room.day) {
        friendship = await this.prisma.$transaction((tx) =>
          this.addFriendship(tx, playerId, npcId, 2, room.day),
        );
        line =
          friendship >= content.economy.friendDiscountAt
            ? `Con đó hả! ${place.keeper.greeting}`
            : place.keeper.greeting;
      } else {
        line = "Chào hoài vậy con, bữa nay gặp rồi mà!";
      }
    } else {
      line = pick(place.keeper.talk[topic], rand);
    }
    this.emitter?.toRoom(room.id, "say", { who: npcId, text: line });
    return { line, friendship };
  }

  /** Câu nói nhanh (UC-D3): hiện trên đầu; câu rao hàng khi đứng quầy thì kéo thêm khách. */
  async say({ room, playerId }: IntentContext, phraseId: string) {
    const phrase = content.data.quickPhrases.find((p) => p.id === phraseId);
    if (!phrase) throw new GameError("invalid_payload", "Không có câu này");
    this.emitter?.toRoom(room.id, "say", { who: playerId, text: phrase.text });
    if (!phrase.shout) return;
    const biz = await this.businessOf(playerId);
    if (!biz || biz.status !== "OPEN" || !room.attending.has(playerId)) return;
    const eco = content.economy;
    const ready = room.shoutReadyAt.get(playerId) ?? 0;
    if (room.minute < ready) {
      this.emitter?.toPlayer(playerId, "notify", {
        kind: "info",
        text: "Mới rao xong, khàn cổ rồi — đợi chút nữa.",
      });
      return;
    }
    room.boostUntil.set(biz.id, room.minute + eco.shoutMinutes);
    room.shoutReadyAt.set(playerId, room.minute + eco.shoutCooldownMinutes);
    this.emitter?.toPlayer(playerId, "notify", {
      kind: "good",
      text: "Rao hàng! Khách để ý quầy mình hơn một lúc.",
    });
  }

  // ───────────────────────── Tick ─────────────────────────

  private async tick(room: RoomRuntime) {
    try {
      room.minute += 1;
      const eco = content.economy;
      if (room.minute >= eco.dayEndMinute) {
        await this.endDay(room);
      } else {
        if (room.minute % eco.economyTickMinutes === 0) await this.customerTick(room);
        await this.work.tick(room);
        await this.orders.expire(room);
        if (room.minute % 10 === 0) await this.persistClock(room);
      }
      this.emitter?.toRoom(room.id, "clock", { day: room.day, minute: room.minute });
    } catch (err) {
      this.logger.error(`tick xóm ${room.id} lỗi`, err as Error);
    }
  }

  /** Khách dừng lại ở các quầy đang mở và có người đứng (UC-F3). */
  private async customerTick(room: RoomRuntime) {
    const eco = content.economy;
    const staffed = [...room.members.keys()].filter((id) => room.attending.has(id));
    const businesses = await this.prisma.business.findMany({
      where: { ownerId: { in: staffed }, status: "OPEN", lotId: { not: null } },
    });
    if (businesses.length === 0) return;
    const results = customerArrivals({
      content,
      day: room.day,
      minuteOfDay: room.minute,
      minutes: eco.economyTickMinutes,
      shops: businesses.map((b) => ({
        id: b.id,
        productId: b.productId,
        lotId: b.lotId ?? "",
        priceRatio: menuPriceRatio(
          content.product(b.productId),
          menuOf(b).filter((m) => m.on),
        ),
        reputation: b.reputation,
        boost: (room.boostUntil.get(b.id) ?? 0) > room.minute ? eco.shoutBoost : 1,
        demandCarry: b.demandCarry,
      })),
    });
    for (const r of results) {
      const b = businesses.find((x) => x.id === r.id);
      if (!b) continue;
      await this.prisma.business.update({
        where: { id: b.id },
        data: { demandCarry: r.demandCarry },
      });
      if (r.arrivals === 0) continue;
      const { lost } = await this.orders.spawn(room, b, r.arrivals);
      if (lost > 0) this.emitter?.toPlayer(b.ownerId, "me", await this.me(room, b.ownerId));
    }
  }

  /** Cuối ngày: đóng quầy, bỏ nguyên liệu hết hạn, chốt báo cáo, sang ngày mới lúc 6:00. */
  private async endDay(room: RoomRuntime) {
    const day = room.day;
    for (const playerId of [...room.shifts.keys()]) await this.work.end(room, playerId, "day_end");
    room.boostUntil.clear();
    room.shoutReadyAt.clear();
    for (const playerId of room.members.keys()) {
      await this.closeAllFor(room, playerId);
      const report = await this.prisma.$transaction(async (tx) => {
        await tx.player.update({ where: { id: playerId }, data: { jobId: null } });
        const batches = await tx.inventoryItem.findMany({ where: { playerId } });
        const { spoiled } = spoilage(content, batches, day);
        let spoiledQty = 0;
        let spoiledValue = 0;
        for (const s of spoiled) {
          spoiledQty += s.qty;
          spoiledValue += s.qty * content.ingredient(s.itemId).costPerUnit;
        }
        if (spoiled.length)
          await tx.inventoryItem.deleteMany({ where: { id: { in: spoiled.map((b) => b.id) } } });
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
        wrong: report.wrong,
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
      shift: this.work.view(room, playerId),
      roster: this.roster(room),
      orders: [...room.orders.values()]
        .filter((o) => o.event.ownerId === playerId)
        .map((o) => o.event),
    };
  }

  async me(room: RoomRuntime, playerId: string): Promise<MeView> {
    const [player, biz, inventory, report, money, relations] = await Promise.all([
      this.prisma.player.findUniqueOrThrow({ where: { id: playerId } }),
      this.businessOf(playerId),
      inventoryView(this.prisma, playerId, room.day),
      this.prisma.dailyReport.findUnique({ where: { playerId_day: { playerId, day: room.day } } }),
      this.ledger.balance(this.prisma, playerWallet(playerId)),
      this.prisma.npcRelation.findMany({ where: { playerId } }),
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
            menu: menuOf(biz),
            open: biz.status === "OPEN",
            reputation: biz.reputation,
            rentPaidToday: biz.rentPaidDay === room.day && biz.rentLotId === biz.lotId,
          }
        : null,
      inventory,
      friendship: Object.fromEntries(relations.map((r) => [r.npcId, r.friendship])),
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

  // ───────────────────────── Tiện ích ─────────────────────────

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

  private async closeAllFor(room: RoomRuntime, playerId: string) {
    const open = await this.prisma.business.findMany({
      where: { ownerId: playerId, status: "OPEN" },
    });
    for (const b of open) this.orders.dropFor(room, b.id);
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

  private async friendship(playerId: string, npcId: string): Promise<number> {
    const rel = await this.prisma.npcRelation.findUnique({
      where: { playerId_npcId: { playerId, npcId } },
    });
    return rel?.friendship ?? 0;
  }

  /** Cộng thân thiết (tối đa 100); `greetDay` ghi nhận ngày đã chào. Trả về mức mới. */
  private async addFriendship(
    tx: Tx,
    playerId: string,
    npcId: string,
    amount: number,
    greetDay?: number,
  ) {
    const rel = await tx.npcRelation.upsert({
      where: { playerId_npcId: { playerId, npcId } },
      create: { playerId, npcId, friendship: Math.min(100, amount), lastGreetDay: greetDay ?? 0 },
      update: {
        friendship: { increment: amount },
        ...(greetDay ? { lastGreetDay: greetDay } : {}),
      },
    });
    if (rel.friendship > 100)
      await tx.npcRelation.update({
        where: { playerId_npcId: { playerId, npcId } },
        data: { friendship: 100 },
      });
    return Math.min(100, rel.friendship);
  }

  private event(tx: Tx, playerId: string, type: string, payload: Record<string, unknown>) {
    return tx.gameEvent.create({ data: { playerId, type, payload: payload as object } });
  }
}
