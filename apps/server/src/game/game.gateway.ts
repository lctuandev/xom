import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import {
  type Ack,
  attendSchema,
  buyEquipmentSchema,
  type ClientToServerEvents,
  emptySchema,
  type MakeResult,
  type MeView,
  makeOrderSchema,
  marketBuySchema,
  menuSchema,
  orderIdSchema,
  type PongPayload,
  payOrderSchema,
  pingSchema,
  type ServerToClientEvents,
  SOCKET_OPTIONS,
  saySchema,
  type TalkResult,
  talkSchema,
  tutorialSchema,
  updateBusinessSchema,
  type WorkResult,
  workActSchema,
  workStartSchema,
} from "@xom/shared";
import type { Server, Socket } from "socket.io";
import type { ZodType } from "zod";
import { AuthService } from "../auth/auth.service.js";
import { GameService, type IntentContext } from "./game.service.js";
import { GameError } from "./room.js";

interface SocketData {
  playerId: string;
  /** Mốc thời gian các intent gần đây, để chặn spam. */
  recent: number[];
}
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, never, SocketData>;
type GameServer = Server<ClientToServerEvents, ServerToClientEvents, never, SocketData>;

const MAX_INTENTS_PER_SEC = 20;
const playerChannel = (playerId: string) => `player:${playerId}`;

@WebSocketGateway({ ...SOCKET_OPTIONS, transports: [...SOCKET_OPTIONS.transports] })
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GameGateway.name);
  @WebSocketServer() private server!: GameServer;

  constructor(
    private readonly auth: AuthService,
    private readonly game: GameService,
  ) {}

  afterInit() {
    this.game.work.setEmitter({
      shift: (playerId, v) => this.server.to(playerChannel(playerId)).emit("shift", v),
      payslip: (playerId, p) => this.server.to(playerChannel(playerId)).emit("payslip", p),
      say: (roomId, who, text) => this.server.to(`room:${roomId}`).emit("say", { who, text }),
    });
    this.game.orders.setEmitter({
      order: (roomId, e) => this.server.to(`room:${roomId}`).emit("order", e),
      update: (roomId, e) => this.server.to(`room:${roomId}`).emit("orderUpdate", e),
      result: (roomId, e) => this.server.to(`room:${roomId}`).emit("orderResult", e),
    });
    this.game.setEmitter({
      toRoom: (roomId: string, event: string, data: unknown) =>
        this.server.to(`room:${roomId}`).emit(event as "clock", data as never),
      toPlayer: (playerId: string, event: string, data: unknown) =>
        this.server.to(playerChannel(playerId)).emit(event as "me", data as never),
    });
    // Xác thực trong middleware: token sai → client nhận connect_error("unauthorized") và tự refresh.
    this.server.use((socket, next) => {
      const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
      this.auth.verifyAccess(token).then(
        ({ playerId }) => {
          socket.data = { playerId, recent: [] };
          next();
        },
        () => next(new Error("unauthorized")),
      );
    });
  }

  async handleConnection(client: GameSocket) {
    try {
      const { playerId } = client.data;
      const { roomId, snapshot } = await this.game.join(playerId, client.id);
      await client.join([`room:${roomId}`, playerChannel(playerId)]);
      client.emit("snapshot", snapshot);
    } catch (err) {
      this.logger.error(`không vào được xóm ${client.id}`, err as Error);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: GameSocket) {
    if (client.data?.playerId) this.game.leave(client.data.playerId, client.id);
  }

  /** Echo để đo độ trễ. */
  @SubscribeMessage("ping")
  ping(@MessageBody() body: unknown): Ack<PongPayload> {
    const parsed = pingSchema.safeParse(body);
    if (!parsed.success) return { ok: false, error: "invalid_payload" };
    return { ok: true, data: { clientTime: parsed.data.clientTime, serverTime: Date.now() } };
  }

  @SubscribeMessage("equipment:buy")
  buyEquipment(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, buyEquipmentSchema, body, (ctx, p) =>
      this.game.buyEquipment(ctx, p.equipmentId),
    );
  }

  @SubscribeMessage("market:buy")
  marketBuy(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, marketBuySchema, body, (ctx, p) =>
      this.game.marketBuy(ctx, p.itemId, p.packs),
    );
  }

  @SubscribeMessage("biz:update")
  updateBusiness(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, updateBusinessSchema, body, (ctx, p) =>
      this.game.updateLot(ctx, p.lotId),
    );
  }

  @SubscribeMessage("biz:open")
  open(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, emptySchema, body, (ctx) => this.game.openBusiness(ctx));
  }

  @SubscribeMessage("biz:close")
  close(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, emptySchema, body, (ctx) => this.game.closeBusiness(ctx));
  }

  @SubscribeMessage("work:start")
  workStart(
    @ConnectedSocket() c: GameSocket,
    @MessageBody() body: unknown,
  ): Promise<Ack<WorkResult>> {
    return this.handleWith(c, workStartSchema, body, async (ctx, p) => {
      await this.game.work.start(ctx.room, ctx.playerId, p.jobId, p.role);
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

  @SubscribeMessage("biz:attend")
  attend(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, attendSchema, body, (ctx, p) => this.game.attend(ctx, p.on));
  }

  @SubscribeMessage("biz:menu")
  menu(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, menuSchema, body, (ctx, p) =>
      this.game.setMenu(ctx, p.variantId, { on: p.on, price: p.price }),
    );
  }

  @SubscribeMessage("order:make")
  make(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown): Promise<Ack<MakeResult>> {
    return this.handleWith(c, makeOrderSchema, body, async (ctx, p) => {
      const r = await this.game.orders.make(ctx.room, ctx.playerId, p.orderId, p.build);
      return { ...r, me: await this.game.me(ctx.room, ctx.playerId) };
    });
  }

  @SubscribeMessage("order:pay")
  pay(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, payOrderSchema, body, (ctx, p) =>
      this.game.orders.pay(ctx.room, ctx.playerId, p.orderId, p.change, p.discount),
    );
  }

  @SubscribeMessage("order:decline")
  decline(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, orderIdSchema, body, (ctx, p) =>
      this.game.orders.decline(ctx.room, ctx.playerId, p.orderId),
    );
  }

  @SubscribeMessage("npc:talk")
  talk(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown): Promise<Ack<TalkResult>> {
    return this.handleWith(c, talkSchema, body, (ctx, p) => this.game.talk(ctx, p.npcId, p.topic));
  }

  @SubscribeMessage("chat:say")
  say(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, saySchema, body, (ctx, p) => this.game.say(ctx, p.phraseId));
  }

  @SubscribeMessage("tutorial:set")
  tutorial(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, tutorialSchema, body, (ctx, p) => this.game.setTutorial(ctx, p.step));
  }

  /** Intent trả về MeView mới. */
  private handle<P>(
    client: GameSocket,
    schema: ZodType<P>,
    body: unknown,
    fn: (ctx: IntentContext, payload: P) => Promise<void>,
  ): Promise<Ack<MeView>> {
    return this.handleWith(client, schema, body, async (ctx, p) => {
      await fn(ctx, p);
      return this.game.me(ctx.room, ctx.playerId);
    });
  }

  /** Khung chung cho intent: rate limit → validate zod → chạy trong hàng đợi xóm → Ack<T>. */
  private async handleWith<P, T>(
    client: GameSocket,
    schema: ZodType<P>,
    body: unknown,
    fn: (ctx: IntentContext, payload: P) => Promise<T>,
  ): Promise<Ack<T>> {
    const data = client.data;
    if (!data?.playerId) return { ok: false, error: "unauthorized" };
    const now = Date.now();
    data.recent = data.recent.filter((t) => now - t < 1000);
    if (data.recent.length >= MAX_INTENTS_PER_SEC) return { ok: false, error: "rate_limited" };
    data.recent.push(now);

    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success) {
      return { ok: false, error: "invalid_payload", message: parsed.error.issues[0]?.message };
    }
    try {
      return {
        ok: true,
        data: await this.game.intentWith(data.playerId, (ctx) => fn(ctx, parsed.data)),
      };
    } catch (err) {
      if (err instanceof GameError) return { ok: false, error: err.code, message: err.message };
      this.logger.error("intent lỗi", err as Error);
      return { ok: false, error: "internal", message: "Có lỗi, thử lại sau" };
    }
  }
}
