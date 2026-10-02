import { Injectable } from "@nestjs/common";
import { content } from "@xom/content";
import { shiftAt } from "@xom/sim";
import type { Tx } from "../economy/ledger.service.js";
import type { Business } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { GameError } from "./room.js";

type Db = PrismaService | Tx;

/**
 * Chỗ DUY NHẤT tìm cửa hàng của một người chơi (docs/IA.md §5). Hiện mỗi người một cửa hàng; bước D (nhiều cửa hàng)
 * chỉ sửa ở đây (thêm `businessId`) — các service khác không tự `business.findFirst({ ownerId })` nữa.
 */
@Injectable()
export class BusinessRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Cửa hàng của người chơi (null = chưa có xe hàng). */
  of(playerId: string, db: Db = this.prisma): Promise<Business | null> {
    return db.business.findFirst({ where: { ownerId: playerId } });
  }

  /** Như `of` nhưng bắt buộc có — không có thì báo lỗi cho người chơi. */
  async require(
    playerId: string,
    message = "Bạn chưa có quầy hàng",
    db: Db = this.prisma,
  ): Promise<Business> {
    const biz = await this.of(playerId, db);
    if (!biz) throw new GameError("invalid_state", message);
    return biz;
  }

  /** Cửa hàng đang mở (bán) của người chơi — có thì chủ đang bận đứng quầy. */
  openOf(playerId: string): Promise<Business | null> {
    return this.prisma.business.findFirst({ where: { ownerId: playerId, status: "OPEN" } });
  }

  /** Cửa hàng đang mở ở một chỗ, kèm nhân viên (nhân viên bán nốt ca khi chủ thoát game). */
  openWithEmployee(playerId: string) {
    return this.prisma.business.findFirst({
      where: { ownerId: playerId, status: "OPEN", lotId: { not: null } },
      include: { employee: true },
    });
  }

  /**
   * Chủ có bị "trói" ở quầy không (HANDOFF 3.4, docs/IA.md bước E): có quầy đang mở mà KHÔNG có nhân viên trong ca → phải
   * đứng bán, không đi làm việc khác được. Có nhân viên trong ca thì chủ tự do đi làm thuê, chạy xe ôm, phụ hồ.
   */
  async ownerTied(playerId: string, minute: number): Promise<Business | null> {
    const open = await this.prisma.business.findMany({
      where: { ownerId: playerId, status: "OPEN" },
      include: { employee: true },
    });
    return open.find((b) => !b.employee || !shiftAt(content, b.employee.shiftId, minute)) ?? null;
  }

  /** Cửa hàng kèm nhân viên. */
  withEmployee(playerId: string) {
    return this.prisma.business.findFirst({
      where: { ownerId: playerId },
      include: { employee: true },
    });
  }
}
