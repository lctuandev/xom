import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import {
  type Ack,
  atmAuthSchema,
  atmPinSchema,
  atmSchema,
  buyEquipmentSchema,
  type InspectResult,
  inspectSchema,
  type MakeResult,
  makeOrderSchema,
  marketBuySchema,
  marketSellSchema,
  orderIdSchema,
  payOrderSchema,
  SOCKET_OPTIONS,
  vendorBuySchema,
} from "@xom/shared";
import type { GameSocket } from "./game.gateway.js";
import { GameService } from "./game.service.js";
import { IntentRunner } from "./intent-runner.js";

/** Intent nhóm 🧺 Mua bán: chợ, vựa xe, sạp ăn, ATM, làm món / tính tiền cho khách. (docs/IA.md §5) */
@WebSocketGateway({ ...SOCKET_OPTIONS, transports: [...SOCKET_OPTIONS.transports] })
export class TradeGateway {
  constructor(
    private readonly runner: IntentRunner,
    private readonly game: GameService,
  ) {}

  private handle: IntentRunner["handle"] = (...a) => this.runner.handle(...a);
  private handleWith: IntentRunner["handleWith"] = (...a) => this.runner.handleWith(...a);

  @SubscribeMessage("equipment:buy")
  buyEquipment(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, buyEquipmentSchema, body, (ctx, p) =>
      this.game.market.buyEquipment(ctx, p.equipmentId, p.pay, p.mode),
    );
  }

  @SubscribeMessage("market:buy")
  marketBuy(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, marketBuySchema, body, (ctx, p) =>
      this.game.market.marketBuy(ctx, p.itemId, p.packs, p.pay),
    );
  }

  @SubscribeMessage("market:sell")
  marketSell(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, marketSellSchema, body, (ctx, p) =>
      this.game.market.marketSell(ctx, p.itemId),
    );
  }

  @SubscribeMessage("order:make")
  make(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown): Promise<Ack<MakeResult>> {
    return this.handleWith(c, makeOrderSchema, body, async (ctx, p) => {
      const r = await this.game.orders.make(ctx.room, ctx.playerId, p.orderId, p.build);
      this.game.broadcast.stockChanged(ctx.room);
      return { ...r, me: await this.game.me(ctx.room, ctx.playerId) };
    });
  }

  @SubscribeMessage("order:pay")
  pay(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, payOrderSchema, body, async (ctx, p) => {
      const r = await this.game.orders.pay(ctx.room, ctx.playerId, p.orderId, p.change, p.discount);
      // Thành tựu + "Chuyện của tôi" ngay khoảnh khắc đạt mốc (món đầu tiên, khách thứ 100…), không đợi cuối ngày.
      void this.game.stats.checkAchievements(ctx.playerId, ctx.room.day).catch(() => undefined);
      return r;
    });
  }

  @SubscribeMessage("vendor:buy")
  vendorBuy(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, vendorBuySchema, body, (ctx, p) =>
      this.game.needs.vendorBuy(ctx, p.vendorId, p.itemId, p.pay),
    );
  }

  @SubscribeMessage("order:start")
  startOrder(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, orderIdSchema, body, (ctx, p) =>
      this.game.orders.start(ctx.room, ctx.playerId, p.orderId),
    );
  }

  @SubscribeMessage("order:inspect")
  inspect(
    @ConnectedSocket() c: GameSocket,
    @MessageBody() body: unknown,
  ): Promise<Ack<InspectResult>> {
    return this.handleWith(c, inspectSchema, body, async (ctx, p) =>
      this.game.orders.inspect(ctx.room, ctx.playerId, p.orderId, p.part),
    );
  }

  @SubscribeMessage("order:decline")
  decline(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, orderIdSchema, body, (ctx, p) =>
      this.game.orders.decline(ctx.room, ctx.playerId, p.orderId),
    );
  }

  @SubscribeMessage("atm:use")
  atm(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, atmSchema, body, async (ctx, p) => {
      const receipt = await this.game.bank.useAtm(ctx, p);
      return { me: await this.game.me(ctx.room, ctx.playerId), receipt };
    });
  }

  @SubscribeMessage("atm:auth")
  atmAuth(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, atmAuthSchema, body, (ctx, p) =>
      this.game.bank.atmAuth(ctx, p.atmId, p.pin),
    );
  }

  @SubscribeMessage("atm:pin")
  atmPin(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, atmPinSchema, body, (ctx, p) =>
      this.game.bank.atmSetPin(ctx, p.atmId, p.pin, p.old),
    );
  }
}
