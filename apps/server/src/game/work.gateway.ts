import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import { content } from "@xom/content";
import {
  type Ack,
  contractIdSchema,
  crewMixSchema,
  crewViewSchema,
  emptySchema,
  gigPostSchema,
  gigReviewSchema,
  gigShotSchema,
  rideGoSchema,
  rideOfferSchema,
  ridePaySchema,
  SOCKET_OPTIONS,
  type WorkResult,
  workActSchema,
  workStartSchema,
} from "@xom/shared";
import type { GameSocket } from "./game.gateway.js";
import { GameService, type IntentContext } from "./game.service.js";
import { IntentRunner } from "./intent-runner.js";
import { requireAt } from "./place.js";
import { GameError } from "./room.js";

/** Intent nhóm 💼 Việc làm: làm thuê, việc xóm, thuê nhau, xe ôm, phụ hồ. (docs/IA.md §5) */
@WebSocketGateway({ ...SOCKET_OPTIONS, transports: [...SOCKET_OPTIONS.transports] })
export class WorkGateway {
  constructor(
    private readonly runner: IntentRunner,
    private readonly game: GameService,
  ) {}

  private handle: IntentRunner["handle"] = (...a) => this.runner.handle(...a);
  private handleWith: IntentRunner["handleWith"] = (...a) => this.runner.handleWith(...a);

  @SubscribeMessage("work:start")
  workStart(
    @ConnectedSocket() c: GameSocket,
    @MessageBody() body: unknown,
  ): Promise<Ack<WorkResult>> {
    return this.handleWith(c, workStartSchema, body, async (ctx, p) => {
      const place = content.placeForJob(p.jobId);
      if (place)
        requireAt(ctx.room, ctx.playerId, place.id, `Tới ${place.name} mới nhận việc được`);
      await this.game.work.start(ctx.room, ctx.playerId, p.jobId, p.role);
      const job = content.jobById.get(p.jobId);
      const role = job?.roles.find((r) => r.id === p.role);
      await this.game.story.note(ctx.playerId, "first_job", ctx.room.day, {
        job: `${role?.name.toLowerCase() ?? ""} · ${job?.name ?? ""}`,
      });
      return this.workResult(ctx, { ok: true, line: "Vào ca!", pay: 0 });
    });
  }

  @SubscribeMessage("work:act")
  workAct(
    @ConnectedSocket() c: GameSocket,
    @MessageBody() body: unknown,
  ): Promise<Ack<WorkResult>> {
    return this.handleWith(c, workActSchema, body, async (ctx, p) =>
      this.workResult(ctx, await this.game.work.act(ctx.room, ctx.playerId, p)),
    );
  }

  @SubscribeMessage("work:stop")
  workStop(
    @ConnectedSocket() c: GameSocket,
    @MessageBody() body: unknown,
  ): Promise<Ack<WorkResult>> {
    return this.handleWith(c, emptySchema, body, async (ctx) => {
      const payslip = await this.game.work.end(ctx.room, ctx.playerId, "stop");
      if (!payslip) throw new GameError("invalid_state", "Chưa vào ca");
      return this.workResult(ctx, { ok: true, line: "Ra ca!", pay: 0, payslip });
    });
  }

  private async workResult(
    ctx: IntentContext,
    o: { ok: boolean; line: string; pay: number; payslip?: WorkResult["payslip"] },
  ): Promise<WorkResult> {
    return {
      ...o,
      me: await this.game.me(ctx.room, ctx.playerId),
      shift: this.game.work.view(ctx.room, ctx.playerId),
    };
  }

  @SubscribeMessage("ride:view")
  rideView(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, emptySchema, body, (ctx) =>
      this.game.rides.view(ctx.room, ctx.playerId),
    );
  }

  @SubscribeMessage("ride:rent")
  rideRent(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, emptySchema, body, async (ctx) => {
      const r = await this.game.rides.rent(ctx.room, ctx.playerId);
      await this.game.pushMe(ctx.room, ctx.playerId);
      return r;
    });
  }

  @SubscribeMessage("ride:wait")
  rideWait(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, emptySchema, body, (ctx) =>
      this.game.rides.wait(ctx.room, ctx.playerId),
    );
  }

  @SubscribeMessage("ride:offer")
  rideOffer(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, rideOfferSchema, body, (ctx, p) =>
      this.game.rides.offer(ctx.room, ctx.playerId, p.ratio),
    );
  }

  @SubscribeMessage("ride:go")
  rideGo(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, rideGoSchema, body, (ctx, p) =>
      this.game.rides.go(ctx.room, ctx.playerId, p.route),
    );
  }

  @SubscribeMessage("ride:arrive")
  rideArrive(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, emptySchema, body, (ctx) =>
      this.game.rides.arrive(ctx.room, ctx.playerId),
    );
  }

  @SubscribeMessage("ride:pay")
  ridePay(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, ridePaySchema, body, async (ctx, p) => {
      const r = await this.game.rides.pay(ctx.room, ctx.playerId, p.change);
      await this.game.pushMe(ctx.room, ctx.playerId);
      return r;
    });
  }

  @SubscribeMessage("ride:quit")
  rideQuit(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, emptySchema, body, (ctx) =>
      this.game.rides.quit(ctx.room, ctx.playerId),
    );
  }

  @SubscribeMessage("contract:list")
  contractList(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, emptySchema, body, (ctx) =>
      this.game.contracts.board(ctx.room, ctx.playerId),
    );
  }

  @SubscribeMessage("contract:take")
  contractTake(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, contractIdSchema, body, async (ctx, p) => {
      const board = await this.game.contracts.take(ctx.room, ctx.playerId, p.id);
      await this.game.pushMe(ctx.room, ctx.playerId);
      return board;
    });
  }

  @SubscribeMessage("contract:prepare")
  contractPrepare(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, contractIdSchema, body, async (ctx, p) => {
      const board = await this.game.contracts.prepare(ctx.room, ctx.playerId, p.id);
      await this.game.pushMe(ctx.room, ctx.playerId);
      return board;
    });
  }

  @SubscribeMessage("contract:deliver")
  contractDeliver(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, contractIdSchema, body, async (ctx, p) => {
      const board = await this.game.contracts.deliver(ctx.room, ctx.playerId, p.id);
      await this.game.pushMe(ctx.room, ctx.playerId);
      return board;
    });
  }

  @SubscribeMessage("contract:drop")
  contractDrop(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, contractIdSchema, body, async (ctx, p) => {
      const board = await this.game.contracts.drop(ctx.room, ctx.playerId, p.id);
      await this.game.pushMe(ctx.room, ctx.playerId);
      return board;
    });
  }

  @SubscribeMessage("crew:view")
  crewView(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, crewViewSchema, body, (ctx, p) =>
      this.game.projects.crewView(ctx.room, ctx.playerId, p.siteId),
    );
  }

  @SubscribeMessage("crew:mix")
  crewMix(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, crewMixSchema, body, async (ctx, p) => {
      const r = await this.game.projects.mix(ctx.room, ctx.playerId, p.siteId, p);
      if (r.ok) await this.game.pushMe(ctx.room, ctx.playerId);
      return r;
    });
  }

  @SubscribeMessage("gig:list")
  gigList(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, emptySchema, body, (ctx) =>
      this.game.gigs.board(ctx.room, ctx.playerId),
    );
  }

  @SubscribeMessage("gig:post")
  gigPost(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, gigPostSchema, body, async (ctx, p) => {
      const r = await this.game.gigs.post(ctx.room, ctx.playerId, p.reward, p.hours);
      await this.game.pushMe(ctx.room, ctx.playerId);
      return r;
    });
  }

  @SubscribeMessage("gig:cancel")
  gigCancel(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, contractIdSchema, body, async (ctx, p) => {
      const r = await this.game.gigs.cancel(ctx.room, ctx.playerId, p.id);
      await this.game.pushMe(ctx.room, ctx.playerId);
      return r;
    });
  }

  @SubscribeMessage("gig:take")
  gigTake(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, contractIdSchema, body, async (ctx, p) => {
      const r = await this.game.gigs.take(ctx.room, ctx.playerId, p.id);
      await this.game.pushMe(ctx.room, ctx.playerId);
      return r;
    });
  }

  @SubscribeMessage("gig:drop")
  gigDrop(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, contractIdSchema, body, async (ctx, p) => {
      const r = await this.game.gigs.drop(ctx.room, ctx.playerId, p.id);
      await this.game.pushMe(ctx.room, ctx.playerId);
      return r;
    });
  }

  @SubscribeMessage("gig:shoot")
  gigShoot(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, contractIdSchema, body, async (ctx, p) => {
      const r = await this.game.gigs.shoot(ctx.room, ctx.playerId, p.id);
      await this.game.pushMe(ctx.room, ctx.playerId);
      return r;
    });
  }

  @SubscribeMessage("gig:shot")
  gigShot(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, gigShotSchema, body, (ctx, p) =>
      this.game.gigs.shot(ctx.playerId, p.id, p.at),
    );
  }

  @SubscribeMessage("gig:submit")
  gigSubmit(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, contractIdSchema, body, (ctx, p) =>
      this.game.gigs.submit(ctx.room, ctx.playerId, p.id),
    );
  }

  @SubscribeMessage("gig:review")
  gigReview(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, gigReviewSchema, body, async (ctx, p) => {
      const r = await this.game.gigs.review(ctx.room, ctx.playerId, p.id, p.stars);
      await this.game.pushMe(ctx.room, ctx.playerId);
      return r;
    });
  }

  @SubscribeMessage("gig:dispute")
  gigDispute(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handleWith(c, contractIdSchema, body, async (ctx, p) => {
      const r = await this.game.gigs.dispute(ctx.room, ctx.playerId, p.id);
      await this.game.pushMe(ctx.room, ctx.playerId);
      return r;
    });
  }
}
