import { Injectable } from "@nestjs/common";
import { content } from "@xom/content";
import type { FundView, NotifyEvent } from "@xom/shared";
import { canPropose, tallyVotes } from "@xom/sim";
import {
  fundWallet,
  InsufficientFundsError,
  LedgerService,
  SYSTEM,
} from "../economy/ledger.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { GameError, type RoomRuntime } from "./room.js";

const ACTIVE = ["VOTING", "FUNDING", "BUILDING"] as const;
const DAY = 24 * 60;

/**
 * Quỹ xóm + công trình chung (docs/USECASES.md UC-J5): ai trong xóm cũng đề xuất được (mỗi lúc một đề xuất đang
 * bỏ phiếu); hết hạn hoặc đủ phiếu thì kiểm phiếu; qua thì chờ quỹ đủ tiền rồi thi công vài ngày; xong thì nghiệm thu,
 * khách ở các chỗ bán liên quan ghé nhiều hơn. Quỹ do phí chợ (một phần) + hàng xóm góp; chi qua sổ cái.
 */
@Injectable()
export class ProjectService {
  private notify?: (roomId: string, n: NotifyEvent) => void;
  /** Công trình đã xong theo xóm (cache, nạp lần đầu cần). */
  private readonly doneCache = new Map<string, Set<string>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  setNotifier(fn: (roomId: string, n: NotifyEvent) => void) {
    this.notify = fn;
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
          await this.ledger.transfer(
            tx,
            fundWallet(room.id),
            SYSTEM.supplier,
            def.cost,
            "project",
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
        text: `🏗️ Khởi công ${def.emoji} ${def.name} — ${def.buildDays} ngày nữa xong`,
      });
      return;
    }
    if (r.status === "BUILDING" && r.doneDay !== null && room.day >= r.doneDay) {
      await this.prisma.roomProject.update({ where: { id }, data: { status: "DONE" } });
      this.doneCache.get(room.id)?.add(def.id);
      this.notify?.(room.id, {
        kind: "good",
        text: `🎉 Nghiệm thu ${def.emoji} ${def.name}! ${def.description}`,
      });
    }
  }
}
