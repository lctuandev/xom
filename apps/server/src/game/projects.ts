import { Injectable } from "@nestjs/common";
import { content } from "@xom/content";
import type { CrewView, FundView, MixResultView, NotifyEvent, SiteView } from "@xom/shared";
import {
  canPropose,
  checkMix,
  laborBudget,
  type MixInput,
  type MixOrder,
  mixOrder,
  siteOf,
  tallyVotes,
} from "@xom/sim";
import {
  fundWallet,
  InsufficientFundsError,
  LedgerService,
  playerWallet,
  SYSTEM,
} from "../economy/ledger.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { BusinessRepo } from "./business-repo.js";
import { addToReport } from "./report.js";
import { GameError, type RoomRuntime } from "./room.js";
import { StoryService } from "./story.js";

const ACTIVE = ["VOTING", "FUNDING", "BUILDING"] as const;
const DAY = 24 * 60;
/** Phải đứng cách công trường trong khoảng này (mét). */
const SITE_REACH = 6;

/** Ví giữ khoản nhân công của một công trình (UC-J6). */
export const laborWallet = (rowId: string) => `escrow:project:${rowId}`;

interface CrewState {
  siteId: string;
  order: MixOrder;
  /** Phút tuyệt đối được trộn mẻ tiếp. */
  readyAt: number;
  n: number;
  day: number;
  mixes: number;
  earned: number;
}

/**
 * Quỹ xóm + công trình chung (docs/USECASES.md UC-J5): ai trong xóm cũng đề xuất được (mỗi lúc một đề xuất đang
 * bỏ phiếu); hết hạn hoặc đủ phiếu thì kiểm phiếu; qua thì chờ quỹ đủ tiền rồi thi công vài ngày; xong thì nghiệm thu,
 * khách ở các chỗ bán liên quan ghé nhiều hơn. Quỹ do phí chợ (một phần) + hàng xóm góp; chi qua sổ cái.
 */
@Injectable()
export class ProjectService {
  private notify?: (roomId: string, n: NotifyEvent) => void;
  /** Công trường đổi (khởi công, thêm mẻ, xong) → vẽ lại bản đồ cho cả xóm. */
  private changed?: (room: RoomRuntime) => void;
  /** Công trình đã xong theo xóm (cache, nạp lần đầu cần). */
  private readonly doneCache = new Map<string, Set<string>>();
  /** Lệnh trộn của Cai thầu cho từng người phụ hồ. */
  private readonly crew = new Map<string, CrewState>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessRepo,
    private readonly ledger: LedgerService,
    private readonly story: StoryService,
  ) {}

  setNotifier(fn: (roomId: string, n: NotifyEvent) => void, changed?: (room: RoomRuntime) => void) {
    this.notify = fn;
    this.changed = changed;
  }

  /** Công trường đang thi công của xóm (vẽ trên bản đồ). */
  async sites(roomId: string): Promise<SiteView[]> {
    const rows = await this.prisma.roomProject.findMany({ where: { roomId, status: "BUILDING" } });
    const out: SiteView[] = [];
    for (const r of rows) {
      const def = content.data.projects.find((p) => p.id === r.projectId);
      if (!def) continue;
      const at = siteOf(content, def);
      out.push({
        id: r.id,
        projectId: r.projectId,
        x: at.x,
        z: at.z,
        mixes: r.mixes,
        need: def.crewMixes,
        budget: await this.ledger.balance(this.prisma, laborWallet(r.id)),
      });
    }
    return out;
  }

  private async site(room: RoomRuntime, siteId: string) {
    const site = (await this.sites(room.id)).find((s) => s.id === siteId);
    if (!site) throw new GameError("invalid_state", "Công trình này không còn thi công");
    return site;
  }

  private crewOf(room: RoomRuntime, playerId: string, site: SiteView): CrewState {
    let c = this.crew.get(playerId);
    if (!c || c.siteId !== site.id) {
      c = {
        siteId: site.id,
        order: mixOrder(content, site.id, playerId, site.mixes, 0),
        readyAt: 0,
        n: 0,
        day: room.day,
        mixes: 0,
        earned: 0,
      };
      this.crew.set(playerId, c);
    }
    if (c.day !== room.day) Object.assign(c, { day: room.day, mixes: 0, earned: 0 });
    return c;
  }

  /** Bảng phụ hồ: lệnh trộn hiện tại của Cai thầu cho mình. */
  async crewView(room: RoomRuntime, playerId: string, siteId: string): Promise<CrewView> {
    const site = await this.site(room, siteId);
    const c = this.crewOf(room, playerId, site);
    const now = room.day * DAY + room.minute;
    return {
      site,
      order: c.order,
      readyAt: c.readyAt > now ? c.readyAt - room.day * DAY : null,
      today: { mixes: c.mixes, earned: c.earned },
    };
  }

  /**
   * Trộn một mẻ: đứng tại công trường, không đang bán / làm ca khác, chờ mẻ trước xong. Đúng định mức thì trả công từ khoản
   * nhân công của công trình (không sinh tiền mới), sai thì Cai thầu bắt trộn lại.
   */
  async mix(
    room: RoomRuntime,
    playerId: string,
    siteId: string,
    input: MixInput,
  ): Promise<MixResultView> {
    const site = await this.site(room, siteId);
    const keeper = content.data.crew.keeper;
    const pos = room.members.get(playerId)?.pos;
    if (!pos || pos.inside || Math.hypot(pos.x - site.x, pos.z - site.z) > SITE_REACH)
      throw new GameError("invalid_state", "Ra tận công trường mới trộn hồ được");
    if (room.shifts.has(playerId))
      throw new GameError("invalid_state", "Đang trong ca làm thuê khác");
    if (await this.businesses.ownerTied(playerId, room.minute))
      throw new GameError(
        "invalid_state",
        "Quầy đang mở mà không có nhân viên trong ca — đóng quầy hoặc thuê người bán thay (👩‍🍳 Nhân viên) rồi mới đi phụ hồ",
      );
    const c = this.crewOf(room, playerId, site);
    const now = room.day * DAY + room.minute;
    if (c.readyAt > now)
      throw new GameError("invalid_state", `${keeper}: "Mẻ trước chưa dùng hết, đợi chút đã con."`);
    const wage = content.data.crew.wagePerMix;
    if (site.budget < wage)
      throw new GameError("invalid_state", `${keeper}: "Hết tiền công rồi, mai quay lại nghen."`);
    const problems = checkMix(content, c.order, input);
    const mixMinutes = content.data.crew.mixMinutes;
    if (problems.length) {
      // Trộn hỏng: đổ bỏ, trộn lại mẻ đó (mất chút thời gian), không có tiền.
      c.readyAt = now + Math.ceil(mixMinutes / 2);
      void this.prisma.gameEvent
        .create({ data: { playerId, type: "crew_mix", payload: { ok: false } } })
        .catch(() => undefined);
      return { ok: false, problems, pay: 0, view: await this.crewView(room, playerId, siteId) };
    }
    const row = await this.prisma.$transaction(async (tx) => {
      await this.ledger.transfer(
        tx,
        laborWallet(siteId),
        playerWallet(playerId),
        wage,
        "crew_wage",
        siteId,
      );
      await addToReport(tx, playerId, room.day, { wages: wage });
      await tx.gameEvent.create({
        data: { playerId, type: "crew_mix", payload: { ok: true, wage } },
      });
      return tx.roomProject.update({ where: { id: siteId }, data: { mixes: { increment: 1 } } });
    });
    c.mixes += 1;
    c.earned += wage;
    c.n += 1;
    c.readyAt = now + mixMinutes;
    c.order = mixOrder(content, siteId, playerId, row.mixes, c.n);
    const def = content.data.projects.find((p) => p.id === row.projectId);
    await this.story.note(playerId, "first_crew", room.day, {
      name: def?.name ?? "công trình xóm",
    });
    if (def && row.mixes >= def.crewMixes) await this.settle(room, siteId);
    this.changed?.(room);
    return {
      ok: true,
      problems: [],
      pay: wage,
      view: await this.crewView(room, playerId, siteId).catch(() => ({
        site: { ...site, mixes: row.mixes, budget: site.budget - wage },
        order: c.order,
        readyAt: null,
        today: { mixes: c.mixes, earned: c.earned },
      })),
    };
  }

  async done(roomId: string): Promise<ReadonlySet<string>> {
    const hit = this.doneCache.get(roomId);
    if (hit) return hit;
    const rows = await this.prisma.roomProject.findMany({ where: { roomId, status: "DONE" } });
    const set = new Set(rows.map((r) => r.projectId));
    this.doneCache.set(roomId, set);
    return set;
  }

  async view(room: RoomRuntime, playerId: string): Promise<FundView> {
    const [balance, members, rows, done] = await Promise.all([
      this.ledger.balance(this.prisma, fundWallet(room.id)),
      this.prisma.player.count({ where: { roomId: room.id } }),
      this.prisma.roomProject.findMany({
        where: { roomId: room.id, status: { in: [...ACTIVE] } },
        orderBy: { createdAt: "asc" },
      }),
      this.done(room.id),
    ]);
    const names = new Map(
      (
        await this.prisma.player.findMany({
          where: { id: { in: rows.map((r) => r.proposerId) } },
          select: { id: true, displayName: true },
        })
      ).map((p) => [p.id, p.displayName]),
    );
    return {
      balance,
      members,
      done: [...done],
      active: rows.map((r) => {
        const votes = (r.votes ?? {}) as Record<string, boolean>;
        const t = tallyVotes(votes);
        return {
          id: r.id,
          projectId: r.projectId,
          status: r.status,
          proposerName: names.get(r.proposerId) ?? "Hàng xóm",
          yes: t.yes,
          no: t.no,
          mine: votes[playerId] ?? null,
          voteDay: r.voteDay,
          voteMinute: r.voteMinute,
          doneDay: r.doneDay,
        };
      }),
    };
  }

  /** Đề xuất công trình (người đề xuất tự bỏ phiếu thuận). */
  async propose(room: RoomRuntime, playerId: string, projectId: string) {
    const def = content.data.projects.find((p) => p.id === projectId);
    if (!def) throw new GameError("invalid_payload", "Không có công trình này");
    const active = await this.prisma.roomProject.findMany({
      where: { roomId: room.id, status: { in: [...ACTIVE] } },
    });
    if (active.some((r) => r.status === "VOTING"))
      throw new GameError("invalid_state", "Xóm đang bàn một đề xuất rồi — bỏ phiếu xong đã");
    const why = canPropose(def, await this.done(room.id), new Set(active.map((r) => r.projectId)));
    if (why) throw new GameError("invalid_state", why);
    const end = room.day * DAY + room.minute + content.data.fund.voteMinutes;
    const row = await this.prisma.roomProject.create({
      data: {
        roomId: room.id,
        projectId,
        proposerId: playerId,
        votes: { [playerId]: true },
        voteDay: Math.floor(end / DAY),
        voteMinute: end % DAY,
      },
    });
    const name = room.members.get(playerId)?.displayName ?? "Hàng xóm";
    this.notify?.(room.id, {
      kind: "info",
      text: `🗳️ ${name} đề xuất ${def.emoji} ${def.name} (${(def.cost / 1000).toLocaleString("vi-VN")}k) — vào Quỹ xóm bỏ phiếu nha!`,
    });
    await this.settle(room, row.id);
  }

  async vote(room: RoomRuntime, playerId: string, id: string, yes: boolean) {
    const row = await this.prisma.roomProject.findUnique({ where: { id } });
    if (!row || row.roomId !== room.id)
      throw new GameError("invalid_payload", "Không có đề xuất này");
    if (row.status !== "VOTING") throw new GameError("invalid_state", "Đã hết bỏ phiếu");
    const votes = { ...((row.votes ?? {}) as Record<string, boolean>), [playerId]: yes };
    await this.prisma.roomProject.update({ where: { id }, data: { votes } });
    await this.settle(room, id);
  }

  /**
   * Chạy mỗi nhịp kinh tế: kiểm phiếu đề xuất hết hạn (hoặc cả xóm đã bỏ), quỹ đủ thì khởi công,
   * tới ngày thì nghiệm thu.
   */
  async tick(room: RoomRuntime) {
    const rows = await this.prisma.roomProject.findMany({
      where: { roomId: room.id, status: { in: [...ACTIVE] } },
    });
    for (const r of rows) await this.settle(room, r.id);
  }

  private async settle(room: RoomRuntime, id: string): Promise<void> {
    const r = await this.prisma.roomProject.findUnique({ where: { id } });
    if (!r) return;
    const def = content.data.projects.find((p) => p.id === r.projectId);
    if (!def) return;
    const now = room.day * DAY + room.minute;
    if (r.status === "VOTING") {
      const votes = (r.votes ?? {}) as Record<string, boolean>;
      const members = await this.prisma.player.count({ where: { roomId: room.id } });
      const expired = now >= r.voteDay * DAY + r.voteMinute;
      if (!expired && Object.keys(votes).length < members) return;
      const t = tallyVotes(votes);
      await this.prisma.roomProject.update({
        where: { id },
        data: { status: t.passed ? "FUNDING" : "REJECTED" },
      });
      this.notify?.(room.id, {
        kind: t.passed ? "good" : "warn",
        text: t.passed
          ? `✅ Xóm đồng ý làm ${def.emoji} ${def.name} (${t.yes} thuận / ${t.no} chống) — đủ quỹ là khởi công`
          : `❌ ${def.name} không qua (${t.yes} thuận / ${t.no} chống)`,
      });
      if (!t.passed) return;
      return this.settle(room, id);
    }
    if (r.status === "FUNDING") {
      try {
        await this.prisma.$transaction(async (tx) => {
          // Chi phí công trình: phần vật tư + nhà thầu trả ngay, phần nhân công giữ riêng để trả phụ hồ (UC-J6).
          const labor = laborBudget(content, def.cost);
          await this.ledger.transfer(
            tx,
            fundWallet(room.id),
            SYSTEM.supplier,
            def.cost - labor,
            "project",
            def.id,
          );
          if (labor > 0)
            await this.ledger.transfer(
              tx,
              fundWallet(room.id),
              laborWallet(id),
              labor,
              "project_labor",
              def.id,
            );
          await tx.roomProject.update({
            where: { id },
            data: { status: "BUILDING", doneDay: room.day + def.buildDays },
          });
        });
      } catch (err) {
        if (err instanceof InsufficientFundsError) return; // chờ quỹ đủ
        throw err;
      }
      this.notify?.(room.id, {
        kind: "info",
        text: `🏗️ Khởi công ${def.emoji} ${def.name} — ${def.buildDays} ngày nữa xong. ${content.data.crew.keeper} cần người phụ hồ: trộn đủ ${def.crewMixes} mẻ vữa là xong sớm!`,
        open: "site",
      });
      this.changed?.(room);
      return;
    }
    const early = r.status === "BUILDING" && r.mixes >= def.crewMixes;
    if (r.status === "BUILDING" && ((r.doneDay !== null && room.day >= r.doneDay) || early)) {
      const moved = await this.prisma.$transaction(async (tx) => {
        const m = await tx.roomProject.updateMany({
          where: { id, status: "BUILDING" },
          data: { status: "DONE" },
        });
        if (m.count === 0) return false;
        // Tiền công phụ hồ chưa dùng hết thì nhà thầu thuê thợ của họ (trả nốt cho nhà thầu).
        const left = await this.ledger.balance(tx, laborWallet(id));
        if (left > 0)
          await this.ledger.transfer(
            tx,
            laborWallet(id),
            SYSTEM.supplier,
            left,
            "project_labor_left",
            def.id,
          );
        return true;
      });
      if (!moved) return;
      this.doneCache.get(room.id)?.add(def.id);
      this.notify?.(room.id, {
        kind: "good",
        text: `🎉 Nghiệm thu ${def.emoji} ${def.name}${early ? " sớm nhờ bà con phụ hồ" : ""}! ${def.description}`,
      });
      this.changed?.(room);
    }
  }
}
