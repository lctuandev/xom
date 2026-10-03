import { Injectable } from "@nestjs/common";
import { content } from "@xom/content";
import type { NotifyEvent, RideView } from "@xom/shared";
import {
  congestion,
  Grid,
  haggleChance,
  type Payment,
  passengerWait,
  pickPayment,
  type RideDest,
  type RideRoute,
  ROUTE_WEIGHTS,
  rideDestinations,
  rideFare,
  rideFuel,
  rideLine,
  rideStars,
  rideTip,
  routeSpeed,
  seededRandom,
  settleCash,
  starLine,
} from "@xom/sim";
import { bankWallet, LedgerService, playerWallet, SYSTEM } from "../economy/ledger.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { BusinessRepo } from "./business-repo.js";
import { ContractService } from "./contracts.js";
import { PaymentService } from "./payment.js";
import { addToReport } from "./report.js";
import { GameError, type RoomRuntime } from "./room.js";
import { StoryService } from "./story.js";

/** Đứng cách trạm / chỗ đón / nơi tới trong khoảng này (mét). */
const REACH = 6;
/** Chạy nhanh hơn tốc độ cho phép bấy nhiêu lần là gian lận (chừa sai số đi tắt, giật lag). */
const SPEED_SLACK = 1.4;

interface RideState {
  stage: RideView["stage"];
  readyAt?: number;
  passenger?: NonNullable<RideView["passenger"]>;
  archetype?: string;
  /** Chỗ khách vẫy (người chạy đang đứng đâu thì đón ở đó). */
  pickup?: { x: number; z: number };
  dest?: RideDest;
  meters?: number;
  fare?: number;
  price?: number;
  route?: RideRoute;
  speed?: number;
  pathMeters?: number;
  startedAt?: number;
  wet?: boolean;
  pay?: Payment;
  stars?: number;
  comment?: string;
  tip?: number;
  /** Đếm khách để sinh ngẫu nhiên tất định. */
  n: number;
}

/**
 * 🛵 Xe ôm (docs/KIENTRUC.md §4, UC-N1): thuê xe Wave của Chú Lực theo ngày (ở trạm) → đứng đâu ngoài đường cũng chờ
 * khách được (xe ôm truyền thống đậu đầu hẻm, ngã tư, chợ…; trạm chỉ là nơi thuê xe) → khách vẫy, hỏi giá, mình
 * trả giá (nói thách quá thì khách đi bộ) → chọn đường lớn (kẹt giờ cao điểm) hay hẻm (trơn khi mưa) → chạy thật tới nơi
 * (server kiểm vị trí + thời gian chạy) → khách trả tiền (thối tiền), chấm sao, boa → trừ xăng. Tiền chỉ có khi chạy thật.
 */
@Injectable()
export class RideService {
  private notify?: (playerId: string, n: NotifyEvent) => void;
  private push?: (playerId: string, r: RideView) => void;
  private readonly states = new Map<string, RideState>();
  private readonly today = new Map<string, { day: number; rides: number; earned: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly businesses: BusinessRepo,
    private readonly ledger: LedgerService,
    private readonly payment: PaymentService,
    private readonly story: StoryService,
    private readonly contracts: ContractService,
  ) {}

  setNotifier(
    notify: (playerId: string, n: NotifyEvent) => void,
    push: (playerId: string, r: RideView) => void,
  ) {
    this.notify = notify;
    this.push = push;
  }

  private station() {
    const place = content.place(content.data.rides.stationPlaceId);
    const front = place.facing === 0 ? 1 : -1;
    return { x: place.position.x, z: place.position.z + front * 1.4, name: place.name };
  }

  private state(playerId: string): RideState {
    let s = this.states.get(playerId);
    if (!s) {
      s = { stage: "idle", n: 0 };
      this.states.set(playerId, s);
    }
    return s;
  }

  private near(room: RoomRuntime, playerId: string, x: number, z: number) {
    const pos = room.members.get(playerId)?.pos;
    return !!pos && !pos.inside && Math.hypot(pos.x - x, pos.z - z) <= REACH;
  }

  private atStation(room: RoomRuntime, playerId: string) {
    const st = this.station();
    if (!this.near(room, playerId, st.x, st.z))
      throw new GameError("invalid_state", `Ra ${st.name} mới đón khách được`);
  }

  private wet(room: RoomRuntime) {
    const now = room.weatherView().now;
    return now === "rain" || now === "storm";
  }

  async view(room: RoomRuntime, playerId: string): Promise<RideView> {
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    const s = this.state(playerId);
    const t = this.today.get(playerId);
    const today =
      t && t.day === room.day ? { rides: t.rides, earned: t.earned } : { rides: 0, earned: 0 };
    const view: RideView = {
      stage: s.stage,
      bikeToday: player.bikeRentDay === room.day,
      today,
      rating: { rides: player.rides, avg: player.rides ? player.rideStars / player.rides : 0 },
      readyAt: s.readyAt,
      passenger: s.passenger,
      dest: s.dest,
      meters: s.meters,
      fare: s.fare,
      price: s.price,
      route: s.route,
      speed: s.speed,
      pay: s.pay,
      stars: s.stars,
      comment: s.comment,
      tip: s.tip,
    };
    if (s.stage === "route" && s.dest) {
      const st = s.pickup ?? this.station();
      const jam = congestion(content, room.minute);
      const wet = this.wet(room);
      const secs = (route: RideRoute) =>
        Math.round(
          Grid.length(st, room.grid.path(st, s.dest as RideDest, ROUTE_WEIGHTS[route])) /
            routeSpeed(content, route, jam, wet),
        );
      view.routes = { road: secs("road"), alley: secs("alley"), jam, wet };
    }
    return view;
  }

  /** Thuê xe Wave cũ một ngày (tiền mặt trước, thiếu thì chuyển khoản). */
  async rent(room: RoomRuntime, playerId: string) {
    this.atStation(room, playerId);
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    if (player.bikeRentDay === room.day)
      throw new GameError("invalid_state", "Hôm nay thuê xe rồi");
    const cost = content.data.rides.bikeRentPerDay;
    await this.prisma.$transaction(async (tx) => {
      await this.payment.cashThenBank(
        tx,
        playerId,
        cost,
        SYSTEM.landlord,
        "bike_rent",
        "Không đủ tiền thuê xe",
      );
      await tx.player.update({ where: { id: playerId }, data: { bikeRentDay: room.day } });
      await addToReport(tx, playerId, room.day, { fees: cost });
      await tx.gameEvent.create({ data: { playerId, type: "ride_rent", payload: { cost } } });
    });
    return this.view(room, playerId);
  }

  /** Dừng xe chờ khách — ở đâu ngoài đường cũng được (không phải trong nhà / trong tiệm). */
  async wait(room: RoomRuntime, playerId: string) {
    if (room.members.get(playerId)?.pos?.inside)
      throw new GameError("invalid_state", "Ra ngoài đường mới đón khách được");
    const player = await this.prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    if (player.bikeRentDay !== room.day)
      throw new GameError("invalid_state", "Thuê xe của Chú Lực trước đã");
    if (room.shifts.has(playerId)) throw new GameError("invalid_state", "Đang trong ca làm thuê");
    if (await this.businesses.ownerTied(playerId, room.minute))
      throw new GameError(
        "invalid_state",
        "Quầy đang mở mà không có nhân viên trong ca — đóng quầy hoặc thuê người bán thay (👩‍🍳 Nhân viên) rồi mới chạy xe ôm",
      );
    const s = this.state(playerId);
    if (s.stage !== "idle") throw new GameError("invalid_state", "Đang có khách rồi");
    s.stage = "waiting";
    s.readyAt = room.minute + passengerWait(content, room.minute);
    s.comment = undefined;
    return this.view(room, playerId);
  }

  /** Mỗi phút game: ai chờ đủ lâu thì có khách tới hỏi. */
  async tick(room: RoomRuntime) {
    for (const [playerId, s] of this.states) {
      if (s.stage !== "waiting" || (s.readyAt ?? 0) > room.minute) continue;
      const pos = room.members.get(playerId)?.pos;
      if (!pos) continue;
      // Đang trong nhà / trong tiệm thì khách chưa thấy xe — ra đường mới có người vẫy.
      if (pos.inside) continue;
      this.newPassenger(room, playerId, s, { x: pos.x, z: pos.z });
      if ((s.stage as RideState["stage"]) !== "offer") continue;
      this.notify?.(playerId, {
        kind: "info",
        text: `🙋 ${s.passenger?.name} vẫy xe: "${s.passenger?.line}" — bấm để trả giá`,
        open: "ride",
      });
      this.push?.(playerId, await this.view(room, playerId));
    }
  }

  private newPassenger(
    room: RoomRuntime,
    playerId: string,
    s: RideState,
    st: { x: number; z: number },
  ) {
    s.n += 1;
    const rand = seededRandom("ride", playerId, room.day, room.minute, s.n);
    const people = content.data.residents.filter((r) => r.id !== "chu_luc");
    const who = people[Math.floor(rand() * people.length)] ?? people[0];
    const dests = rideDestinations(content, st);
    const dest = dests[Math.floor(rand() * dests.length)] ?? dests[0];
    if (!who || !dest) return;
    const meters = Grid.length(st, room.grid.path(st, dest, ROUTE_WEIGHTS.road));
    s.stage = "offer";
    s.passenger = {
      residentId: who.id,
      name: who.name,
      bio: who.bio,
      line: rideLine(content, "ask", rand, dest.label),
      model: content.data.npcs.find((n) => n.id === who.archetype)?.model,
    };
    s.archetype = who.archetype;
    s.pickup = { x: st.x, z: st.z };
    s.dest = dest;
    s.meters = Math.round(meters);
    s.fare = rideFare(content, meters);
    s.readyAt = undefined;
  }

  /** Trả giá: đưa ra mức giá (× giá chuẩn); khách chịu thì chọn đường, không thì khách đi bộ, chờ khách khác. */
  async offer(room: RoomRuntime, playerId: string, ratio: number) {
    const s = this.state(playerId);
    if (s.stage !== "offer" || !s.fare || !s.passenger)
      throw new GameError("invalid_state", "Chưa có khách hỏi giá");
    if (!content.data.rides.haggle.some((h) => Math.abs(h.ratio - ratio) < 1e-6))
      throw new GameError("invalid_payload", "Mức giá không có");
    const wet = this.wet(room);
    const rand = seededRandom("haggle", playerId, room.day, room.minute, s.n);
    const price = Math.max(1000, Math.round((s.fare * ratio) / 1000) * 1000);
    if (rand() < haggleChance(content, ratio, wet)) {
      s.stage = "route";
      s.price = price;
      s.comment = rideLine(content, "accept", rand);
      void this.log(playerId, "ride_haggle", { ratio, accepted: true });
    } else {
      const name = s.passenger.name;
      s.comment = `${name}: "${rideLine(content, "refuse", rand)}"`;
      s.stage = "waiting";
      s.readyAt = room.minute + Math.ceil(passengerWait(content, room.minute) / 2);
      s.passenger = undefined;
      s.dest = undefined;
      s.price = undefined;
      void this.log(playerId, "ride_haggle", { ratio, accepted: false });
    }
    return this.view(room, playerId);
  }

  /** Chọn đường rồi chạy: server ghi giờ bắt đầu + tốc độ cho phép. */
  async go(room: RoomRuntime, playerId: string, route: RideRoute) {
    const s = this.state(playerId);
    if (s.stage !== "route" || !s.dest)
      throw new GameError("invalid_state", "Chưa chốt giá với khách");
    const st = s.pickup ?? this.station();
    // Khách đứng chỗ vẫy xe — phải quay lại đón chứ không chạy từ chỗ khác.
    if (!this.near(room, playerId, st.x, st.z))
      throw new GameError("invalid_state", "Quay lại chỗ khách đang đứng chờ đã");
    const wet = this.wet(room);
    const jam = congestion(content, room.minute);
    s.route = route;
    s.wet = wet;
    s.speed = routeSpeed(content, route, jam, wet);
    s.pathMeters = Grid.length(st, room.grid.path(st, s.dest, ROUTE_WEIGHTS[route]));
    s.startedAt = Date.now();
    s.stage = "riding";
    s.comment = undefined;
    return this.view(room, playerId);
  }

  /** Tới nơi: kiểm vị trí + không chạy nhanh hơn xe cho phép; khách chấm sao, chuẩn bị trả tiền. */
  async arrive(room: RoomRuntime, playerId: string) {
    const s = this.state(playerId);
    if (s.stage !== "riding" || !s.dest || !s.startedAt || !s.speed || !s.pathMeters || !s.route)
      throw new GameError("invalid_state", "Đang không chở ai");
    if (!this.near(room, playerId, s.dest.x, s.dest.z))
      throw new GameError("invalid_state", `Chưa tới ${s.dest.label}`);
    const ms = Date.now() - s.startedAt;
    const minMs = (s.pathMeters / (s.speed * SPEED_SLACK)) * 1000;
    if (ms < minMs) throw new GameError("invalid_state", "Chạy gì nhanh dữ vậy — từ từ thôi");
    const rand = seededRandom("ride-pay", playerId, room.day, s.n);
    const npc = content.data.npcs.find((n) => n.id === s.archetype);
    s.stars = rideStars(content, { meters: s.pathMeters, ms, route: s.route, wet: !!s.wet });
    s.comment = starLine(content, s.stars, rand);
    s.tip = rideTip(content, s.stars, rand);
    s.pay = pickPayment(s.price ?? 0, npc?.transferRate ?? 0.3, rand);
    s.stage = "pay";
    return this.view(room, playerId);
  }

  /** Thu tiền (thối nếu khách đưa tờ lớn), nhận boa, trừ xăng; cuốc xong quay về trạm. */
  async pay(room: RoomRuntime, playerId: string, change: number | null) {
    const s = this.state(playerId);
    if (s.stage !== "pay" || !s.pay || !s.price || !s.dest || !s.passenger)
      throw new GameError("invalid_state", "Chưa tới nơi");
    const price = s.price;
    const rand = seededRandom("ride-change", playerId, room.day, s.n);
    let received = price;
    let short = false;
    if (s.pay.kind === "cash" && s.pay.bill !== price) {
      if (change === null)
        throw new GameError("invalid_payload", "Khách đưa tờ lớn — thối tiền cho khách");
      const r = settleCash(price, s.pay.bill, change, rand);
      received = r.received;
      short = r.outcome === "short";
    }
    let stars = s.stars ?? 3;
    let tip = s.tip ?? 0;
    if (short) {
      stars = Math.max(1, stars - 2);
      tip = 0;
    }
    const fuel = rideFuel(content, s.pathMeters ?? s.meters ?? 0);
    const viaBank = s.pay.kind === "transfer";
    const name = s.passenger.name;
    const place = s.dest.label;
    await this.prisma.$transaction(async (tx) => {
      const to = viaBank ? bankWallet(playerId) : playerWallet(playerId);
      await this.ledger.transfer(tx, SYSTEM.customers, to, received, "ride_fare");
      if (tip > 0)
        await this.ledger.transfer(tx, SYSTEM.customers, playerWallet(playerId), tip, "ride_tip");
      await this.payment.cashThenBank(
        tx,
        playerId,
        fuel,
        SYSTEM.market,
        "fuel",
        "Không đủ tiền đổ xăng",
      );
      await tx.player.update({
        where: { id: playerId },
        data: { rides: { increment: 1 }, rideStars: { increment: stars } },
      });
      await addToReport(tx, playerId, room.day, { revenue: received + tip, tips: tip, fees: fuel });
      await tx.gameEvent.create({
        data: {
          playerId,
          type: "ride_done",
          payload: {
            route: s.route,
            meters: Math.round(s.pathMeters ?? 0),
            price,
            stars,
            tip,
            fuel,
          },
        },
      });
    });
    if (short) await this.contracts.trustEvent(playerId, "short").catch(() => undefined);
    const t = this.today.get(playerId);
    const today = t && t.day === room.day ? t : { day: room.day, rides: 0, earned: 0 };
    today.rides += 1;
    today.earned += received + tip - fuel;
    this.today.set(playerId, today);
    this.notify?.(playerId, {
      kind: stars >= 4 ? "good" : "info",
      text: `🛵 ${"⭐".repeat(stars)} ${name}: "${short ? "Thối thiếu rồi nha!" : s.comment}"${tip ? ` · boa ${tip.toLocaleString("vi-VN")}đ` : ""} · xăng −${fuel.toLocaleString("vi-VN")}đ`,
    });
    await this.story.note(playerId, "first_ride", room.day, { name, place });
    this.states.set(playerId, { stage: "idle", n: s.n });
    return this.view(room, playerId);
  }

  /** Nghỉ chạy / bỏ khách (đang chở mà bỏ thì khách giận, không trả tiền). */
  async quit(room: RoomRuntime, playerId: string) {
    const s = this.state(playerId);
    if (s.stage === "riding" || s.stage === "pay") void this.log(playerId, "ride_abandon", {});
    this.states.set(playerId, { stage: "idle", n: s.n });
    return this.view(room, playerId);
  }

  /** Rời xóm hẳn: bỏ cuốc đang dở. */
  clear(playerId: string) {
    this.states.delete(playerId);
  }

  private log(playerId: string, type: string, payload: Record<string, unknown>) {
    return this.prisma.gameEvent
      .create({ data: { playerId, type, payload: payload as object } })
      .catch(() => undefined);
  }
}
