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
  type ClientToServerEvents,
  chatTextSchema,
  joinRoomSchema,
  type MeView,
  moveSchema,
  type PongPayload,
  pingSchema,
  type ServerToClientEvents,
  SOCKET_OPTIONS,
  saySchema,
  type TalkResult,
  talkSchema,
  tutorialSchema,
} from "@xom/shared";
import type { Server, Socket } from "socket.io";
import { AuthService } from "../auth/auth.service.js";
import { GameService } from "./game.service.js";
import { IntentRunner } from "./intent-runner.js";
import { GameError } from "./room.js";

export interface SocketData {
  playerId: string;
  /** Mốc thời gian các intent gần đây, để chặn spam. */
  recent: number[];
  /** Lần báo vị trí gần nhất (ms) — tối đa ~15 lần/giây. */
  lastMove: number;
}
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, never, SocketData>;
type GameServer = Server<ClientToServerEvents, ServerToClientEvents, never, SocketData>;

const _MAX_INTENTS_PER_SEC = 20;
const playerChannel = (playerId: string) => `player:${playerId}`;

@WebSocketGateway({ ...SOCKET_OPTIONS, transports: [...SOCKET_OPTIONS.transports] })
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GameGateway.name);
  @WebSocketServer() private server!: GameServer;

  constructor(
    private readonly auth: AuthService,
    private readonly game: GameService,
    private readonly runner: IntentRunner,
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
      charged: (playerId) => void this.game.emitMe(playerId),
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
          socket.data = { playerId, recent: [], lastMove: 0 };
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

  @SubscribeMessage("npc:talk")
  talk(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown): Promise<Ack<TalkResult>> {
    return this.handleWith(c, talkSchema, body, (ctx, p) => this.game.talk(ctx, p.npcId, p.topic));
  }

  @SubscribeMessage("chat:text")
  chatText(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, chatTextSchema, body, (ctx, p) => this.game.chatText(ctx, p.text));
  }

  @SubscribeMessage("chat:say")
  say(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, saySchema, body, (ctx, p) => this.game.say(ctx, p.phraseId));
  }

  /** Vị trí người chơi (không Ack): sai định dạng hay gửi quá dày thì bỏ qua lặng lẽ. */
  @SubscribeMessage("move")
  move(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    const data = c.data;
    if (!data?.playerId) return;
    const now = Date.now();
    if (now - data.lastMove < 60) return;
    const parsed = moveSchema.safeParse(body);
    if (!parsed.success) return;
    data.lastMove = now;
    this.game.move(data.playerId, parsed.data);
  }

  /**
   * Vào xóm của bạn bằng mã (UC-J1). Không chạy trong hàng đợi của một xóm vì đụng tới hai xóm:
   * service tự tuần tự hóa; xong thì chuyển mọi socket của người chơi sang kênh xóm mới và gửi snapshot.
   */
  @SubscribeMessage("xom:join")
  async joinRoom(
    @ConnectedSocket() c: GameSocket,
    @MessageBody() body: unknown,
  ): Promise<Ack<MeView>> {
    const playerId = c.data?.playerId;
    if (!playerId) return { ok: false, error: "unauthorized" };
    const parsed = joinRoomSchema.safeParse(body ?? {});
    if (!parsed.success)
      return { ok: false, error: "invalid_payload", message: parsed.error.issues[0]?.message };
    try {
      const { from } = await this.game.switchRoom(playerId, parsed.data.code);
      const sockets = await this.server.in(playerChannel(playerId)).fetchSockets();
      let me: MeView | null = null;
      for (const s of sockets) {
        s.leave(`room:${from}`);
        const { roomId, snapshot } = await this.game.join(playerId, s.id);
        s.join(`room:${roomId}`);
        s.emit("snapshot", snapshot);
        me = snapshot.me;
      }
      if (!me) return { ok: false, error: "internal", message: "Mất kết nối" };
      return { ok: true, data: me };
    } catch (err) {
      if (err instanceof GameError) return { ok: false, error: err.code, message: err.message };
      this.logger.error("chuyển xóm lỗi", err as Error);
      return { ok: false, error: "internal", message: "Có lỗi, thử lại sau" };
    }
  }

  @SubscribeMessage("tutorial:set")
  tutorial(@ConnectedSocket() c: GameSocket, @MessageBody() body: unknown) {
    return this.handle(c, tutorialSchema, body, (ctx, p) => this.game.setTutorial(ctx, p.step));
  }

  /** Intent trả về MeView mới. */

  private handle: IntentRunner["handle"] = (...a) => this.runner.handle(...a);
  private handleWith: IntentRunner["handleWith"] = (...a) => this.runner.handleWith(...a);
}
