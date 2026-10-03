import { Injectable } from "@nestjs/common";
import { type AchievementMetric, content } from "@xom/content";
import type { MyStatsView, NotifyEvent, XomBoardView } from "@xom/shared";
import {
  achievementProgress,
  type Contender,
  costsOf,
  formatClock,
  levelOf,
  marketShare,
  priceMoves,
  profitOf,
  type SkillPoints,
  xomAverage,
  xomAwards,
} from "@xom/sim";
import { PrismaService } from "../prisma/prisma.service.js";
import type { RoomRuntime } from "./room.js";
import { StoryService } from "./story.js";

const WINDOW = 7;

/**
 * Thống kê + bảng giải của xóm (docs/USECASES.md UC-P2): so trong xóm, 7 ngày gần nhất, nhiều hạng mục
 * (doanh thu, lãi, đông khách, được tin, lên nhanh, chăm làm, thân thiện); thị phần theo món; tin "đang hot";
 * thành tựu mở bằng làm thật.
 */
@Injectable()
export class StatsService {
  private notify?: (playerId: string, n: NotifyEvent) => void;

  constructor(
    private readonly prisma: PrismaService,
    private readonly story: StoryService,
  ) {}

  setNotifier(fn: (playerId: string, n: NotifyEvent) => void) {
    this.notify = fn;
  }

  /** Người trong xóm + số liệu 7 ngày (từ DailyReport, sổ đánh giá, kỹ năng). */
  private async contenders(room: RoomRuntime): Promise<Contender[]> {
    const from = room.day - WINDOW + 1;
    const players = await this.prisma.player.findMany({
      where: { roomId: room.id },
      include: {
        businesses: { take: 1 },
        reports: { where: { day: { gte: from - WINDOW } } },
      },
    });
    const ids = players.map((p) => p.id);
    const ratings = await this.prisma.review.groupBy({
      by: ["ownerId"],
      where: { ownerId: { in: ids } },
      _avg: { stars: true },
      _count: { _all: true },
    });
    const rating = new Map(ratings.map((r) => [r.ownerId, r]));
    return players.map((p) => {
      const r = rating.get(p.id);
      return {
        playerId: p.id,
        name: p.displayName,
        productId: p.businesses[0]?.productId ?? null,
        days: p.reports.map((d) => ({
          day: d.day,
          revenue: d.revenue,
          tips: d.tips,
          wages: d.wages,
          stockCost: d.stockCost,
          rent: d.rent,
          fees: d.fees,
          staffWages: d.staffWages,
          utilities: d.utilities,
          served: d.served,
        })),
        rating: {
          avg: Math.round((r?._avg.stars ?? 0) * 10) / 10,
          count: r?._count._all ?? 0,
        },
        friendly: ((p.skills ?? {}) as SkillPoints).an_noi ?? 0,
      };
    });
  }

  async board(room: RoomRuntime): Promise<XomBoardView> {
    const cs = await this.contenders(room);
    return {
      day: room.day,
      players: cs.length,
      awards: xomAwards(content.data.awards, cs, room.day, WINDOW),
      shares: marketShare(cs, room.day, WINDOW),
      trends: this.trends(room, cs),
    };
  }

  /** "Đang hot": trời, giá chợ, khai trương, món bán chạy hôm nay — kết nối kinh tế + sự kiện + xếp hạng. */
  private trends(room: RoomRuntime, cs: Contender[]): XomBoardView["trends"] {
    const out: XomBoardView["trends"] = [];
    const w = room.weatherView();
    const sky = content.weatherKind(w.now);
    out.push({ emoji: sky.emoji, text: sky.news.replace(/^\S+\s/, "") });
    if (w.next) {
      const next = content.weatherKind(w.next.kind);
      out.push({
        emoji: next.emoji,
        text: next.forecast.replace(/^\S+\s/, "").replace("{time}", formatClock(w.next.at)),
      });
    }
    for (const e of room.activeEvents()) {
      const def = content.data.events.find((d) => d.id === e.eventId);
      if (!def) continue;
      out.push({
        emoji: def.emoji,
        text: e.ownerName ? `${e.ownerName} đang ${def.name.toLowerCase()}` : def.name,
      });
    }
    for (const m of priceMoves(content, room.day, room.minute).slice(0, 3))
      out.push({
        emoji: m.change > 0 ? "📈" : "📉",
        text: `${m.name} ở chợ ${m.change > 0 ? "lên" : "xuống"} ${Math.abs(Math.round(m.change * 100))}% so với hôm qua`,
      });
    const today = new Map<string, number>();
    for (const c of cs) {
      if (!c.productId) continue;
      const served = c.days.find((d) => d.day === room.day)?.served ?? 0;
      today.set(c.productId, (today.get(c.productId) ?? 0) + served);
    }
    const best = [...today.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] > 0)
      out.push({
        emoji: "🔥",
        text: `Hôm nay ${content.product(best[0]).name.toLowerCase()} bán chạy nhất xóm (${best[1]} món)`,
      });
    return out;
  }

  /** Số liệu của mình 7 ngày + trung bình quầy cùng món trong xóm + thành tựu (mở cái mới nếu đủ). */
  async mine(room: RoomRuntime, playerId: string): Promise<MyStatsView> {
    const cs = await this.contenders(room);
    const me = cs.find((c) => c.playerId === playerId);
    const days = [];
    for (let d = Math.max(1, room.day - WINDOW + 1); d <= room.day; d++) {
      const row = me?.days.find((x) => x.day === d);
      const c = row ? costsOf(row) : { stock: 0, rent: 0, staff: 0, utilities: 0, fees: 0 };
      days.push({
        day: d,
        revenue: row?.revenue ?? 0,
        tips: row?.tips ?? 0,
        profit: row ? profitOf(row) : 0,
        served: row?.served ?? 0,
        wages: row?.wages ?? 0,
        costs: c,
      });
    }
    const achievements = await this.checkAchievements(playerId, room.day);
    // Sổ theo từng cửa hàng (góp ý đợt 4): cùng khung 7 ngày, từ BusinessDay.
    const from = Math.max(1, room.day - WINDOW + 1);
    const rows = await this.prisma.businessDay.findMany({
      where: { business: { ownerId: playerId }, day: { gte: from, lte: room.day } },
    });
    const bizIds = [...new Set(rows.map((r) => r.businessId))];
    const shops = bizIds.map((businessId) => ({
      businessId,
      days: Array.from({ length: room.day - from + 1 }, (_, i) => {
        const d = from + i;
        const r = rows.find((x) => x.businessId === businessId && x.day === d);
        const stat = r ? { ...r, wages: 0 } : null;
        return {
          day: d,
          revenue: r?.revenue ?? 0,
          tips: r?.tips ?? 0,
          profit: stat ? profitOf(stat) : 0,
          served: r?.served ?? 0,
          wages: 0,
          costs: stat ? costsOf(stat) : { stock: 0, rent: 0, staff: 0, utilities: 0, fees: 0 },
        };
      }),
    }));
    return {
      days,
      shops,
      avg: me?.productId ? xomAverage(cs, me.productId, room.day, WINDOW) : null,
      achievements,
    };
  }

  /** Tính tiến độ thành tựu; cái nào vừa đủ thì ghi lại + báo "🏅 Thành tựu mới". */
  async checkAchievements(playerId: string, day: number) {
    const [player, totals, fiveStars, replies, events, friends] = await Promise.all([
      this.prisma.player.findUniqueOrThrow({ where: { id: playerId } }),
      this.prisma.dailyReport.aggregate({
        where: { playerId },
        _sum: { served: true, revenue: true, wages: true },
      }),
      this.prisma.review.count({ where: { ownerId: playerId, stars: 5 } }),
      this.prisma.review.count({ where: { ownerId: playerId, reply: { not: null } } }),
      this.prisma.gameEvent.count({ where: { playerId, type: "event_host" } }),
      this.prisma.npcRelation.count({ where: { playerId, friendship: { gte: 30 } } }),
    ]);
    const values: Record<AchievementMetric, number> = {
      served: totals._sum.served ?? 0,
      revenue: totals._sum.revenue ?? 0,
      wages: totals._sum.wages ?? 0,
      five_stars: fiveStars,
      replies,
      events,
      level: levelOf(player.xp).level,
      friends,
    };
    const list = achievementProgress(content.data.achievements, values);
    const got = { ...((player.achievements ?? {}) as Record<string, number>) };
    const fresh = list.filter((a) => a.done && got[a.id] === undefined);
    if (fresh.length) {
      for (const a of fresh) got[a.id] = day;
      await this.prisma.player.update({ where: { id: playerId }, data: { achievements: got } });
      for (const a of fresh) {
        this.notify?.(playerId, { kind: "good", text: `🏅 Thành tựu mới: ${a.emoji} ${a.name}` });
        // Chuyện của tôi: thành tựu có câu kể thì ghi thành một mốc (đã báo 🏅 rồi nên không báo thêm).
        const story = content.data.achievements.find((x) => x.id === a.id)?.story;
        if (story)
          await this.story.write(playerId, `ach:${a.id}`, day, a.emoji, story, { quiet: true });
      }
    }
    // Đã mở thì giữ "xong" kể cả khi số liệu sau này đổi (vd. đánh giá bị xoá); kèm thưởng + đã nhận chưa.
    const claimed = (player.rewardsClaimed ?? {}) as Record<string, number>;
    return list.map((a) => ({
      ...a,
      done: a.done || got[a.id] !== undefined,
      reward: content.data.achievements.find((x) => x.id === a.id)?.reward ?? { xp: 0, money: 0 },
      claimed: claimed[`ach:${a.id}`] !== undefined,
    }));
  }
}
