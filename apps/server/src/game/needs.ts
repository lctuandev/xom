import { Injectable } from "@nestjs/common";
import { content } from "@xom/content";
import type { PayMethod } from "@xom/shared";
import {
  absMinute,
  eat,
  needsAlert,
  needsAt,
  needsFrom,
  type PaySource,
  seededRandom,
} from "@xom/sim";
import { SYSTEM, type Tx } from "../economy/ledger.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { Broadcast } from "./broadcast.js";
import { PaymentService } from "./payment.js";
import { addFriendship, ORDER_REACH } from "./place.js";
import { GameError, type IntentContext, type RoomRuntime } from "./room.js";
import { StaffService } from "./staff.js";

/** 🍚 Nhu cầu (UC-B9–B11): đói / khát, ăn uống ở sạp NPC, khách réo khi chủ vắng quầy. */
@Injectable()
export class NeedsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payment: PaymentService,
    private readonly staff: StaffService,
    private readonly broadcast: Broadcast,
  ) {}

  /** Ăn / uống (UC-B11): cộng vào mức no / khát hiện tại. */
  async feed(tx: Tx, room: RoomRuntime, playerId: string, add: { food?: number; drink?: number }) {
    const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
    const now = absMinute(room.day, room.minute);
    const next = eat(content, needsFrom(player.needs), now, add);
    await tx.player.update({ where: { id: playerId }, data: { needs: { ...next } } });
    room.needsAlert.delete(playerId);
  }

  /**
   * Mỗi giờ game: ai vừa đói / khát thì nhắc một lần (không khoá gì — chỉ tay chậm đi chút).
   * Người mới (chưa có mốc) được tính là vừa ăn sáng.
   */
  async needsTick(room: RoomRuntime) {
    const now = absMinute(room.day, room.minute);
    const players = await this.prisma.player.findMany({
      where: { id: { in: [...room.members.keys()] } },
    });
    for (const p of players) {
      const n = needsFrom(p.needs);
      if (!n.at) {
        await this.prisma.player.update({
          where: { id: p.id },
          data: { needs: { food: n.food, drink: n.drink, at: now } },
        });
        continue;
      }
      const a = needsAlert(content, needsAt(content, n, now));
      const key = `${a.food}:${a.drink}`;
      if (key === "ok:ok" || room.needsAlert.get(p.id) === key) continue;
      room.needsAlert.set(p.id, key);
      const text =
        a.food !== "ok" && a.drink !== "ok"
          ? "🍚💧 Vừa đói vừa khát — ghé 🍜 Ăn uống làm tô phở, ly nước mía đi (tay đang chậm hẳn)"
          : a.food !== "ok"
            ? a.food === "empty"
              ? "🍚 Đói lả rồi! Ghé 🍜 Ăn uống kiếm gì bỏ bụng (tay đang chậm)"
              : "🍚 Bụng réo rồi — ghé 🍜 Ăn uống kiếm gì bỏ bụng"
            : a.drink === "empty"
              ? "💧 Khô cổ quá! Làm ly cà phê đá, nước mía đi (tay đang chậm)"
              : "💧 Khát nước rồi — ghé 🍜 Ăn uống làm ly gì mát mát";
      this.broadcast.notify(p.id, { kind: "warn", text });
      this.broadcast.me(p.id);
    }
  }

  /**
   * Quầy đang mở mà chủ đi vắng (đi ăn, đi chợ…): khách tới réo "có ai bán không" — chủ được báo để chạy về
   * (UC-B11). Mỗi quầy réo tối đa một lần mỗi 20 phút game.
   */
  async calloutTick(room: RoomRuntime) {
    const away = [...room.members.keys()].filter((id) => !room.attending.has(id));
    if (!away.length) return;
    const open = await this.prisma.business.findMany({
      where: { ownerId: { in: away }, status: "OPEN", lotId: { not: null } },
    });
    const lines = content.data.needs.callouts;
    for (const b of open) {
      if ((room.calloutAt.get(b.id) ?? -999) > room.minute - 20) continue;
      // Nhân viên đang trong ca thì khách có người bán, không réo chủ.
      if (await this.staff.onDuty(b.id, room.minute)) continue;
      const rand = seededRandom("callout", b.id, room.day, room.minute);
      if (rand() > 0.6) continue;
      room.calloutAt.set(b.id, room.minute);
      const lot = content.lot(b.lotId ?? "");
      this.broadcast.say(room.id, {
        who: `lot:${lot.id}`,
        text: lines[Math.floor(rand() * lines.length)] ?? "Có ai bán không?",
      });
      this.broadcast.notify(b.ownerId, {
        kind: "warn",
        text: `🔔 Khách đang réo ở quầy ${lot.name} — chạy về bán thôi!`,
      });
    }
  }

  /**
   * Mua đồ ăn ở sạp NPC (UC-B9, B10): sạp phải đang bày (đúng giờ), mình phải đứng gần; tiền đi qua sổ cái.
   * Người bán nói một câu, thân thiết +1.
   */
  async vendorBuy(
    { room, playerId }: IntentContext,
    vendorId: string,
    itemId: string,
    pay?: PayMethod,
  ) {
    const v = content.data.vendors.find((x) => x.id === vendorId);
    const item = v?.items.find((i) => i.id === itemId);
    if (!v || !item) throw new GameError("invalid_payload", "Sạp không bán món này");
    if (room.minute < v.open || room.minute >= v.close)
      throw new GameError("invalid_state", `${v.sign} chưa bày hàng hoặc đã dọn rồi`);
    const pos = room.members.get(playerId)?.pos;
    if (pos && (pos.inside || Math.hypot(pos.x - v.position.x, pos.z - v.position.z) > ORDER_REACH))
      throw new GameError("invalid_state", "Lại gần sạp mới mua được");
    let src: PaySource = "cash";
    await this.prisma.$transaction(async (tx) => {
      src = await this.payment.payOut(
        tx,
        playerId,
        item.price,
        SYSTEM.market,
        "food",
        v.id,
        pay,
        v.cashOnly,
      );
      await addFriendship(tx, playerId, v.id, 1);
      await this.feed(tx, room, playerId, { food: item.food, drink: item.drink });
    });
    this.broadcast.paidBy(playerId, src, item.price);
    void this.broadcast.log(playerId, "vendor_buy", {
      vendorId: v.id,
      itemId: item.id,
      price: item.price,
    });
    const line = v.lines[Math.floor(Math.random() * v.lines.length)] ?? "Cảm ơn con!";
    this.broadcast.say(room.id, { who: `vendor:${v.id}`, text: `${line} (${item.name})` });
  }
}
