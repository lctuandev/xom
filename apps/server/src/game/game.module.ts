import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { GameGateway } from "./game.gateway.js";
import { GameService } from "./game.service.js";
import { OrderService } from "./orders.js";

@Module({
  imports: [AuthModule],
  providers: [GameGateway, GameService, OrderService],
})
export class GameModule {}
