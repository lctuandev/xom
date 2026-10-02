import { Injectable } from "@nestjs/common";
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

  /** Cửa hàng kèm nhân viên. */
  withEmployee(playerId: string) {
    return this.prisma.business.findFirst({
      where: { ownerId: playerId },
      include: { employee: true },
    });
  }
}
