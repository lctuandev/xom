import { Injectable } from "@nestjs/common";
import { content } from "@xom/content";
import { onDutyTeam } from "@xom/sim";
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

  /** Mọi cửa hàng của người chơi, cũ trước (docs/IA.md bước D — không giới hạn số cửa hàng). */
  list(playerId: string, db: Db = this.prisma): Promise<Business[]> {
    return db.business.findMany({ where: { ownerId: playerId }, orderBy: { createdAt: "asc" } });
  }

  /** Id cửa hàng đang quản lý (đã chọn và còn của mình), mặc định cửa hàng cũ nhất. */
  private async activeId(playerId: string, db: Db, list: { id: string }[]) {
    if (!list.length) return null;
    const p = await db.player.findUnique({
      where: { id: playerId },
      select: { activeBusinessId: true },
    });
    return list.find((b) => b.id === p?.activeBusinessId)?.id ?? list[0]?.id ?? null;
  }

  /** Cửa hàng ĐANG QUẢN LÝ của người chơi (null = chưa có xe hàng) — mọi thao tác quầy áp cho cửa hàng này. */
  async of(playerId: string, db: Db = this.prisma): Promise<Business | null> {
    const list = await this.list(playerId, db);
    const id = await this.activeId(playerId, db, list);
    return list.find((b) => b.id === id) ?? null;
  }

  /** Chọn cửa hàng đang quản lý (phải là của mình). */
  async select(playerId: string, businessId: string) {
    const biz = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!biz || biz.ownerId !== playerId)
      throw new GameError("invalid_payload", "Không phải cửa hàng của bạn");
    await this.prisma.player.update({
      where: { id: playerId },
      data: { activeBusinessId: businessId },
    });
    return biz;
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

  /** Mọi cửa hàng đang mở ở một chỗ, kèm nhân viên (nhân viên bán nốt ca khi chủ thoát game). */
  openWithEmployee(playerId: string) {
    return this.prisma.business.findMany({
      where: { ownerId: playerId, status: "OPEN", lotId: { not: null } },
      include: { employees: true },
    });
  }

  /**
   * Chủ có bị "trói" ở quầy không (HANDOFF 3.4, docs/IA.md bước E): có quầy đang mở mà KHÔNG có nhân viên trong ca → phải
   * đứng bán, không đi làm việc khác được. Có nhân viên trong ca thì chủ tự do đi làm thuê, chạy xe ôm, phụ hồ.
   */
  async ownerTied(playerId: string, minute: number): Promise<Business | null> {
    const open = await this.prisma.business.findMany({
      where: { ownerId: playerId, status: "OPEN" },
      include: { employees: true },
    });
    return open.find((b) => onDutyTeam(content, b.employees, minute).length === 0) ?? null;
  }

  /** Cửa hàng đang quản lý, kèm nhân viên. */
  async withEmployee(playerId: string) {
    const list = await this.prisma.business.findMany({
      where: { ownerId: playerId },
      orderBy: { createdAt: "asc" },
      include: { employees: true },
    });
    const id = await this.activeId(playerId, this.prisma, list);
    return list.find((b) => b.id === id) ?? null;
  }

  /** Mọi cửa hàng kèm nhân viên (bảng Cửa hàng của tôi / tổng quan). */
  listWithEmployee(playerId: string) {
    return this.prisma.business.findMany({
      where: { ownerId: playerId },
      orderBy: { createdAt: "asc" },
      include: { employees: true },
    });
  }
}
