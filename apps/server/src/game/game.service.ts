import { createHash } from "node:crypto";
import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { content, type SkillId } from "@xom/content";
import type {
  AwayView,
  ClockView,
  MeView,
  MovePayload,
  PayMethod,
  PeerPos,
  RosterView,
  Snapshot,
  TalkResult,
  WeatherIdView,
  WorldView,
} from "@xom/shared";
import {
  absMinute,
  addSkill,
  bankInterest,
  chanceIn,
  customerArrivals,
  eventCategoryDemand,
  fameOf,
  levelOf,
  marketMovesSince,
  maskText,
  menuPriceRatio,
  needsAt,
  needsFrom,
  overrideWeather,
  type PaySource,
  projectDemand,
  recipeIngredients,
  type SkillPoints,
  seededRandom,
  shiftAt,
  spoilage,
  wearDemand,
  weatherDemand,
} from "@xom/sim";
import {
  bankWallet,
  fundWallet,
  InsufficientFundsError,
  LedgerService,
  playerWallet,
  SYSTEM,
  type Tx,
} from "../economy/ledger.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { BankService } from "./bank.js";
import { Broadcast, type GameEmitter } from "./broadcast.js";
import { BusinessService } from "./business.js";
import { BusinessRepo } from "./business-repo.js";
import { ContractService } from "./contracts.js";
import { GigService } from "./gigs.js";
import { inventoryView, stockMap } from "./inventory.js";
import { MarketService } from "./market.js";
import { availableMenu, menuOf } from "./menu.js";
import { NeedsService } from "./needs.js";
import { OrderService } from "./orders.js";
import { PaymentService } from "./payment.js";
import { addFriendship, friendship as friendshipOf, ORDER_REACH } from "./place.js";
import { ProjectService } from "./projects.js";
import { RegularService } from "./regulars.js";
import { emptyReport } from "./report.js";
import { ReviewService } from "./reviews.js";
import { RideService } from "./rides.js";
import { GameError, type IntentContext, RoomRuntime } from "./room.js";
import { ShopService } from "./shop.js";
import { StaffService } from "./staff.js";
import { StatsService } from "./stats.js";
import { StoryService } from "./story.js";
import { WorkService } from "./work.js";

/** 1 giây thật = 1 phút game (docs/PLAN.md §3.2). */
const TICK_MS = Number(process.env.GAME_TICK_MS ?? 1000);
/** Rời game quá thời gian này thì quầy tự đóng. */
/** Ân hạn khi mất kết nối trước khi dọn quầy (test được rút ngắn qua env). */
const leaveGraceMs = () => Number(process.env.LEAVE_GRACE_MS ?? 30_000);
const _EQUIPMENT_RESALE = 0.5;
/** Người bán ở chợ (thân thiết tăng khi mua hàng). */
const _MARKET_KEEPER = "cho_dau_moi";
/** Băm PIN ATM kèm id người chơi (không lưu PIN thô). */
const _pinHash = (playerId: string, pin: string) =>
  createHash("sha256").update(`xom-atm:${playerId}:${pin}`).digest("hex");
/** Khoảng cách tối thiểu giữa hai tin chat của một người. */
const CHAT_GAP_MS = 1500;
/** Tối đa người online trong một xóm (docs/PLAN.md Phase 2). */
export const MAX_MEMBERS = 8;
/** Nhịp phát vị trí người chơi cho cả xóm. */
const PEER_FLUSH_MS = 100;
/** Khoảng cách tối đa (m) tới cây ATM. */
const _ATM_REACH = 3;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Nhân viên của quầy cho MeView: tên, ca, có đang trong ca không (để HUD báo "đang bán thay"). */
function staffView(
  e: { staffId: string; shiftId: string } | null,
  minute: number,
  ownerSells: boolean,
) {
  if (!e) return null;
  const person = content.data.staff.people.find((p) => p.id === e.staffId);
  const shift = content.data.staff.shifts.find((s) => s.id === e.shiftId);
  if (!person || !shift) return null;
  const onDuty = minute >= shift.from && minute < shift.to;
  return {
    name: person.name,
    shift: shift.name,
    from: shift.from,
    to: shift.to,
    onDuty,
    selling: onDuty && !ownerSells,
    model: person.model,
  };
}

/** Chủ đang tự đứng bán (đứng quầy và đã giành bán thay nhân viên). */
const ownerSells = (room: RoomRuntime, playerId: string) =>
  room.attending.has(playerId) && room.selfSell.has(playerId);

/** Dời mọi mốc "ngày" của người chơi theo độ lệch ngày giữa hai xóm (khóa unique → dời qua số âm). */
async function rebaseDays(tx: Tx, playerId: string, offset: number) {
  await tx.$executeRaw`UPDATE "InventoryItem" SET "batchDay" = -("batchDay" + ${offset}) WHERE "playerId" = ${playerId}::uuid`;
  await tx.$executeRaw`UPDATE "InventoryItem" SET "batchDay" = -"batchDay" WHERE "playerId" = ${playerId}::uuid`;
  await tx.$executeRaw`UPDATE "DailyReport" SET "day" = -("day" + ${offset}) WHERE "playerId" = ${playerId}::uuid`;
  await tx.$executeRaw`UPDATE "DailyReport" SET "day" = -"day" WHERE "playerId" = ${playerId}::uuid`;
  await tx.$executeRaw`UPDATE "Business" SET "rentPaidDay" = "rentPaidDay" + ${offset} WHERE "ownerId" = ${playerId}::uuid AND "rentPaidDay" IS NOT NULL`;
  await tx.$executeRaw`UPDATE "Business" SET "promoDay" = "promoDay" + ${offset} WHERE "ownerId" = ${playerId}::uuid AND "promoDay" IS NOT NULL`;
  await tx.$executeRaw`UPDATE "NpcRelation" SET "lastGreetDay" = "lastGreetDay" + ${offset} WHERE "playerId" = ${playerId}::uuid`;
}

const pick = <T>(list: readonly T[], rand: () => number): T =>
  list[Math.floor(rand() * list.length)] ?? (list[0] as T);

export type { GameEmitter } from "./broadcast.js";
export type { IntentContext } from "./room.js";

@Injectable()
export class GameService implements OnModuleDestroy {
  private readonly logger = new Logger(GameService.name);
  private readonly rooms = new Map<string, RoomRuntime>();
  private readonly roomOfPlayer = new Map<string, string>();
  private readonly occupantsCache = new Map<string, WorldView["lots"]>();
  private emitter?: GameEmitter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessRepo,
    private readonly ledger: LedgerService,
    private readonly payment: PaymentService,
    readonly orders: OrderService,
    readonly work: WorkService,
    readonly reviews: ReviewService,
    readonly stats: StatsService,
    readonly projects: ProjectService,
    readonly story: StoryService,
    readonly regulars: RegularService,
    readonly staff: StaffService,
    readonly contracts: ContractService,
    readonly gigs: GigService,
    readonly rides: RideService,
    readonly shops: ShopService,
    readonly bank: BankService,
    readonly needs: NeedsService,
    readonly market: MarketService,
    readonly broadcast: Broadcast,
    readonly biz: BusinessService,
  ) {}

  setEmitter(emitter: GameEmitter) {
    this.emitter = emitter;
    this.broadcast.bind(emitter, {
      me: (playerId) => this.emitMe(playerId),
      world: (room) => this.emitWorld(room),
    });
    this.biz.bindOccupants((roomId) => this.occupantsCache.get(roomId) ?? []);
    this.reviews.setNotifier((playerId, n) => emitter.toPlayer(playerId, "notify", n));
    this.stats.setNotifier((playerId, n) => emitter.toPlayer(playerId, "notify", n));
    this.projects.setNotifier(
      (roomId, n) => emitter.toRoom(roomId, "notify", n),
      (room) => this.emitWorld(room),
    );
    this.story.setNotifier((playerId, n) => emitter.toPlayer(playerId, "notify", n));
    this.regulars.setNotifier((playerId, n) => emitter.toPlayer(playerId, "notify", n));
    this.staff.setNotifier((playerId, n) => emitter.toPlayer(playerId, "notify", n));
    this.contracts.setNotifier((playerId, n) => emitter.toPlayer(playerId, "notify", n));
    this.gigs.setNotifier((playerId, n) => emitter.toPlayer(playerId, "notify", n));
    this.shops.setNotifier({
      notify: (playerId, n) => emitter.toPlayer(playerId, "notify", n),
      onWorld: (room) => this.emitWorld(room),
      notifyRoom: (roomId, n) => emitter.toRoom(roomId, "notify", n),
      landlord: (playerId, e) => emitter.toPlayer(playerId, "landlord", e),
      pushMe: (room, playerId) => this.pushMe(room, playerId),
    });
    this.rides.setNotifier(
      (playerId, n) => emitter.toPlayer(playerId, "notify", n),
      (playerId, r) => emitter.toPlayer(playerId, "ride", r),
    );
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
    if (wasOffline) {
      member.sessionStart = Date.now();
      void this.log(playerId, "session_start", { roomId: room.id });
    }
    member.sockets.add(socketId);
    this.roomOfPlayer.set(playerId, room.id);
    const snapshot = await room.run(async () => {
      // Hàng xóm thấy người mới (và quầy của họ) ngay.
      if (isNew) await this.refreshOccupants(room);
      return this.snapshot(room, playerId);
    });
    // Vào lại sau một lúc vắng: tóm tắt chuyện đã xảy ra ở xóm (THEGIOI §4).
    if (wasOffline) {
      const away = await this.awayReport(room, player).catch(() => null);
      if (away) snapshot.away = away;
    }
    if (isNew) this.emitWorld(room);
    if (wasOffline) this.emitRoster(room);
    return { roomId: room.id, snapshot };
  }

  /**
   * "Trong lúc bạn vắng…" (docs/THEGIOI.md §4): chuyện thật đã xảy ra ở xóm khi mình offline — đánh giá mới về quầy,
   * hàng xóm mới, quầy đang mở, công trình xong / chờ bỏ phiếu, giá chợ đổi. Không có tiền tự sinh. Vắng chưa đủ lâu
   * hoặc không có gì đáng kể thì không báo.
   */
  private async awayReport(
    room: RoomRuntime,
    player: { id: string; lastSeenAt: Date | null; lastSeenDay: number | null },
  ): Promise<AwayView | null> {
    const since = player.lastSeenAt;
    if (!since) return null;
    const minutes = Math.floor((Date.now() - since.getTime()) / 60_000);
    if (minutes < content.data.away.minMinutes) return null;
    const fromDay = player.lastSeenDay ?? room.day;
    const [reviews, neighbors, done, voting, biz, shifts] = await Promise.all([
      this.prisma.review.findMany({
        where: { ownerId: player.id, createdAt: { gt: since } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      this.prisma.player.findMany({
        where: { roomId: room.id, createdAt: { gt: since }, id: { not: player.id } },
        select: { displayName: true },
        take: 5,
      }),
      this.prisma.roomProject.findMany({
        where: { roomId: room.id, status: "DONE", doneDay: { gte: fromDay } },
        select: { projectId: true },
      }),
      this.prisma.roomProject.findMany({
        where: { roomId: room.id, status: "VOTING", createdAt: { gt: since } },
        select: { projectId: true },
      }),
      this.businesses.of(player.id),
      this.prisma.staffShift.findMany({ where: { ownerId: player.id, createdAt: { gt: since } } }),
    ]);
    const latest = reviews[0];
    const staffName = (id: string) =>
      content.data.staff.people.find((p) => p.id === id)?.name ?? id;
    const items = biz ? recipeIngredients(content.product(biz.productId).recipe) : [];
    const report: AwayView = {
      minutes,
      days: Math.max(0, room.day - fromDay),
      reviews: {
        count: reviews.length,
        avg: reviews.length ? reviews.reduce((n, r) => n + r.stars, 0) / reviews.length : 0,
        latest: latest ? { name: latest.authorName, stars: latest.stars, text: latest.text } : null,
      },
      newNeighbors: neighbors.map((n) => n.displayName),
      stalls: (this.occupantsCache.get(room.id) ?? [])
        .filter((o) => o.open && o.ownerId !== player.id)
        .map((o) => ({ name: o.ownerName, productId: o.productId })),
      projects: {
        done: done.map(
          (p) => content.data.projects.find((x) => x.id === p.projectId)?.name ?? p.projectId,
        ),
        voting: voting.map(
          (p) => content.data.projects.find((x) => x.id === p.projectId)?.name ?? p.projectId,
        ),
      },
      prices: marketMovesSince(content, items, fromDay, room.day),
      staff: shifts.length
        ? {
            name: [...new Set(shifts.map((s) => staffName(s.staffId)))].join(", "),
            served: shifts.reduce((n, s) => n + s.served, 0),
            wrong: shifts.reduce((n, s) => n + s.wrong, 0),
            revenue: shifts.reduce((n, s) => n + s.revenue, 0),
            wages: shifts.reduce((n, s) => n + s.wages, 0),
          }
        : null,
    };
    const nothing =
      report.days === 0 &&
      report.reviews.count === 0 &&
      report.newNeighbors.length === 0 &&
      report.stalls.length === 0 &&
      report.projects.done.length === 0 &&
      report.projects.voting.length === 0 &&
      !report.staff;
    return nothing ? null : report;
  }

  leave(playerId: string, socketId: string) {
    const room = this.roomFor(playerId);
    const member = room?.members.get(playerId);
    if (!room || !member) return;
    member.sockets.delete(socketId);
    if (member.sockets.size > 0) return;
    // Mất kết nối = không còn đứng ở quầy: ngừng có khách ngay, đóng quầy sau thời gian ân hạn.
    room.attending.delete(playerId);
    // Mốc để lần sau vào lại tóm tắt "Trong lúc bạn vắng…" (dev/test có thể giả như đã vắng lâu).
    const fake = this.debugAway.get(playerId);
    this.debugAway.delete(playerId);
    void this.prisma.player
      .update({
        where: { id: playerId },
        data: {
          lastSeenAt: new Date(Date.now() - (fake?.minutes ?? 0) * 60_000),
          lastSeenDay: room.day - (fake?.days ?? 0),
        },
      })
      .catch(() => undefined);
    void this.log(playerId, "session_end", {
      ms: Date.now() - (member.sessionStart ?? Date.now()),
    });
    this.emitRoster(room);
    member.leaveTimer = setTimeout(() => {
      void room
        .run(async () => {
          if (member.sockets.size > 0) return;
          // Có nhân viên trong ca thì bán nốt tới hết ca rồi mới dọn quầy (KIENTRUC §2).
          await this.staff.finishShift(room, playerId);
          await this.biz.closeAllFor(room, playerId);
          await this.work.end(room, playerId, "left");
          this.rides.clear(playerId);
          await this.prisma.player.update({ where: { id: playerId }, data: { jobId: null } });
          room.members.delete(playerId);
          this.roomOfPlayer.delete(playerId);
          this.emitWorld(room);
          if (room.members.size === 0) await this.unloadRoom(room);
        })
        .catch((err) => this.logger.warn(`không dọn được người chơi rời xóm: ${err}`));
    }, leaveGraceMs());
  }

  /**
   * Tắt server: dừng nhịp + hẹn giờ rời xóm, CHỜ nhịp / intent đang chạy dở xong rồi mới lưu đồng hồ — trước đây nhịp đang
   * chạy chạm DB sau khi Prisma đóng ("Cannot use a pool after calling end", HANDOFF §4).
   */
  async onModuleDestroy() {
    for (const room of this.rooms.values()) {
      clearInterval(room.timer);
      clearInterval(room.peerTimer);
      for (const m of room.members.values()) clearTimeout(m.leaveTimer);
    }
    for (const room of this.rooms.values()) {
      await room.drain();
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

  roomFor(playerId: string): RoomRuntime | undefined {
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
      const biz = await this.businesses.of(playerId);
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
      const biz = await this.businesses.of(playerId);
      if (!biz?.lotId) return;
      const lots = await this.refreshOccupants(to);
      if (lots.some((o) => o.lotId === biz.lotId && o.businessId !== biz.id)) {
        await this.prisma.business.update({ where: { id: biz.id }, data: { lotId: null } });
      }
    });
    this.logger.log(`người chơi ${playerId} chuyển xóm ${from.id} → ${to.id}`);
    void this.log(playerId, "xom_join", { from: from.id, to: to.id });
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

  /** Gọi món ở quầy hàng xóm (UC-J3): phải đứng gần quầy đó. */
  async shopOrder(
    { room, playerId }: IntentContext,
    p: { businessId: string; variantId: string; picks: Record<string, string>; mods: string[] },
  ) {
    const biz = await this.prisma.business.findUnique({ where: { id: p.businessId } });
    if (!biz || this.roomOfPlayer.get(biz.ownerId) !== room.id)
      throw new GameError("invalid_state", "Quầy này không ở xóm mình");
    const member = room.members.get(playerId);
    const pos = member?.pos;
    if (biz.lotId && pos) {
      const lot = content.lot(biz.lotId).position;
      if (pos.inside || Math.hypot(pos.x - lot.x, pos.z - lot.z) > ORDER_REACH)
        throw new GameError("invalid_state", "Lại gần quầy mới gọi món được");
    }
    await this.orders.playerOrder(
      room,
      { id: playerId, name: member?.displayName ?? "Hàng xóm" },
      biz,
      p,
    );
  }

  /** Quỹ xóm + công trình chung (UC-J5). */
  fundView({ room, playerId }: IntentContext) {
    return this.projects.view(room, playerId);
  }

  /** Góp quỹ xóm: tiền đi qua sổ cái vào ví quỹ (không lấy lại được). */
  async fundDonate({ room, playerId }: IntentContext, amount: number, pay?: PayMethod) {
    const step = content.data.fund.donateStep;
    if (amount % step !== 0)
      throw new GameError("invalid_payload", `Góp theo bội số ${step.toLocaleString("vi-VN")}đ`);
    let src: PaySource = "cash";
    await this.prisma.$transaction(async (tx) => {
      src = await this.payment.payOut(
        tx,
        playerId,
        amount,
        fundWallet(room.id),
        "donate",
        room.id,
        pay,
      );
    });
    this.broadcast.paidBy(playerId, src, amount);
    void this.log(playerId, "fund_donate", { amount });
    await this.story.note(playerId, "first_donate", room.day, {
      money: `${amount.toLocaleString("vi-VN")}đ`,
    });
    const name = room.members.get(playerId)?.displayName ?? "Hàng xóm";
    this.emitter?.toRoom(room.id, "notify", {
      kind: "good",
      text: `🤝 ${name} góp ${amount.toLocaleString("vi-VN")}đ vào quỹ xóm`,
    });
    await this.projects.tick(room);
    void this.emitMe(playerId).catch(() => undefined);
    return this.projects.view(room, playerId);
  }

  /** Chuyện của tôi (docs/THEGIOI.md §1). */
  storyList({ playerId }: IntentContext) {
    return this.story.list(playerId);
  }

  async projectPropose({ room, playerId }: IntentContext, projectId: string) {
    await this.projects.propose(room, playerId, projectId);
    void this.log(playerId, "project_propose", { projectId });
    return this.projects.view(room, playerId);
  }

  async projectVote({ room, playerId }: IntentContext, id: string, yes: boolean) {
    await this.projects.vote(room, playerId, id, yes);
    return this.projects.view(room, playerId);
  }

  /** Bảng giải + thị phần + đang hot của xóm (UC-P2). */
  statsXom({ room }: IntentContext) {
    return this.stats.board(room);
  }

  /** Số liệu 7 ngày của mình + thành tựu. */
  statsMe({ room, playerId }: IntentContext) {
    return this.stats.mine(room, playerId);
  }

  /** Sổ đánh giá của một chủ quầy cùng xóm (hoặc của mình). */
  reviewList({ room, playerId }: IntentContext, ownerId: string) {
    return this.reviews.list(room, playerId, ownerId);
  }

  async reviewWrite(
    { room, playerId }: IntentContext,
    p: { ownerId: string; stars: number; text: string },
  ) {
    const name = room.members.get(playerId)?.displayName ?? "Hàng xóm";
    await this.reviews.write(room, { id: playerId, name }, p.ownerId, p.stars, p.text);
    return this.reviews.list(room, playerId, p.ownerId);
  }

  async reviewReply({ room, playerId }: IntentContext, reviewId: string, text: string) {
    await this.reviews.reply(playerId, reviewId, text);
    void this.emitMe(playerId).catch(() => undefined);
    return this.reviews.list(room, playerId, playerId);
  }

  /** Dev/test: đặt giờ trong ngày của xóm mình; production không cho. */
  async debugClock({ room }: IntentContext, minute: number, day?: number) {
    if (process.env.NODE_ENV === "production")
      throw new GameError("invalid_state", "Không có lệnh này");
    room.minute = minute;
    if (day !== undefined && day !== room.day) {
      // Nhảy ngày: lên lại kế hoạch trời + sự kiện của ngày đó (lịch tuần).
      room.day = day;
      room.planWeather();
      this.emitter?.toRoom(room.id, "events", room.events);
    }
    this.emitter?.toRoom(room.id, "clock", this.clockOf(room));
  }

  /** Dev/test: lần rời xóm tới ghi mốc như đã vắng lâu (thử "Trong lúc bạn vắng", THEGIOI §4). */
  private readonly debugAway = new Map<string, { minutes: number; days: number }>();
  async debugAwaySet({ playerId }: IntentContext, minutes: number, days: number) {
    if (process.env.NODE_ENV === "production")
      throw new GameError("invalid_state", "Không có lệnh này");
    this.debugAway.set(playerId, { minutes, days });
  }

  /** Dev/test: cộng tiền mặt cho mình (để kịch bản thử tính năng cần vốn); production không cho. */
  async debugGrant(
    { room, playerId }: IntentContext,
    p: { money?: number; xp?: number; food?: number; drink?: number },
  ) {
    if (process.env.NODE_ENV === "production")
      throw new GameError("invalid_state", "Không có lệnh này");
    const { money, xp } = p;
    if (money)
      await this.prisma.$transaction((tx) =>
        this.ledger.transfer(tx, SYSTEM.bank, playerWallet(playerId), money, "debug"),
      );
    if (xp)
      await this.prisma.player.update({ where: { id: playerId }, data: { xp: { increment: xp } } });
    if (p.food !== undefined || p.drink !== undefined) {
      const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
      const now = absMinute(room.day, room.minute);
      const cur = needsAt(content, needsFrom(player.needs), now);
      await this.prisma.player.update({
        where: { id: playerId },
        data: { needs: { food: p.food ?? cur.food, drink: p.drink ?? cur.drink, at: now } },
      });
    }
  }

  /** Cấp hiện tại của người chơi (mở khoá theo cấp, Luật 4.2). */
  /** Cộng điểm kỹ năng (làm thật mới lên). */
  async gainSkill(tx: Tx, playerId: string, id: SkillId, amount = 1) {
    const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
    const next = addSkill(content, (player.skills ?? {}) as SkillPoints, id, amount);
    await tx.player.update({ where: { id: playerId }, data: { skills: next } });
  }

  /** Dev/test (UC-B4): ép thời tiết của xóm mình trong một khoảng; production không cho. */
  async debugWeather(
    { room }: IntentContext,
    p: { kind: WeatherIdView; after: number; minutes: number },
  ) {
    if (process.env.NODE_ENV === "production")
      throw new GameError("invalid_state", "Không có lệnh này");
    const from = room.minute + p.after;
    room.weather = overrideWeather(room.weather, { from, to: from + p.minutes, kind: p.kind });
    this.emitter?.toRoom(room.id, "clock", this.clockOf(room));
  }

  /** Ví người chơi đổi ngoài intent của chính họ (mua của hàng xóm): gửi lại số dư. */
  async emitMe(playerId: string) {
    const room = this.roomFor(playerId);
    if (!room) return;
    this.emitter?.toPlayer(playerId, "me", await this.me(room, playerId));
  }

  /** Lưu tiến độ kịch bản người mới. */
  async setTutorial({ playerId }: IntentContext, step: string) {
    if (!content.stepById.has(step))
      throw new GameError("invalid_payload", "Bước kịch bản không tồn tại");
    await this.prisma.player.update({ where: { id: playerId }, data: { tutorial: step } });
    void this.log(playerId, "tutorial_step", { step });
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
    let friendship = await friendshipOf(this.prisma, playerId, npcId);
    let line: string;
    if (topic === "greet") {
      const rel = await this.prisma.npcRelation.findUnique({
        where: { playerId_npcId: { playerId, npcId } },
      });
      if (!rel || rel.lastGreetDay !== room.day) {
        friendship = await this.prisma.$transaction(async (tx) => {
          await this.gainSkill(tx, playerId, "an_noi");
          return addFriendship(tx, playerId, npcId, 2, room.day);
        });
        // Kỹ năng ăn nói vừa nhích lên: gửi lại hồ sơ.
        void this.emitMe(playerId).catch(() => undefined);
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
  /** Chat tự gõ (UC-D4): một dòng ngắn, che từ tục, mỗi người cách nhau tối thiểu CHAT_GAP_MS. */
  chatText({ room, playerId }: IntentContext, text: string) {
    const now = Date.now();
    if (now - (room.chatAt.get(playerId) ?? 0) < CHAT_GAP_MS)
      throw new GameError("invalid_state", "Từ từ thôi, nói chậm lại chút");
    room.chatAt.set(playerId, now);
    const clean = maskText(text.replace(/\s+/g, " ").trim(), content.data.reviews.banned);
    this.emitter?.toRoom(room.id, "say", { who: playerId, text: clean });
    void this.log(playerId, "chat", { length: clean.length });
    return Promise.resolve();
  }

  async say({ room, playerId }: IntentContext, phraseId: string) {
    const phrase = content.data.quickPhrases.find((p) => p.id === phraseId);
    if (!phrase) throw new GameError("invalid_payload", "Không có câu này");
    this.emitter?.toRoom(room.id, "say", { who: playerId, text: phrase.text });
    if (!phrase.shout) return;
    const biz = await this.businesses.of(playerId);
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
        if (room.minute % eco.economyTickMinutes === 0) {
          await this.biz.staffAutoOpen(room);
          await this.customerTick(room);
          for (const owner of await this.staff.tickLive(room))
            this.emitter?.toPlayer(owner, "me", await this.me(room, owner));
          await this.needs.calloutTick(room);
          await this.contracts.tick(room);
          await this.gigs.tick(room);
          await this.projects.tick(room);
        }
        if (room.minute % 60 === 0) {
          await this.biz.chargeUtilities(room);
          await this.needs.needsTick(room);
        }
        await this.work.tick(room);
        await this.rides.tick(room);
        await this.shops.tick(room);
        await this.biz.deliverTransfers(room);
        await this.orders.expire(room);
        if (room.minute % 10 === 0) await this.persistClock(room);
      }
      this.emitter?.toRoom(room.id, "clock", this.clockOf(room));
    } catch (err) {
      this.logger.error(`tick xóm ${room.id} lỗi`, err as Error);
    }
  }

  /** Khách dừng lại ở các quầy đang mở và có người đứng (UC-F3). */
  private async customerTick(room: RoomRuntime) {
    const eco = content.economy;
    // Khách vào quầy chủ tự đứng: đúng cửa hàng chủ đang đứng (nhiều cửa hàng: chỉ một quầy một lúc).
    const staffed = [...room.attending.keys()];
    const all = (
      await this.prisma.business.findMany({
        where: { ownerId: { in: staffed }, status: "OPEN", lotId: { not: null } },
        include: { employee: true },
      })
    ).filter((b) => room.attendsAt(b.ownerId, b.id));
    // Nhân viên đang trong ca mà chủ không giành bán: nhân viên bán (StaffService), khách không vào bếp của chủ.
    const businesses = all.filter(
      (b) =>
        !(
          b.employee &&
          shiftAt(content, b.employee.shiftId, room.minute) &&
          !room.selfSell.has(b.ownerId)
        ),
    );
    if (businesses.length === 0) return;
    // Công trình chung đã nghiệm thu (UC-J5): đường sá, cầu, đèn… làm khách ghé chỗ bán gần đó nhiều hơn.
    const built = await this.projects.done(room.id);
    const xomEvents = room
      .activeEvents()
      .filter((e) => !e.businessId)
      .map((e) => e.eventId);
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
        boost:
          ((room.boostUntil.get(b.id) ?? 0) > room.minute ? eco.shoutBoost : 1) *
          this.biz.promoOf(room, b.id).demand *
          // Ảnh quầy thợ ảnh chụp, đăng lên nhóm xóm (UC-M8).
          this.gigs.adOf(room, b) *
          wearDemand(b.wear, eco.maintenance) *
          projectDemand(content, built, b.lotId ?? "") *
          // Sự kiện cả xóm theo nhóm hàng (chợ đêm thứ Bảy: ăn vặt, đồ uống, phụ kiện đông hẳn).
          eventCategoryDemand(content, xomEvents, content.product(b.productId).category) *
          weatherDemand(
            room.sky,
            content.lot(b.lotId ?? "").kind,
            content.product(b.productId).category,
          ),
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
      const { discount } = this.biz.promoOf(room, b.id);
      // Khách VIP (sự kiện cá nhân): thỉnh thoảng ghé quầy đang mở.
      const vip = content.data.events.find((e) => e.effects.vip && e.trigger.kind === "per_hour");
      if (vip?.trigger.kind === "per_hour" && vip.effects.vip) {
        const roll = seededRandom("vip", b.id, room.day, room.minute)();
        if (roll < chanceIn(vip.trigger.perHour, eco.economyTickMinutes)) {
          const { created } = await this.orders.spawn(room, b, 1, {
            discount,
            vip: vip.effects.vip,
          });
          if (created) {
            const shop = content.product(b.productId).name.toLowerCase();
            this.emitter?.toPlayer(b.ownerId, "notify", {
              kind: "info",
              text: vip.news.replace("{shop}", `quầy ${shop}`),
            });
          }
        }
      }
      if (r.arrivals === 0) continue;
      const { lost } = await this.orders.spawn(room, b, r.arrivals, { discount });
      if (lost > 0) this.emitter?.toPlayer(b.ownerId, "me", await this.me(room, b.ownerId));
    }
  }

  /** Cuối ngày: đóng quầy, bỏ nguyên liệu hết hạn, chốt báo cáo, sang ngày mới lúc 6:00. */
  private async endDay(room: RoomRuntime) {
    const day = room.day;
    for (const playerId of [...room.shifts.keys()]) await this.work.end(room, playerId, "day_end");
    room.boostUntil.clear();
    room.shoutReadyAt.clear();
    room.purchases.clear();
    room.atmTries.clear();
    room.calloutAt.clear();
    for (const playerId of room.members.keys()) {
      await this.biz.closeAllFor(room, playerId);
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
        // Lãi ngân hàng (rất nhỏ, có trần — Luật 2.3).
        const interest = bankInterest(
          await this.ledger.balance(tx, bankWallet(playerId)),
          content.economy.bank,
        );
        if (interest > 0)
          await this.ledger.transfer(tx, SYSTEM.bank, bankWallet(playerId), interest, "interest");
        const biz = await this.businesses.of(playerId, tx);
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
            interest,
          },
          update: {
            spoiledQty,
            spoiledValue,
            reputation: biz?.reputation ?? 0,
            moneyEnd,
            interest,
          },
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
        interest: report.interest,
        fees: report.fees,
        staffWages: report.staffWages,
        utilities: report.utilities,
        profit:
          report.revenue +
          report.tips +
          report.wages +
          report.interest -
          report.stockCost -
          report.rent -
          report.fees -
          report.staffWages -
          report.utilities,
        moneyEnd: Number(report.moneyEnd),
      });
      // Thành tựu (UC-P2): cuối ngày xem có cái nào vừa đủ.
      await this.stats.checkAchievements(playerId, day).catch(() => undefined);
    }
    room.day += 1;
    room.minute = content.economy.dayStartMinute;
    room.planWeather();
    await this.persistClock(room);
    this.emitWorld(room);
    this.emitter?.toRoom(room.id, "events", room.events);
    for (const playerId of room.members.keys()) {
      this.emitter?.toPlayer(playerId, "snapshot", await this.snapshot(room, playerId));
    }
  }

  // ───────────────────────── View ─────────────────────────

  clockOf(room: RoomRuntime): ClockView {
    return { day: room.day, minute: room.minute, weather: room.weatherView() };
  }

  async snapshot(room: RoomRuntime, playerId: string): Promise<Snapshot> {
    return {
      me: await this.me(room, playerId),
      clock: this.clockOf(room),
      world: {
        lots: this.occupantsCache.get(room.id) ?? (await this.refreshOccupants(room)),
        sites: await this.projects.sites(room.id),
      },
      shift: this.work.view(room, playerId),
      roster: this.roster(room),
      events: room.events,
      orders: [...room.orders.values()]
        .filter((o) => o.event.ownerId === playerId || o.event.buyerId === playerId)
        .map((o) => o.event),
    };
  }

  async me(room: RoomRuntime, playerId: string): Promise<MeView> {
    const [player, biz, shops, report, money, bank, relations, served] = await Promise.all([
      this.prisma.player.findUniqueOrThrow({ where: { id: playerId } }),
      this.businesses.withEmployee(playerId),
      this.businesses.listWithEmployee(playerId),
      this.prisma.dailyReport.findUnique({ where: { playerId_day: { playerId, day: room.day } } }),
      this.ledger.balance(this.prisma, playerWallet(playerId)),
      this.ledger.balance(this.prisma, bankWallet(playerId)),
      this.prisma.npcRelation.findMany({ where: { playerId } }),
      this.prisma.dailyReport.aggregate({ where: { playerId }, _sum: { served: true } }),
    ]);
    // Kho riêng từng cửa hàng: MeView mang kho của cửa hàng đang quản lý.
    const inventory = biz ? await inventoryView(this.prisma, biz.id, room.day) : [];
    const lease = biz
      ? await this.prisma.lease.findFirst({ where: { ownerId: playerId, status: "ACTIVE" } })
      : null;
    const totalServed = served._sum.served ?? 0;
    const lv = levelOf(player.xp);
    return {
      playerId,
      displayName: player.displayName,
      money,
      bank,
      trust: player.trust,
      needs: needsAt(content, needsFrom(player.needs), absMinute(room.day, room.minute)),
      atm: {
        hasPin: player.atmPin !== null,
        locked: player.atmLockDay !== null && player.atmLockDay >= room.day,
      },
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
            promoDay: biz.promoDay,
            wear: biz.wear,
            staff: staffView(biz.employee, room.minute, ownerSells(room, playerId)),
            selfSell: room.selfSell.has(playerId),
            leaseLotId: lease?.lotId ?? null,
          }
        : null,
      inventory,
      shops: shops.map((b) => ({
        id: b.id,
        equipmentId: b.equipmentId,
        productId: b.productId,
        lotId: b.lotId,
        name: b.shopName,
        open: b.status === "OPEN",
        staffOnDuty: !!b.employee && !!shiftAt(content, b.employee.shiftId, room.minute),
        active: b.id === biz?.id,
      })),
      friendship: Object.fromEntries(relations.map((r) => [r.npcId, r.friendship])),
      progress: {
        xp: player.xp,
        level: lv.level,
        into: lv.into,
        need: lv.need,
        fame: fameOf(totalServed, biz?.reputation ?? 0),
        served: totalServed,
        skills: (player.skills ?? {}) as SkillPoints,
      },
      today: {
        sold: report?.served ?? 0,
        revenue: report?.revenue ?? 0,
        tips: report?.tips ?? 0,
        lost: report?.lost ?? 0,
        stockCost: report?.stockCost ?? 0,
        wages: report?.wages ?? 0,
        fees: report?.fees ?? 0,
        staffWages: report?.staffWages ?? 0,
        utilities: report?.utilities ?? 0,
      },
    };
  }

  // ───────────────────────── Tiện ích ─────────────────────────

  private async refreshOccupants(room: RoomRuntime): Promise<WorldView["lots"]> {
    const businesses = await this.prisma.business.findMany({
      where: { ownerId: { in: [...room.members.keys()] }, lotId: { not: null } },
      include: { owner: true },
    });
    const stocks = await Promise.all(businesses.map((b) => stockMap(this.prisma, b.id)));
    const lots = businesses.map((b, i) => ({
      lotId: b.lotId ?? "",
      businessId: b.id,
      ownerId: b.ownerId,
      ownerName: b.owner.displayName,
      menu: menuOf(b),
      available: availableMenu(b.productId, menuOf(b), stocks[i] ?? new Map()).map(
        (m) => m.variantId,
      ),
      equipmentId: b.equipmentId,
      productId: b.productId,
      open: b.status === "OPEN",
      shopName: b.signed ? b.shopName : null,
    }));
    this.occupantsCache.set(room.id, lots);
    return lots;
  }

  private emitWorld(room: RoomRuntime) {
    void Promise.all([this.refreshOccupants(room), this.projects.sites(room.id)])
      .then(([lots, sites]) => this.emitter?.toRoom(room.id, "world", { lots, sites }))
      .catch((err) => this.logger.warn(`không cập nhật được quầy: ${err}`));
  }

  async pushMe(room: RoomRuntime, playerId: string) {
    this.emitter?.toPlayer(playerId, "me", await this.me(room, playerId));
  }

  log(playerId: string, type: string, payload: Record<string, unknown>) {
    return this.prisma.gameEvent
      .create({ data: { playerId, type, payload: payload as object } })
      .catch((err) => this.logger.warn(`không ghi được sự kiện ${type}: ${err}`));
  }

  private event(tx: Tx, playerId: string, type: string, payload: Record<string, unknown>) {
    return tx.gameEvent.create({ data: { playerId, type, payload: payload as object } });
  }
}
