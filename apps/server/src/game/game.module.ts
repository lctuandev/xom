import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { GameGateway } from "./game.gateway.js";
import { GameService } from "./game.service.js";
import { OrderService } from "./orders.js";
import { ReviewService } from "./reviews.js";
import { WorkService } from "./work.js";

@Module({
  imports: [AuthModule],
  providers: [GameGateway, GameService, OrderService, ReviewService, WorkService],
})
export class GameModule {}
