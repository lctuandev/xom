import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import {
  debugAwaySchema,
  debugClockSchema,
  debugContractSchema,
  debugGrantSchema,
  debugRegularsSchema,
  debugWeatherSchema,
  SOCKET_OPTIONS,
  shopLeaseSchema,
} from "@xom/shared";
import type { GameSocket } from "./game.gateway.js";
import { GameService } from "./game.service.js";
import { IntentRunner } from "./intent-runner.js";
import { GameError } from "./room.js";

/** Intent nhóm 🧪 Lệnh thử nghiệm (chỉ bản dev). (docs/IA.md §5) */
@WebSocketGateway({ ...SOCKET_OPTIONS, transports: [...SOCKET_OPTIONS.transports] })
export class DebugGateway {
  constructor(
    private readonly runner: IntentRunner,
    private readonly game: GameService,
  ) {}

  private handle: IntentRunner["handle"] = (...a) => this.runner.handle(...a);
  private handleWith: IntentRunner["handleWith"] = (...a) => this.runner.handleWith(...a);

  @SubscribeMessage("debug:shop")
  debugShop(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, shopLeaseSchema, body, async (ctx, p) => {
      if (process.env.NODE_ENV === "production")
        throw new GameError("invalid_state", "Không có lệnh này");
      await this.game.shops.debugReady(ctx.room, ctx.playerId, p.lotId);
    });
  }

  @SubscribeMessage("debug:contract")
  debugContract(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, debugContractSchema, body, async (ctx, p) => {
      if (process.env.NODE_ENV === "production")
        throw new GameError("invalid_state", "Không có lệnh này");
      await this.game.contracts.debugPost(ctx.room, p.templateId);
    });
  }

  @SubscribeMessage("debug:regulars")
  debugRegulars(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, debugRegularsSchema, body, async (ctx, p) => {
      if (process.env.NODE_ENV === "production")
        throw new GameError("invalid_state", "Không có lệnh này");
      await this.game.regulars.debugSet(ctx.playerId, p.visits);
    });
  }

  @SubscribeMessage("debug:away")
  debugAway(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, debugAwaySchema, body, (ctx, p) =>
      this.game.debugAwaySet(ctx, p.minutes, p.days),
    );
  }

  @SubscribeMessage("debug:clock")
  debugClock(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, debugClockSchema, body, (ctx, p) =>
      this.game.debugClock(ctx, p.minute, p.day),
    );
  }

  @SubscribeMessage("debug:grant")
  debugGrant(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, debugGrantSchema, body, (ctx, p) => this.game.debugGrant(ctx, p));
  }

  @SubscribeMessage("debug:weather")
  debugWeather(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, debugWeatherSchema, body, (ctx, p) => this.game.debugWeather(ctx, p));
  }
}
