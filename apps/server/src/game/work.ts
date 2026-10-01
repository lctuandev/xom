import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { content } from "@xom/content";
import type {
  CashierTaskView,
  DeliveryTaskView,
  DinerView,
  PayslipView,
  ShiftView,
  WorkAct,
} from "@xom/shared";
import {
  annoy,
  apologize,
  callBack,
  calm,
  clean,
  type Diner,
  decoyCodes,
  deliveryOrder,
  deliveryPay,
  deliverySurcharge,
  type Floor,
  type FloorConfig,
  type FloorEvent,
  floorTick,
  newFloor,
  paid,
  payingOf,
  pickPayment,
  plated,
  queueOf,
  type Role,
  ringTotal,
  sameItems,
  seededRandom,
  served,
  settleCash,
  tableStates,
  waiterCanReach,
  XP,
} from "@xom/sim";
import { LedgerService, playerWallet, SYSTEM } from "../economy/ledger.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { addToReport } from "./report.js";
import { GameError, type RoomRuntime } from "./room.js";

// Vào làm (docs/USECASES.md nhóm W): ca làm ở quán cơm (đứng quầy / thu ngân / bưng bê) và bưu cục (giao hàng).
// Mọi việc do server sinh và chấm; tiền = lương cứng giờ có làm + tiền từng việc, đứng không thì không có tiền.

const R = () => content.data.restaurant;
const D = () => content.data.delivery;
/** Hệ số thời gian của xóm: đồng hồ tăng tốc thì khách đi lại, ăn uống cũng nhanh theo. */
const SCALE = Number(process.env.GAME_TICK_MS ?? 1000) / 1000;

interface DeliveryState extends DeliveryTaskView {
  absent: boolean;
  /** Được gọi lại sau phút game này (khi hẹn giao lại). */
  laterUntil: number;
  /** Tiền mặt khách đưa cho đơn này (để kiểm tiền nộp). */
  cash: number;
  /** Phụ phí mưa/bão tính lúc giao xong (UC-B4) — người giao được hưởng. */
  surcharge: number;
}

/** Phiếu tính tiền của một khách (các dòng trên máy + tổng đúng). */
function ticketOf(d: Diner) {
  const r = R();
  const dish = r.dishes.find((x) => x.id === d.order.dishId);
  const mods = d.order.modIds.map((id) => r.mods.find((m) => m.id === id)?.say).filter(Boolean);
  return [
    [dish?.name, ...mods].join(", "),
    ...d.order.drinkIds.map((id) => r.drinks.find((x) => x.id === id)?.name ?? id),
  ];
}

export interface Shift {
  playerId: string;
  jobId: string;
  role: string;
  placeId: string;
  carry: number;
  lastDoneMinute: number;
  basePaidHour: number;
  stats: {
    done: number;
    mistakes: number;
    walked: number;
    base: number;
    piece: number;
    tips: number;
  };
  trays: Record<string, number>;
  refilling: Record<string, number>;
  /** Tiền trong ngăn kéo phải có (theo đúng giá) và tiền thực có (theo thao tác của thu ngân). */
  drawer: { expected: number; actual: number };
  /** Quán cơm: cả quán sống động (khách, dĩa, bàn, đồng nghiệp) — UC-W8. */
  floor: Floor | null;
  deliveries: DeliveryState[];
  cashHeld: number;
  fast: boolean;
}

export interface WorkOutcome {
  ok: boolean;
  line: string;
  pay: number;
  payslip?: PayslipView;
}

export interface WorkEmitter {
  shift(playerId: string, view: ShiftView | null): void;
  payslip(playerId: string, slip: PayslipView): void;
  say(roomId: string, who: string, text: string): void;
}

const strikesOf = (s: Shift) => s.stats.mistakes + Math.floor(s.stats.walked / 2);
const NAMES = () =>
  content.data.npcs.filter((n) => n.id !== "reviewer" && n.id !== "vip").map((n) => n.name);

function floorCfg(s: Shift): FloorConfig {
  return {
    r: R(),
    scale: SCALE,
    layout: R().layout,
    role: s.role as Role,
    names: NAMES(),
    newId: randomUUID,
  };
}

function dinerView(d: Diner): DinerView {
  return {
    id: d.id,
    name: d.name,
    look: d.look,
    stage: d.stage,
    since: d.since,
    table: d.table,
    say: d.say,
    incident: d.incident,
    incidentAt: d.incidentAt,
    complaining: d.complained && !d.apologized,
    stars: d.review?.stars ?? null,
  };
}

@Injectable()
export class WorkService {
  private emit?: WorkEmitter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  setEmitter(e: WorkEmitter) {
    this.emit = e;
  }

  view(room: RoomRuntime, playerId: string): ShiftView | null {
    const s = room.shifts.get(playerId);
    if (!s) return null;
    const job = content.job(s.jobId);
    const f = s.floor;
    const now = Date.now();
    return {
      jobId: s.jobId,
      role: s.role,
      placeId: s.placeId,
      stats: {
        done: s.stats.done,
        mistakes: s.stats.mistakes,
        walked: s.stats.walked,
        strikes: strikesOf(s),
        maxStrikes: job.maxStrikes,
        earned: s.stats.base + s.stats.piece + s.stats.tips,
        reviews: f?.stats.reviews ?? 0,
        stars: f?.stats.stars ?? 0,
        dashed: f?.stats.dashed ?? 0,
      },
      plates: f
        ? queueOf(f).map((d) => ({
            id: d.id,
            customer: d.name,
            text: d.order.text,
            items: d.order.items,
            createdAt: d.waitFrom,
            expiresAt: d.waitFrom + d.patienceMs,
          }))
        : [],
      trays: s.trays,
      refilling: s.refilling,
      cashier: f
        ? payingOf(f).map(
            (d): CashierTaskView => ({
              id: d.id,
              customer: d.name,
              ticket: ticketOf(d),
              pay: d.pay,
              createdAt: d.waitFrom,
              expiresAt: d.waitFrom + d.patienceMs,
            }),
          )
        : [],
      serve: f
        ? f.pass
            .filter((p) => p.npcTakenAt === null)
            .map((p) => {
              const d = f.diners.find((x) => x.id === p.dinerId);
              return {
                id: p.id,
                customer: d?.name ?? "Khách",
                table: p.table,
                dish: p.dish,
                createdAt: p.readyAt,
                expiresAt: d && d.stage === "seated" ? d.waitFrom + d.patienceMs : now + 60_000,
              };
            })
        : [],
      tables: f ? tableStates(f, floorCfg(s)) : [],
      deliveries: s.deliveries.map(
        ({ absent: _a, laterUntil: _l, cash: _c, surcharge: _s, ...v }) => v,
      ),
      cashHeld: s.cashHeld,
      fast: s.fast,
      diners: f ? f.diners.map(dinerView) : [],
      pass: f
        ? f.pass.map((p) => ({
            id: p.id,
            table: p.table,
            dish: p.dish,
            readyAt: p.readyAt,
            npc: p.npcTakenAt !== null,
          }))
        : [],
      holding: f ? f.holding : [],
      now,
      scale: SCALE,
    };
  }

  private push(room: RoomRuntime, s: Shift) {
    this.emit?.shift(s.playerId, this.view(room, s.playerId));
  }

  /** Vào ca (UC-W1): chỉ khi đang ở nơi làm, quầy riêng đóng, chưa có ca khác. */
  async start(room: RoomRuntime, playerId: string, jobId: string, role: string) {
    const job = content.jobById.get(jobId);
    const r = job?.roles.find((x) => x.id === role);
    const place = job ? content.placeForJob(job.id) : undefined;
    if (!job || !r || !place) throw new GameError("invalid_payload", "Không có việc này");
    if (room.shifts.has(playerId))
      throw new GameError("invalid_state", "Đang trong ca — ra ca rồi mới đổi việc");
    const openBiz = await this.prisma.business.findFirst({
      where: { ownerId: playerId, status: "OPEN" },
    });
    if (openBiz)
      throw new GameError("invalid_state", "Đang mở quầy — đóng quầy rồi mới đi làm thuê được");
    const trays: Record<string, number> = {};
    for (const f of R().foods) trays[f.id] = R().trayPortions;
    const shift: Shift = {
      playerId,
      jobId,
      role,
      placeId: place.id,
      carry: 0.6, // khách đầu tiên tới sớm
      lastDoneMinute: -1,
      basePaidHour: -1,
      stats: { done: 0, mistakes: 0, walked: 0, base: 0, piece: 0, tips: 0 },
      trays,
      refilling: {},
      drawer: { expected: 0, actual: 0 },
      floor: jobId === "phu_quan_com" ? newFloor(R().layout, Date.now()) : null,
      deliveries: [],
      cashHeld: 0,
      fast: false,
    };
    room.shifts.set(playerId, shift);
    await this.prisma.player.update({ where: { id: playerId }, data: { jobId } });
    await this.prisma.gameEvent.create({
      data: { playerId, type: "job_start", payload: { jobId, role } },
    });
    await this.floorStep(room, shift);
    this.push(room, shift);
    this.emit?.say(room.id, place.id, place.keeper.greeting);
  }

  /** Ra ca / bị cho nghỉ / hết ngày / bỏ đi: trừ tiền lệch két & COD, phát phiếu lương. */
  async end(
    room: RoomRuntime,
    playerId: string,
    reason: PayslipView["reason"],
  ): Promise<PayslipView | null> {
    const s = room.shifts.get(playerId);
    if (!s) return null;
    // Đơn đã giao mà chưa nộp: tự nộp chuyến (tiền COD chưa từng vào ví, thiếu thì trừ vào tiền chuyến).
    if (s.deliveries.some((d) => d.stage === "delivered")) {
      await this.dispatch(room, s, { kind: "settle" }).catch(() => undefined);
    }
    room.shifts.delete(playerId);
    // Thu ngân: kiểm két cuối ca, thiếu thì trừ lương.
    const shortage = Math.max(0, s.drawer.expected - s.drawer.actual);
    let deductions = 0;
    await this.prisma.$transaction(async (tx) => {
      await tx.player.update({ where: { id: playerId }, data: { jobId: null } });
      if (shortage > 0) {
        const bal = await this.ledger.balance(tx, playerWallet(playerId));
        deductions = Math.min(shortage, bal);
        if (deductions > 0) {
          await this.ledger.transfer(
            tx,
            playerWallet(playerId),
            SYSTEM.employer,
            deductions,
            "shortage",
            s.jobId,
          );
          await addToReport(tx, playerId, room.day, { wages: -deductions });
        }
      }
    });
    const slip: PayslipView = {
      jobId: s.jobId,
      role: s.role,
      done: s.stats.done,
      mistakes: s.stats.mistakes,
      walked: s.stats.walked,
      base: s.stats.base,
      piece: s.stats.piece,
      deductions,
      total: s.stats.base + s.stats.piece + s.stats.tips - deductions,
      tips: s.stats.tips,
      stars: s.floor?.stats.reviews ? s.floor.stats.stars / s.floor.stats.reviews : null,
      reason,
    };
    this.emit?.shift(playerId, null);
    this.emit?.payslip(playerId, slip);
    return slip;
  }

  // ───────────────────────── Nhịp của ca ─────────────────────────

  async tick(room: RoomRuntime) {
    const now = Date.now();
    for (const s of [...room.shifts.values()]) {
      let changed = await this.floorStep(room, s);
      for (const [food, at] of Object.entries(s.refilling)) {
        if (at > now) continue;
        s.trays[food] = R().trayPortions;
        delete s.refilling[food];
        changed = true;
        this.emit?.say(
          room.id,
          s.placeId,
          `Khay ${content.data.restaurant.foods.find((f) => f.id === food)?.name.toLowerCase()} mới ra nè!`,
        );
      }
      // Lương cứng: giờ nào có làm ít nhất một việc.
      const hour = Math.floor(room.minute / 60);
      if (
        room.minute % 60 === 0 &&
        s.lastDoneMinute >= room.minute - 60 &&
        s.basePaidHour !== hour
      ) {
        s.basePaidHour = hour;
        await this.pay(room, s, content.job(s.jobId).wagePerHour, "wage");
        s.stats.base += content.job(s.jobId).wagePerHour;
        changed = true;
      }
      if (strikesOf(s) >= content.job(s.jobId).maxStrikes) {
        const place = content.place(s.placeId);
        this.emit?.say(
          room.id,
          place.id,
          `${place.keeper.name}: Thôi hôm nay con về nghỉ đi, mai làm lại.`,
        );
        await this.end(room, s.playerId, "fired");
        continue;
      }
      if (changed) this.push(room, s);
    }
  }

  /** Một nhịp của quán sống động: khách tới, đi lại, ăn, trả tiền, gây chuyện; đồng nghiệp làm phần của họ. */
  private async floorStep(room: RoomRuntime, s: Shift): Promise<boolean> {
    if (!s.floor) return false;
    const rand = seededRandom("floor", s.playerId, room.day, room.minute, Date.now());
    // Trời mưa người ta chui vào quán có mái nhiều hơn (UC-B4).
    const cfg = { ...floorCfg(s), crowd: room.sky.indoor };
    const events = floorTick(s.floor, cfg, { now: Date.now(), minute: room.minute, rand });
    await this.floorEvents(room, s, events);
    return true;
  }

  private async floorEvents(room: RoomRuntime, s: Shift, events: FloorEvent[]) {
    for (const e of events) {
      if (e.kind === "walked") s.stats.walked++;
      else if (e.kind === "dashed") s.stats.walked++;
      else if (e.kind === "review" && e.tip > 0) {
        await this.pay(room, s, e.tip, "tip");
        this.emit?.say(room.id, s.placeId, `Khách boa ${e.tip / 1000}k — chia cho con nè!`);
      }
    }
  }

  private diner(s: Shift, id: string): Diner {
    const d = s.floor?.diners.find((x) => x.id === id);
    if (!d || d.stage === "gone") throw new GameError("invalid_state", "Khách này đi rồi");
    return d;
  }

  // ───────────────────────── Thao tác ─────────────────────────

  async act(room: RoomRuntime, playerId: string, a: WorkAct): Promise<WorkOutcome> {
    const s = room.shifts.get(playerId);
    if (!s) throw new GameError("invalid_state", "Chưa vào ca");
    const out = await this.dispatch(room, s, a);
    if (out.ok && out.pay > 0) {
      s.stats.done++;
      s.lastDoneMinute = room.minute;
      await this.prisma.player.update({
        where: { id: playerId },
        data: { xp: { increment: a.kind === "settle" ? XP.delivery : XP.jobTask } },
      });
    }
    if (room.shifts.has(playerId)) this.push(room, s);
    return out;
  }

  private async dispatch(room: RoomRuntime, s: Shift, a: WorkAct): Promise<WorkOutcome> {
    const role = content.job(s.jobId).roles.find((r) => r.id === s.role);
    const piece = role?.piecePay ?? 0;
    switch (a.kind) {
      case "plate": {
        this.need(s, "dung_quay");
        const f = this.floor(s);
        const d = queueOf(f)[0];
        if (!d || d.id !== a.taskId) throw new GameError("invalid_state", "Khách này đi rồi");
        // Mỗi lần múc lấy một phần trong khay (múc sai cũng tốn).
        const use = new Map<string, number>();
        for (const x of a.items) use.set(x, (use.get(x) ?? 0) + 1);
        for (const [x, n] of use) {
          if ((s.trays[x] ?? 0) < n)
            throw new GameError("invalid_state", "Khay hết món — báo bếp đã");
        }
        for (const [x, n] of use) s.trays[x] = (s.trays[x] ?? 0) - n;
        if (!sameItems(a.items, d.order.items)) {
          s.stats.mistakes++;
          annoy(d, 0.1, "múc sai");
          return { ok: false, line: "Ủa, con đâu có kêu vậy! Múc lại giùm con.", pay: 0 };
        }
        plated(f, d, Date.now(), floorCfg(s));
        await this.pay(room, s, piece, "piece");
        return { ok: true, line: `Cảm ơn con! Con ngồi bàn ${d.table} nha.`, pay: piece };
      }
      case "refill": {
        this.need(s, "dung_quay");
        if (!(a.foodId in s.trays)) throw new GameError("invalid_payload", "Không có khay này");
        if (s.refilling[a.foodId]) return { ok: true, line: "Bếp đang làm, đợi xíu!", pay: 0 };
        s.refilling[a.foodId] = Date.now() + R().refillSec * 1000;
        return { ok: true, line: "Có liền, đợi bếp xíu nha con!", pay: 0 };
      }
      case "ring": {
        this.need(s, "thu_ngan");
        const f = this.floor(s);
        const d = payingOf(f).find((x) => x.id === a.taskId);
        if (!d) throw new GameError("invalid_state", "Khách này đi rồi");
        const total = d.order.total;
        let rung: number;
        try {
          rung = ringTotal(R(), a.lines);
        } catch {
          throw new GameError("invalid_payload", "Máy tính tiền không có món này");
        }
        if (rung > total) {
          // Khách thấy tính dư → phàn nàn, bấm lại.
          s.stats.mistakes++;
          annoy(d, 0.1, "tính dư tiền");
          return { ok: false, line: "Tính dư rồi em ơi, coi lại giùm!", pay: 0 };
        }
        // Tính thiếu thì khách lặng lẽ trả theo giá báo — quán mất tiền (lộ ra khi kiểm két).
        s.drawer.expected += total;
        let line = "Cảm ơn em!";
        if (d.pay.kind === "transfer") {
          s.drawer.actual += rung;
        } else {
          const { received, outcome } = settleCash(
            rung,
            d.pay.bill,
            a.change ?? 0,
            seededRandom("ring", d.id),
          );
          s.drawer.actual += received;
          if (outcome === "short") {
            s.stats.mistakes++;
            annoy(d, 0.2, "thối thiếu");
            line = "Thối thiếu rồi em, đưa đủ đây!";
          } else if (outcome === "over_returned") line = "Em thối dư nè, trả lại nè.";
        }
        const review = paid(f, floorCfg(s), d, Date.now(), seededRandom("review", d.id));
        await this.floorEvents(room, s, [review]);
        await this.pay(room, s, piece, "piece");
        return { ok: true, line, pay: piece };
      }
      case "grab": {
        this.need(s, "bung_be");
        const f = this.floor(s);
        const now = Date.now();
        const p = f.pass.find((x) => x.id === a.taskId && x.npcTakenAt === null);
        if (!p || p.readyAt > now)
          throw new GameError("invalid_state", "Dĩa này chưa ra hoặc bưng rồi");
        if (f.holding.includes(p.id)) return { ok: true, line: "Đang cầm rồi mà.", pay: 0 };
        if (f.holding.length >= 2)
          return { ok: false, line: "Hai tay cầm hai dĩa rồi, bưng đi đã!", pay: 0 };
        if (!waiterCanReach(f, floorCfg(s), R().layout.pass, now))
          throw new GameError("invalid_state", "Đi tới cửa bếp đã");
        f.holding.push(p.id);
        f.waiter = { at: R().layout.pass, t: now };
        return { ok: true, line: `Dĩa bàn ${p.table} nè!`, pay: 0 };
      }
      case "serve": {
        this.need(s, "bung_be");
        const f = this.floor(s);
        const now = Date.now();
        const p = f.pass.find((x) => x.id === a.taskId);
        if (!p || !f.holding.includes(p.id))
          throw new GameError("invalid_state", "Chưa cầm dĩa này");
        const at = R().layout.tables[a.table - 1];
        if (!at) throw new GameError("invalid_payload", "Không có bàn này");
        if (!waiterCanReach(f, floorCfg(s), at, now))
          throw new GameError("invalid_state", "Chưa tới bàn");
        f.waiter = { at, t: now };
        if (a.table !== p.table) {
          s.stats.mistakes++;
          const wrong = f.diners.find(
            (d) => d.table === a.table && (d.stage === "seated" || d.stage === "eating"),
          );
          if (wrong) annoy(wrong, 0.05, "bưng nhầm bàn");
          return { ok: false, line: `Bàn ${a.table}: ủa đâu phải của tụi con!`, pay: 0 };
        }
        served(f, p, now, room.minute);
        await this.pay(room, s, piece, "piece");
        return { ok: true, line: "Cảm ơn nha!", pay: piece };
      }
      case "clean": {
        this.need(s, "bung_be");
        const f = this.floor(s);
        const now = Date.now();
        const at = R().layout.tables[a.table - 1];
        if (!at) throw new GameError("invalid_payload", "Không có bàn này");
        if (!waiterCanReach(f, floorCfg(s), at, now))
          throw new GameError("invalid_state", "Chưa tới bàn");
        f.waiter = { at, t: now };
        if (!clean(f, a.table)) return { ok: false, line: "Bàn này sạch rồi mà.", pay: 0 };
        const pay = Math.round(piece / 2);
        await this.pay(room, s, pay, "piece");
        return { ok: true, line: "Bàn sạch bong!", pay };
      }
      case "sorry": {
        const d = this.diner(s, a.taskId);
        if (!apologize(d, Date.now()))
          return { ok: false, line: "Khách đâu có than gì đâu.", pay: 0 };
        return { ok: true, line: "Dạ con xin lỗi, có liền!", pay: 0 };
      }
      case "calm": {
        const f = this.floor(s);
        const d = this.diner(s, a.taskId);
        const now = Date.now();
        // Bưng bê phải đi tới tận bàn; vai khác đứng tại chỗ nói vọng ra.
        if (s.role === "bung_be") {
          const at = R().layout.tables[d.table - 1];
          if (at && !waiterCanReach(f, floorCfg(s), at, now))
            throw new GameError("invalid_state", "Chưa tới bàn");
          if (at) f.waiter = { at, t: now };
        }
        if (!calm(d, now)) return { ok: false, line: "Yên rồi mà.", pay: 0 };
        s.lastDoneMinute = room.minute;
        return { ok: true, line: "Dạ thôi mà anh chị, bỏ qua giùm quán nha!", pay: 0 };
      }
      case "callback": {
        const d = this.diner(s, a.taskId);
        if (!callBack(floorCfg(s), d, Date.now()))
          return { ok: false, line: "Khách đi mất rồi…", pay: 0 };
        s.lastDoneMinute = room.minute;
        return { ok: true, line: "Anh ơi, chưa tính tiền nè!", pay: 0 };
      }
      case "take": {
        this.need(s, "giao_hang");
        const active = s.deliveries.filter(
          (d) => d.stage !== "delivered" && d.stage !== "returning",
        );
        const room_ = D().maxPerTrip - active.length;
        if (room_ <= 0) return { ok: false, line: "Chở nhiêu đó được rồi, đi giao đi em!", pay: 0 };
        for (let k = 0; k < room_; k++) {
          const rand = seededRandom(
            "deliv",
            s.playerId,
            room.day,
            room.minute,
            s.deliveries.length,
            k,
          );
          const o = deliveryOrder(D(), rand);
          const shelf = [o.code, ...decoyCodes(o.code, D().shelfSize - 1, rand)].sort(
            () => rand() - 0.5,
          );
          s.deliveries.push({
            id: randomUUID(),
            code: o.code,
            recipient: o.recipient,
            addressId: o.addressId,
            item: o.item,
            fragile: o.fragile,
            cod: o.cod,
            stage: "shelf",
            shelf,
            door: null,
            absent: o.absent,
            laterUntil: 0,
            cash: 0,
            surcharge: 0,
          });
        }
        return { ok: true, line: "Phiếu giao nè, soạn đúng mã trên kệ nha!", pay: 0 };
      }
      case "pick": {
        const d = this.delivery(s, a.taskId, ["shelf"]);
        if (a.code !== d.code) {
          s.stats.mistakes++;
          return {
            ok: false,
            line: `Gói ${a.code} đâu phải của đơn này, đọc kỹ mã giùm anh!`,
            pay: 0,
          };
        }
        d.stage = "picked";
        d.shelf = [];
        return { ok: true, line: "Đúng gói rồi, quét mã xong. Lên xe!", pay: 0 };
      }
      case "ride": {
        this.need(s, "giao_hang");
        s.fast = a.fast;
        return {
          ok: true,
          line: a.fast ? "Chạy nhanh — cẩn thận hàng dễ vỡ!" : "Chạy chậm, chắc ăn.",
          pay: 0,
        };
      }
      case "call": {
        const d = this.delivery(s, a.taskId, ["picked", "later"]);
        if (d.stage === "later" && room.minute < d.laterUntil) {
          return { ok: false, line: "Khách hẹn lát nữa mới về, quay lại sau nha.", pay: 0 };
        }
        const addr = D().addresses.find((x) => x.id === d.addressId);
        if (a.addressId !== d.addressId) {
          return {
            ok: false,
            line: `Không phải nhà tôi! ${addr?.label ?? "Nhà đó"} ở chỗ khác kìa.`,
            pay: 0,
          };
        }
        const rand = seededRandom("door", d.id, room.day, room.minute);
        // Đường trơn (mưa, bão) chạy nhanh càng dễ móp hàng.
        if (d.fragile && s.fast && rand() < D().fragileDamageFast * room.sky.delivery.damage) {
          d.stage = "refused";
          return { ok: false, line: "Hàng móp hết rồi, tôi không nhận đâu!", pay: 0 };
        }
        if (d.absent && d.stage !== "later") {
          d.stage = "absent";
          return { ok: false, line: "Gọi mấy cuộc mà không ai bắt máy…", pay: 0 };
        }
        const roll = rand();
        const relation = roll < 0.7 ? "self" : roll < 0.95 ? "relative" : "stranger";
        const rel = D().relatives[Math.floor(rand() * D().relatives.length)] ?? "em";
        const name =
          relation === "self"
            ? d.recipient
            : relation === "relative"
              ? `${rel === "vợ" || rel === "chồng" ? "Người" : "Bé"} ${rel} của ${d.recipient}`
              : "Người ở trọ tầng dưới";
        d.stage = "at_door";
        d.door = { name, relation, pay: d.cod > 0 ? pickPayment(d.cod, 0.3, rand) : null };
        const line =
          relation === "stranger"
            ? "Ủa gói gì vậy? Tôi đâu có đặt…"
            : relation === "relative"
              ? `Để em nhận giùm ${d.recipient} cho.`
              : "Tới rồi hả em, đưa đây!";
        return { ok: true, line, pay: 0 };
      }
      case "handover": {
        const d = this.delivery(s, a.taskId, ["at_door"]);
        const door = d.door;
        if (!door) throw new GameError("invalid_state", "Chưa gọi khách");
        if (!a.accept) {
          if (door.relation === "stranger") {
            d.stage = "later";
            d.laterUntil = room.minute + 30;
            d.door = null;
            return { ok: true, line: "Dạ để em liên lạc người nhận rồi quay lại.", pay: 0 };
          }
          return { ok: false, line: "Ơ, tôi nhận được mà!", pay: 0 };
        }
        if (door.relation === "stranger") {
          s.stats.mistakes++;
          d.stage = "returning";
          d.door = null;
          return { ok: false, line: "Giao nhầm người rồi! Gói này coi như thất lạc.", pay: 0 };
        }
        if (door.pay?.kind === "cash") {
          const res = settleCash(d.cod, door.pay.bill, a.change ?? 0, seededRandom("cod", d.id));
          d.cash = d.cod;
          s.cashHeld += res.received;
          if (res.outcome === "short") s.stats.mistakes++;
        }
        d.stage = "delivered";
        d.door = null;
        d.surcharge = this.surcharge(room, s, d);
        return {
          ok: true,
          line: d.surcharge
            ? `Mưa gió vầy mà em vẫn giao, gửi thêm ${d.surcharge.toLocaleString("vi-VN")}đ phụ phí nè!`
            : "Ký rồi nè, cảm ơn em nha!",
          pay: 0,
        };
      }
      case "absent": {
        const d = this.delivery(s, a.taskId, ["absent"]);
        if (a.choice === "neighbor") {
          if (d.cod > 0)
            return { ok: false, line: "Đơn thu tiền hộ không gửi hàng xóm được.", pay: 0 };
          d.stage = "delivered";
          d.surcharge = this.surcharge(room, s, d);
          return { ok: true, line: "Chị hàng xóm nhận giùm rồi.", pay: 0 };
        }
        if (a.choice === "later") {
          d.stage = "later";
          d.laterUntil = room.minute + 60;
          d.absent = false;
          return { ok: true, line: "Hẹn khách một tiếng nữa giao lại.", pay: 0 };
        }
        d.stage = "returning";
        return { ok: true, line: "Mang hàng về hoàn bưu cục.", pay: 0 };
      }
      case "settle": {
        this.need(s, "giao_hang");
        const post = content.place(s.placeId).position;
        let pay = 0;
        let cashDue = 0;
        for (const d of s.deliveries) {
          if (d.stage !== "delivered") continue;
          const addr = D().addresses.find((x) => x.id === d.addressId);
          const meters = addr ? Math.hypot(addr.position.x - post.x, addr.position.z - post.z) : 0;
          pay += deliveryPay(piece, meters) + d.surcharge;
          cashDue += d.cash;
        }
        const finished = s.deliveries.filter(
          (d) => d.stage === "delivered" || d.stage === "returning" || d.stage === "refused",
        );
        if (finished.length === 0)
          return { ok: false, line: "Chưa có đơn nào xong mà nộp gì em.", pay: 0 };
        // Nộp tiền COD: thiếu thì trừ vào tiền chuyến.
        const shortage = Math.max(0, cashDue - s.cashHeld);
        const delivered = finished.filter((d) => d.stage === "delivered").length;
        s.deliveries = s.deliveries.filter((d) => !finished.includes(d));
        s.cashHeld = 0;
        const net = Math.max(0, pay - shortage);
        if (net > 0) await this.pay(room, s, net, "piece");
        s.stats.done += Math.max(0, delivered - 1); // act() cộng thêm 1 khi pay > 0
        const line =
          shortage > 0
            ? `Thiếu ${shortage.toLocaleString("vi-VN")}đ tiền thu hộ, anh trừ vào tiền chuyến nha.`
            : delivered > 0
              ? `Giao ${delivered} đơn, tiền chuyến ${net.toLocaleString("vi-VN")}đ. Giỏi!`
              : "Hàng hoàn về rồi, chuyến này không có tiền.";
        return { ok: net > 0, line, pay: net };
      }
    }
  }

  /** Phụ phí mưa/bão của một đơn theo trời lúc giao (khách trả thêm, bưu cục chuyển cho người giao). */
  private surcharge(room: RoomRuntime, s: Shift, d: DeliveryState): number {
    const piece = content.job(s.jobId).roles.find((r) => r.id === s.role)?.piecePay ?? 0;
    const post = content.place(s.placeId).position;
    const addr = D().addresses.find((x) => x.id === d.addressId);
    const meters = addr ? Math.hypot(addr.position.x - post.x, addr.position.z - post.z) : 0;
    return deliverySurcharge(room.sky, deliveryPay(piece, meters));
  }

  private floor(s: Shift): Floor {
    if (!s.floor) throw new GameError("invalid_state", "Việc này chỉ có ở quán cơm");
    return s.floor;
  }

  private need(s: Shift, role: string) {
    if (s.role !== role)
      throw new GameError("invalid_state", "Việc này không phải của vai bạn đang làm");
  }

  private delivery(s: Shift, id: string, stages: DeliveryTaskView["stage"][]): DeliveryState {
    this.need(s, "giao_hang");
    const d = s.deliveries.find((x) => x.id === id);
    if (!d) throw new GameError("invalid_state", "Không có đơn này");
    if (!stages.includes(d.stage)) throw new GameError("invalid_state", "Đơn này đang ở bước khác");
    return d;
  }

  /** Trả tiền cho người làm (lương cứng / tiền việc) qua sổ cái. */
  private async pay(room: RoomRuntime, s: Shift, amount: number, reason: "wage" | "piece" | "tip") {
    if (amount <= 0) return;
    await this.prisma.$transaction(async (tx) => {
      await this.ledger.transfer(
        tx,
        SYSTEM.employer,
        playerWallet(s.playerId),
        amount,
        reason,
        s.jobId,
      );
      await addToReport(
        tx,
        s.playerId,
        room.day,
        reason === "tip" ? { tips: amount } : { wages: amount },
      );
    });
    if (reason === "piece") s.stats.piece += amount;
    if (reason === "tip") s.stats.tips += amount;
  }
}
