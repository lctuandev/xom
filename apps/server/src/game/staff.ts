import { Injectable } from "@nestjs/common";
import { content } from "@xom/content";
import type { NotifyEvent, StaffView } from "@xom/shared";
import {
  menuPriceRatio,
  nextReputation,
  nextShopLevel,
  onDutyTeam,
  type StaffShiftResult,
  shopLevel,
  staffShift,
  staffWageCarry,
} from "@xom/sim";
import { LedgerService, playerWallet, SYSTEM } from "../economy/ledger.service.js";
import type { Business, Employee } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { BusinessRepo } from "./business-repo.js";
import { consume, stockMap } from "./inventory.js";
import { menuOf } from "./menu.js";
import { PaymentService } from "./payment.js";
import { PlotService } from "./plots.js";
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
    private readonly payment: PaymentService,
    private readonly plots: PlotService,
  ) {}

  setNotifier(fn: (playerId: string, n: NotifyEvent) => void) {
    this.notify = fn;
  }

  async view(playerId: string): Promise<StaffView> {
    const [biz, all, recent] = await Promise.all([
      this.businesses.withEmployee(playerId),
      this.businesses.listWithEmployee(playerId),
      this.prisma.staffShift.findMany({
        where: { ownerId: playerId },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);
    const level = biz ? await this.plots.levelFor(biz) : 1;
    const lotKind = biz?.lotId ? content.lot(biz.lotId).kind : null;
    const next = nextShopLevel(content, level, lotKind);
    return {
      employees: (biz?.employees ?? []).map((e) => ({
        id: e.id,
        staffId: e.staffId,
        shiftId: e.shiftId,
        hiredDay: e.hiredDay,
      })),
      maxStaff: shopLevel(content, level).maxStaff,
      level,
      next: next
        ? {
            level: next.level,
            name: next.name,
            cost: next.upgradeCost,
            maxStaff: next.maxStaff,
            trafficMul: next.trafficMul,
          }
        : null,
      busyElsewhere: all
        .filter((b) => b.id !== biz?.id)
        .flatMap((b) => b.employees.map((e) => e.staffId)),
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

  /**
   * Thuê người cho cửa hàng đang quản lý (docs/IA.md bước E): tối đa theo cấp tiệm; một người chỉ làm cho một cửa hàng
   * của mình; thuê lại người đang làm ở đây thì đổi ca.
   */
  async hire(room: RoomRuntime, playerId: string, staffId: string, shiftId: string) {
    const person = content.data.staff.people.find((p) => p.id === staffId);
    if (!person || !content.data.staff.shifts.some((s) => s.id === shiftId))
      throw new GameError("invalid_payload", "Không có người / ca này");
    const biz = await this.businesses.withEmployee(playerId);
    if (!biz) throw new GameError("invalid_state", "Chưa có quầy thì thuê người làm gì");
    const here = biz.employees.find((e) => e.staffId === staffId);
    if (here) {
      await this.prisma.employee.update({ where: { id: here.id }, data: { shiftId } });
      return this.view(playerId);
    }
    const elsewhere = await this.prisma.employee.findFirst({
      where: { staffId, business: { ownerId: playerId } },
    });
    if (elsewhere)
      throw new GameError(
        "invalid_state",
        `${person.name} đang làm ở cửa hàng khác của bạn — cho nghỉ bên đó trước`,
      );
    const level = await this.plots.levelFor(biz);
    const max = shopLevel(content, level).maxStaff;
    if (biz.employees.length >= max)
      throw new GameError(
        "invalid_state",
        `Cửa hàng cấp ${level} chỉ thuê được ${max} người — nâng cấp tiệm để thuê thêm`,
      );
    await this.prisma.employee.create({
      data: { businessId: biz.id, staffId, shiftId, hiredDay: room.day },
    });
    await this.story.note(playerId, "first_hire", room.day, { name: person.name });
    return this.view(playerId);
  }

  /** Cho một người nghỉ (bỏ trống = cho nghỉ hết người ở cửa hàng đang quản lý). */
  async fire(playerId: string, employeeId?: string) {
    const biz = await this.businesses.of(playerId);
    if (biz)
      await this.prisma.employee.deleteMany({
        where: { businessId: biz.id, ...(employeeId ? { id: employeeId } : {}) },
      });
    return this.view(playerId);
  }

  /** Quầy này có nhân viên đang trong ca không. */
  async onDuty(businessId: string, minute: number) {
    const list = await this.prisma.employee.findMany({ where: { businessId } });
    return onDutyTeam(content, list, minute).length > 0;
  }

  /**
   * Mỗi nhịp kinh tế: quầy đang mở, chủ không tự đứng bán ĐÚNG quầy đó, có nhân viên trong ca → cả nhóm trong ca bán thay
   * một nhịp. Trả về chủ quầy có tiền/kho đổi (để gửi MeView mới).
   */
  async tickLive(room: RoomRuntime): Promise<string[]> {
    const step = content.economy.economyTickMinutes;
    const online = [...room.members.values()]
      .filter((m) => m.sockets.size > 0)
      .map((m) => m.playerId);
    if (online.length === 0) return [];
    const list = (
      await this.prisma.business.findMany({
        where: {
          ownerId: { in: online },
          status: "OPEN",
          lotId: { not: null },
          employees: { some: {} },
        },
        include: { employees: true },
      })
    ).filter((b) => !(room.attendsAt(b.ownerId, b.id) && room.selfSell.has(b.ownerId)));
    const changed: string[] = [];
    for (const biz of list) {
      const team = onDutyTeam(content, biz.employees, room.minute);
      if (!team.length) continue;
      const r = await this.run(room, biz, team, room.minute, room.minute + step, "live");
      if (r && r.minutes > 0) changed.push(biz.ownerId);
    }
    return changed;
  }

  /** Chủ thoát game mà quầy đang mở: nhân viên bán nốt tới hết ca hôm nay (tính ngay), rồi dọn quầy. */
  async finishShift(room: RoomRuntime, playerId: string) {
    // Nhiều cửa hàng: mọi cửa hàng đang mở có nhân viên đều bán nốt; mỗi người theo ca của mình (gom theo ca).
    for (const biz of await this.businesses.openWithEmployee(playerId)) {
      const byShift = new Map<string, Employee[]>();
      for (const e of biz.employees) byShift.set(e.shiftId, [...(byShift.get(e.shiftId) ?? []), e]);
      for (const [shiftId, team] of byShift) {
        const shift = content.data.staff.shifts.find((s) => s.id === shiftId);
        if (!shift) continue;
        const from = Math.max(room.minute, shift.from);
        const to = Math.min(shift.to, content.economy.dayEndMinute);
        if (from >= to) continue;
        await this.run(room, biz, team, from, to, "offline");
      }
    }
  }

  /** Chạy một phiên bán thay của cả nhóm và ghi sổ: tiền bán, lương từng người, kho, báo cáo ngày, phiếu ca theo người. */
  private async run(
    room: RoomRuntime,
    biz: Business,
    employees: Employee[],
    from: number,
    to: number,
    mode: "live" | "offline",
  ): Promise<StaffShiftResult | null> {
    const team = employees
      .map((e) => content.data.staff.people.find((p) => p.id === e.staffId))
      .filter((p): p is NonNullable<typeof p> => !!p);
    const first = team[0];
    if (!first || !biz.lotId) return null;
    const names = team.map((p) => p.name).join(", ");
    const product = content.product(biz.productId);
    const menu = menuOf(biz).filter((m) => m.on);
    const stock = await stockMap(this.prisma, biz.id);
    const r = staffShift({
      content,
      staff: first,
      team,
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
      // Cấp tiệm: tiệm to hơn, đông khách hơn (docs/IA.md bước E).
      boost: shopLevel(content, await this.plots.levelFor(biz)).trafficMul,
      capacity: mode === "live" ? this.capacity.get(biz.id) : undefined,
      seed: biz.id,
    });
    if (mode === "live") this.capacity.set(biz.id, r.capacity);
    // Lương từng người, cộng dồn phần lẻ theo (quầy, người).
    const wageOf = new Map<string, number>();
    for (const p of team) {
      const key = `${biz.id}:${p.id}`;
      const pay = staffWageCarry(p, r.minutes, this.wageCarry.get(key) ?? 0);
      this.wageCarry.set(key, pay.carry);
      wageOf.set(p.id, pay.wages);
    }
    const wages = [...wageOf.values()].reduce((a, b) => a + b, 0);
    // Hết hàng từ đầu: nhân viên không đứng quầy, không tốn lương; báo chủ một lần trong ngày.
    if (r.minutes === 0) {
      const key = `${biz.id}:${room.day}`;
      if (r.soldOut && !this.soldOutTold.has(key)) {
        this.soldOutTold.add(key);
        this.notify?.(biz.ownerId, {
          kind: "warn",
          text: `📦 Hết hàng — ${names} dọn quầy nghỉ. Nhập thêm hàng nha!`,
        });
      }
      return r;
    }
    let quit = false;
    await this.prisma.$transaction(async (tx) => {
      if (r.used.size) await consume(tx, biz.id, r.used);
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
          await this.payment.cashThenBank(
            tx,
            biz.ownerId,
            wages,
            SYSTEM.employer,
            "staff_wage",
            "Không đủ tiền trả lương",
            biz.id,
          );
        } catch (err) {
          if (!(err instanceof GameError)) throw err;
          quit = true;
        }
      }
      const total = r.served + r.wrong;
      const satisfaction = total ? (r.served + r.wrong * 0.4) / total : 0;
      await addToReport(tx, biz.ownerId, room.day, {
        revenue: r.revenue,
        served: r.served,
        wrong: r.wrong,
        lost: r.lost,
        staffWages: quit ? 0 : wages,
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
      // Phiếu ca theo NGƯỜI: chế độ live gộp theo (quầy, người, ngày) vào một dòng; offline là một dòng riêng.
      for (const [idx, b] of r.byStaff.entries()) {
        const w = quit ? 0 : (wageOf.get(b.staffId) ?? 0);
        const lost = idx === 0 ? r.lost : 0;
        const open =
          mode === "live"
            ? await tx.staffShift.findFirst({
                where: { businessId: biz.id, staffId: b.staffId, day: room.day, toMinute: from },
                orderBy: { createdAt: "desc" },
              })
            : null;
        if (open)
          await tx.staffShift.update({
            where: { id: open.id },
            data: {
              toMinute: to,
              served: { increment: b.served },
              wrong: { increment: b.wrong },
              lost: { increment: lost },
              revenue: { increment: b.revenue },
              wages: { increment: w },
            },
          });
        else
          await tx.staffShift.create({
            data: {
              businessId: biz.id,
              ownerId: biz.ownerId,
              staffId: b.staffId,
              day: room.day,
              fromMinute: from,
              toMinute: to,
              served: b.served,
              wrong: b.wrong,
              lost,
              revenue: b.revenue,
              wages: w,
            },
          });
      }
      if (quit) await tx.employee.deleteMany({ where: { id: { in: employees.map((e) => e.id) } } });
    });
    if (quit)
      this.notify?.(biz.ownerId, {
        kind: "warn",
        text: `😤 ${names} nghỉ làm vì không có tiền trả lương`,
      });
    else if (mode === "live" && r.served > 0)
      this.notify?.(biz.ownerId, {
        kind: "info",
        text: `👩‍🍳 ${names} vừa bán ${r.served} món thay bạn`,
      });
    return r;
  }
}
