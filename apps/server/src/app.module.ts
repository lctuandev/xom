import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module.js";
import { IpThrottlerGuard } from "./auth/throttler.guard.js";
import { EconomyModule } from "./economy/economy.module.js";
import { GameModule } from "./game/game.module.js";
import { HealthController } from "./health/health.controller.js";
import { PrismaModule } from "./prisma/prisma.module.js";

@Module({
  imports: [
    PrismaModule,
    EconomyModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AuthModule,
    GameModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: IpThrottlerGuard }],
})
export class AppModule {}
