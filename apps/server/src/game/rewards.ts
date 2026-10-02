import { Injectable } from "@nestjs/common";
import { content, type Reward } from "@xom/content";
import type { QuestView } from "@xom/shared";
import { LedgerService, playerWallet, SYSTEM } from "../economy/ledger.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { Broadcast } from "./broadcast.js";
import { GameError, type IntentContext, type RoomRuntime } from "./room.js";

type Claimed = Record<string, number>;
const questKey = (day: number, id: string) => `q:${day}:${id}`;
const achKey = (id: string) => `ach:${id}`;

/**
 * Thưởng thành tựu + nhiệm vụ hằng ngày (góp ý đợt 2: "có mà không thưởng gì thì trông vô dụng"). Server kiểm đạt thật
 * (thành tựu đã ghi mở / sổ hôm nay đủ số) và chưa nhận rồi mới cộng XP + tiền mặt qua sổ cái (lý do `reward`). Tiền nhỏ,
 * một lần (thành tựu) hoặc mỗi ngày một lần (nhiệm vụ) — không thành thu nhập thụ động.
 */
@Injectable()
export class RewardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly broadcast: Broadcast,
  ) {}

  claimedOf(raw: unknown): Claimed {
    return { ...((raw ?? {}) as Claimed) };
  }

  /** Nhiệm vụ hôm nay: tiến độ từ sổ hôm nay (món bán, tiền công) + số người online cùng xóm. */
  async quests(room: RoomRuntime, playerId: string): Promise<QuestView[]> {
    const [player, report] = await Promise.all([
      this.prisma.player.findUniqueOrThrow({ where: { id: playerId } }),
      this.prisma.dailyReport.findFirst({ where: { playerId, day: room.day } }),
    ]);
    const claimed = this.claimedOf(player.rewardsClaimed);
    const online = [...room.members.values()].filter((m) => m.sockets.size > 0).length;
    const values = { sold: report?.served ?? 0, wages: report?.wages ?? 0, neighbors: online };
    return content.data.dailyQuests.map((q) => {
      const value = Math.min(q.goal, values[q.metric]);
      return {
        id: q.id,
        emoji: q.emoji,
        text: q.text,
        hint: q.hint,
        goal: q.goal,
        value,
        done: value >= q.goal,
        reward: q.reward,
        claimed: claimed[questKey(room.day, q.id)] !== undefined,
      };
    });
  }

  async claim({ room, playerId }: IntentContext, kind: "ach" | "quest", id: string) {
    let reward: Reward;
    let key: string;
    let label: string;
    if (kind === "ach") {
      const def = content.data.achievements.find((a) => a.id === id);
      if (!def) throw new GameError("invalid_payload", "Không có thành tựu này");
      const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
      const got = (player.achievements ?? {}) as Record<string, number>;
      if (got[id] === undefined) throw new GameError("invalid_state", "Chưa đạt thành tựu này");
      reward = def.reward;
      key = achKey(id);
      label = `${def.emoji} ${def.name}`;
    } else {
      const q = (await this.quests(room, playerId)).find((x) => x.id === id);
      if (!q) throw new GameError("invalid_payload", "Không có nhiệm vụ này");
      if (!q.done) throw new GameError("invalid_state", "Chưa xong nhiệm vụ này");
      reward = q.reward;
      key = questKey(room.day, id);
      label = `${q.emoji} ${q.text}`;
    }
    await this.prisma.$transaction(async (tx) => {
      // Đọc lại trong giao dịch: bấm hai lần cũng chỉ nhận một lần.
      const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
      const claimed = this.claimedOf(player.rewardsClaimed);
      if (claimed[key] !== undefined) throw new GameError("invalid_state", "Nhận thưởng này rồi");
      claimed[key] = room.day;
      // Dọn dấu nhiệm vụ ngày cũ (chỉ cần hôm nay).
      for (const k of Object.keys(claimed))
        if (k.startsWith("q:") && (claimed[k] ?? 0) < room.day - 7) delete claimed[k];
      await tx.player.update({
        where: { id: playerId },
        data: { rewardsClaimed: claimed, xp: { increment: reward.xp } },
      });
      if (reward.money > 0)
        await this.ledger.transfer(
          tx,
          SYSTEM.bank,
          playerWallet(playerId),
          reward.money,
          "reward",
          key,
        );
    });
    const parts = [
      reward.money > 0 ? `+${reward.money.toLocaleString("vi-VN")}đ` : null,
      reward.xp > 0 ? `+${reward.xp} kinh nghiệm` : null,
    ].filter(Boolean);
    this.broadcast.notify(playerId, { kind: "good", text: `🎁 ${label}: ${parts.join(", ")}` });
  }
}
