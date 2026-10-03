import { Injectable } from "@nestjs/common";
import { content } from "@xom/content";
import type { LandlordEvent, NotifyEvent, PayMethod, RentView, ShopSetupView } from "@xom/shared";
import {
  absMinute,
  needsFoodCert,
  nextShopStep,
  normalizeShopName,
  type RentState,
  rentOwed,
  rentPromiseOptions,
  rentShouldRemind,
  rentVerdict,
  shopEstimate,
  shopNameError,
  trustAfter,
} from "@xom/sim";
import { bankWallet, LedgerService, playerWallet, SYSTEM } from "../economy/ledger.service.js";
import type { Business, Lease } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { BusinessRepo } from "./business-repo.js";
import { PaymentService } from "./payment.js";
import { addToReport } from "./report.js";
import { GameError, type RoomRuntime } from "./room.js";
import { StoryService } from "./story.js";

/** Cọc thuê nhà nằm trong ví giữ hộ, trả nhà thì hoàn. */
export const depositWallet = (leaseId: string) => `escrow:lease:${leaseId}`;
const REACH = 6;
const DAY = 1440;
const at = (abs: number) => ({ day: Math.floor(abs / DAY), minute: abs % DAY });
const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;
/** "Thứ Tư, ngày 7" — hẹn theo ngày, không theo giờ. */
export const rentDayLabel = (day: number) => `${content.weekday(day).name}, ngày ${day}`;

/**
 * 🏪 Mở tiệm trong nhà mặt tiền theo quy trình đời thật (docs/USECASES.md UC-F12):
 * 1. Ký hợp đồng thuê nhà — đặt cọc (hoàn khi trả nhà) và phải còn vốn dự phòng; tiền nhà tính mỗi ngày dù mở hay đóng.
 * 2. Đăng ký hộ kinh doanh ở UBND phường — đặt tên quán (không trùng trong xóm), lệ phí, chờ xét vài giờ.
 * 3. Quán ăn uống: tập huấn ATTP rồi hẹn đoàn kiểm tra; đoàn tới thì chủ phải có mặt ở tiệm, vắng thì hẹn lại.
 * 4. Làm biển hiệu tên quán → mới được mở tiệm.
 * Tiền nhà (UC-F13): chủ nhà tới đòi — trả ngay / hẹn ngày (phí trễ) / để sau; quá hạn trừ cọc + tính lần trễ; trễ nhiều lần
 * hoặc hết cọc thì dẹp tiệm.
 */
@Injectable()
export class ShopService {
  private notify?: (playerId: string, n: NotifyEvent) => void;
  private onWorld?: (room: RoomRuntime) => void;
  private notifyRoom?: (roomId: string, n: NotifyEvent) => void;
  private landlord?: (playerId: string, e: LandlordEvent) => void;
  private pushMe?: (room: RoomRuntime, playerId: string) => Promise<void>;
  /** Đã báo (hồ sơ xong / đoàn tới) — tránh báo lại mỗi phút. */
  private readonly told = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessRepo,
    private readonly ledger: LedgerService,
    private readonly payment: PaymentService,
    private readonly story: StoryService,
  ) {}

  setNotifier(fns: {
    notify: (playerId: string, n: NotifyEvent) => void;
    onWorld: (room: RoomRuntime) => void;
    notifyRoom: (roomId: string, n: NotifyEvent) => void;
    landlord: (playerId: string, e: LandlordEvent) => void;
    pushMe: (room: RoomRuntime, playerId: string) => Promise<void>;
  }) {
    this.pushMe = fns.pushMe;
    this.notify = fns.notify;
    this.onWorld = fns.onWorld;
    this.notifyRoom = fns.notifyRoom;
    this.landlord = fns.landlord;
  }

  private now(room: RoomRuntime) {
    return absMinute(room.day, room.minute);
  }

  private activeLease(ownerId: string) {
    return this.prisma.lease.findFirst({ where: { ownerId, status: "ACTIVE" } });
  }

  private async business(playerId: string) {
    const biz = await this.businesses.of(playerId);
    if (!biz)
      throw new GameError(
        "invalid_state",
        "Mua đồ nghề ở vựa xe Ông Sáu trước đã — tiệm cũng cần quầy, đồ nghề",
      );
    return biz;
  }

  async view(room: RoomRuntime, playerId: string): Promise<ShopSetupView> {
    const [biz, lease, others] = await Promise.all([
      this.businesses.of(playerId),
      this.activeLease(playerId),
      this.prisma.lease.findMany({
        where: { roomId: room.id, status: "ACTIVE", ownerId: { not: playerId } },
      }),
    ]);
    const owners = await this.prisma.player.findMany({
      where: { id: { in: others.map((l) => l.ownerId) } },
      select: { id: true, displayName: true },
    });
    const nameOf = new Map(owners.map((o) => [o.id, o.displayName]));
    const now = this.now(room);
    const productId = biz?.productId ?? content.data.products[0]?.id ?? "banh_mi";
    const needCert = needsFoodCert(content, productId);
    const licensed = !!biz?.licenseAt && biz.licenseAt <= now;
    const win = content.data.shopSetup.foodCert.inspectWindow;
    return {
      lease: lease
        ? { lotId: lease.lotId, deposit: lease.deposit, signedDay: lease.signedDay }
        : null,
      rent: lease ? await this.rentView(room, lease) : null,
      shopName: biz?.shopName ?? null,
      license: !biz?.licenseAt ? "none" : licensed ? "done" : "pending",
      licenseReady: biz?.licenseAt ? at(biz.licenseAt) : null,
      needCert,
      trained: !!biz?.trained,
      inspect: biz?.inspectAt
        ? {
            ...at(biz.inspectAt),
            until: (biz.inspectAt + win) % DAY,
            arrived: now >= biz.inspectAt,
          }
        : null,
      certified: !!biz?.certified,
      signed: !!biz?.signed,
      step: nextShopStep({
        leased: !!lease,
        licensed,
        needCert,
        certified: !!biz?.certified,
        signed: !!biz?.signed,
      }),
      houses: content.data.lots
        .filter((l) => l.kind === "house")
        .map((l) => {
          const other = others.find((o) => o.lotId === l.id);
          return {
            lotId: l.id,
            rentPerDay: l.rentPerDay,
            estimate: shopEstimate(content, l.id, productId),
            leasedBy: other ? (nameOf.get(other.ownerId) ?? "Hàng xóm") : null,
          };
        }),
    };
  }

  /** 1. Ký hợp đồng thuê nhà: đặt cọc + kiểm vốn dự phòng; dọn đồ nghề vào nhà. */
  async lease(room: RoomRuntime, playerId: string, lotId: string) {
    const lot = content.findLot(lotId);
    if (!lot || lot.kind !== "house")
      throw new GameError("invalid_payload", "Không phải nhà cho thuê");
    const biz = await this.business(playerId);
    if (await this.activeLease(playerId))
      throw new GameError("invalid_state", "Đang thuê một căn rồi — trả nhà cũ trước");
    const taken = await this.prisma.lease.findFirst({
      where: { roomId: room.id, lotId, status: "ACTIVE" },
    });
    if (taken) throw new GameError("invalid_state", "Căn này có người thuê rồi");
    if (biz.status === "OPEN")
      throw new GameError("invalid_state", "Đóng quầy rồi mới dọn sang nhà mới");
    const est = shopEstimate(content, lotId, biz.productId);
    const [cash, bank] = await Promise.all([
      this.ledger.balance(this.prisma, playerWallet(playerId)),
      this.ledger.balance(this.prisma, bankWallet(playerId)),
    ]);
    if (cash + bank < est.deposit + est.reserve)
      throw new GameError(
        "insufficient_funds",
        `Chủ nhà: "Cọc ${est.deposit.toLocaleString("vi-VN")}đ, mà phải còn dư ít nhất ${est.reserve.toLocaleString("vi-VN")}đ trả tiền nhà mấy ngày đầu nghen."`,
      );
    await this.prisma.$transaction(async (tx) => {
      const l = await tx.lease.create({
        data: {
          roomId: room.id,
          lotId,
          ownerId: playerId,
          deposit: est.deposit,
          signedDay: room.day,
          // Ngày ký không tính tiền nhà (có thể đã trả tiền chỗ xe đẩy hôm nay).
          paidDay: room.day,
        },
      });
      await this.payment.cashThenBank(
        tx,
        playerId,
        est.deposit,
        depositWallet(l.id),
        "lease_deposit",
        "Không đủ tiền đặt cọc",
      );
      await tx.business.update({ where: { id: biz.id }, data: { lotId } });
      await tx.gameEvent.create({
        data: { playerId, type: "shop_lease", payload: { lotId, deposit: est.deposit } },
      });
    });
    this.onWorld?.(room);
    return this.view(room, playerId);
  }

  /** Trả nhà: hoàn cọc (còn bao nhiêu), dọn đồ nghề ra. */
  async unlease(room: RoomRuntime, playerId: string) {
    const lease = await this.activeLease(playerId);
    if (!lease) throw new GameError("invalid_state", "Đang không thuê nhà nào");
    const biz = await this.business(playerId);
    if (biz.status === "OPEN" && biz.lotId === lease.lotId)
      throw new GameError("invalid_state", "Đóng tiệm rồi mới trả nhà");
    // Còn nợ tiền nhà thì chủ nhà trừ vào cọc trước, còn bao nhiêu mới hoàn.
    const owed = rentOwed({
      day: room.day,
      paidDay: lease.paidDay,
      rentPerDay: content.lot(lease.lotId).rentPerDay,
    }).amount;
    const due = owed + (owed > 0 ? lease.lateFee : 0);
    if (due > 0) {
      const left = await this.ledger.balance(this.prisma, depositWallet(lease.id));
      if (left < due)
        throw new GameError(
          "invalid_state",
          `Còn nợ tiền nhà ${vnd(due)} mà cọc chỉ còn ${vnd(left)} — trả tiền nhà trước rồi mới trả nhà`,
        );
      await this.prisma.$transaction(async (tx) => {
        await this.ledger.transfer(
          tx,
          depositWallet(lease.id),
          SYSTEM.landlord,
          due,
          "rent_from_deposit",
          lease.id,
        );
        await addToReport(tx, playerId, room.day, { rent: due });
      });
    }
    await this.end(room, lease, "ENDED");
    return this.view(room, playerId);
  }

  /** 2. Đăng ký hộ kinh doanh: đặt tên quán, nộp lệ phí, chờ xét. */
  async register(room: RoomRuntime, playerId: string, rawName: string) {
    if (!(await this.activeLease(playerId)))
      throw new GameError("invalid_state", "Cần hợp đồng thuê nhà để ghi địa chỉ kinh doanh");
    const biz = await this.business(playerId);
    if (biz.licenseAt) throw new GameError("invalid_state", "Hồ sơ hộ kinh doanh nộp rồi");
    const err = shopNameError(content, rawName);
    if (err) throw new GameError("invalid_payload", err);
    const name = normalizeShopName(rawName);
    const members = [...room.members.keys()];
    const dup = await this.prisma.business.findFirst({
      where: {
        ownerId: { in: members, not: playerId },
        shopName: { equals: name, mode: "insensitive" },
      },
    });
    if (dup)
      throw new GameError("invalid_state", "Trong xóm có quán trùng tên rồi — đặt tên khác nha");
    const lic = content.data.shopSetup.license;
    await this.prisma.$transaction(async (tx) => {
      await this.payment.cashThenBank(
        tx,
        playerId,
        lic.fee,
        SYSTEM.landlord,
        "license_fee",
        "Không đủ tiền lệ phí",
      );
      await tx.business.update({
        where: { id: biz.id },
        data: { shopName: name, licenseAt: this.now(room) + lic.minutes },
      });
      await addToReport(tx, playerId, room.day, { fees: lic.fee });
      await tx.gameEvent.create({ data: { playerId, type: "shop_register", payload: { name } } });
    });
    await this.story.note(playerId, "first_license", room.day, { name });
    return this.view(room, playerId);
  }

  /** 3a. Tập huấn kiến thức ATTP (quán ăn uống). */
  async train(room: RoomRuntime, playerId: string) {
    const biz = await this.business(playerId);
    this.requireLicensed(room, biz);
    if (!needsFoodCert(content, biz.productId))
      throw new GameError("invalid_state", "Nghề này không cần giấy ATTP");
    if (biz.trained) throw new GameError("invalid_state", "Tập huấn rồi");
    const fee = content.data.shopSetup.foodCert.trainingFee;
    await this.prisma.$transaction(async (tx) => {
      await this.payment.cashThenBank(
        tx,
        playerId,
        fee,
        SYSTEM.landlord,
        "food_training",
        "Không đủ tiền tập huấn",
      );
      await tx.business.update({ where: { id: biz.id }, data: { trained: true } });
      await addToReport(tx, playerId, room.day, { fees: fee });
    });
    return this.view(room, playerId);
  }

  /** 3b. Hẹn đoàn kiểm tra ATTP tới tiệm. */
  async book(room: RoomRuntime, playerId: string) {
    const biz = await this.business(playerId);
    this.requireLicensed(room, biz);
    if (!biz.trained)
      throw new GameError("invalid_state", "Tập huấn ATTP trước rồi mới hẹn kiểm tra");
    if (biz.certified) throw new GameError("invalid_state", "Có giấy ATTP rồi");
    if (biz.inspectAt) throw new GameError("invalid_state", "Đã hẹn đoàn kiểm tra rồi");
    const inspectAt = this.now(room) + content.data.shopSetup.foodCert.inspectAfter;
    await this.prisma.business.update({ where: { id: biz.id }, data: { inspectAt } });
    return this.view(room, playerId);
  }

  /** 3c. Đoàn tới: chủ có mặt ở tiệm (trước cửa hoặc trong tiệm) → cấp giấy chứng nhận ATTP. */
  async meet(room: RoomRuntime, playerId: string) {
    const biz = await this.business(playerId);
    const lease = await this.activeLease(playerId);
    if (!biz.inspectAt || !lease) throw new GameError("invalid_state", "Chưa hẹn đoàn kiểm tra");
    const now = this.now(room);
    if (now < biz.inspectAt) throw new GameError("invalid_state", "Đoàn chưa tới — chờ chút");
    const pos = room.members.get(playerId)?.pos;
    const lot = content.lot(lease.lotId).position;
    const here =
      !!pos &&
      (pos.inside === `shop:${lease.lotId}` ||
        (!pos.inside && Math.hypot(pos.x - lot.x, pos.z - lot.z) <= REACH));
    if (!here) throw new GameError("invalid_state", "Về tận tiệm mới đón đoàn kiểm tra được");
    await this.prisma.business.update({
      where: { id: biz.id },
      data: { certified: true, inspectAt: null },
    });
    void this.log(playerId, "shop_certified", {});
    this.notify?.(playerId, {
      kind: "good",
      text: "🧑‍🍳 Đoàn kiểm tra: bếp sạch, đồ tươi — cấp giấy chứng nhận ATTP!",
    });
    return this.view(room, playerId);
  }

  /** 4. Làm biển hiệu tên quán (hiện trên nhà ngoài phố). */
  async sign(room: RoomRuntime, playerId: string) {
    const biz = await this.business(playerId);
    this.requireLicensed(room, biz);
    if (needsFoodCert(content, biz.productId) && !biz.certified)
      throw new GameError("invalid_state", "Có giấy ATTP rồi mới treo biển mở quán ăn được");
    if (biz.signed) throw new GameError("invalid_state", "Biển hiệu treo rồi");
    const fee = content.data.shopSetup.signFee;
    await this.prisma.$transaction(async (tx) => {
      await this.payment.cashThenBank(
        tx,
        playerId,
        fee,
        SYSTEM.market,
        "sign",
        "Không đủ tiền làm biển hiệu",
      );
      await tx.business.update({ where: { id: biz.id }, data: { signed: true } });
      await addToReport(tx, playerId, room.day, { fees: fee });
    });
    this.onWorld?.(room);
    return this.view(room, playerId);
  }

  /** Mở tiệm trong nhà: phải là nhà mình đang thuê và đủ giấy tờ. */
  async requireReady(room: RoomRuntime, biz: Business, lotId: string) {
    const lease = await this.activeLease(biz.ownerId);
    if (!lease || lease.lotId !== lotId)
      throw new GameError(
        "invalid_state",
        "Ký hợp đồng thuê căn này trước (☰ Menu → 🏠 Thuê nhà & giấy tờ)",
      );
    const now = this.now(room);
    const missing =
      !biz.licenseAt || biz.licenseAt > now
        ? "giấy đăng ký hộ kinh doanh"
        : needsFoodCert(content, biz.productId) && !biz.certified
          ? "giấy chứng nhận ATTP"
          : !biz.signed
            ? "biển hiệu"
            : null;
    if (missing)
      throw new GameError(
        "invalid_state",
        `Chưa có ${missing} — xem ☰ Menu → 🏠 Thuê nhà & giấy tờ`,
      );
  }

  /** Chọn nhà làm chỗ bán: chỉ nhà mình đang thuê. */
  async requireLease(playerId: string, lotId: string) {
    const lease = await this.activeLease(playerId);
    if (!lease || lease.lotId !== lotId)
      throw new GameError(
        "invalid_state",
        "Nhà này phải ký hợp đồng thuê trước (☰ Menu → 🏠 Thuê nhà & giấy tờ)",
      );
  }

  /** Dọn quầy ra vỉa hè: phải trả nhà trước (tránh vừa tiền nhà vừa tiền chỗ). */
  async requireNoLease(playerId: string) {
    const lease = await this.activeLease(playerId);
    if (lease)
      throw new GameError(
        "invalid_state",
        `Đang thuê ${content.lot(lease.lotId).name} — tiền nhà vẫn tính mỗi ngày. Trả nhà (☰ Menu → 🏠 Thuê nhà & giấy tờ) rồi mới ra vỉa hè bán`,
      );
  }

  /** Mỗi phút: báo hồ sơ đã duyệt, đoàn kiểm tra tới; quá giờ không ai đón thì huỷ hẹn. */
  async tick(room: RoomRuntime) {
    const now = this.now(room);
    const members = [...room.members.keys()];
    if (!members.length) return;
    await this.rentTick(room);
    const list = await this.prisma.business.findMany({
      where: {
        ownerId: { in: members },
        OR: [{ inspectAt: { not: null } }, { licenseAt: { gt: now - 180, lte: now } }],
      },
    });
    const win = content.data.shopSetup.foodCert.inspectWindow;
    for (const b of list) {
      if (b.licenseAt && b.licenseAt <= now && !this.told.has(`lic:${b.id}`)) {
        this.told.add(`lic:${b.id}`);
        this.notify?.(b.ownerId, {
          kind: "good",
          text: `🏛️ ${content.data.shopSetup.license.office} duyệt hồ sơ: hộ kinh doanh "${b.shopName}" đã có giấy!`,
        });
      }
      if (!b.inspectAt) continue;
      const key = `insp:${b.id}:${b.inspectAt}`;
      if (now >= b.inspectAt && !this.told.has(key)) {
        this.told.add(key);
        this.notify?.(b.ownerId, {
          kind: "warn",
          text: `👮 Đoàn kiểm tra ATTP tới tiệm rồi — về tiệm đón trong ${win} phút (☰ Menu → 🏠 Thuê nhà & giấy tờ)`,
        });
      }
      if (now > b.inspectAt + win) {
        await this.prisma.business.update({ where: { id: b.id }, data: { inspectAt: null } });
        this.notify?.(b.ownerId, {
          kind: "warn",
          text: "👮 Đoàn kiểm tra tới mà không gặp chủ — về rồi, hẹn lại nha",
        });
      }
    }
  }

  // ───────────── 🏠 Đòi tiền nhà (UC-F13) ─────────────

  async rentView(room: RoomRuntime, lease: Lease): Promise<RentView> {
    const r = content.data.shopSetup.rent;
    const ll = content.landlordOf(lease.lotId);
    const rentPerDay = content.lot(lease.lotId).rentPerDay;
    const owed = rentOwed({ day: room.day, paidDay: lease.paidDay, rentPerDay });
    return {
      lotId: lease.lotId,
      landlord: { id: ll.id, name: ll.name, tag: ll.tag, model: ll.model },
      rentPerDay,
      paidDay: lease.paidDay,
      owedDays: owed.days,
      owed: owed.amount,
      lateFee: owed.amount > 0 ? lease.lateFee : 0,
      promiseDay: owed.amount > 0 ? lease.promiseDay : null,
      promiseOptions:
        lease.promiseDay === null ? rentPromiseOptions(content, room.day, owed.amount) : [],
      strikes: lease.strikes,
      maxStrikes: r.evictAfterStrikes,
      depositLeft: await this.ledger.balance(this.prisma, depositWallet(lease.id)),
      remindMinute: r.remindMinute,
      dueMinute: r.dueMinute,
    };
  }

  private async myLease(playerId: string) {
    const lease = await this.activeLease(playerId);
    if (!lease) throw new GameError("invalid_state", "Đang không thuê nhà nào");
    return lease;
  }

  /** 💵 Trả hết tiền nhà đang nợ (cộng phí trễ đã chốt nếu có hẹn). Trả trước trong ngày cũng được. */
  async rentPay(room: RoomRuntime, playerId: string, method: PayMethod = "auto") {
    const lease = await this.myLease(playerId);
    const owed = rentOwed({
      day: room.day,
      paidDay: lease.paidDay,
      rentPerDay: content.lot(lease.lotId).rentPerDay,
    }).amount;
    if (owed <= 0) throw new GameError("invalid_state", "Tiền nhà trả đủ tới hôm nay rồi");
    const fee = lease.lateFee;
    await this.prisma.$transaction(async (tx) => {
      const { wallet: from, source: src } = await this.payment.walletFor(
        tx,
        playerId,
        owed + fee,
        method,
      );
      await this.ledger.transfer(tx, from, SYSTEM.landlord, owed, "rent", lease.id);
      if (fee > 0)
        await this.ledger.transfer(tx, from, SYSTEM.landlord, fee, "rent_late_fee", lease.id);
      await tx.lease.update({
        where: { id: lease.id },
        data: { paidDay: room.day, promiseDay: null, lateFee: 0 },
      });
      await addToReport(tx, playerId, room.day, { rent: owed, fees: fee });
      await tx.gameEvent.create({
        data: { playerId, type: "rent_pay", payload: { owed, fee, via: src } },
      });
    });
    const fresh = await this.prisma.lease.findUniqueOrThrow({ where: { id: lease.id } });
    const view = await this.rentView(room, fresh);
    this.say(playerId, fresh, "paid", view, { owed, fee });
    return view;
  }

  /** 🗓️ Xin hẹn trả tới ngày `day` (hẹn theo ngày, cả ngày đó trả lúc nào cũng được); phí trễ chốt ngay lúc hẹn. */
  async rentPromise(room: RoomRuntime, playerId: string, day: number) {
    const lease = await this.myLease(playerId);
    const owed = rentOwed({
      day: room.day,
      paidDay: lease.paidDay,
      rentPerDay: content.lot(lease.lotId).rentPerDay,
    }).amount;
    if (owed <= 0) throw new GameError("invalid_state", "Có nợ tiền nhà đâu mà hẹn");
    if (lease.promiseDay !== null)
      throw new GameError(
        "invalid_state",
        `Đã hẹn tới ngày ${lease.promiseDay} rồi — hẹn thì phải giữ lời`,
      );
    const opt = rentPromiseOptions(content, room.day, owed).find((o) => o.day === day);
    if (!opt)
      throw new GameError(
        "invalid_payload",
        `Chỉ hẹn được tối đa ${content.data.shopSetup.rent.maxPromiseDays} ngày`,
      );
    const fresh = await this.prisma.lease.update({
      where: { id: lease.id },
      data: { promiseDay: opt.day, lateFee: opt.fee },
    });
    void this.log(playerId, "rent_promise", { days: opt.day - room.day, owed, fee: opt.fee });
    const view = await this.rentView(room, fresh);
    this.say(playerId, fresh, "promise", view, { owed, fee: opt.fee, day: opt.day });
    return view;
  }

  /** Mỗi phút từ giờ nhắc: chủ nhà tới nhắc (một lần/ngày); quá hạn / thất hẹn thì trừ cọc; quá đáng thì dẹp tiệm. */
  private async rentTick(room: RoomRuntime) {
    const leases = await this.prisma.lease.findMany({
      where: { roomId: room.id, status: "ACTIVE" },
    });
    for (const lease of leases) {
      const rentPerDay = content.lot(lease.lotId).rentPerDay;
      const owed = rentOwed({ day: room.day, paidDay: lease.paidDay, rentPerDay }).amount;
      if (owed <= 0) continue;
      const state: RentState = {
        day: room.day,
        minute: room.minute,
        rentPerDay,
        paidDay: lease.paidDay,
        promiseDay: lease.promiseDay,
        strikes: lease.strikes,
        depositLeft: await this.ledger.balance(this.prisma, depositWallet(lease.id)),
        online: (room.members.get(lease.ownerId)?.sockets.size ?? 0) > 0,
      };
      const verdict = rentVerdict(content, state);
      if (verdict.kind === "collect") await this.collectLate(room, lease, verdict);
      else if (verdict.kind === "evict") await this.evict(room, lease);
      else if (rentShouldRemind(content, state)) {
        const key = `rent:${lease.id}:${room.day}`;
        if (this.told.has(key)) continue;
        this.told.add(key);
        const promisedToday = lease.promiseDay !== null && lease.promiseDay <= room.day;
        this.say(
          lease.ownerId,
          lease,
          promisedToday ? "promised" : "remind",
          await this.rentView(room, lease),
          { owed, fee: promisedToday ? lease.lateFee : 0 },
        );
      }
    }
  }

  /** Quá hạn / thất hẹn: trừ (nợ + phí trễ) vào cọc, tính một lần trễ, trừ 🤝 tin cậy. */
  private async collectLate(room: RoomRuntime, lease: Lease, v: { owed: number; fee: number }) {
    const fresh = await this.prisma.$transaction(async (tx) => {
      await this.ledger.transfer(
        tx,
        depositWallet(lease.id),
        SYSTEM.landlord,
        v.owed,
        "rent_from_deposit",
        lease.id,
      );
      if (v.fee > 0)
        await this.ledger.transfer(
          tx,
          depositWallet(lease.id),
          SYSTEM.landlord,
          v.fee,
          "rent_late_fee",
          lease.id,
        );
      const player = await tx.player.findUniqueOrThrow({ where: { id: lease.ownerId } });
      await tx.player.update({
        where: { id: lease.ownerId },
        data: { trust: trustAfter(content, player.trust, "rent_late") },
      });
      await addToReport(tx, lease.ownerId, room.day, { rent: v.owed, fees: v.fee });
      await tx.gameEvent.create({
        data: {
          playerId: lease.ownerId,
          type: "rent_late",
          payload: { owed: v.owed, fee: v.fee, strikes: lease.strikes + 1 },
        },
      });
      return tx.lease.update({
        where: { id: lease.id },
        data: { paidDay: room.day, promiseDay: null, lateFee: 0, strikes: { increment: 1 } },
      });
    });
    const view = await this.rentView(room, fresh);
    await this.pushMe?.(room, lease.ownerId);
    this.say(lease.ownerId, fresh, "late", view, { owed: v.owed + v.fee, fee: v.fee });
    this.notify?.(lease.ownerId, {
      kind: "warn",
      text: `🏠 Trễ tiền nhà: ${content.landlordOf(lease.lotId).name} trừ ${vnd(v.owed + v.fee)} vào cọc · trễ ${fresh.strikes}/${view.maxStrikes} lần · 🤝 −${content.data.shopSetup.rent.trustLate}`,
    });
  }

  /** Dẹp tiệm: mất cọc còn lại, đóng tiệm, dọn đồ nghề ra, mất nhà; cả xóm biết. */
  private async evict(room: RoomRuntime, lease: Lease) {
    const ll = content.landlordOf(lease.lotId);
    const lot = content.lot(lease.lotId);
    const view = await this.rentView(room, lease);
    await this.prisma.$transaction(async (tx) => {
      const left = await this.ledger.balance(tx, depositWallet(lease.id));
      if (left > 0)
        await this.ledger.transfer(
          tx,
          depositWallet(lease.id),
          SYSTEM.landlord,
          left,
          "rent_from_deposit",
          lease.id,
        );
    });
    const [biz, owner] = await Promise.all([
      this.prisma.business.findFirst({ where: { ownerId: lease.ownerId, lotId: lease.lotId } }),
      this.prisma.player.findUnique({
        where: { id: lease.ownerId },
        select: { displayName: true },
      }),
    ]);
    await this.end(room, lease, "EVICTED");
    await this.pushMe?.(room, lease.ownerId);
    this.say(lease.ownerId, lease, "evict", { ...view, depositLeft: 0 }, { owed: view.owed });
    this.notify?.(lease.ownerId, {
      kind: "warn",
      text: `📦 ${ll.name} dẹp tiệm, lấy lại ${lot.name} — mất cọc. Đồ nghề dọn ra rồi, muốn bán tiếp thì ra vỉa hè`,
    });
    const shop = biz?.shopName ? `"${biz.shopName}"` : "tiệm";
    this.notifyRoom?.(room.id, {
      kind: "info",
      text: `📦 ${ll.name} dẹp ${shop} của ${owner?.displayName ?? "hàng xóm"} ở ${lot.name} vì nợ tiền nhà`,
    });
    await this.story.note(lease.ownerId, "evicted", room.day, {
      landlord: ll.name,
      lot: lot.name,
    });
  }

  /** Gửi lời chủ nhà (modal chân dung) cho người thuê. */
  private say(
    playerId: string,
    lease: Lease,
    mood: LandlordEvent["mood"],
    rent: RentView,
    vars: { owed: number; fee?: number; day?: number },
  ) {
    const lines = content.landlordOf(lease.lotId).lines[mood];
    const raw = lines[Math.floor(Math.random() * lines.length)] ?? "";
    const line = raw
      .replaceAll("{owed}", vnd(vars.owed))
      .replaceAll("{fee}", vnd(vars.fee ?? 0))
      .replaceAll("{day}", vars.day ? rentDayLabel(vars.day) : "");
    this.landlord?.(playerId, { mood, line, rent });
  }

  /** Dev/test: thuê nhà + đủ giấy tờ ngay (tên quán mặc định nếu chưa có). */
  async debugReady(room: RoomRuntime, playerId: string, lotId: string) {
    if (!(await this.activeLease(playerId))) await this.lease(room, playerId, lotId);
    const biz = await this.business(playerId);
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    await this.prisma.business.update({
      where: { id: biz.id },
      data: {
        shopName: biz.shopName ?? `Tiệm ${player.displayName}`,
        licenseAt: this.now(room),
        trained: true,
        certified: true,
        signed: true,
        inspectAt: null,
      },
    });
    this.onWorld?.(room);
  }

  private requireLicensed(room: RoomRuntime, biz: Business) {
    if (!biz.licenseAt) throw new GameError("invalid_state", "Đăng ký hộ kinh doanh trước đã");
    if (biz.licenseAt > this.now(room))
      throw new GameError("invalid_state", "Hồ sơ hộ kinh doanh còn đang xét");
  }

  private async end(room: RoomRuntime, lease: Lease, status: "ENDED" | "EVICTED") {
    await this.prisma.$transaction(async (tx) => {
      const left = await this.ledger.balance(tx, depositWallet(lease.id));
      if (left > 0 && status === "ENDED")
        await this.ledger.transfer(
          tx,
          depositWallet(lease.id),
          playerWallet(lease.ownerId),
          left,
          "lease_refund",
          lease.id,
        );
      await tx.lease.update({ where: { id: lease.id }, data: { status, endedDay: room.day } });
      await tx.business.updateMany({
        where: { ownerId: lease.ownerId, lotId: lease.lotId },
        data: { lotId: null, status: "CLOSED" },
      });
      await tx.gameEvent.create({
        data: {
          playerId: lease.ownerId,
          type: "shop_unlease",
          payload: { lotId: lease.lotId, status, refund: left },
        },
      });
    });
    room.attending.delete(lease.ownerId);
    this.onWorld?.(room);
  }

  private log(playerId: string, type: string, payload: Record<string, unknown>) {
    return this.prisma.gameEvent
      .create({ data: { playerId, type, payload: payload as object } })
      .catch(() => undefined);
  }
}
