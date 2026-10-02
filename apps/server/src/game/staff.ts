import { Injectable } from "@nestjs/common";
import { content } from "@xom/content";
import type { NotifyEvent, StaffView } from "@xom/shared";
import {
  menuPriceRatio,
  nextReputation,
  type StaffShiftResult,
  shiftAt,
  staffShift,
  staffWageCarry,
} from "@xom/sim";
import {
  bankWallet,
  InsufficientFundsError,
  LedgerService,
  playerWallet,
  SYSTEM,
} from "../economy/ledger.service.js";
import type { Business } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { BusinessRepo } from "./business-repo.js";
import { consume, stockMap } from "./inventory.js";
import { menuOf } from "./menu.js";
import { addToReport } from "./report.js";
import { GameError, type RoomRuntime } from "./room.js";
import { StoryService } from "./story.js";

/**
 * Nhân viên đứng quầy thay (docs/KIENTRUC.md §2): chủ rời quầy (đi chợ, đi làm thuê) hoặc thoát game mà quầy đang mở và
 * nhân viên đang trong ca → nhân viên bán (sim staffShift: theo lưu lượng, tay nghề, kho hàng). Tiền bán vào ví chủ, lương
 * trả theo giờ từ ví chủ; không đủ trả lương thì nhân viên nghỉ. Không tự nhập hàng, không tự mở quầy → thu nhập có trần.
 */
@Injectable()
export class StaffService {
  private notify?: (playerId: string, n: NotifyEvent) => void;
  private readonly soldOutTold = new Set<string>();
  /** Sức làm dư giữa các nhịp bán trực tiếp (theo quầy). */
  private readonly capacity = new Map<string, number>();
  /** Phần lương lẻ chưa trả (đồng) của phiên đang chạy — trả theo nhịp không làm tròn lên mỗi nhịp. */
  private readonly wageCarry = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessRepo,
    private readonly ledger: LedgerService,
    private readonly story: StoryService,
  ) {}

  setNotifier(fn: (playerId: string, n: NotifyEvent) => void) {
    this.notify = fn;
  }

  async view(playerId: string): Promise<StaffView> {
    const biz = await this.businesses.withEmployee(playerId);
    const recent = await this.prisma.staffShift.findMany({
      where: { ownerId: playerId },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    return {
      employee: biz?.employee
        ? {
            staffId: biz.employee.staffId,
            shiftId: biz.employee.shiftId,
            hiredDay: biz.employee.hiredDay,
          }
        : null,
      recent: recent.map((r) => ({
        staffId: r.staffId,
        day: r.day,
        fromMinute: r.fromMinute,
        toMinute: r.toMinute,
        served: r.served,
        wrong: r.wrong,
        lost: r.lost,
        revenue: r.revenue,
        wages: r.wages,
      })),
    };
  }

  async hire(room: RoomRuntime, playerId: string, staffId: string, shiftId: string) {
    const person = content.data.staff.people.find((p) => p.id === staffId);
    if (!person || !content.data.staff.shifts.some((s) => s.id === shiftId))
      throw new GameError("invalid_payload", "Không có người / ca này");
    const biz = await this.businesses.of(playerId);
    if (!biz) throw new GameError("invalid_state", "Chưa có quầy thì thuê người làm gì");
    await this.prisma.employee.upsert({
      where: { businessId: biz.id },
      create: { businessId: biz.id, staffId, shiftId, hiredDay: room.day },
      update: { staffId, shiftId, hiredDay: room.day },
    });
    await this.story.note(playerId, "first_hire", room.day, { name: person.name });
    return this.view(playerId);
  }

  async fire(playerId: string) {
    const biz = await this.businesses.of(playerId);
    if (biz) await this.prisma.employee.deleteMany({ where: { businessId: biz.id } });
    return this.view(playerId);
  }

  /** Quầy này có nhân viên đang trong ca không. */
  async onDuty(businessId: string, minute: number) {
    const e = await this.prisma.employee.findUnique({ where: { businessId } });
    return !!e && !!shiftAt(content, e.shiftId, minute);
  }

  /**
   * Mỗi nhịp kinh tế: quầy đang mở, chủ còn trong xóm mà không tự đứng bán, nhân viên trong ca → bán thay một nhịp.
   * Trả về chủ quầy có tiền/kho đổi (để gửi MeView mới).
   */
  async tickLive(room: RoomRuntime): Promise<string[]> {
    const step = content.economy.economyTickMinutes;
    // Chủ online mà không tự đứng bán (đi vắng, hoặc ở tiệm nhưng để nhân viên bán) → nhân viên bán.
    const away = [...room.members.values()]
      .filter(
        (m) =>
          m.sockets.size > 0 && !(room.attending.has(m.playerId) && room.selfSell.has(m.playerId)),
      )
      .map((m) => m.playerId);
    if (away.length === 0) return [];
    const list = await this.prisma.business.findMany({
      where: {
        ownerId: { in: away },
        status: "OPEN",
        lotId: { not: null },
        employee: { isNot: null },
      },
      include: { employee: true },
    });
    const changed: string[] = [];
    for (const biz of list) {
      const e = biz.employee;
      if (!e || !shiftAt(content, e.shiftId, room.minute)) continue;
      const r = await this.run(room, biz, e.staffId, room.minute, room.minute + step, "live");
      if (r && r.minutes > 0) changed.push(biz.ownerId);
    }
    return changed;
  }

  /** Chủ thoát game mà quầy đang mở: nhân viên bán nốt tới hết ca hôm nay (tính ngay), rồi dọn quầy. */
  async finishShift(room: RoomRuntime, playerId: string) {
    const biz = await this.businesses.openWithEmployee(playerId);
    const e = biz?.employee;
    const shift = e ? content.data.staff.shifts.find((s) => s.id === e.shiftId) : undefined;
    if (!biz || !e || !shift) return;
    const from = Math.max(room.minute, shift.from);
    const to = Math.min(shift.to, content.economy.dayEndMinute);
    if (from >= to) return;
    await this.run(room, biz, e.staffId, from, to, "offline");
  }

  /** Chạy một phiên bán thay và ghi sổ: tiền bán, lương, kho, báo cáo ngày, phiên (để báo khi vắng). */
  private async run(
    room: RoomRuntime,
    biz: Business,
    staffId: string,
    from: number,
    to: number,
    mode: "live" | "offline",
  ): Promise<StaffShiftResult | null> {
    const person = content.data.staff.people.find((p) => p.id === staffId);
    if (!person || !biz.lotId) return null;
    const product = content.product(biz.productId);
    const menu = menuOf(biz).filter((m) => m.on);
    const stock = await stockMap(this.prisma, biz.ownerId);
    const r = staffShift({
      content,
      staff: person,
      productId: biz.productId,
      lotId: biz.lotId,
      menu: menu.map((m) => ({ variantId: m.variantId, price: m.price })),
      stock,
      reputation: biz.reputation,
      priceRatio: menuPriceRatio(product, menu),
      day: room.day,
      fromMinute: from,
      toMinute: to,
      demandCarry: biz.demandCarry,
      capacity: mode === "live" ? this.capacity.get(biz.id) : undefined,
      seed: biz.id,
    });
    if (mode === "live") this.capacity.set(biz.id, r.capacity);
    const pay = staffWageCarry(person, r.minutes, this.wageCarry.get(biz.id) ?? 0);
    this.wageCarry.set(biz.id, pay.carry);
    const wages = pay.wages;
    // Hết hàng từ đầu: nhân viên không đứng quầy, không tốn lương; báo chủ một lần trong ngày.
    if (r.minutes === 0) {
      const key = `${biz.id}:${room.day}`;
      if (r.soldOut && !this.soldOutTold.has(key)) {
        this.soldOutTold.add(key);
        this.notify?.(biz.ownerId, {
          kind: "warn",
          text: `📦 Hết hàng — ${person.name} dọn quầy nghỉ. Nhập thêm hàng nha!`,
        });
      }
      return r;
    }
    let quit = false;
    await this.prisma.$transaction(async (tx) => {
      if (r.used.size) await consume(tx, biz.ownerId, r.used);
      if (r.revenue > 0)
        await this.ledger.transfer(
          tx,
          SYSTEM.customers,
          playerWallet(biz.ownerId),
          r.revenue,
          "staff_sale",
          biz.id,
        );
      if (wages > 0) {
        try {
          await this.ledger.transfer(
            tx,
            playerWallet(biz.ownerId),
            SYSTEM.employer,
            wages,
            "staff_wage",
            biz.id,
          );
        } catch (err) {
          if (!(err instanceof InsufficientFundsError)) throw err;
          try {
            await this.ledger.transfer(
              tx,
              bankWallet(biz.ownerId),
              SYSTEM.employer,
              wages,
              "staff_wage",
              biz.id,
            );
          } catch (err2) {
            if (!(err2 instanceof InsufficientFundsError)) throw err2;
            quit = true;
          }
        }
      }
      const total = r.served + r.wrong;
      const satisfaction = total ? (r.served + r.wrong * 0.4) / total : 0;
      await addToReport(tx, biz.ownerId, room.day, {
        revenue: r.revenue,
        served: r.served,
        wrong: r.wrong,
        lost: r.lost,
        fees: quit ? 0 : wages,
        ...(total ? { satisfaction: { value: satisfaction, weight: total } } : {}),
      });
      await tx.business.update({
        where: { id: biz.id },
        data: {
          demandCarry: r.demandCarry,
          reputation: nextReputation(
            biz.reputation,
            satisfaction || biz.reputation,
            total,
            content.economy.reputationRate,
          ),
        },
      });
      // Phiên bán: chế độ live gộp theo (quầy, ngày) vào một dòng; offline là một dòng riêng.
      const open =
        mode === "live"
          ? await tx.staffShift.findFirst({
              where: { businessId: biz.id, day: room.day, toMinute: from },
              orderBy: { createdAt: "desc" },
            })
          : null;
      if (open)
        await tx.staffShift.update({
          where: { id: open.id },
          data: {
            toMinute: to,
            served: { increment: r.served },
            wrong: { increment: r.wrong },
            lost: { increment: r.lost },
            revenue: { increment: r.revenue },
            wages: { increment: quit ? 0 : wages },
          },
        });
      else
        await tx.staffShift.create({
          data: {
            businessId: biz.id,
            ownerId: biz.ownerId,
            staffId,
            day: room.day,
            fromMinute: from,
            toMinute: to,
            served: r.served,
            wrong: r.wrong,
            lost: r.lost,
            revenue: r.revenue,
            wages: quit ? 0 : wages,
          },
        });
      if (quit) await tx.employee.deleteMany({ where: { businessId: biz.id } });
    });
    if (quit)
      this.notify?.(biz.ownerId, {
        kind: "warn",
        text: `😤 ${person.name} nghỉ làm vì không có tiền trả lương`,
      });
    else if (mode === "live" && r.served > 0)
      this.notify?.(biz.ownerId, {
        kind: "info",
        text: `👩‍🍳 ${person.name} vừa bán ${r.served} món thay bạn`,
      });
    return r;
  }
}
