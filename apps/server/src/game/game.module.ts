import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { BankService } from "./bank.js";
import { Broadcast } from "./broadcast.js";
import { BusinessGateway } from "./business.gateway.js";
import { BusinessService } from "./business.js";
import { BusinessRepo } from "./business-repo.js";
import { ContractService } from "./contracts.js";
import { DebugGateway } from "./debug.gateway.js";
import { GameGateway } from "./game.gateway.js";
import { GameService } from "./game.service.js";
import { GigService } from "./gigs.js";
import { IntentRunner } from "./intent-runner.js";
import { MarketService } from "./market.js";
import { NeedsService } from "./needs.js";
import { OrderService } from "./orders.js";
import { PaymentService } from "./payment.js";
import { PlotService } from "./plots.js";
import { ProjectService } from "./projects.js";
import { RegularService } from "./regulars.js";
import { ReviewService } from "./reviews.js";
import { RewardService } from "./rewards.js";
import { RideService } from "./rides.js";
import { ShopService } from "./shop.js";
import { StaffService } from "./staff.js";
import { StatsService } from "./stats.js";
import { StoryService } from "./story.js";
import { TradeGateway } from "./trade.gateway.js";
import { VoiceAiService } from "./voice-ai.js";
import { WorkGateway } from "./work.gateway.js";
import { WorkService } from "./work.js";
import { XomGateway } from "./xom.gateway.js";

@Module({
  imports: [AuthModule],
  providers: [
    BankService,
    Broadcast,
    BusinessRepo,
    BusinessService,
    MarketService,
    NeedsService,
    PaymentService,
    RewardService,
    PlotService,
    GameGateway,
    BusinessGateway,
    TradeGateway,
    WorkGateway,
    XomGateway,
    DebugGateway,
    IntentRunner,
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
