import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { type AccessClaims, AuthService } from "./auth.service.js";

export type AuthedRequest = Request & { auth: AccessClaims };

/** Guard REST: yêu cầu header `Authorization: Bearer <access token>`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    req.auth = await this.auth.verifyAccess(token);
    return true;
  }
}
