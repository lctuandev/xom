import { Injectable, Logger } from "@nestjs/common";
import type {
  ClockView,
  DayReportView,
  EventView,
  LandlordEvent,
  MeView,
  NotifyEvent,
  PeerPos,
  RideView,
  RosterView,
  SayEvent,
  Snapshot,
  WorldView,
} from "@xom/shared";
import type { PaySource } from "@xom/sim";
import { PrismaService } from "../prisma/prisma.service.js";
import type { RoomRuntime } from "./room.js";

/** Cổng phát sự kiện ra socket; gateway cung cấp để service không phụ thuộc Socket.IO. */
export interface GameEmitter {
  toRoom(roomId: string, event: "clock", data: ClockView): void;
  toRoom(roomId: string, event: "world", data: WorldView): void;
  toRoom(roomId: string, event: "notify", data: NotifyEvent): void;
  toRoom(roomId: string, event: "say", data: SayEvent): void;
  toRoom(roomId: string, event: "roster", data: RosterView): void;
  toRoom(roomId: string, event: "peers", data: PeerPos[]): void;
  toRoom(roomId: string, event: "events", data: EventView[]): void;
  toPlayer(playerId: string, event: "me", data: MeView): void;
  toPlayer(playerId: string, event: "dayEnd", data: DayReportView): void;
  toPlayer(playerId: string, event: "snapshot", data: Snapshot): void;
  toPlayer(playerId: string, event: "notify", data: NotifyEvent): void;
  toPlayer(playerId: string, event: "ride", data: RideView): void;
  toPlayer(playerId: string, event: "landlord", data: LandlordEvent): void;
}

/**
 * Phát tin ra người chơi / cả xóm cho mọi service game (thông báo, lời nói, MeView, bản đồ) + ghi sự kiện đo lường —
 * thay cho kiểu mỗi service một `setNotifier(...)` riêng. GameService gắn emitter + cách dựng MeView / WorldView.
 */
@Injectable()
export class Broadcast {
  private readonly logger = new Logger("Broadcast");
  private emitter?: GameEmitter;
  private meOf?: (playerId: string) => Promise<void>;
  private worldOf?: (room: RoomRuntime) => void;

  constructor(private readonly prisma: PrismaService) {}

  bind(
    emitter: GameEmitter,
    fns: { me: (playerId: string) => Promise<void>; world: (room: RoomRuntime) => void },
  ) {
    this.emitter = emitter;
    this.meOf = fns.me;
    this.worldOf = fns.world;
  }

  notify(playerId: string, n: NotifyEvent) {
    this.emitter?.toPlayer(playerId, "notify", n);
  }

  notifyRoom(roomId: string, n: NotifyEvent) {
    this.emitter?.toRoom(roomId, "notify", n);
  }

  say(roomId: string, s: SayEvent) {
    this.emitter?.toRoom(roomId, "say", s);
  }

  /** Gửi MeView mới (tiền, kho, no/khát… vừa đổi ngoài intent). Không chặn, lỗi bỏ qua. */
  me(playerId: string) {
    void this.meOf?.(playerId).catch(() => undefined);
  }

  /** Cập nhật bản đồ (quầy, công trường, công trình) cho cả xóm. */
  world(room: RoomRuntime) {
    this.worldOf?.(room);
  }

  /** Sự kiện trong ngày của xóm đổi (khai trương…). */
  events(room: RoomRuntime) {
    this.emitter?.toRoom(room.id, "events", room.events);
  }

  /** Kho của ai đó đổi: hàng xóm cần biết món nào còn làm được (chỉ khi xóm có người khác). */
  stockChanged(room: RoomRuntime) {
    if (room.members.size > 1) this.world(room);
  }

  /** Báo khoản vừa trả đi bằng ví nào (chuyển khoản thì có "ting ting"). */
  paidBy(playerId: string, src: PaySource, amount: number) {
    if (src !== "bank") return;
    this.notify(playerId, {
      kind: "info",
      text: `🏦 Đã chuyển khoản ${amount.toLocaleString("vi-VN")}đ`,
    });
  }

  /** Ghi sự kiện đo lường (DESIGN §16), không chặn luồng chơi nếu lỗi. */
  log(playerId: string, type: string, payload: Record<string, unknown>) {
    return this.prisma.gameEvent
      .create({ data: { playerId, type, payload: payload as object } })
      .catch((err) => this.logger.warn(`không ghi được sự kiện ${type}: ${err}`));
  }
}
