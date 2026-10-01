import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { GameGateway } from "./game.gateway.js";
import { GameService } from "./game.service.js";
import { OrderService } from "./orders.js";
import { ProjectService } from "./projects.js";
import { ReviewService } from "./reviews.js";
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
    ProjectService,
    VoiceAiService,
    WorkService,
  ],
})
export class GameModule {}
