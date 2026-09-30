import { type ExecutionContext, Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Request } from "express";
import { clientIp } from "../common/client-ip.js";

/**
 * Giới hạn request REST theo IP thật của người chơi (không phải IP của proxy Next).
 * Socket có bộ giới hạn riêng trong GameGateway nên bỏ qua ở đây.
 */
@Injectable()
export class IpThrottlerGuard extends ThrottlerGuard {
  override canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return Promise.resolve(true);
    return super.canActivate(context);
  }

  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    return clientIp(req as unknown as Request);
  }
}
