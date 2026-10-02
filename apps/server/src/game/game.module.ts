import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ContractService } from "./contracts.js";
import { GameGateway } from "./game.gateway.js";
import { GameService } from "./game.service.js";
import { GigService } from "./gigs.js";
import { OrderService } from "./orders.js";
import { ProjectService } from "./projects.js";
import { RegularService } from "./regulars.js";
import { ReviewService } from "./reviews.js";
import { RideService } from "./rides.js";
import { ShopService } from "./shop.js";
import { StaffService } from "./staff.js";
import { StatsService } from "./stats.js";
import { StoryService } from "./story.js";
import { VoiceAiService } from "./voice-ai.js";
import { WorkService } from "./work.js";

@Module({
  imports: [AuthModule],
  providers: [
    GameGateway,
    GameService,
    OrderService,
    ReviewService,
    StatsService,
    StoryService,
    RegularService,
    StaffService,
    ContractService,
    GigService,
    RideService,
    ShopService,
    ProjectService,
    VoiceAiService,
    WorkService,
  ],
})
export class GameModule {}
