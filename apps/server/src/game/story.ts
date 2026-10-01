import { Injectable } from "@nestjs/common";
import { content } from "@xom/content";
import type { NotifyEvent, StoryEntryView } from "@xom/shared";
import { storyText } from "@xom/sim";
import type { Tx } from "../economy/ledger.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

type Db = PrismaService | Tx;

/**
 * Chuyện của tôi (docs/THEGIOI.md §1): ghi mốc đời người chơi — mỗi mốc một lần, câu viết sẵn lúc xảy ra
 * (đổi content sau này không làm sai ký ức). Có mốc mới thì báo "📖 …" cho người chơi.
 */
@Injectable()
export class StoryService {
  private notify?: (playerId: string, n: NotifyEvent) => void;

  constructor(private readonly prisma: PrismaService) {}

  setNotifier(fn: (playerId: string, n: NotifyEvent) => void) {
    this.notify = fn;
  }

  /** Ghi mốc `beatId` trong content.story; `suffix` để một loại mốc ghi nhiều lần (đổi nghề theo từng nghề). */
  async note(
    playerId: string,
    beatId: string,
    day: number,
    vars: Record<string, string | number> = {},
    opts: { suffix?: string; db?: Db; quiet?: boolean } = {},
  ): Promise<boolean> {
    const beat = content.data.story.find((b) => b.id === beatId);
    if (!beat) return false;
    const key = opts.suffix ? `${beatId}:${opts.suffix}` : beatId;
    return this.write(playerId, key, day, beat.emoji, storyText(beat.text, vars), opts);
  }

  /** Ghi một mốc đã có sẵn câu (thành tựu). */
  async write(
    playerId: string,
    key: string,
    day: number,
    emoji: string,
    text: string,
    opts: { db?: Db; quiet?: boolean } = {},
  ): Promise<boolean> {
    const db = opts.db ?? this.prisma;
    const { count } = await db.storyEntry.createMany({
      data: [{ playerId, key, day, emoji, text }],
      skipDuplicates: true,
    });
    if (count > 0 && !opts.quiet)
      this.notify?.(playerId, { kind: "good", text: `📖 ${emoji} ${text}` });
    return count > 0;
  }

  async list(playerId: string): Promise<StoryEntryView[]> {
    const rows = await this.prisma.storyEntry.findMany({
      where: { playerId },
      orderBy: [{ day: "asc" }, { createdAt: "asc" }],
      take: 200,
    });
    return rows.map((r) => ({ day: r.day, emoji: r.emoji, text: r.text }));
  }
}
