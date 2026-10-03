import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import {
  attendSchema,
  bizSelectSchema,
  bizUpgradeSchema,
  emptySchema,
  hostEventSchema,
  landBuySchema,
  landSellSchema,
  menuSchema,
  rentPaySchema,
  rentPromiseSchema,
  repairSchema,
  reviewListSchema,
  reviewReplySchema,
  reviewWriteSchema,
  SOCKET_OPTIONS,
  selfSellSchema,
  shopLeaseSchema,
  shopOrderSchema,
  shopRegisterSchema,
  staffFireSchema,
  staffHireSchema,
  stockTransferSchema,
  updateBusinessSchema,
} from "@xom/shared";
import type { GameSocket } from "./game.gateway.js";
import { GameService } from "./game.service.js";
import { IntentRunner } from "./intent-runner.js";

/** Intent nhóm 🏪 Cửa hàng của mình: quầy, thực đơn, thuê nhà & tiền nhà, nhân viên, khách quen, đánh giá, khai trương, gọi món ở quầy hàng xóm. (docs/IA.md §5) */
@WebSocketGateway({ ...SOCKET_OPTIONS, transports: [...SOCKET_OPTIONS.transports] })
export class BusinessGateway {
  constructor(
    private readonly runner: IntentRunner,
    private readonly game: GameService,
  ) {}

  private handle: IntentRunner["handle"] = (...a) => this.runner.handle(...a);
  private handleWith: IntentRunner["handleWith"] = (...a) => this.runner.handleWith(...a);

  @SubscribeMessage("land:buy")
  landBuy(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, landBuySchema, body, (ctx, p) =>
      this.game.plots.buy(ctx, p.lotId, p.pay),
    );
  }

  @SubscribeMessage("land:sell")
  landSell(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, landSellSchema, body, (ctx, p) => this.game.plots.sell(ctx, p.lotId));
  }

  @SubscribeMessage("biz:update")
  updateBusiness(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, updateBusinessSchema, body, (ctx, p) =>
      this.game.biz.updateLot(ctx, p.lotId, p.pay),
    );
  }

  @SubscribeMessage("biz:open")
  open(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, emptySchema, body, (ctx) => this.game.biz.openBusiness(ctx));
  }

  @SubscribeMessage("biz:close")
  close(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, emptySchema, body, (ctx) => this.game.biz.closeBusiness(ctx));
  }

  @SubscribeMessage("biz:repair")
  repair(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, repairSchema, body, (ctx, p) => this.game.biz.repair(ctx, p.pay));
  }

  @SubscribeMessage("biz:attend")
  attend(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, attendSchema, body, (ctx, p) => this.game.biz.attend(ctx, p.on));
  }

  @SubscribeMessage("biz:selfSell")
  selfSell(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, selfSellSchema, body, (ctx, p) => this.game.biz.setSelfSell(ctx, p.on));
  }

  @SubscribeMessage("biz:menu")
  menu(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, menuSchema, body, (ctx, p) =>
      this.game.biz.setMenu(ctx, p.variantId, { on: p.on, price: p.price }),
    );
  }

  @SubscribeMessage("shop:order")
  shopOrder(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, shopOrderSchema, body, (ctx, p) => this.game.shopOrder(ctx, p));
  }

  @SubscribeMessage("regulars:list")
  regularsList(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, emptySchema, body, (ctx) => this.game.regulars.list(ctx.playerId));
  }

  @SubscribeMessage("shop:view")
  shopView(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, emptySchema, body, async (ctx) => {
      const r = await this.game.shops.view(ctx.room, ctx.playerId);
      await this.game.pushMe(ctx.room, ctx.playerId);
      return r;
    });
  }

  @SubscribeMessage("rent:pay")
  rentPay(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, rentPaySchema, body, async (ctx, p) => {
      const r = await this.game.shops.rentPay(ctx.room, ctx.playerId, p.pay);
      await this.game.pushMe(ctx.room, ctx.playerId);
      return r;
    });
  }

  @SubscribeMessage("rent:promise")
  rentPromise(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, rentPromiseSchema, body, (ctx, p) =>
      this.game.shops.rentPromise(ctx.room, ctx.playerId, p.day),
    );
  }

  @SubscribeMessage("shop:unlease")
  shopUnlease(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, emptySchema, body, async (ctx) => {
      const r = await this.game.shops.unlease(ctx.room, ctx.playerId);
      await this.game.pushMe(ctx.room, ctx.playerId);
      return r;
    });
  }

  @SubscribeMessage("shop:train")
  shopTrain(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, emptySchema, body, async (ctx) => {
      const r = await this.game.shops.train(ctx.room, ctx.playerId);
      await this.game.pushMe(ctx.room, ctx.playerId);
      return r;
    });
  }

  @SubscribeMessage("shop:book")
  shopBook(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, emptySchema, body, async (ctx) => {
      const r = await this.game.shops.book(ctx.room, ctx.playerId);
      await this.game.pushMe(ctx.room, ctx.playerId);
      return r;
    });
  }

  @SubscribeMessage("shop:meet")
  shopMeet(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, emptySchema, body, async (ctx) => {
      const r = await this.game.shops.meet(ctx.room, ctx.playerId);
      await this.game.pushMe(ctx.room, ctx.playerId);
      return r;
    });
  }

  @SubscribeMessage("shop:sign")
  shopSign(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, emptySchema, body, async (ctx) => {
      const r = await this.game.shops.sign(ctx.room, ctx.playerId);
      await this.game.pushMe(ctx.room, ctx.playerId);
      return r;
    });
  }

  @SubscribeMessage("shop:lease")
  shopLease(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, shopLeaseSchema, body, async (ctx, p) => {
      const r = await this.game.shops.lease(ctx.room, ctx.playerId, p.lotId);
      await this.game.pushMe(ctx.room, ctx.playerId);
      return r;
    });
  }

  @SubscribeMessage("shop:register")
  shopRegister(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, shopRegisterSchema, body, async (ctx, p) => {
      const r = await this.game.shops.register(ctx.room, ctx.playerId, p.name);
      await this.game.pushMe(ctx.room, ctx.playerId);
      return r;
    });
  }

  @SubscribeMessage("staff:view")
  staffView(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, emptySchema, body, (ctx) => this.game.staff.view(ctx.playerId));
  }

  @SubscribeMessage("staff:hire")
  staffHire(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, staffHireSchema, body, async (ctx, p) => {
      const r = await this.game.staff.hire(ctx.room, ctx.playerId, p.staffId, p.shiftId);
      await this.game.pushMe(ctx.room, ctx.playerId);
      return r;
    });
  }

  @SubscribeMessage("staff:fire")
  staffFire(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, staffFireSchema, body, async (ctx, p) => {
      const r = await this.game.staff.fire(ctx.playerId, p.employeeId);
      await this.game.pushMe(ctx.room, ctx.playerId);
      return r;
    });
  }

  @SubscribeMessage("review:list")
  reviewList(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, reviewListSchema, body, (ctx, p) =>
      this.game.reviewList(ctx, p.businessId),
    );
  }

  @SubscribeMessage("review:write")
  reviewWrite(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, reviewWriteSchema, body, (ctx, p) => this.game.reviewWrite(ctx, p));
  }

  @SubscribeMessage("review:reply")
  reviewReply(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, reviewReplySchema, body, (ctx, p) =>
      this.game.reviewReply(ctx, p.reviewId, p.text),
    );
  }

  @SubscribeMessage("event:host")
  hostEvent(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, hostEventSchema, body, (ctx, p) =>
      this.game.biz.hostEvent(ctx, p.eventId, p.pay),
    );
  }

  @SubscribeMessage("biz:select")
  bizSelect(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, bizSelectSchema, body, (ctx, p) =>
      this.game.biz.select(ctx, p.businessId),
    );
  }

  @SubscribeMessage("stock:transfer")
  stockTransfer(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, stockTransferSchema, body, (ctx, p) =>
      this.game.biz.transferStock(ctx, p),
    );
  }

  @SubscribeMessage("biz:upgrade")
  bizUpgrade(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, bizUpgradeSchema, body, (ctx, p) => this.game.biz.upgrade(ctx, p.pay));
  }
}
