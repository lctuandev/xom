import { Injectable } from "@nestjs/common";
import { content } from "@xom/content";
import type {
  GigBoardView,
  GigView,
  NotifyEvent,
  PhotoSessionView,
  PhotoShotView,
} from "@xom/shared";
import {
  adMultiplier,
  disputeVerdict,
  gigDeposit,
  gigFee,
  type PhotoMoment,
  photoMoments,
  photoQuality,
  shotScore,
  trustAfter,
  trustLevel,
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
import type { Gig } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { addToReport } from "./report.js";
import { GameError, type RoomRuntime } from "./room.js";
import { StoryService } from "./story.js";

/** Phải đứng cách quầy cần chụp trong khoảng này (mét). */
const REACH = 7;
/** Phút trong một ngày game (để tính hạn nghiệm thu qua ngày). */
const DAY = 1440;
/** Chừa trễ mạng khi bấm máy cuối buổi (ms). */
const LATE_MS = 600;
/** Bù trễ mạng tối đa khi chấm giờ bấm máy (ms). */
const MAX_LAG_MS = 400;

export const gigWallet = (gigId: string) => `escrow:gig:${gigId}`;

interface Session {
  gigId: string;
  startedAt: number;
  moments: PhotoMoment[];
  shots: number[];
}

/**
 * 📋 Việc người chơi đăng cho nhau (docs/KIENTRUC.md §3 — 1.20b, docs/USECASES.md UC-M8). Hiện có 📸 chụp ảnh quầy (NGHE §3.3).
 *
 * Như sàn việc tự do ngoài đời (escrow): người đăng **trả trước** tiền công vào ví giữ hộ (+ phí ghi sổ vào quỹ xóm) → người
 * nhận đặt cọc → làm việc (thuê máy ảnh, tới tận quầy đang mở, chụp đúng khoảnh khắc — server sinh khoảnh khắc + chấm từng tấm
 * theo giờ server) → nộp bộ ảnh → người đăng **nghiệm thu** + chấm sao trong hạn, quá hạn thì **tự trả**; khiếu nại thì
 * Chú Hai xem ảnh rồi phân xử. Ảnh được duyệt đăng lên nhóm xóm: quầy đông khách hơn vài giờ.
 */
@Injectable()
export class GigService {
  private notify?: (playerId: string, n: NotifyEvent) => void;
  /** Buổi chụp đang diễn ra (theo người chụp). */
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly story: StoryService,
  ) {}

  setNotifier(fn: (playerId: string, n: NotifyEvent) => void) {
    this.notify = fn;
  }

  private now(room: RoomRuntime) {
    return room.day * DAY + room.minute;
  }

  async board(room: RoomRuntime, playerId: string): Promise<GigBoardView> {
    const [player, biz, rows] = await Promise.all([
      this.prisma.player.findUniqueOrThrow({ where: { id: playerId } }),
      this.prisma.business.findFirst({ where: { ownerId: playerId } }),
      this.prisma.gig.findMany({
        where: {
          roomId: room.id,
          OR: [
            { day: room.day },
            { posterId: playerId, status: { in: ["OPEN", "TAKEN", "SUBMITTED"] } },
            { takerId: playerId, status: { in: ["TAKEN", "SUBMITTED"] } },
          ],
        },
        orderBy: [{ createdAt: "desc" }],
      }),
    ]);
    const ids = new Set<string>();
    for (const g of rows) {
      ids.add(g.posterId);
      if (g.takerId) ids.add(g.takerId);
    }
    const people = await this.prisma.player.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, displayName: true, gigs: true, gigStars: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));
    const shops = await this.prisma.business.findMany({
      where: { id: { in: rows.map((g) => g.businessId) } },
      select: { id: true, shopName: true, productId: true },
    });
    const shopName = new Map(
      shops.map((b) => [
        b.id,
        b.shopName ?? `quầy ${content.product(b.productId).name.toLowerCase()}`,
      ]),
    );
    return {
      day: room.day,
      trust: player.trust,
      lockedUntil:
        player.trustLockDay !== null && player.trustLockDay >= room.day
          ? player.trustLockDay
          : null,
      canPost: !!biz,
      gigs: rows.map((g) => {
        const taker = g.takerId ? byId.get(g.takerId) : undefined;
        const session = this.sessions.get(playerId);
        const view: GigView = {
          id: g.id,
          kind: "photo",
          posterName: byId.get(g.posterId)?.displayName ?? "Hàng xóm",
          shopName: shopName.get(g.businessId) ?? "quầy",
          lotId: g.lotId,
          reward: g.reward,
          deposit: g.deposit,
          fee: g.fee,
          deadline: g.deadline,
          status: g.status,
          takerName: taker?.displayName ?? null,
          takerRating: taker
            ? { gigs: taker.gigs, avg: taker.gigs ? taker.gigStars / taker.gigs : 0 }
            : null,
          posted: g.posterId === playerId,
          taken: g.takerId === playerId,
          cameraPaid: g.cameraPaid,
          shots: session?.gigId === g.id ? session.shots : g.shots,
          quality: g.quality,
          stars: g.stars,
          reviewBy: g.reviewBy === null ? null : g.reviewBy - room.day * DAY,
          verdict: (g.verdict as GigView["verdict"]) ?? null,
        };
        return view;
      }),
    };
  }

  /** Chủ quầy đăng việc chụp ảnh quầy: trả trước tiền công vào ví giữ hộ + phí ghi sổ vào quỹ xóm. */
  async post(room: RoomRuntime, playerId: string, reward: number, hours: number) {
    const p = content.data.gigs.photo;
    if (!p.rewards.includes(reward))
      throw new GameError("invalid_payload", "Mức tiền công không có");
    if (!p.hours.includes(hours)) throw new GameError("invalid_payload", "Hạn làm không có");
    const biz = await this.prisma.business.findFirst({ where: { ownerId: playerId } });
    if (!biz?.lotId)
      throw new GameError("invalid_state", "Có quầy rồi mới thuê chụp ảnh quầy được");
    const open = await this.prisma.gig.count({
      where: { posterId: playerId, status: { in: ["OPEN", "TAKEN", "SUBMITTED"] } },
    });
    if (open > 0) throw new GameError("invalid_state", "Đang có một việc chụp ảnh chưa xong");
    const deadline = Math.min(room.minute + hours * 60, content.economy.dayEndMinute - 1);
    if (deadline - room.minute < 30)
      throw new GameError("invalid_state", "Sắp hết ngày rồi — mai đăng việc nghen");
    const fee = gigFee(content, reward);
    const lotId = biz.lotId;
    await this.prisma.$transaction(async (tx) => {
      const gig = await tx.gig.create({
        data: {
          roomId: room.id,
          day: room.day,
          kind: "photo",
          posterId: playerId,
          businessId: biz.id,
          lotId,
          reward,
          deposit: gigDeposit(content, reward),
          fee,
          deadline,
        },
      });
      await this.pay(
        tx,
        playerId,
        gigWallet(gig.id),
        reward,
        "gig_escrow",
        gig.id,
        "Không đủ tiền công",
      );
      await this.pay(
        tx,
        playerId,
        fundWallet(room.id),
        fee,
        "gig_fee",
        gig.id,
        "Không đủ tiền phí ghi sổ",
      );
      await addToReport(tx, playerId, room.day, { fees: fee });
      await tx.gameEvent.create({
        data: { playerId, type: "gig_post", payload: { reward, hours } },
      });
    });
    return this.board(room, playerId);
  }

  /** Gỡ việc khi chưa ai nhận: hoàn tiền công (phí ghi sổ không hoàn). */
  async cancel(room: RoomRuntime, playerId: string, id: string) {
    const g = await this.prisma.gig.findFirst({ where: { id, posterId: playerId } });
    if (!g || g.status !== "OPEN")
      throw new GameError("invalid_state", "Có người nhận rồi, không gỡ được");
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.gig.updateMany({
        where: { id, status: "OPEN" },
        data: { status: "CANCELLED" },
      });
      if (moved.count === 0)
        throw new GameError("invalid_state", "Có người nhận rồi, không gỡ được");
      await this.ledger.transfer(
        tx,
        gigWallet(id),
        playerWallet(playerId),
        g.reward,
        "gig_refund",
        id,
      );
    });
    return this.board(room, playerId);
  }

  /** Nhận việc: không tự nhận việc mình, đủ tin cậy, không bị khoá; cọc vào ví giữ hộ. */
  async take(room: RoomRuntime, playerId: string, id: string) {
    const g = await this.prisma.gig.findFirst({ where: { id, roomId: room.id } });
    if (!g || g.status !== "OPEN" || g.day !== room.day || room.minute >= g.deadline)
      throw new GameError("invalid_state", "Việc này không còn trên bảng");
    if (g.posterId === playerId)
      throw new GameError("invalid_state", "Việc mình đăng thì nhờ người khác làm chứ");
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    const keeper = content.data.contracts.keeper;
    if (player.trustLockDay !== null && player.trustLockDay >= room.day)
      throw new GameError(
        "invalid_state",
        `${keeper}: "Bỏ việc nhiều quá, nghỉ tới hết ngày ${player.trustLockDay} rồi tính nghen."`,
      );
    const min = content.data.gigs.photo.minTrust;
    if (player.trust < min)
      throw new GameError(
        "invalid_state",
        `${keeper}: "Việc của người ta cần tin cậy ${min} trở lên nghen."`,
      );
    const active = await this.prisma.gig.count({
      where: { takerId: playerId, status: { in: ["TAKEN", "SUBMITTED"] } },
    });
    if (active > 0)
      throw new GameError("invalid_state", "Xong việc đang nhận rồi hẵng nhận việc mới");
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.gig.updateMany({
        where: { id, status: "OPEN" },
        data: { status: "TAKEN", takerId: playerId },
      });
      if (claimed.count === 0) throw new GameError("invalid_state", "Có người nhận mất rồi");
      await this.pay(
        tx,
        playerId,
        gigWallet(id),
        g.deposit,
        "gig_deposit",
        id,
        "Không đủ tiền đặt cọc",
      );
      await tx.gameEvent.create({
        data: { playerId, type: "gig_take", payload: { reward: g.reward } },
      });
    });
    this.notify?.(g.posterId, {
      kind: "info",
      text: `📸 ${player.displayName} nhận chụp ảnh quầy bạn — nhớ mở quầy cho người ta chụp`,
      open: "jobs:gigs",
    });
    return this.board(room, playerId);
  }

  /** Bỏ ngang: như trễ hạn. */
  async drop(room: RoomRuntime, playerId: string, id: string) {
    const g = await this.mine(playerId, id);
    if (g.status !== "TAKEN") throw new GameError("invalid_state", "Đã nộp ảnh rồi");
    await this.fail(room, g, "bỏ ngang");
    return this.board(room, playerId);
  }

  /** Bắt đầu buổi chụp: đứng tại quầy đang mở; lần đầu thì thuê máy ảnh. Server sinh khoảnh khắc + bấm giờ. */
  async shoot(room: RoomRuntime, playerId: string, id: string): Promise<PhotoSessionView> {
    const g = await this.mine(playerId, id);
    if (g.status !== "TAKEN") throw new GameError("invalid_state", "Đã nộp ảnh rồi");
    const p = content.data.gigs.photo;
    if (g.shots.length >= p.shots)
      throw new GameError("invalid_state", `Chụp đủ ${p.shots} kiểu rồi — nộp ảnh thôi`);
    const lot = content.lot(g.lotId).position;
    const pos = room.members.get(playerId)?.pos;
    if (!pos || pos.inside || Math.hypot(pos.x - lot.x, pos.z - lot.z) > REACH)
      throw new GameError("invalid_state", "Tới tận quầy người ta mới chụp được");
    const biz = await this.prisma.business.findUnique({ where: { id: g.businessId } });
    if (biz?.status !== "OPEN")
      throw new GameError(
        "invalid_state",
        "Quầy đang đóng — chờ chủ quầy mở hàng rồi chụp mới có không khí",
      );
    if (!g.cameraPaid)
      await this.prisma.$transaction(async (tx) => {
        await this.pay(
          tx,
          playerId,
          SYSTEM.market,
          p.cameraRent,
          "camera_rent",
          id,
          "Không đủ tiền thuê máy ảnh",
        );
        await tx.gig.update({ where: { id }, data: { cameraPaid: true } });
        await addToReport(tx, playerId, room.day, { fees: p.cameraRent });
      });
    const moments = photoMoments(content, id, playerId, g.shots.length, Date.now());
    this.sessions.set(playerId, { gigId: id, startedAt: Date.now(), moments, shots: [...g.shots] });
    return { gigId: id, sessionMs: p.sessionMs, shotsMax: p.shots - g.shots.length, moments };
  }

  /** Bấm máy: server chấm theo giờ server (không tin giờ của máy người chơi). */
  async shot(playerId: string, id: string, at?: number): Promise<PhotoShotView> {
    const s = this.sessions.get(playerId);
    if (!s || s.gigId !== id)
      throw new GameError("invalid_state", "Chưa cầm máy — bắt đầu buổi chụp đã");
    const p = content.data.gigs.photo;
    const t = Date.now() - s.startedAt;
    if (t > p.sessionMs + LATE_MS) {
      await this.endSession(playerId);
      throw new GameError("invalid_state", "Hết buổi chụp rồi");
    }
    if (s.shots.length >= p.shots)
      throw new GameError("invalid_state", `Chụp đủ ${p.shots} kiểu rồi`);
    // Bù trễ mạng / giật hình: tin giờ bấm của máy người chơi nhưng chỉ sớm hơn giờ server tối đa `MAX_LAG_MS`
    // (không "bấm trước" được khi server chưa nhận, cũng không lùi giờ quá xa để gian lận).
    const when = at === undefined ? t : Math.min(t, Math.max(t - MAX_LAG_MS, at));
    const score = shotScore(content, s.moments, when);
    s.shots.push(score);
    await this.prisma.gig.update({ where: { id }, data: { shots: s.shots } });
    return { score, shots: s.shots };
  }

  private async endSession(playerId: string) {
    const s = this.sessions.get(playerId);
    if (!s) return;
    this.sessions.delete(playerId);
    await this.prisma.gig
      .update({ where: { id: s.gigId }, data: { shots: s.shots } })
      .catch(() => undefined);
  }

  /** Nộp bộ ảnh (các tấm đẹp nhất): chờ người đăng nghiệm thu trong hạn. */
  async submit(room: RoomRuntime, playerId: string, id: string) {
    await this.endSession(playerId);
    const g = await this.mine(playerId, id);
    if (g.status !== "TAKEN") throw new GameError("invalid_state", "Đã nộp ảnh rồi");
    const keep = content.data.gigs.photo.keep;
    if (g.shots.length < keep)
      throw new GameError("invalid_state", `Chụp ít nhất ${keep} kiểu rồi mới nộp`);
    const quality = photoQuality(content, g.shots);
    const reviewBy = this.now(room) + content.data.gigs.reviewMinutes;
    await this.prisma.gig.update({
      where: { id },
      data: { status: "SUBMITTED", quality, reviewBy },
    });
    const taker = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    this.notify?.(g.posterId, {
      kind: "info",
      text: `📸 ${taker.displayName} nộp ảnh quầy — bấm để nghiệm thu (quá ${content.data.gigs.reviewMinutes / 60} giờ tự trả tiền)`,
      open: "jobs:gigs",
    });
    return this.board(room, playerId);
  }

  /** Người đăng nghiệm thu + chấm sao: trả tiền công + hoàn cọc; ảnh đăng lên nhóm xóm. */
  async review(room: RoomRuntime, playerId: string, id: string, stars: number) {
    const g = await this.prisma.gig.findFirst({ where: { id, posterId: playerId } });
    if (!g || g.status !== "SUBMITTED")
      throw new GameError("invalid_state", "Chưa có ảnh để nghiệm thu");
    await this.release(room, g, "accepted", stars);
    return this.board(room, playerId);
  }

  /** Khiếu nại: Chú Hai xem bộ ảnh rồi phân xử theo chuẩn. */
  async dispute(room: RoomRuntime, playerId: string, id: string) {
    const g = await this.prisma.gig.findFirst({ where: { id, posterId: playerId } });
    if (!g || g.status !== "SUBMITTED")
      throw new GameError("invalid_state", "Chưa có ảnh để khiếu nại");
    const keeper = content.data.contracts.keeper;
    const quality = g.quality ?? 0;
    if (disputeVerdict(content, quality) === "taker") {
      await this.release(room, g, "dispute_taker", null);
      const p = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
      await this.prisma.player.update({
        where: { id: playerId },
        data: { trust: trustAfter(content, p.trust, "dispute_lost") },
      });
      this.notify?.(playerId, {
        kind: "warn",
        text: `⚖️ ${keeper}: "Ảnh ${quality}/100 vậy là đạt rồi con" — vẫn trả tiền công, 🤝 −${content.data.gigs.disputeLostTrust}`,
      });
    } else {
      await this.refundAfterDispute(g);
      this.notify?.(playerId, {
        kind: "good",
        text: `⚖️ ${keeper}: "Ảnh ${quality}/100 chưa đạt" — hoàn lại ${g.reward.toLocaleString("vi-VN")}đ tiền công`,
      });
    }
    return this.board(room, playerId);
  }

  /** Mỗi nhịp: hết hạn chưa ai nhận → hoàn; nhận mà quá hạn chưa nộp → hỏng; nộp mà quá hạn nghiệm thu → tự trả. */
  async tick(room: RoomRuntime) {
    const late = { OR: [{ day: { lt: room.day } }, { deadline: { lt: room.minute } }] };
    const expired = await this.prisma.gig.findMany({
      where: { roomId: room.id, status: "OPEN", ...late },
    });
    for (const g of expired) {
      await this.prisma.$transaction(async (tx) => {
        const moved = await tx.gig.updateMany({
          where: { id: g.id, status: "OPEN" },
          data: { status: "EXPIRED" },
        });
        if (moved.count === 0) return;
        await this.ledger.transfer(
          tx,
          gigWallet(g.id),
          playerWallet(g.posterId),
          g.reward,
          "gig_refund",
          g.id,
        );
      });
      this.notify?.(g.posterId, {
        kind: "info",
        text: `📸 Chưa ai nhận chụp ảnh quầy — hoàn ${g.reward.toLocaleString("vi-VN")}đ tiền công`,
      });
    }
    const overdue = await this.prisma.gig.findMany({
      where: { roomId: room.id, status: "TAKEN", ...late },
    });
    for (const g of overdue) await this.fail(room, g, "trễ hạn");
    const unreviewed = await this.prisma.gig.findMany({
      where: { roomId: room.id, status: "SUBMITTED", reviewBy: { lte: this.now(room) } },
    });
    for (const g of unreviewed) await this.release(room, g, "auto", null);
  }

  /** Quầy được ảnh quảng cáo (nhân vào lượng khách). */
  adOf(room: RoomRuntime, biz: { adDay: number | null; adUntil: number | null; adMul: number }) {
    return biz.adDay === room.day && (biz.adUntil ?? 0) > room.minute ? biz.adMul : 1;
  }

  /** Trả tiền công + hoàn cọc cho người nhận; ảnh đăng nhóm xóm; tin cậy + sao. */
  private async release(
    room: RoomRuntime,
    g: Gig,
    verdict: "accepted" | "auto" | "dispute_taker",
    stars: number | null,
  ) {
    const takerId = g.takerId;
    if (!takerId) return;
    const quality = g.quality ?? 0;
    const p = content.data.gigs.photo;
    const mul = adMultiplier(content, quality);
    const done = await this.prisma.$transaction(async (tx) => {
      const moved = await tx.gig.updateMany({
        where: { id: g.id, status: "SUBMITTED" },
        data: { status: "DONE", verdict, stars, doneAt: new Date() },
      });
      if (moved.count === 0) return false;
      await this.ledger.transfer(
        tx,
        gigWallet(g.id),
        playerWallet(takerId),
        g.reward,
        "gig_reward",
        g.id,
      );
      await this.ledger.transfer(
        tx,
        gigWallet(g.id),
        playerWallet(takerId),
        g.deposit,
        "gig_deposit_back",
        g.id,
      );
      const taker = await tx.player.findUniqueOrThrow({ where: { id: takerId } });
      await tx.player.update({
        where: { id: takerId },
        data: {
          trust: trustAfter(content, taker.trust, "done"),
          ...(stars ? { gigs: { increment: 1 }, gigStars: { increment: stars } } : {}),
        },
      });
      await tx.business.update({
        where: { id: g.businessId },
        data: { adDay: room.day, adUntil: room.minute + p.adMinutes, adMul: mul },
      });
      await addToReport(tx, takerId, room.day, { revenue: g.reward });
      await tx.gameEvent.create({
        data: {
          playerId: takerId,
          type: "gig_done",
          payload: { reward: g.reward, quality, stars, verdict },
        },
      });
      return true;
    });
    if (!done) return;
    const [taker, poster, shop] = await Promise.all([
      this.prisma.player.findUniqueOrThrow({ where: { id: takerId } }),
      this.prisma.player.findUniqueOrThrow({ where: { id: g.posterId } }),
      this.prisma.business.findUnique({ where: { id: g.businessId } }),
    ]);
    const shopName =
      shop?.shopName ?? `quầy ${content.product(shop?.productId ?? "banh_mi").name.toLowerCase()}`;
    const boost = Math.round((mul - 1) * 100);
    this.notify?.(takerId, {
      kind: "good",
      text: `📸 ${verdict === "auto" ? `${poster.displayName} chưa nghiệm thu — tự trả` : `${poster.displayName} nhận ảnh${stars ? ` ${"⭐".repeat(stars)}` : ""}`}: +${g.reward.toLocaleString("vi-VN")}đ, hoàn cọc. 🤝 +${content.data.contracts.trust.done}`,
    });
    this.notify?.(g.posterId, {
      kind: "good",
      text: `📣 Ảnh quầy (${quality}/100) đăng lên nhóm xóm — khách ghé +${boost}% trong ${p.adMinutes / 60} giờ`,
    });
    await this.story.note(takerId, "first_gig", room.day, {
      shop: shopName,
      name: poster.displayName,
    });
    await this.story.note(g.posterId, "first_gig_post", room.day, { name: taker.displayName });
  }

  /** Phân xử người đăng thắng: hoàn tiền công; người nhận lấy lại cọc nhưng mất tin cậy. */
  private async refundAfterDispute(g: Gig) {
    const takerId = g.takerId;
    if (!takerId) return;
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.gig.updateMany({
        where: { id: g.id, status: "SUBMITTED" },
        data: { status: "REFUNDED", verdict: "dispute_poster", doneAt: new Date() },
      });
      if (moved.count === 0) return;
      await this.ledger.transfer(
        tx,
        gigWallet(g.id),
        playerWallet(g.posterId),
        g.reward,
        "gig_refund",
        g.id,
      );
      await this.ledger.transfer(
        tx,
        gigWallet(g.id),
        playerWallet(takerId),
        g.deposit,
        "gig_deposit_back",
        g.id,
      );
      const taker = await tx.player.findUniqueOrThrow({ where: { id: takerId } });
      await tx.player.update({
        where: { id: takerId },
        data: { trust: trustAfter(content, taker.trust, "dispute_lost") },
      });
      await tx.gameEvent.create({
        data: { playerId: takerId, type: "gig_disputed", payload: { quality: g.quality } },
      });
    });
    this.notify?.(takerId, {
      kind: "warn",
      text: `⚖️ ${content.data.contracts.keeper}: "Ảnh ${g.quality ?? 0}/100 chưa đạt" — không có tiền công, hoàn cọc, 🤝 −${content.data.gigs.disputeLostTrust}`,
    });
  }

  private async mine(playerId: string, id: string) {
    const g = await this.prisma.gig.findUnique({ where: { id } });
    if (!g || g.takerId !== playerId || (g.status !== "TAKEN" && g.status !== "SUBMITTED"))
      throw new GameError("invalid_state", "Không phải việc mình đang nhận");
    return g;
  }

  /** Người nhận trễ / bỏ: hoàn tiền công người đăng, mất cọc, trừ tin cậy (có thể bị khoá). */
  private async fail(room: RoomRuntime, g: Gig, why: string) {
    const takerId = g.takerId;
    if (!takerId) return;
    this.sessions.delete(takerId);
    const rule = content.data.contracts.trust;
    let locked = false;
    const moved = await this.prisma.$transaction(async (tx) => {
      const m = await tx.gig.updateMany({
        where: { id: g.id, status: "TAKEN" },
        data: { status: "FAILED" },
      });
      if (m.count === 0) return false;
      await this.ledger.transfer(
        tx,
        gigWallet(g.id),
        playerWallet(g.posterId),
        g.reward,
        "gig_refund",
        g.id,
      );
      await this.ledger.transfer(
        tx,
        gigWallet(g.id),
        SYSTEM.market,
        g.deposit,
        "penalty:gig",
        g.id,
      );
      const p = await tx.player.findUniqueOrThrow({ where: { id: takerId } });
      const trust = trustAfter(content, p.trust, "fail");
      locked = trustLevel(content, trust) === "lock";
      await tx.player.update({
        where: { id: takerId },
        data: { trust, ...(locked ? { trustLockDay: room.day + rule.lockDays - 1 } : {}) },
      });
      await addToReport(tx, takerId, room.day, { fees: g.deposit });
      await tx.gameEvent.create({
        data: { playerId: takerId, type: "gig_fail", payload: { why } },
      });
      return true;
    });
    if (!moved) return;
    this.notify?.(takerId, {
      kind: "warn",
      text: `📸 ${why[0]?.toUpperCase()}${why.slice(1)} việc chụp ảnh: mất cọc ${g.deposit.toLocaleString("vi-VN")}đ, 🤝 −${rule.fail}${
        locked ? ` · ${content.data.contracts.keeper} khoá nhận việc ${rule.lockDays} ngày` : ""
      }`,
    });
    this.notify?.(g.posterId, {
      kind: "info",
      text: `📸 Thợ ảnh ${why} — hoàn ${g.reward.toLocaleString("vi-VN")}đ tiền công cho bạn`,
    });
  }

  /** Trả từ tiền mặt, thiếu thì chuyển khoản. */
  private async pay(
    tx: Tx,
    playerId: string,
    to: string,
    amount: number,
    reason: string,
    ref: string,
    broke: string,
  ) {
    try {
      await this.ledger.transfer(tx, playerWallet(playerId), to, amount, reason, ref);
    } catch (err) {
      if (!(err instanceof InsufficientFundsError)) throw err;
      try {
        await this.ledger.transfer(tx, bankWallet(playerId), to, amount, reason, ref);
      } catch (err2) {
        if (err2 instanceof InsufficientFundsError)
          throw new GameError("insufficient_funds", broke);
        throw err2;
      }
    }
  }
}
