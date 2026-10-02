import { createHash, randomUUID } from "node:crypto";
import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { content, type SkillId } from "@xom/content";
import type {
  AtmReceipt,
  AwayView,
  ClockView,
  DayReportView,
  EventView,
  MeView,
  MovePayload,
  NotifyEvent,
  PayMethod,
  PeerPos,
  RideView,
  RosterView,
  SayEvent,
  Snapshot,
  TalkResult,
  WeatherIdView,
  WorldView,
} from "@xom/shared";
import {
  absMinute,
  addSkill,
  atmAmountError,
  bankInterest,
  canHost,
  chanceIn,
  choosePayment,
  customerArrivals,
  eat,
  eventCategoryDemand,
  fameOf,
  feeToFund,
  hostCost,
  levelOf,
  marketMovesSince,
  marketPackPrice,
  maskText,
  menuPriceRatio,
  needsAlert,
  needsAt,
  needsFrom,
  overrideWeather,
  type PaySource,
  pinError,
  projectDemand,
  recipeIngredients,
  repairCost,
  resaleValue,
  type SkillPoints,
  seededRandom,
  spoilage,
  unlockLevel,
  wearDemand,
  wearState,
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
import type { Business } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ContractService } from "./contracts.js";
import { addItems, inventoryView, stockMap } from "./inventory.js";
import { availableMenu, menuOf, patchMenu } from "./menu.js";
import { OrderService } from "./orders.js";
import { ProjectService } from "./projects.js";
import { RegularService } from "./regulars.js";
import { addToReport, emptyReport } from "./report.js";
import { ReviewService } from "./reviews.js";
import { RideService } from "./rides.js";
import { GameError, RoomRuntime } from "./room.js";
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
const EQUIPMENT_RESALE = 0.5;
/** Người bán ở chợ (thân thiết tăng khi mua hàng). */
const MARKET_KEEPER = "cho_dau_moi";
/** Băm PIN ATM kèm id người chơi (không lưu PIN thô). */
const pinHash = (playerId: string, pin: string) =>
  createHash("sha256").update(`xom-atm:${playerId}:${pin}`).digest("hex");
/** Khoảng cách tối thiểu giữa hai tin chat của một người. */
const CHAT_GAP_MS = 1500;
/** Tối đa người online trong một xóm (docs/PLAN.md Phase 2). */
export const MAX_MEMBERS = 8;
/** Nhịp phát vị trí người chơi cho cả xóm. */
const PEER_FLUSH_MS = 100;
/** Khoảng cách tối đa (m) tới quầy để gọi món. */
const ORDER_REACH = 6;
/** Khoảng cách tối đa (m) tới cây ATM. */
const ATM_REACH = 3;

/** Cổng phát sự kiện ra socket; gateway cung cấp để service không phụ thuộc Socket.IO. */
export interface GameEmitter {
  toRoom(roomId: string, event: "clock", data: ClockView): void;
  toRoom(roomId: string, event: "world", data: WorldView): void;
  toRoom(roomId: string, event: "notify", data: NotifyEvent): void;
  toRoom(roomId: string, event: "say", data: SayEvent): void;
  toRoom(roomId: string, event: "roster", data: RosterView): void;
  toRoom(roomId: string, event: "peers", data: PeerPos[]): void;
  toRoom(roomId: string, event: "events", data: EventView[]): void;
  toPlayer(playerId: string, event: "me", data: MeView): void;
  toPlayer(playerId: string, event: "dayEnd", data: DayReportView): void;
  toPlayer(playerId: string, event: "snapshot", data: Snapshot): void;
  toPlayer(playerId: string, event: "notify", data: NotifyEvent): void;
  toPlayer(playerId: string, event: "ride", data: RideView): void;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

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
    readonly reviews: ReviewService,
    readonly stats: StatsService,
    readonly projects: ProjectService,
    readonly story: StoryService,
    readonly regulars: RegularService,
    readonly staff: StaffService,
    readonly contracts: ContractService,
    readonly rides: RideService,
    readonly shops: ShopService,
  ) {}

  setEmitter(emitter: GameEmitter) {
    this.emitter = emitter;
    this.reviews.setNotifier((playerId, n) => emitter.toPlayer(playerId, "notify", n));
    this.stats.setNotifier((playerId, n) => emitter.toPlayer(playerId, "notify", n));
    this.projects.setNotifier((roomId, n) => emitter.toRoom(roomId, "notify", n));
    this.story.setNotifier((playerId, n) => emitter.toPlayer(playerId, "notify", n));
    this.regulars.setNotifier((playerId, n) => emitter.toPlayer(playerId, "notify", n));
    this.staff.setNotifier((playerId, n) => emitter.toPlayer(playerId, "notify", n));
    this.contracts.setNotifier((playerId, n) => emitter.toPlayer(playerId, "notify", n));
    this.shops.setNotifier(
      (playerId, n) => emitter.toPlayer(playerId, "notify", n),
      (room) => this.emitWorld(room),
    );
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
      this.businessOf(player.id),
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
          await this.closeAllFor(room, playerId);
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
    void this.log(playerId, "xom_join", { from: from.id, to: to.id });
    return { from: from.id, to: to.id };
  }

  /**
   * Người chơi trả tiền (DESIGN §2): 💵 / 🏦 theo lựa chọn, hoặc tự chọn (lặt vặt trả tiền mặt, khoản lớn chuyển khoản).
   * Trả về nguồn đã dùng; thiếu tiền thì báo cách gỡ (rút ATM, chọn ví kia).
   */
  private async payOut(
    tx: Tx,
    playerId: string,
    amount: number,
    to: string,
    reason: string,
    refId?: string,
    method: PayMethod = "auto",
    cashOnly = false,
  ): Promise<PaySource> {
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
    const from = src === "cash" ? playerWallet(playerId) : bankWallet(playerId);
    await this.ledger.transfer(tx, from, to, amount, reason, refId);
    return src;
  }

  /** Ăn / uống (UC-B11): cộng vào mức no / khát hiện tại. */
  async feed(tx: Tx, room: RoomRuntime, playerId: string, add: { food?: number; drink?: number }) {
    const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
    const now = absMinute(room.day, room.minute);
    const next = eat(content, needsFrom(player.needs), now, add);
    await tx.player.update({ where: { id: playerId }, data: { needs: { ...next } } });
    room.needsAlert.delete(playerId);
  }

  /**
   * Mỗi giờ game: ai vừa đói / khát thì nhắc một lần (không khoá gì — chỉ tay chậm đi chút).
   * Người mới (chưa có mốc) được tính là vừa ăn sáng.
   */
  private async needsTick(room: RoomRuntime) {
    const now = absMinute(room.day, room.minute);
    const players = await this.prisma.player.findMany({
      where: { id: { in: [...room.members.keys()] } },
    });
    for (const p of players) {
      const n = needsFrom(p.needs);
      if (!n.at) {
        await this.prisma.player.update({
          where: { id: p.id },
          data: { needs: { food: n.food, drink: n.drink, at: now } },
        });
        continue;
      }
      const a = needsAlert(content, needsAt(content, n, now));
      const key = `${a.food}:${a.drink}`;
      if (key === "ok:ok" || room.needsAlert.get(p.id) === key) continue;
      room.needsAlert.set(p.id, key);
      const text =
        a.food !== "ok" && a.drink !== "ok"
          ? "🍚💧 Vừa đói vừa khát — ghé 🍜 Ăn uống làm tô phở, ly nước mía đi (tay đang chậm hẳn)"
          : a.food !== "ok"
            ? a.food === "empty"
              ? "🍚 Đói lả rồi! Ghé 🍜 Ăn uống kiếm gì bỏ bụng (tay đang chậm)"
              : "🍚 Bụng réo rồi — ghé 🍜 Ăn uống kiếm gì bỏ bụng"
            : a.drink === "empty"
              ? "💧 Khô cổ quá! Làm ly cà phê đá, nước mía đi (tay đang chậm)"
              : "💧 Khát nước rồi — ghé 🍜 Ăn uống làm ly gì mát mát";
      this.emitter?.toPlayer(p.id, "notify", { kind: "warn", text });
      void this.emitMe(p.id).catch(() => undefined);
    }
  }

  /**
   * Quầy đang mở mà chủ đi vắng (đi ăn, đi chợ…): khách tới réo "có ai bán không" — chủ được báo để chạy về
   * (UC-B11). Mỗi quầy réo tối đa một lần mỗi 20 phút game.
   */
  private async calloutTick(room: RoomRuntime) {
    const away = [...room.members.keys()].filter((id) => !room.attending.has(id));
    if (!away.length) return;
    const open = await this.prisma.business.findMany({
      where: { ownerId: { in: away }, status: "OPEN", lotId: { not: null } },
    });
    const lines = content.data.needs.callouts;
    for (const b of open) {
      if ((room.calloutAt.get(b.id) ?? -999) > room.minute - 20) continue;
      // Nhân viên đang trong ca thì khách có người bán, không réo chủ.
      if (await this.staff.onDuty(b.id, room.minute)) continue;
      const rand = seededRandom("callout", b.id, room.day, room.minute);
      if (rand() > 0.6) continue;
      room.calloutAt.set(b.id, room.minute);
      const lot = content.lot(b.lotId ?? "");
      this.emitter?.toRoom(room.id, "say", {
        who: `lot:${lot.id}`,
        text: lines[Math.floor(rand() * lines.length)] ?? "Có ai bán không?",
      });
      this.emitter?.toPlayer(b.ownerId, "notify", {
        kind: "warn",
        text: `🔔 Khách đang réo ở quầy ${lot.name} — chạy về bán thôi!`,
      });
    }
  }

  /** Báo cho người chơi khoản vừa trả đi bằng ví nào (chuyển khoản thì có "ting ting"). */
  private paidBy(playerId: string, src: PaySource, amount: number) {
    if (src !== "bank") return;
    this.emitter?.toPlayer(playerId, "notify", {
      kind: "info",
      text: `🏦 Đã chuyển khoản ${amount.toLocaleString("vi-VN")}đ`,
    });
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
      void this.emitMe(playerId).catch(() => undefined);
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
    void this.log(playerId, player.atmPin ? "atm_pin_change" : "atm_pin_set", {});
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
    void this.log(playerId, deposit ? "atm_deposit" : "atm_withdraw", { amount: p.amount, fee });
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

  /** Người chơi phải đứng ở địa điểm này (gần người đứng quầy, hoặc đang ở trong) — server kiểm, không tin client. */
  requireAt(room: RoomRuntime, playerId: string, placeId: string, message: string) {
    const pos = room.members.get(playerId)?.pos;
    if (!pos) return; // chưa báo vị trí (vừa kết nối) — các bước sau vẫn kiểm tiền, hàng
    const p = content.place(placeId).position;
    if (pos.inside === placeId) return;
    if (pos.inside || Math.hypot(pos.x - p.x, pos.z - p.z) > ORDER_REACH)
      throw new GameError("invalid_state", message);
  }

  async buyEquipment({ room, playerId }: IntentContext, equipmentId: string, pay?: PayMethod) {
    const eq = content.equipmentById.get(equipmentId);
    if (!eq) throw new GameError("invalid_payload", "Không có thiết bị này");
    this.requireAt(room, playerId, "vua_xe", "Tới vựa xe Ông Sáu mới mua xe được");
    const current = await this.businessOf(playerId);
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
      src = await this.payOut(tx, playerId, eq.price, SYSTEM.supplier, "equipment_buy", eq.id, pay);
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
    this.paidBy(playerId, src, eq.price);
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
    this.emitWorld(room);
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
    this.requireAt(room, playerId, MARKET_KEEPER, "Ra chợ Bà Năm mới mua được");
    const eco = content.economy;
    const friendship = await this.friendship(playerId, MARKET_KEEPER);
    let total = marketPackPrice(ing, room.day, room.minute, eco) * packs;
    if (packs >= eco.bulkPacks) total *= 1 - eco.bulkDiscount;
    if (friendship >= eco.friendDiscountAt) total *= 1 - eco.friendDiscount;
    total = Math.max(500, Math.round(total / 500) * 500);
    let src: PaySource = "cash";
    await this.prisma.$transaction(async (tx) => {
      src = await this.payOut(tx, playerId, total, SYSTEM.market, "market_buy", itemId, pay);
      await addItems(tx, playerId, itemId, room.day, ing.packSize * packs);
      await addToReport(tx, playerId, room.day, { stockCost: total });
      await this.addFriendship(tx, playerId, MARKET_KEEPER, 1);
    });
    this.paidBy(playerId, src, total);
    this.stockChanged(room);
  }

  /**
   * Thanh lý hàng tồn (góp ý chơi thử: đổi nghề thì kẹt hàng cũ): bán hết một loại cho Bà Năm với giá thấp
   * (resaleRate × giá gốc), phải đứng ở chợ; tiền qua sổ cái, ghi bớt vào chi phí nhập hàng hôm nay.
   */
  async marketSell({ room, playerId }: IntentContext, itemId: string) {
    const ing = content.ingredientById.get(itemId);
    if (!ing) throw new GameError("invalid_payload", "Chợ không mua món này");
    this.requireAt(room, playerId, MARKET_KEEPER, "Ra chợ Bà Năm mới thanh lý được");
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
    void this.log(playerId, "market_sell", { itemId, qty, value });
    this.emitter?.toRoom(room.id, "say", {
      who: MARKET_KEEPER,
      text:
        value > 0
          ? `Ừ, Bà lấy hết ${qty} ${ing.unit} ${ing.name.toLowerCase()}, gửi con ${value.toLocaleString("vi-VN")}đ.`
          : "Ít quá Bà lấy giùm, khỏi tính tiền nha.",
    });
    this.stockChanged(room);
  }

  /** Kho của ai đó đổi: hàng xóm cần biết món nào còn làm được (chỉ khi xóm có người khác). */
  stockChanged(room: RoomRuntime) {
    if (room.members.size > 1) this.emitWorld(room);
  }

  async updateLot({ room, playerId }: IntentContext, lotId: string) {
    const biz = await this.requireBusiness(playerId);
    if (lotId === biz.lotId) return;
    if (!content.lotById.has(lotId)) throw new GameError("invalid_payload", "Không có chỗ này");
    // Nhà mặt tiền: phải ký hợp đồng thuê trước (UC-F12) — mở bằng vốn, không khoá theo cấp.
    if (content.lot(lotId).kind === "house") await this.shops.requireLease(playerId, lotId);
    if (biz.status === "OPEN") throw new GameError("invalid_state", "Đóng quầy rồi mới chuyển chỗ");
    const taken = (this.occupantsCache.get(room.id) ?? []).find((o) => o.lotId === lotId);
    if (taken) throw new GameError("invalid_state", `Chỗ này ${taken.ownerName} đang dùng`);
    await this.prisma.business.update({ where: { id: biz.id }, data: { lotId } });
    this.emitWorld(room);
  }

  /** Bật/tắt món, đổi giá trong thực đơn (UC-F2). */
  async setMenu(
    { room, playerId }: IntentContext,
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
    // Hàng xóm thấy thực đơn/giá mới.
    this.emitWorld(room);
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
      src = await this.payOut(tx, playerId, amount, fundWallet(room.id), "donate", room.id, pay);
    });
    this.paidBy(playerId, src, amount);
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

  /**
   * Mua đồ ăn ở sạp NPC (UC-B9, B10): sạp phải đang bày (đúng giờ), mình phải đứng gần; tiền đi qua sổ cái.
   * Người bán nói một câu, thân thiết +1.
   */
  async vendorBuy(
    { room, playerId }: IntentContext,
    vendorId: string,
    itemId: string,
    pay?: PayMethod,
  ) {
    const v = content.data.vendors.find((x) => x.id === vendorId);
    const item = v?.items.find((i) => i.id === itemId);
    if (!v || !item) throw new GameError("invalid_payload", "Sạp không bán món này");
    if (room.minute < v.open || room.minute >= v.close)
      throw new GameError("invalid_state", `${v.sign} chưa bày hàng hoặc đã dọn rồi`);
    const pos = room.members.get(playerId)?.pos;
    if (pos && (pos.inside || Math.hypot(pos.x - v.position.x, pos.z - v.position.z) > ORDER_REACH))
      throw new GameError("invalid_state", "Lại gần sạp mới mua được");
    let src: PaySource = "cash";
    await this.prisma.$transaction(async (tx) => {
      src = await this.payOut(
        tx,
        playerId,
        item.price,
        SYSTEM.market,
        "food",
        v.id,
        pay,
        v.cashOnly,
      );
      await this.addFriendship(tx, playerId, v.id, 1);
      await this.feed(tx, room, playerId, { food: item.food, drink: item.drink });
    });
    this.paidBy(playerId, src, item.price);
    void this.log(playerId, "vendor_buy", { vendorId: v.id, itemId: item.id, price: item.price });
    const line = v.lines[Math.floor(Math.random() * v.lines.length)] ?? "Cảm ơn con!";
    this.emitter?.toRoom(room.id, "say", { who: `vendor:${v.id}`, text: `${line} (${item.name})` });
  }

  /**
   * Người chơi tự tổ chức sự kiện (DESIGN §9, UC-B5): khai trương — phải đang đứng quầy đang mở; trả tiền pháo, bong bóng,
   * băng rôn (money sink, Luật 2.2); đổi lại quầy đông khách + giảm giá trong X giờ game, cả xóm thấy tin.
   */
  async hostEvent({ room, playerId }: IntentContext, eventId: string, pay?: PayMethod) {
    const def = content.data.events.find((e) => e.id === eventId);
    if (!def || def.trigger.kind !== "player")
      throw new GameError("invalid_payload", "Không có sự kiện này");
    const biz = await this.requireBusiness(playerId);
    if (biz.status !== "OPEN" || !biz.lotId || !room.attending.has(playerId))
      throw new GameError("invalid_state", "Mở quầy và đứng ở quầy rồi mới khai trương được");
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
      src = await this.payOut(tx, playerId, cost, SYSTEM.market, "event", def.id, pay);
      await tx.business.update({ where: { id: biz.id }, data: { promoDay: room.day } });
      await addToReport(tx, playerId, room.day, { fees: cost });
      await this.event(tx, playerId, "event_host", { eventId: def.id, cost, lotId: biz.lotId });
    });
    this.paidBy(playerId, src, cost);
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
    this.emitter?.toRoom(room.id, "events", room.events);
    this.emitter?.toRoom(room.id, "say", {
      who: playerId,
      text: "🎉 Khai trương! Ghé ủng hộ nha!",
    });
  }

  /** Hệ số khách + giảm giá từ sự kiện đang diễn ra ở một quầy. */
  private promoOf(room: RoomRuntime, businessId: string) {
    let demand = 1;
    let discount = 0;
    for (const e of room.activeEvents(businessId)) {
      const fx = content.event(e.eventId).effects;
      demand *= fx.demand ?? 1;
      discount = Math.max(discount, fx.discount ?? 0);
    }
    return { demand, discount };
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
    if (lot.kind === "house") await this.shops.requireReady(room, biz, lot.id);
    const eco = content.economy;
    if (wearState(biz.wear, eco.maintenance) === "broken")
      throw new GameError("invalid_state", "Xe hư rồi — đẩy tới vựa xe Ông Sáu sửa đã");
    await this.prisma.$transaction(async (tx) => {
      const paid = biz.rentPaidDay === room.day && biz.rentLotId === lot.id;
      if (!paid) {
        await this.payOut(tx, playerId, lot.rentPerDay, SYSTEM.landlord, "rent", lot.id);
        // Phí chợ/vệ sinh (xe đẩy) hoặc thuế khoán (tiệm) mỗi ngày — Luật 2.2.
        const fee = eco.fees.daily[lot.kind];
        // Phí chợ thu tận tay; một phần vào quỹ xóm làm công trình chung (UC-J5), còn lại cho ban quản lý chợ.
        if (fee > 0) {
          const toFund = feeToFund(fee, content.data.fund.feeShare);
          if (toFund > 0)
            await this.payOut(tx, playerId, toFund, fundWallet(room.id), "fee", lot.id);
          if (fee - toFund > 0)
            await this.payOut(tx, playerId, fee - toFund, SYSTEM.landlord, "fee", lot.id);
        }
        await addToReport(tx, playerId, room.day, { rent: lot.rentPerDay, fees: fee });
      }
      await tx.business.update({
        where: { id: biz.id },
        data: { status: "OPEN", rentPaidDay: room.day, rentLotId: lot.id },
      });
    });
    void this.log(playerId, "biz_open", {
      lotId: lot.id,
      productId: biz.productId,
      kind: lot.kind,
    });
    // Chuyện của tôi: lần đầu mở quầy; lần đầu mở tiệm trong nhà mặt tiền.
    const product = content.product(biz.productId).name.toLowerCase();
    await this.story.note(playerId, "first_open", room.day, { product, lot: lot.name });
    if (lot.kind === "house")
      await this.story.note(playerId, "first_shop", room.day, { lot: lot.name });
    this.emitWorld(room);
  }

  /**
   * Sửa xe/quầy ở vựa xe Ông Sáu (Luật 2.2): tiền sửa theo độ mòn; sửa xong như mới.
   */
  async repair({ room, playerId }: IntentContext, pay?: PayMethod) {
    this.requireAt(room, playerId, "vua_xe", "Đẩy xe tới vựa xe Ông Sáu mới sửa được");
    const biz = await this.requireBusiness(playerId);
    if (biz.status === "OPEN")
      throw new GameError("invalid_state", "Đóng quầy rồi mới đem xe đi sửa");
    const m = content.economy.maintenance;
    const cost = repairCost(content.equipment(biz.equipmentId).price, biz.wear, m);
    if (cost <= 0) throw new GameError("invalid_state", "Xe còn tốt mà, chưa cần sửa đâu con");
    let src: PaySource = "cash";
    await this.prisma.$transaction(async (tx) => {
      src = await this.payOut(tx, playerId, cost, SYSTEM.supplier, "repair", biz.id, pay);
      await tx.business.update({ where: { id: biz.id }, data: { wear: 0 } });
      await addToReport(tx, playerId, room.day, { fees: cost });
    });
    this.paidBy(playerId, src, cost);
    void this.log(playerId, "repair", { cost, wear: biz.wear });
    this.emitter?.toRoom(room.id, "say", {
      who: "vua_xe",
      text: `Sửa xong rồi, chạy ngon như mới! Hết ${cost.toLocaleString("vi-VN")}đ nha con.`,
    });
  }

  /**
   * Điện nước của tiệm (Luật 2.2): mỗi giờ tiệm (nhà mặt tiền) mở cửa trả một khoản; hết tiền mặt thì trừ tài khoản;
   * hết cả hai thì tiệm phải đóng cửa.
   */
  private async chargeUtilities(room: RoomRuntime) {
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
            await addToReport(tx, b.ownerId, room.day, { fees: perHour });
          });
          paid = true;
          break;
        } catch (err) {
          if (!(err instanceof InsufficientFundsError)) throw err;
        }
      }
      if (!paid) {
        await this.closeAllFor(room, b.ownerId);
        this.emitWorld(room);
        this.emitter?.toPlayer(b.ownerId, "notify", {
          kind: "warn",
          text: "Hết tiền đóng điện nước — tiệm phải tạm đóng cửa.",
        });
      }
      this.emitter?.toPlayer(b.ownerId, "me", await this.me(room, b.ownerId));
    }
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
    let friendship = await this.friendship(playerId, npcId);
    let line: string;
    if (topic === "greet") {
      const rel = await this.prisma.npcRelation.findUnique({
        where: { playerId_npcId: { playerId, npcId } },
      });
      if (!rel || rel.lastGreetDay !== room.day) {
        friendship = await this.prisma.$transaction(async (tx) => {
          await this.gainSkill(tx, playerId, "an_noi");
          return this.addFriendship(tx, playerId, npcId, 2, room.day);
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
        if (room.minute % eco.economyTickMinutes === 0) {
          await this.customerTick(room);
          for (const owner of await this.staff.tickLive(room))
            this.emitter?.toPlayer(owner, "me", await this.me(room, owner));
          await this.calloutTick(room);
          await this.contracts.tick(room);
          await this.projects.tick(room);
        }
        if (room.minute % 60 === 0) {
          await this.chargeUtilities(room);
          await this.needsTick(room);
        }
        await this.work.tick(room);
        await this.rides.tick(room);
        await this.shops.tick(room);
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
    const staffed = [...room.members.keys()].filter((id) => room.attending.has(id));
    const businesses = await this.prisma.business.findMany({
      where: { ownerId: { in: staffed }, status: "OPEN", lotId: { not: null } },
    });
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
          this.promoOf(room, b.id).demand *
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
      const { discount } = this.promoOf(room, b.id);
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
    // Nhà thuê tính tiền mỗi ngày dù mở hay đóng (UC-F12).
    await this.shops.endDay(room).catch((err) => this.logger.warn(`tính tiền nhà lỗi: ${err}`));
    for (const playerId of [...room.shifts.keys()]) await this.work.end(room, playerId, "day_end");
    room.boostUntil.clear();
    room.shoutReadyAt.clear();
    room.purchases.clear();
    room.atmTries.clear();
    room.calloutAt.clear();
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
        // Lãi ngân hàng (rất nhỏ, có trần — Luật 2.3).
        const interest = bankInterest(
          await this.ledger.balance(tx, bankWallet(playerId)),
          content.economy.bank,
        );
        if (interest > 0)
          await this.ledger.transfer(tx, SYSTEM.bank, bankWallet(playerId), interest, "interest");
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
        profit:
          report.revenue +
          report.tips +
          report.wages +
          report.interest -
          report.stockCost -
          report.rent -
          report.fees,
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
      world: { lots: this.occupantsCache.get(room.id) ?? (await this.refreshOccupants(room)) },
      shift: this.work.view(room, playerId),
      roster: this.roster(room),
      events: room.events,
      orders: [...room.orders.values()]
        .filter((o) => o.event.ownerId === playerId || o.event.buyerId === playerId)
        .map((o) => o.event),
    };
  }

  async me(room: RoomRuntime, playerId: string): Promise<MeView> {
    const [player, biz, inventory, report, money, bank, relations, served] = await Promise.all([
      this.prisma.player.findUniqueOrThrow({ where: { id: playerId } }),
      this.businessOf(playerId),
      inventoryView(this.prisma, playerId, room.day),
      this.prisma.dailyReport.findUnique({ where: { playerId_day: { playerId, day: room.day } } }),
      this.ledger.balance(this.prisma, playerWallet(playerId)),
      this.ledger.balance(this.prisma, bankWallet(playerId)),
      this.prisma.npcRelation.findMany({ where: { playerId } }),
      this.prisma.dailyReport.aggregate({ where: { playerId }, _sum: { served: true } }),
    ]);
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
          }
        : null,
      inventory,
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
      },
    };
  }

  // ───────────────────────── Tiện ích ─────────────────────────

  private async refreshOccupants(room: RoomRuntime): Promise<WorldView["lots"]> {
    const businesses = await this.prisma.business.findMany({
      where: { ownerId: { in: [...room.members.keys()] }, lotId: { not: null } },
      include: { owner: true },
    });
    const stocks = await Promise.all(businesses.map((b) => stockMap(this.prisma, b.ownerId)));
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
    void this.refreshOccupants(room)
      .then((lots) => this.emitter?.toRoom(room.id, "world", { lots }))
      .catch((err) => this.logger.warn(`không cập nhật được quầy: ${err}`));
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

  /** Ghi sự kiện đo lường (DESIGN §16), không chặn luồng chơi nếu lỗi. */
  /** Gửi MeView mới cho người chơi (sau intent không trả MeView mà đổi tiền / kho). */
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
