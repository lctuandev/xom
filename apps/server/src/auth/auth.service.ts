import { createHash, randomBytes } from "node:crypto";
import { HttpException, HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";
import { content } from "@xom/content";
import type { AuthResponse, AuthUser, LoginInput, RegisterInput } from "@xom/shared";
import { jwtVerify, SignJWT } from "jose";
import { config } from "../config.js";
import { LedgerService, playerWallet, SYSTEM } from "../economy/ledger.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

export interface AccessClaims {
  userId: string;
  playerId: string;
}

interface Session {
  auth: AuthResponse;
  refreshToken: string;
  expiresAt: Date;
}

const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_MAX_FAILURES = 8;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

@Injectable()
export class AuthService {
  /** Số lần đăng nhập sai gần đây theo username (một server nên giữ trong bộ nhớ là đủ). */
  private readonly failures = new Map<string, number[]>();
  /** Hash giả để so sánh khi username không tồn tại — tránh lộ username qua thời gian phản hồi. */
  private readonly dummyHash = hash("xom-dummy-password");

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async register(input: RegisterInput, userAgent?: string): Promise<Session> {
    const exists = await this.prisma.user.findUnique({ where: { username: input.username } });
    if (exists) {
      throw new HttpException(
        { message: "Tên đăng nhập đã có người dùng", fields: { username: "Đã có người dùng" } },
        HttpStatus.CONFLICT,
      );
    }
    const passwordHash = await hash(input.password);
    const eco = content.economy;
    const user = await this.prisma.$transaction(async (tx) => {
      const room = await tx.room.create({
        data: { code: randomBytes(4).toString("hex"), minute: eco.dayStartMinute },
      });
      const created = await tx.user.create({
        data: {
          username: input.username,
          passwordHash,
          player: { create: { displayName: input.displayName, roomId: room.id } },
        },
        include: { player: true },
      });
      const player = created.player;
      if (!player) throw new Error("Không tạo được player");
      // Vốn khởi nghiệp (content.economy.startingMoney) đi qua sổ cái như mọi khoản tiền khác.
      await this.ledger.transfer(
        tx,
        SYSTEM.bank,
        playerWallet(player.id),
        eco.startingMoney,
        "starting_money",
      );
      await tx.gameEvent.create({ data: { playerId: player.id, type: "register", payload: {} } });
      return created;
    });
    return this.startSession(user.id, userAgent);
  }

  async login(input: LoginInput, ip: string, userAgent?: string): Promise<Session> {
    const key = `${input.username}|${ip}`;
    if (this.recentFailures(key).length >= LOGIN_MAX_FAILURES) {
      throw new HttpException(
        { message: "Sai quá nhiều lần. Thử lại sau 15 phút." },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const user = await this.prisma.user.findUnique({ where: { username: input.username } });
    const ok = await verify(user?.passwordHash ?? (await this.dummyHash), input.password);
    if (!user || !ok) {
      this.failures.set(key, [...this.recentFailures(key), Date.now()]);
      throw new UnauthorizedException({ message: "Sai tên đăng nhập hoặc mật khẩu" });
    }
    this.failures.delete(key);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.startSession(user.id, userAgent);
  }

  /** Đổi refresh token cũ lấy cặp token mới (xoay vòng); token cũ hết hiệu lực ngay. */
  async refresh(refreshToken: string | undefined): Promise<Session> {
    if (!refreshToken) throw new UnauthorizedException({ message: "Chưa đăng nhập" });
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: sha256(refreshToken) },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException({ message: "Phiên đăng nhập đã hết hạn" });
    }
    const next = randomBytes(32).toString("base64url");
    const expiresAt = this.refreshExpiry();
    await this.prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenHash: sha256(next), expiresAt },
    });
    return { auth: await this.issue(session.userId), refreshToken: next, expiresAt };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async verifyAccess(token: string | undefined): Promise<AccessClaims> {
    if (!token) throw new UnauthorizedException({ message: "Chưa đăng nhập" });
    try {
      const { payload } = await jwtVerify(token, config.jwtSecret, { algorithms: ["HS256"] });
      if (typeof payload.sub !== "string" || typeof payload.pid !== "string") throw new Error();
      return { userId: payload.sub, playerId: payload.pid };
    } catch {
      throw new UnauthorizedException({ message: "Phiên đăng nhập đã hết hạn" });
    }
  }

  private async startSession(userId: string, userAgent?: string): Promise<Session> {
    const refreshToken = randomBytes(32).toString("base64url");
    const expiresAt = this.refreshExpiry();
    await this.prisma.session.create({
      data: { userId, refreshTokenHash: sha256(refreshToken), userAgent, expiresAt },
    });
    return { auth: await this.issue(userId), refreshToken, expiresAt };
  }

  private async issue(userId: string): Promise<AuthResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { player: true },
    });
    if (!user.player) throw new Error("Tài khoản chưa có player");
    const authUser: AuthUser = {
      id: user.id,
      username: user.username,
      playerId: user.player.id,
      displayName: user.player.displayName,
    };
    const accessToken = await new SignJWT({ pid: user.player.id })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime(config.accessTokenTtl)
      .sign(config.jwtSecret);
    return { accessToken, user: authUser };
  }

  private refreshExpiry() {
    return new Date(Date.now() + config.refreshTokenDays * 24 * 60 * 60_000);
  }

  private recentFailures(key: string): number[] {
    const cutoff = Date.now() - LOGIN_WINDOW_MS;
    return (this.failures.get(key) ?? []).filter((t) => t > cutoff);
  }
}
