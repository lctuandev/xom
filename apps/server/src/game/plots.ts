import { Injectable } from "@nestjs/common";
import { content } from "@xom/content";
import type { PayMethod, PlotView } from "@xom/shared";
import { effectiveShopLevel, landPrice, landRefund, type PaySource } from "@xom/sim";
import { LedgerService, playerWallet, SYSTEM } from "../economy/ledger.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { Broadcast } from "./broadcast.js";
import { PaymentService } from "./payment.js";
import { addToReport } from "./report.js";
import { GameError, type IntentContext, type RoomRuntime } from "./room.js";

/** Đứng cách ô đất trong khoảng này (mét) mới mua được — phải tới tận nơi xem đất. */
const REACH = 6;

/**
 * Ô đất mua đứt (docs/BANDO.md bước D): chỉ ô sạp có mái của khu đã mở. Chủ ô không trả tiền thuê (chỉ thuế đất khi mở sạp),
 * người khác không dọn tới được; mỗi người tối đa `economy.land.maxPerPlayer` ô một xóm; bán lại cho xóm `sellBack` × giá mua.
 * Danh sách ô có chủ của xóm giữ trong `room.plots` (nạp khi mở xóm, cập nhật khi mua/bán).
 */
@Injectable()
export class PlotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly payment: PaymentService,
    private readonly broadcast: Broadcast,
  ) {}

  async load(room: RoomRuntime) {
    const rows = await this.prisma.plot.findMany({
      where: { roomId: room.id },
      include: { owner: { select: { displayName: true } } },
      orderBy: { createdAt: "asc" },
    });
    room.plots = rows.map((p) => ({
      lotId: p.lotId,
      ownerId: p.ownerId,
      ownerName: p.owner.displayName,
      price: p.price,
      building: p.building,
      buildDone: p.buildDone,
      level: p.level,
    }));
  }

  /** Cấp tiệm có hiệu lực của một cửa hàng ở chỗ nó đang đặt (sạp trên ô của chủ theo công trình đã xây). */
  levelIn(room: RoomRuntime, biz: { ownerId: string; lotId: string | null; level: number }) {
    const kind = biz.lotId ? content.lot(biz.lotId).kind : null;
    const plot = biz.lotId ? this.ownerOf(room, biz.lotId) : undefined;
    return effectiveShopLevel(kind, biz.level, plot?.ownerId === biz.ownerId ? plot.level : null);
  }

  /** Như levelIn nhưng không cần xóm trong bộ nhớ (đọc ô từ DB). */
  async levelFor(biz: { ownerId: string; lotId: string | null; level: number }) {
    const kind = biz.lotId ? content.lot(biz.lotId).kind : null;
    const plot =
      kind === "stall" && biz.lotId
        ? await this.prisma.plot.findFirst({ where: { lotId: biz.lotId, ownerId: biz.ownerId } })
        : null;
    return effectiveShopLevel(kind, biz.level, plot?.level ?? null);
  }

  /** Ô đang có công trình chưa xong (không mở sạp được). */
  building(room: RoomRuntime, lotId: string | null | undefined) {
    const p = lotId ? this.ownerOf(room, lotId) : undefined;
    return p?.buildDone != null ? p : undefined;
  }

  /**
   * 🏗️ Xây tiệm trên ô đất của mình (bước E): theo thứ tự mẫu công trình, trả tiền một lần, chờ đủ ngày (sang ngày mới thì
   * xong). Tiền xây cộng vào giá ô — bán lại cho xóm tính trên tổng đã bỏ ra.
   */
  async build(
    { room, playerId }: IntentContext,
    lotId: string,
    buildingId: string,
    pay?: PayMethod,
  ) {
    const plot = this.ownerOf(room, lotId);
    if (!plot || plot.ownerId !== playerId)
      throw new GameError("invalid_state", "Chỉ xây được trên ô đất của mình");
    const def = content.data.buildings.find((b) => b.id === buildingId);
    if (!def) throw new GameError("invalid_payload", "Không có mẫu công trình này");
    if (plot.buildDone != null)
      throw new GameError("invalid_state", `Đang xây — xong ngày ${plot.buildDone}`);
    if (def.level <= plot.level)
      throw new GameError("invalid_state", "Ô này đã xây tới mức đó rồi");
    if (def.requires && plot.building !== def.requires)
      throw new GameError("invalid_state", `Phải xây ${content.building(def.requires).name} trước`);
    const open = await this.prisma.business.findFirst({
      where: { lotId, ownerId: playerId, status: "OPEN" },
    });
    if (open) throw new GameError("invalid_state", "Đóng sạp rồi mới khởi công");
    const doneDay = room.day + def.buildDays;
    let src: PaySource = "cash";
    await this.prisma.$transaction(async (tx) => {
      src = await this.payment.payOut(tx, playerId, def.cost, SYSTEM.supplier, "build", lotId, pay);
      await tx.plot.update({
        where: { roomId_lotId: { roomId: room.id, lotId } },
        data: { building: def.id, buildDone: doneDay, price: { increment: def.cost } },
      });
      await addToReport(tx, playerId, room.day, { fees: def.cost });
      await tx.gameEvent.create({
        data: {
          playerId,
          type: "land_build",
          payload: { lotId, building: def.id, cost: def.cost },
        },
      });
    });
    await this.load(room);
    this.broadcast.paidBy(playerId, src, def.cost);
    this.broadcast.notify(playerId, {
      kind: "good",
      text: `🏗️ Khởi công ${def.emoji} ${def.name} — ${def.buildDays} ngày nữa xong (ngày ${doneDay})`,
    });
    this.broadcast.world(room);
  }

  /** Sang ngày mới: công trình tới ngày thì xong, ô lên cấp. */
  async finishBuilds(room: RoomRuntime) {
    const due = room.plots.filter((p) => p.buildDone != null && p.buildDone <= room.day);
    if (!due.length) return;
    for (const p of due) {
      const def = content.building(p.building ?? "");
      await this.prisma.plot.update({
        where: { roomId_lotId: { roomId: room.id, lotId: p.lotId } },
        data: { buildDone: null, level: def.level },
      });
      this.broadcast.notify(p.ownerId, {
        kind: "good",
        text: `${def.emoji} ${def.name} xây xong — tiệm lên cấp ${def.level}, khách đông hơn`,
      });
    }
    await this.load(room);
    this.broadcast.world(room);
  }

  ownerOf(room: RoomRuntime, lotId: string): PlotView | undefined {
    return room.plots.find((p) => p.lotId === lotId);
  }

  owns(room: RoomRuntime, playerId: string, lotId: string | null | undefined): boolean {
    return !!lotId && this.ownerOf(room, lotId)?.ownerId === playerId;
  }

  async buy({ room, playerId }: IntentContext, lotId: string, pay?: PayMethod) {
    const lot = content.lotsIn(room.chunks).find((l) => l.id === lotId);
    if (!lot) throw new GameError("invalid_payload", "Không có ô đất này");
    if (lot.kind !== "stall")
      throw new GameError("invalid_state", "Chỉ mua được ô đất (sạp có mái) — vỉa hè là chỗ chung");
    const owner = this.ownerOf(room, lotId);
    if (owner)
      throw new GameError(
        "invalid_state",
        owner.ownerId === playerId ? "Ô này của bạn rồi" : `Ô này ${owner.ownerName} đã mua`,
      );
    const land = content.economy.land;
    if (room.plots.filter((p) => p.ownerId === playerId).length >= land.maxPerPlayer)
      throw new GameError("invalid_state", `Mỗi người chỉ mua tối đa ${land.maxPerPlayer} ô đất`);
    const pos = room.members.get(playerId)?.pos;
    if (!pos || pos.inside || Math.hypot(pos.x - lot.position.x, pos.z - lot.position.z) > REACH)
      throw new GameError(
        "invalid_state",
        `Tới tận ${lot.name.replace(/^⛺ /, "")} xem đất rồi mới mua`,
      );
    // Người khác đang dựng sạp thuê ở ô này thì không mua chen được.
    const renter = await this.prisma.business.findFirst({
      where: { lotId, ownerId: { not: playerId }, owner: { roomId: room.id } },
      include: { owner: { select: { displayName: true } } },
    });
    if (renter) throw new GameError("invalid_state", `${renter.owner.displayName} đang thuê ô này`);
    const price = landPrice(content, lotId);
    let src: PaySource = "cash";
    await this.prisma.$transaction(async (tx) => {
      src = await this.payment.payOut(tx, playerId, price, SYSTEM.landlord, "land_buy", lotId, pay);
      await tx.plot.create({
        data: { roomId: room.id, lotId, ownerId: playerId, price, boughtDay: room.day },
      });
      await addToReport(tx, playerId, room.day, { fees: price });
      await tx.gameEvent.create({
        data: { playerId, type: "land_buy", payload: { lotId, price } },
      });
    });
    await this.load(room);
    this.broadcast.paidBy(playerId, src, price);
    this.broadcast.notify(playerId, {
      kind: "good",
      text: `🏷️ Mua đứt ${lot.name.replace(/^⛺ /, "")} — từ nay không trả tiền thuê, chỉ đóng thuế đất khi mở sạp`,
    });
    this.broadcast.world(room);
  }

  async sell({ room, playerId }: IntentContext, lotId: string) {
    const owner = this.ownerOf(room, lotId);
    if (!owner || owner.ownerId !== playerId)
      throw new GameError("invalid_state", "Ô này không phải của bạn");
    const busy = await this.prisma.business.findFirst({
      where: { lotId, ownerId: playerId, status: "OPEN" },
    });
    if (busy) throw new GameError("invalid_state", "Dọn sạp (đóng quầy) rồi mới bán đất");
    if (owner.buildDone != null)
      throw new GameError("invalid_state", "Đang xây dở — xây xong rồi mới bán được");
    const refund = landRefund(content, owner.price);
    await this.prisma.$transaction(async (tx) => {
      await tx.plot.delete({ where: { roomId_lotId: { roomId: room.id, lotId } } });
      // Quầy của mình đang đặt ở ô này thì dọn ra (chưa chọn chỗ).
      await tx.business.updateMany({ where: { lotId, ownerId: playerId }, data: { lotId: null } });
      await this.ledger.transfer(
        tx,
        SYSTEM.landlord,
        playerWallet(playerId),
        refund,
        "land_sell",
        lotId,
      );
    });
    await this.load(room);
    this.broadcast.notify(playerId, {
      kind: "info",
      text: `🏷️ Bán lại ô đất cho xóm: +${refund.toLocaleString("vi-VN")}đ`,
    });
    this.broadcast.world(room);
  }
}
