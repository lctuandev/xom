"use client";

import type { ComponentType } from "react";
import { AtmSheet } from "../ui/AtmSheet";
import { BoardSheet } from "../ui/BoardSheet";
import { EquipmentSheet } from "../ui/EquipmentSheet";
import { FundSheet } from "../ui/FundSheet";
import {
  BadgesSheet,
  FriendsSheet,
  ProfileSheet,
  QuestsSheet,
  RecipeSheet,
  SettingsSheet,
  SkillsSheet,
  StorySheet,
  WalletSheet,
} from "../ui/HubSheets";
import { ContractsSheet, GigsSheet, JobsSheet } from "../ui/JobsSheet";
import { MarketSheet } from "../ui/MarketSheet";
import { RideSheet } from "../ui/RideSheet";
import { ShopSheet } from "../ui/ShopSheet";
import { SiteSheet } from "../ui/SiteSheet";
import { TalkSheet } from "../ui/TalkSheet";
import { FoodSheet, VendorSheet } from "../ui/VendorSheet";
import { NeighborsSheet, TodaySheet } from "../ui/XomSheet";
import { MainMenu } from "./MainMenu";
import type { FeatureId } from "./registry";
import { BooksSheet } from "./shop/Books";
import { LeaseSheet } from "./shop/Lease";
import { LotSheet } from "./shop/Lot";
import { MenuSheet } from "./shop/Menu";
import { PromoSheet } from "./shop/Promo";
import { RegularsSheet } from "./shop/Regulars";
import { ReviewsSheet } from "./shop/Reviews";
import { StaffSheet } from "./shop/Staff";
import { StallSheet } from "./shop/Stall";
import { StockSheet } from "./shop/Stock";
import { LiquidateSheet } from "./trade/Liquidate";

/** id chức năng → sheet (một chức năng một sheet — docs/IA.md §4). Thiếu id nào TypeScript báo ngay. */
export const SHEETS: Record<FeatureId | "menu", ComponentType> = {
  menu: MainMenu,
  stall: StallSheet,
  dishes: MenuSheet,
  stock: StockSheet,
  lot: LotSheet,
  lease: LeaseSheet,
  staff: StaffSheet,
  books: BooksSheet,
  regulars: RegularsSheet,
  reviews: ReviewsSheet,
  promo: PromoSheet,
  recipes: RecipeSheet,
  equipment: EquipmentSheet,
  market: MarketSheet,
  liquidate: LiquidateSheet,
  food: FoodSheet,
  atm: AtmSheet,
  vendor: VendorSheet,
  shop: ShopSheet,
  jobs: JobsSheet,
  contracts: ContractsSheet,
  gigs: GigsSheet,
  ride: RideSheet,
  site: SiteSheet,
  neighbors: NeighborsSheet,
  today: TodaySheet,
  board: BoardSheet,
  fund: FundSheet,
  talk: TalkSheet,
  profile: ProfileSheet,
  wallet: WalletSheet,
  story: StorySheet,
  skills: SkillsSheet,
  badges: BadgesSheet,
  friends: FriendsSheet,
  quests: QuestsSheet,
  settings: SettingsSheet,
};
