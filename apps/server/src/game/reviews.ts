import { Injectable } from "@nestjs/common";
import { content, type ReviewTag } from "@xom/content";
import type { NotifyEvent, OrderEvent, ReviewsView } from "@xom/shared";
import { addSkill, maskText, reviewSummary, type SkillPoints, seededRandom } from "@xom/sim";
import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { GameError, type RoomRuntime } from "./room.js";
import { VoiceAiService } from "./voice-ai.js";

const LATEST = 20;

const pick = <T>(list: readonly T[], rand: () => number): T =>
  list[Math.floor(rand() * list.length)] as T;

/**
 * Sổ đánh giá quầy (docs/USECASES.md UC-F11): khách NPC thỉnh thoảng chấm sao + viết vài chữ theo đúng chuyện vừa xảy ra;
 * hàng xóm đã mua thì được đánh giá (mỗi ngày một lần mỗi quầy); chủ quầy trả lời một lần, trả lời khéo đánh giá xấu
 * thì gỡ lại chút uy tín. Mỗi cửa hàng một sổ riêng (góp ý đợt 2) — đổi món ở cùng cửa hàng vẫn giữ tiếng.
 */
@Injectable()
export class ReviewService {
  private notify?: (playerId: string, n: NotifyEvent) => void;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: VoiceAiService,
  ) {}

  setNotifier(fn: (playerId: string, n: NotifyEvent) => void) {
    this.notify = fn;
  }

  /** Khách NPC viết đánh giá sau khi tính tiền / bỏ đi. `force`: khách sộp, reviewer luôn viết. */
  async npc(
    e: OrderEvent,
    day: number,
    stars: number,
    tag: ReviewTag,
    opts: { force?: boolean; chance?: number } = {},
  ) {
    const cfg = content.data.reviews;
    const rand = seededRandom("review", e.orderId);
    if (!opts.force && rand() >= (opts.chance ?? cfg.chance)) return;
    const archetype = content.data.npcs.find((n) => n.id === e.archetype);
    const who =
      e.archetype === "vip"
        ? (archetype?.name ?? "Khách sộp")
        : `${pick(cfg.names, rand)} · ${(archetype?.name ?? "khách").toLowerCase()}`;
    const examples = cfg.lines[tag] ?? cfg.lines.ok ?? ["…"];
    const product = content.product(e.productId).name.toLowerCase();
    const text = this.ai.line(
      `review:${e.productId}:${tag}`,
      `Khách viết đánh giá ngắn trên mạng về quầy ${product} ở xóm (${stars} sao), tình huống: ${tag}`,
      pick(examples, rand),
      examples,
      rand,
    );
    await this.prisma.review.create({
      data: {
        ownerId: e.ownerId,
        businessId: e.businessId,
        productId: e.productId,
        authorName: who,
        stars,
        text,
        day,
      },
    });
    if (stars <= 2 || opts.force)
      this.notify?.(e.ownerId, {
        kind: stars <= 2 ? "warn" : "good",
        text: `📒 ${who} chấm ${"★".repeat(stars)}${"☆".repeat(5 - stars)}: “${text}”`,
      });
  }

  /** Hàng xóm đã mua ở quầy hôm nay thì được đánh giá (mỗi ngày một lần mỗi quầy). */
  async write(
    room: RoomRuntime,
    author: { id: string; name: string },
    businessId: string,
    stars: number,
    text: string,
  ) {
    const biz = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!biz) throw new GameError("invalid_payload", "Không có quầy này");
    const ownerId = biz.ownerId;
    if (author.id === ownerId) throw new GameError("invalid_state", "Tự khen quầy mình thì ai tin");
    if (!room.purchases.has(purchaseKey(author.id, businessId, room.day)))
      throw new GameError("invalid_state", "Mua ở quầy này rồi mới đánh giá được");
    const clean = maskText(text.trim(), content.data.reviews.banned);
    try {
      await this.prisma.review.create({
        data: {
          ownerId,
          businessId,
          productId: biz.productId,
          authorId: author.id,
          authorName: author.name,
          stars,
          text: clean,
          day: room.day,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
        throw new GameError("invalid_state", "Hôm nay bạn đánh giá quầy này rồi");
      throw err;
    }
    this.notify?.(ownerId, {
      kind: stars >= 4 ? "good" : "warn",
      text: `📒 ${author.name} chấm quầy bạn ${"★".repeat(stars)}${"☆".repeat(5 - stars)}`,
    });
  }

  /**
   * Chủ quầy trả lời (một lần). Đánh giá ≤ 3 sao mà trả lời đàng hoàng thì gỡ chút uy tín (của đúng cửa hàng đó) + ăn nói.
   * Trả về id cửa hàng của đánh giá.
   */
  async reply(ownerId: string, reviewId: string, text: string): Promise<string> {
    const r = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!r || r.ownerId !== ownerId)
      throw new GameError("invalid_state", "Không phải đánh giá quầy mình");
    if (r.reply) throw new GameError("invalid_state", "Đã trả lời rồi");
    if (!r.businessId) throw new GameError("invalid_state", "Cửa hàng này không còn nữa");
    const businessId = r.businessId;
    const clean = maskText(text.trim(), content.data.reviews.banned);
    await this.prisma.$transaction(async (tx) => {
      await tx.review.update({
        where: { id: r.id },
        data: { reply: clean, repliedAt: new Date() },
      });
      if (r.stars > 3) return;
      const biz = await tx.business.findUnique({ where: { id: businessId } });
      if (biz)
        await tx.business.update({
          where: { id: biz.id },
          data: {
            reputation: Math.min(1, biz.reputation + content.data.reviews.replyRep),
          },
        });
      const player = await tx.player.findUniqueOrThrow({ where: { id: ownerId } });
      await tx.player.update({
        where: { id: ownerId },
        data: { skills: addSkill(content, (player.skills ?? {}) as SkillPoints, "an_noi") },
      });
    });
    return businessId;
  }

  /** Sổ đánh giá của một cửa hàng: điểm trung bình, phân bố sao, 20 đánh giá mới nhất. */
  async list(
    room: RoomRuntime | undefined,
    viewerId: string,
    businessId: string,
  ): Promise<ReviewsView> {
    const biz = await this.prisma.business.findUnique({
      where: { id: businessId },
      include: { owner: { select: { displayName: true } } },
    });
    if (!biz) throw new GameError("invalid_payload", "Không có quầy này");
    const ownerId = biz.ownerId;
    const [all, latest, mineToday] = await Promise.all([
      this.prisma.review.findMany({ where: { businessId }, select: { stars: true } }),
      this.prisma.review.findMany({
        where: { businessId },
        orderBy: { createdAt: "desc" },
        take: LATEST,
      }),
      room
        ? this.prisma.review.findFirst({ where: { businessId, authorId: viewerId, day: room.day } })
        : null,
    ]);
    const sum = reviewSummary(all.map((r) => r.stars));
    return {
      businessId,
      shopName: biz.shopName ?? content.product(biz.productId).name,
      ownerId,
      ownerName: biz.owner.displayName,
      ...sum,
      canWrite:
        viewerId !== ownerId &&
        !mineToday &&
        !!room?.purchases.has(purchaseKey(viewerId, businessId, room.day)),
      items: latest.map((r) => ({
        id: r.id,
        authorName: r.authorName,
        fromPlayer: r.authorId !== null,
        stars: r.stars,
        text: r.text,
        day: r.day,
        reply: r.reply,
      })),
    };
  }
}

/** Khách đã mua ở cửa hàng nào hôm nay (mua rồi mới được đánh giá cửa hàng đó). */
export const purchaseKey = (buyerId: string, businessId: string, day: number) =>
  `${buyerId}:${businessId}:${day}`;
