import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import {
  emptySchema,
  fundDonateSchema,
  projectProposeSchema,
  projectVoteSchema,
  SOCKET_OPTIONS,
} from "@xom/shared";
import type { GameSocket } from "./game.gateway.js";
import { GameService } from "./game.service.js";
import { IntentRunner } from "./intent-runner.js";

/** Intent nhóm 🏘️ Xóm: quỹ & công trình chung, bảng xóm, chuyện của tôi. (docs/IA.md §5) */
@WebSocketGateway({ ...SOCKET_OPTIONS, transports: [...SOCKET_OPTIONS.transports] })
export class XomGateway {
  constructor(
    private readonly runner: IntentRunner,
    private readonly game: GameService,
  ) {}

  private handle: IntentRunner["handle"] = (...a) => this.runner.handle(...a);
  private handleWith: IntentRunner["handleWith"] = (...a) => this.runner.handleWith(...a);

  @SubscribeMessage("fund:view")
  fundView(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, emptySchema, body, (ctx) => this.game.fundView(ctx));
  }

  @SubscribeMessage("fund:donate")
  fundDonate(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, fundDonateSchema, body, (ctx, p) =>
      this.game.fundDonate(ctx, p.amount, p.pay),
    );
  }

  @SubscribeMessage("project:propose")
  projectPropose(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, projectProposeSchema, body, (ctx, p) =>
      this.game.projectPropose(ctx, p.projectId),
    );
  }

  @SubscribeMessage("project:vote")
  projectVote(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, projectVoteSchema, body, (ctx, p) =>
      this.game.projectVote(ctx, p.id, p.yes),
    );
  }

  @SubscribeMessage("xom:list")
  xomList(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, emptySchema, body, (ctx) => this.game.xomList(ctx));
  }

  @SubscribeMessage("stats:xom")
  statsXom(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, emptySchema, body, (ctx) => this.game.statsXom(ctx));
  }

  @SubscribeMessage("story:list")
  storyList(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, emptySchema, body, (ctx) => this.game.storyList(ctx));
  }

  @SubscribeMessage("stats:me")
  statsMe(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, emptySchema, body, (ctx) => this.game.statsMe(ctx));
  }
}
