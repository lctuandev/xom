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
  buyEquipmentSchema,
  type ClientToServerEvents,
  emptySchema,
  type MeView,
  marketBuySchema,
  type PongPayload,
  pingSchema,
  type ServerToClientEvents,
  SOCKET_OPTIONS,
  startJobSchema,
  updateBusinessSchema,
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

const MAX_INTENTS_PER_SEC = 10;
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
      this.game.marketBuy(ctx, p.productId, p.qty),
    );
  }

  @SubscribeMessage("biz:update")
  updateBusiness(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, updateBusinessSchema, body, (ctx, p) => this.game.updateBusiness(ctx, p));
  }

  @SubscribeMessage("biz:open")
  open(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, emptySchema, body, (ctx) => this.game.openBusiness(ctx));
  }

  @SubscribeMessage("biz:close")
  close(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, emptySchema, body, (ctx) => this.game.closeBusiness(ctx));
  }

  @SubscribeMessage("job:start")
  startJob(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, startJobSchema, body, (ctx, p) => this.game.startJob(ctx, p.jobId));
  }

  @SubscribeMessage("job:stop")
  stopJob(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, emptySchema, body, (ctx) => this.game.stopJob(ctx));
  }

  /** Khung chung cho intent: rate limit → validate zod → chạy trong hàng đợi xóm → Ack<MeView>. */
  private async handle<P>(
    client: GameSocket,
    schema: ZodType<P>,
    body: unknown,
    fn: (ctx: IntentContext, payload: P) => Promise<void>,
  ): Promise<Ack<MeView>> {
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
      const me = await this.game.intent(data.playerId, (ctx) => fn(ctx, parsed.data));
      return { ok: true, data: me };
    } catch (err) {
      if (err instanceof GameError) return { ok: false, error: err.code, message: err.message };
      this.logger.error("intent lỗi", err as Error);
      return { ok: false, error: "internal", message: "Có lỗi, thử lại sau" };
    }
  }
}
