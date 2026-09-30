import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  type AuthResponse,
  type LoginInput,
  loginSchema,
  type RegisterInput,
  registerSchema,
} from "@xom/shared";
import type { Request, Response } from "express";
import { clientIp } from "../common/client-ip.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { config } from "../config.js";
import { type AuthedRequest, AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";

const COOKIE_PATH = "/api/auth";

@Controller("auth")
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  async register(
    @Body(new ZodPipe(registerSchema)) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const session = await this.auth.register(body, req.headers["user-agent"]);
    setRefreshCookie(req, res, session.refreshToken, session.expiresAt);
    return session.auth;
  }

  @Post("login")
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const session = await this.auth.login(body, clientIp(req), req.headers["user-agent"]);
    setRefreshCookie(req, res, session.refreshToken, session.expiresAt);
    return session.auth;
  }

  @Post("refresh")
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    try {
      const session = await this.auth.refresh(req.cookies?.[config.refreshCookie]);
      setRefreshCookie(req, res, session.refreshToken, session.expiresAt);
      return session.auth;
    } catch (err) {
      res.clearCookie(config.refreshCookie, { path: COOKIE_PATH });
      throw err;
    }
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[config.refreshCookie]);
    res.clearCookie(config.refreshCookie, { path: COOKIE_PATH });
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@Req() req: AuthedRequest) {
    return req.auth;
  }
}

/**
 * Cookie refresh chỉ gửi kèm /api/auth. `Secure` bật khi request đến qua HTTPS (Cloudflare) —
 * truy cập http://<ip-LAN>:5555 mà đặt Secure thì trình duyệt sẽ không lưu cookie.
 */
function setRefreshCookie(req: Request, res: Response, token: string, expires: Date) {
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.cookie(config.refreshCookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: COOKIE_PATH,
    expires,
  });
}
