import { Injectable, Logger } from "@nestjs/common";
import { type Ack, type MeView } from "@xom/shared";
import type { ZodType } from "zod";
import type { GameSocket } from "./game.gateway.js";
import { GameService, type IntentContext } from "./game.service.js";
import { GameError } from "./room.js";

const MAX_INTENTS_PER_SEC_RUNNER = 20;

/**
 * Khung chung cho mọi intent (docs/IA.md §5): rate limit → validate zod → chạy trong hàng đợi xóm → Ack<T>. Dùng chung
 * cho các gateway theo nhóm (business, trade, work, xom, debug) — mỗi nhóm một file, không còn một gateway 900 dòng.
 */
@Injectable()
export class IntentRunner {
  private readonly logger = new Logger("Intent");

  constructor(private readonly game: GameService) {}

  handle<P>(
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
  async handleWith<P, T>(
    client: GameSocket,
    schema: ZodType<P>,
    body: unknown,
    fn: (ctx: IntentContext, payload: P) => Promise<T>,
  ): Promise<Ack<T>> {
    const data = client.data;
    if (!data?.playerId) return { ok: false, error: "unauthorized" };
    const now = Date.now();
    data.recent = data.recent.filter((t) => now - t < 1000);
    if (data.recent.length >= MAX_INTENTS_PER_SEC_RUNNER)
      return { ok: false, error: "rate_limited" };
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
