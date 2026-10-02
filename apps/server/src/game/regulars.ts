import { Injectable } from "@nestjs/common";
import { content } from "@xom/content";
import type { NotifyEvent, OrderEvent, RegularView } from "@xom/shared";
import { afterDisappointed, afterServed, type ResidentMemory, seededRandom } from "@xom/sim";
import { PrismaService } from "../prisma/prisma.service.js";
import { StoryService } from "./story.js";

/**
 * Khách quen (docs/KIENTRUC.md §1): quầy nhớ từng cư dân có tên đã mua mấy lần. Đủ lần → ❤️ khách quen (kiên nhẫn hơn,
 * hay ghé hơn, có khi dắt bạn); làm sai / để chờ bỏ về liên tiếp → giận, mất ❤️. Ghi vào "Chuyện của tôi" khách quen đầu tiên.
 */
@Injectable()
export class RegularService {
  private notify?: (playerId: string, n: NotifyEvent) => void;

  constructor(
    private readonly prisma: PrismaService,
    private readonly story: StoryService,
  ) {}

  setNotifier(fn: (playerId: string, n: NotifyEvent) => void) {
    this.notify = fn;
  }

  /** Trí nhớ của quầy về các cư dân (để chọn ai ghé, ai là khách quen). */
  async memory(ownerId: string): Promise<Map<string, ResidentMemory & { streak: number }>> {
    const rows = await this.prisma.residentVisit.findMany({ where: { ownerId } });
    return new Map(
      rows.map((r) => [
        r.residentId,
        { visits: r.visits, regular: r.regularSince !== null, streak: r.streakWrong },
      ]),
    );
  }

  /** Mua đúng món, trả tiền xong: +1 lần ghé; đủ lần thì thành khách quen. Trả về có dắt bạn tới không. */
  async served(e: OrderEvent, day: number): Promise<{ friend: boolean }> {
    if (!e.residentId) return { friend: false };
    const resident = content.data.residents.find((r) => r.id === e.residentId);
    if (!resident) return { friend: false };
    const row = await this.prisma.residentVisit.findUnique({
      where: { ownerId_residentId: { ownerId: e.ownerId, residentId: e.residentId } },
    });
    const mem = { visits: row?.visits ?? 0, regular: row?.regularSince != null };
    const next = afterServed(content, mem);
    await this.prisma.residentVisit.upsert({
      where: { ownerId_residentId: { ownerId: e.ownerId, residentId: e.residentId } },
      create: {
        ownerId: e.ownerId,
        residentId: e.residentId,
        visits: next.visits,
        lastDay: day,
        regularSince: next.becameRegular ? day : null,
      },
      update: {
        visits: next.visits,
        lastDay: day,
        streakWrong: 0,
        ...(next.becameRegular ? { regularSince: day } : {}),
      },
    });
    if (next.becameRegular) {
      this.notify?.(e.ownerId, {
        kind: "good",
        text: `❤️ ${resident.name} thành khách quen của quầy bạn!`,
      });
      await this.story.note(e.ownerId, "first_regular", day, {
        name: resident.name,
        bio: resident.bio,
      });
    }
    const friend =
      mem.regular && seededRandom("friend", e.orderId)() < content.data.regulars.friendChance;
    if (friend)
      this.notify?.(e.ownerId, { kind: "info", text: `👫 ${resident.name} rủ bạn ghé quầy` });
    return { friend };
  }

  /** Làm sai / để khách chờ bỏ về: khách quen giận khi đủ chuỗi. */
  async disappointed(e: OrderEvent): Promise<void> {
    if (!e.residentId) return;
    const resident = content.data.residents.find((r) => r.id === e.residentId);
    const row = await this.prisma.residentVisit.findUnique({
      where: { ownerId_residentId: { ownerId: e.ownerId, residentId: e.residentId } },
    });
    if (!row || !resident) return;
    const next = afterDisappointed(content, {
      visits: row.visits,
      regular: row.regularSince !== null,
      streak: row.streakWrong,
    });
    await this.prisma.residentVisit.update({
      where: { id: row.id },
      data: {
        streakWrong: next.streak,
        visits: next.visits,
        ...(next.lostRegular ? { regularSince: null } : {}),
      },
    });
    if (next.lostRegular)
      this.notify?.(e.ownerId, {
        kind: "warn",
        text: `💔 ${resident.name} giận rồi — không còn là khách quen`,
      });
  }

  async list(ownerId: string): Promise<RegularView[]> {
    const rows = await this.prisma.residentVisit.findMany({
      where: { ownerId },
      orderBy: [{ visits: "desc" }],
    });
    return rows.flatMap((r) => {
      const res = content.data.residents.find((x) => x.id === r.residentId);
      return res
        ? [
            {
              residentId: r.residentId,
              name: res.name,
              bio: res.bio,
              visits: r.visits,
              regular: r.regularSince !== null,
              lastDay: r.lastDay,
            },
          ]
        : [];
    });
  }

  /** Dev/test: mọi cư dân đã ghé `visits` lần (chưa là khách quen). */
  async debugSet(ownerId: string, visits: number): Promise<void> {
    for (const r of content.data.residents)
      await this.prisma.residentVisit.upsert({
        where: { ownerId_residentId: { ownerId, residentId: r.id } },
        create: { ownerId, residentId: r.id, visits },
        update: { visits, regularSince: null, streakWrong: 0 },
      });
  }
}
