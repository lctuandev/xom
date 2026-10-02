import { z } from "zod";

// View (server → client) và intent (client → server) của vòng chơi (docs/PLAN.md §3.9).

/** Kiểu trời (khớp content.weather.kinds). */
export type WeatherIdView = "sunny" | "cloudy" | "rain" | "storm";

export interface WeatherView {
  now: WeatherIdView;
  /** Trời sắp đổi (trong khoảng dự báo) — để báo trước "chiều nay có mưa". */
  next: { kind: WeatherIdView; at: number } | null;
}

export interface ClockView {
  day: number;
  /** Phút trong ngày (game). */
  minute: number;
  weather: WeatherView;
}

export interface MenuItemView {
  variantId: string;
  /** Đang bán món này hay không. */
  on: boolean;
  price: number;
}

export interface BusinessView {
  id: string;
  equipmentId: string;
  productId: string;
  lotId: string | null;
  menu: MenuItemView[];
  open: boolean;
  reputation: number;
  /** Đã trả tiền thuê chỗ hiện tại cho hôm nay chưa (mở lại trong ngày không mất thêm). */
  rentPaidToday: boolean;
  /** Nhân viên đang thuê (KIENTRUC §2): ai, ca mấy giờ, bây giờ có đang trong ca không. */
  staff?: {
    name: string;
    shift: string;
    from: number;
    to: number;
    onDuty: boolean;
    /** Nhân viên đang đứng bán (trong ca, chủ không giành bán). */
    selling: boolean;
    /** Model nhân vật (vẽ nhân viên đứng quầy trong tiệm). */
    model: string;
  } | null;
  /** Chủ đứng quầy tự bán thay nhân viên (khi nhân viên đang trong ca). */
  selfSell?: boolean;
  /** Ngày gần nhất tổ chức khai trương (tính thời gian chờ). */
  promoDay: number | null;
  /** Độ mòn xe/quầy 0–1 (sửa ở vựa xe). */
  wear: number;
  /** Nhà mặt tiền đang thuê theo hợp đồng (UC-F12) — tiền nhà tính mỗi ngày dù mở hay đóng. */
  leaseLotId?: string | null;
}

export interface InventoryView {
  itemId: string;
  qty: number;
  /** Số phần sẽ hỏng cuối ngày hôm nay. */
  expiring: number;
}

/** Số liệu trong ngày hiện tại, reset khi sang ngày mới. */
export interface TodayView {
  sold: number;
  revenue: number;
  /** Tiền boa khi phục vụ kịp. */
  tips: number;
  lost: number;
  stockCost: number;
  wages: number;
  fees: number;
}

export interface MeView {
  playerId: string;
  displayName: string;
  /** 💵 Tiền mặt (hiện trên HUD). */
  money: number;
  /** 🏦 Số dư tài khoản ngân hàng (xem trong Hồ sơ / ATM). */
  bank: number;
  /** 🤝 Điểm tin cậy 0–100 (bảng việc xóm, KIENTRUC §3) — không phải tiền. */
  trust: number;
  /** Thẻ ATM: đã tạo PIN chưa, có đang bị máy giữ thẻ không. */
  atm: { hasPin: boolean; locked: boolean };
  /** 🍚 No / 💧 khát (0–100, UC-B11). */
  needs: { food: number; drink: number };
  jobId: string | null;
  /** Bước kịch bản người mới hiện tại. */
  tutorial: string;
  /** Chủ đang đứng ở quầy (quầy chỉ bán khi có chủ). */
  attending: boolean;
  business: BusinessView | null;
  inventory: InventoryView[];
  /** Độ thân thiết với NPC (id địa điểm → 0–100). */
  friendship: Record<string, number>;
  today: TodayView;
  /** Tiến trình (DESIGN §4): cấp độ từ KN, danh tiếng từ số khách đã phục vụ + uy tín. */
  progress: {
    xp: number;
    level: number;
    into: number;
    need: number;
    fame: "unknown" | "local" | "popular" | "famous";
    served: number;
    /** Điểm kỹ năng (bậc suy ra từ content.skills). */
    skills: Partial<Record<"tay_nhanh" | "nho_mon" | "an_noi", number>>;
  };
}

export interface LotOccupant {
  lotId: string;
  businessId: string;
  ownerId: string;
  ownerName: string;
  /** Tên quán trên biển hiệu (đã đăng ký + làm biển, UC-F12). */
  shopName?: string | null;
  /** Thực đơn đang bày (hàng xóm xem để gọi món, UC-J3). */
  menu: MenuItemView[];
  /** Món làm được ngay (đang bật và đủ nguyên liệu lúc cập nhật gần nhất). */
  available: string[];
  equipmentId: string;
  productId: string;
  open: boolean;
}

export interface WorldView {
  lots: LotOccupant[];
  /** 🏗️ Công trường đang thi công (UC-J6). */
  sites?: SiteView[];
}

/** Công trường của một công trình đang thi công (UC-J6). */
export interface SiteView {
  /** Id dòng công trình của xóm. */
  id: string;
  projectId: string;
  x: number;
  z: number;
  /** Mẻ vữa đã trộn đúng / cần để xong sớm. */
  mixes: number;
  need: number;
  /** Tiền công còn lại trong khoản nhân công. */
  budget: number;
}

/** Bảng phụ hồ: lệnh trộn của Cai thầu cho mình. */
export interface CrewView {
  site: SiteView;
  order: { mixId: string; bags: number };
  /** Phút game được trộn mẻ tiếp (đang chờ mẻ trước). */
  readyAt: number | null;
  today: { mixes: number; earned: number };
}

export interface MixResultView {
  ok: boolean;
  /** Lời Cai thầu khi trộn sai. */
  problems: string[];
  pay: number;
  view: CrewView;
}

/** Một sự kiện đang/sắp diễn ra trong xóm (DESIGN §9). */
export interface EventView {
  key: string;
  /** Id sự kiện trong content.events. */
  eventId: string;
  /** Phút game bắt đầu / kết thúc (trong ngày hiện tại). */
  from: number;
  to: number;
  /** Sự kiện của người chơi (khai trương): ai tổ chức, ở quầy nào. */
  ownerId?: string;
  ownerName?: string;
  businessId?: string;
  lotId?: string;
}

/** "Trong lúc bạn vắng…" (docs/THEGIOI.md §4): chuyện thật đã xảy ra ở xóm khi mình offline — không có tiền tự sinh. */
export interface AwayView {
  /** Vắng bao lâu (phút thật). */
  minutes: number;
  /** Số ngày game xóm đã qua (hàng xóm vẫn chơi thì xóm vẫn chạy). */
  days: number;
  reviews: {
    count: number;
    avg: number;
    latest: { name: string; stars: number; text: string } | null;
  };
  /** Người mới dọn về xóm. */
  newNeighbors: string[];
  /** Quầy hàng xóm đang mở lúc mình vào lại. */
  stalls: { name: string; productId: string }[];
  projects: { done: string[]; voting: string[] };
  /** Giá chợ đổi (nguyên liệu nghề mình), khi đã sang ngày khác. */
  prices: { itemId: string; change: number }[];
  /** Nhân viên bán thay trong lúc vắng (KIENTRUC §2) — có người làm thật, có trả lương. */
  staff: { name: string; served: number; wrong: number; revenue: number; wages: number } | null;
}

export interface Snapshot {
  me: MeView;
  clock: ClockView;
  world: WorldView;
  /** Khách đang chờ ở quầy của mình (vào lại game không mất khách). */
  orders: OrderEvent[];
  /** Ca làm thuê đang diễn ra (vào lại game vẫn tiếp tục ca). */
  shift: ShiftView | null;
  /** Ai đang ở trong xóm (Phase 2). */
  roster: RosterView;
  /** Sự kiện hôm nay (đang diễn ra hoặc đã báo trước). */
  events: EventView[];
  /** Vào lại sau một lúc vắng: chuyện đã xảy ra ở xóm (chỉ có trong snapshot lúc vào). */
  away?: AwayView;
}

// ───────── Xóm chung (Phase 2, docs/USECASES.md nhóm J) ─────────

/** Vị trí một người chơi khác, gửi 10 lần/giây khi có thay đổi. */
export interface PeerPos {
  id: string;
  x: number;
  z: number;
  yaw: number;
  moving: boolean;
}

/** Người đang online trong xóm; `inside`: đang ở trong quán/bưu cục nào (ẩn khỏi phố). */
export interface PeerView extends PeerPos {
  name: string;
  inside: string | null;
}

export interface RosterView {
  /** Mã xóm để mời bạn. */
  code: string;
  max: number;
  peers: PeerView[];
}

/** Món: stepId → lựa chọn (single: id, multi: danh sách id, action/hold: true). */
export type DishSelection = string | string[] | true;
export type DishView = Record<string, DishSelection>;

export type PaymentView = { kind: "transfer" } | { kind: "cash"; bill: number };

/** Khách tới quầy gọi món (docs/USECASES.md UC-F3). */
export interface OrderEvent {
  orderId: string;
  businessId: string;
  ownerId: string;
  lotId: string;
  productId: string;
  variantId: string;
  archetype: string;
  /** Câu khách nói: "Cho con ổ bánh mì xíu mại, không hành nha!" */
  ask: string;
  /** Tên món + yêu cầu: "bánh mì xíu mại, không hành". */
  dish: string;
  /** Món khách muốn, để đối chiếu khi làm. */
  spec: DishView;
  price: number;
  pay: PaymentView;
  createdAt: number;
  /** Hết kiên nhẫn lúc này (ms epoch, giờ server). */
  expiresAt: number;
  /** Khách là người chơi thật (UC-J3): trả bằng chuyển khoản từ ví của họ. */
  buyerId?: string;
  buyerName?: string;
  /** Khách VIP (sự kiện cá nhân): dặn kỹ, ít kiên nhẫn, boa đậm. */
  vip?: boolean;
  /** Cư dân có tên (khách quen, KIENTRUC §1); khách vãng lai thì không có. */
  residentId?: string;
  residentName?: string;
  /** Đã mua ở quầy này bao nhiêu lần (trước lần này) và có phải khách quen ❤️. */
  visits?: number;
  regular?: boolean;
  /** Giá đã giảm do quầy đang khai trương. */
  promo?: boolean;
}

/** Món vừa làm xong: đúng hay sai (khách phàn nàn). */
export interface OrderUpdateEvent {
  orderId: string;
  /** making = chủ quầy bắt tay làm món (khách chờ thêm). */
  stage: "making" | "correct" | "wrong";
  line: string;
  mistakes: string[];
  /** Hạn chờ mới (khách đợi tính tiền). */
  expiresAt: number;
}

export type ChangeOutcomeView = "exact" | "short" | "over_returned" | "over_kept" | "transfer";

/** Kết quả một đơn: đã tính tiền (có thể có boa) hoặc khách bỏ đi. */
export interface OrderResultEvent {
  orderId: string;
  served: boolean;
  tip: number;
  line: string;
  outcome?: ChangeOutcomeView;
  received?: number;
}

/** Kết quả kiểm tra một bộ phận (UC-G3). */
export interface InspectResult {
  part: string;
  finding: string;
  /** Hạn chờ mới của khách (kiểm tra quá nhiều thì khách sốt ruột). */
  expiresAt: number;
}

export interface MakeResult {
  me: MeView;
  correct: boolean;
  score: number;
  mistakes: string[];
}

/** Lời nói hiện trên đầu nhân vật (người chơi hoặc NPC). */
export interface SayEvent {
  /** playerId hoặc id NPC. */
  who: string;
  text: string;
}

/** Một đánh giá trong sổ đánh giá quầy (UC-F11). */
export interface ReviewView {
  id: string;
  authorName: string;
  /** Người chơi viết (khác khách NPC). */
  fromPlayer: boolean;
  stars: number;
  text: string;
  day: number;
  reply: string | null;
}

export interface ReviewsView {
  ownerId: string;
  ownerName: string;
  avg: number;
  count: number;
  /** Số đánh giá 1★…5★. */
  dist: number[];
  /** Người xem đã mua ở quầy hôm nay và chưa đánh giá. */
  canWrite: boolean;
  items: ReviewView[];
}

/** Bảng giải của xóm (UC-P2): nhiều hạng mục, 7 ngày gần nhất. */
export interface AwardView {
  id: string;
  emoji: string;
  name: string;
  description: string;
  metric: "revenue" | "profit" | "served" | "rating" | "growth" | "wages" | "friendly";
  entries: { playerId: string; name: string; value: number }[];
}

export interface ShareView {
  productId: string;
  total: number;
  entries: { playerId: string; name: string; served: number; share: number }[];
}

export interface XomBoardView {
  day: number;
  /** Số người trong xóm được tính. */
  players: number;
  awards: AwardView[];
  shares: ShareView[];
  /** Tin "đang hot": thời tiết, giá chợ, khai trương, món bán chạy. */
  trends: { emoji: string; text: string }[];
}

export interface AchievementView {
  id: string;
  emoji: string;
  name: string;
  description: string;
  goal: number;
  value: number;
  done: boolean;
}

/** Số liệu của mình: 7 ngày gần nhất + trung bình quầy cùng món trong xóm + thành tựu. */
export interface MyStatsView {
  days: { day: number; revenue: number; profit: number; served: number; wages: number }[];
  avg: { stalls: number; revenue: number; served: number; rating: number } | null;
  achievements: AchievementView[];
}

/** Công trình chung đang bàn/làm (UC-J5). */
export interface ProjectView {
  id: string;
  projectId: string;
  status: "VOTING" | "FUNDING" | "BUILDING" | "DONE" | "REJECTED";
  proposerName: string;
  yes: number;
  no: number;
  /** Phiếu của mình (null = chưa bỏ). */
  mine: boolean | null;
  /** Hết hạn bỏ phiếu (ngày, phút game). */
  voteDay: number;
  voteMinute: number;
  /** Ngày xong thi công (đang làm). */
  doneDay: number | null;
}

export interface FundView {
  /** Số dư quỹ xóm. */
  balance: number;
  /** Số người trong xóm (được bỏ phiếu). */
  members: number;
  active: ProjectView[];
  /** Công trình đã nghiệm thu (id content). */
  done: string[];
}

export interface TalkResult {
  line: string;
  friendship: number;
}

// ───────────── Vào làm (docs/USECASES.md nhóm W) ─────────────

interface TaskBase {
  id: string;
  /** Tên kiểu khách (Học sinh, Dân văn phòng…). */
  customer: string;
  createdAt: number;
  expiresAt: number;
}

/** Đứng quầy: khách gọi dĩa cơm. */
export interface PlateTaskView extends TaskBase {
  text: string;
  /** Những thứ phải có trên dĩa (để đối chiếu; có thể lặp). */
  items: string[];
}

/** Thu ngân: khách đưa phiếu, trả tiền. */
export interface CashierTaskView extends TaskBase {
  /** Các dòng trên phiếu: "Cơm sườn, thêm trứng", "Trà đá". */
  ticket: string[];
  pay: PaymentView;
}

/** Bưng bê: dĩa ra từ bếp, kẹp phiếu số bàn. */
export interface ServeTaskView extends TaskBase {
  table: number;
  dish: string;
}

export type TableState = "free" | "waiting" | "eating" | "dirty";

/** Một khách trong quán (UC-W8): client diễn đi lại theo bước + thời điểm (giờ server). */
export interface DinerView {
  id: string;
  name: string;
  look: number;
  stage:
    | "entering"
    | "queue"
    | "to_table"
    | "seated"
    | "eating"
    | "to_cashier"
    | "paying"
    | "leaving"
    | "gone";
  since: number;
  table: number;
  say: { text: string; tone: "ask" | "bad" | "good"; until: number } | null;
  incident: "argue" | "dash" | null;
  incidentAt: number;
  /** Đang than chờ lâu (chưa được xin lỗi). */
  complaining: boolean;
  stars: number | null;
}

/** Dĩa ở cửa bếp chờ bưng (npc = đồng nghiệp đang bưng). */
export interface PassView {
  id: string;
  table: number;
  dish: string;
  readyAt: number;
  npc: boolean;
}

export type DeliveryStage =
  | "shelf"
  | "picked"
  | "at_door"
  | "absent"
  | "later"
  | "refused"
  | "delivered"
  | "returning";

/** Giao hàng: một đơn trong chuyến. */
export interface DeliveryTaskView {
  id: string;
  code: string;
  recipient: string;
  addressId: string;
  item: string;
  fragile: boolean;
  /** Tiền thu hộ; 0 = đã trả trước. */
  cod: number;
  stage: DeliveryStage;
  /** Các gói trên kệ để chọn (khi stage = shelf). */
  shelf: string[];
  /** Người ra mở cửa (khi stage = at_door). */
  door: {
    name: string;
    relation: "self" | "relative" | "stranger";
    pay: PaymentView | null;
  } | null;
}

export interface ShiftStatsView {
  done: number;
  mistakes: number;
  /** Khách bỏ về vì chờ lâu. */
  walked: number;
  strikes: number;
  maxStrikes: number;
  /** Tiền đã nhận trong ca (lương cứng + tiền việc). */
  earned: number;
  /** Đánh giá của khách trong ca (quán cơm). */
  reviews: number;
  stars: number;
  /** Khách quỵt tiền trốn được. */
  dashed: number;
}

export interface ShiftView {
  jobId: string;
  role: string;
  placeId: string;
  stats: ShiftStatsView;
  plates: PlateTaskView[];
  /** Số phần còn trong mỗi khay. */
  trays: Record<string, number>;
  /** Khay đang chờ bếp mang ra: foodId → thời điểm có (ms). */
  refilling: Record<string, number>;
  cashier: CashierTaskView[];
  serve: ServeTaskView[];
  tables: TableState[];
  deliveries: DeliveryTaskView[];
  /** Tiền COD đang cầm (phải nộp lại). */
  cashHeld: number;
  /** Đang chạy xe nhanh. */
  fast: boolean;
  /** Quán sống động (UC-W8). */
  diners: DinerView[];
  pass: PassView[];
  /** Dĩa mình đang cầm (id dĩa ở cửa bếp). */
  holding: string[];
  /** Giờ server lúc gửi (để client bù lệch đồng hồ) và hệ số thời gian của xóm (ms thật / phút game / 1000). */
  now: number;
  scale: number;
}

export interface PayslipView {
  jobId: string;
  role: string;
  done: number;
  mistakes: number;
  walked: number;
  base: number;
  piece: number;
  deductions: number;
  total: number;
  /** Tiền khách boa trong ca. */
  tips: number;
  /** Trung bình sao khách đánh giá (null = chưa có). */
  stars: number | null;
  reason: "stop" | "fired" | "day_end" | "left";
}

export interface WorkResult {
  me: MeView;
  ok: boolean;
  /** Lời chủ/khách nói (hiện trên đầu). */
  line: string;
  /** Tiền nhận được từ việc này. */
  pay: number;
  shift: ShiftView | null;
  payslip?: PayslipView;
}

export interface DayReportView {
  day: number;
  revenue: number;
  tips: number;
  stockCost: number;
  rent: number;
  wages: number;
  spoiledQty: number;
  spoiledValue: number;
  served: number;
  lost: number;
  /** Món làm sai phải giảm giá. */
  wrong: number;
  satisfaction: number;
  reputation: number;
  /** Lãi ngân hàng nhận cuối ngày. */
  interest: number;
  /** Phí chợ/thuế, điện nước, sửa xe, khai trương. */
  fees: number;
  /** Lãi/lỗ trong ngày (gồm cả tiền vào tài khoản). */
  profit: number;
  moneyEnd: number;
}

/** Một dòng trong sổ khách quen của quầy (KIENTRUC §1). */
export interface RegularView {
  residentId: string;
  name: string;
  bio: string;
  visits: number;
  regular: boolean;
  lastDay: number;
}

/** 🏪 Mở tiệm trong nhà mặt tiền theo quy trình (UC-F12). */
export interface ShopSetupView {
  /** Nhà mình đang thuê. */
  lease: { lotId: string; deposit: number; signedDay: number } | null;
  shopName: string | null;
  /** Hộ kinh doanh: chưa nộp / đang xét (xong lúc readyAt) / đã có. */
  license: "none" | "pending" | "done";
  licenseReady: { day: number; minute: number } | null;
  /** Nghề này có cần giấy ATTP không (quán ăn uống). */
  needCert: boolean;
  trained: boolean;
  /** Đoàn kiểm tra ATTP: tới lúc nào, đón được tới lúc nào. */
  inspect: { day: number; minute: number; until: number; arrived: boolean } | null;
  certified: boolean;
  signed: boolean;
  step: "lease" | "license" | "cert" | "sign" | "ready";
  houses: {
    lotId: string;
    rentPerDay: number;
    estimate: {
      deposit: number;
      reserve: number;
      license: number;
      training: number;
      sign: number;
      total: number;
    };
    /** Người khác đang thuê (tên) — null = trống hoặc của mình. */
    leasedBy: string | null;
  }[];
}

/** 🛵 Xe ôm (KIENTRUC §4, UC-N1): trạng thái cuốc xe của mình. */
export interface RideView {
  /** idle: chưa chờ khách · waiting: đang chờ · offer: khách hỏi giá · route: đã chốt giá, chọn đường ·
   *  riding: đang chở · pay: tới nơi, thu tiền. */
  stage: "idle" | "waiting" | "offer" | "route" | "riding" | "pay";
  /** Đã thuê xe hôm nay chưa. */
  bikeToday: boolean;
  today: { rides: number; earned: number };
  /** Sao trung bình khách chấm (cả đời). */
  rating: { rides: number; avg: number };
  /** Phút game khách tới (khi đang chờ). */
  readyAt?: number;
  passenger?: {
    residentId: string;
    name: string;
    bio: string;
    line: string;
    /** Model nhân vật (theo kiểu khách) để vẽ khách ngồi sau xe. */
    model?: string;
  };
  dest?: { kind: "address" | "lot"; id: string; label: string; x: number; z: number };
  /** Quãng đường (m) theo đường lớn — để báo giá. */
  meters?: number;
  /** Giá chuẩn cuốc này. */
  fare?: number;
  /** Giá đã chốt. */
  price?: number;
  /** Ước thời gian (giây) mỗi đường, độ kẹt xe, trời mưa. */
  routes?: { road: number; alley: number; jam: number; wet: boolean };
  route?: "road" | "alley";
  /** Tốc độ chạy (m/s) khi đang chở. */
  speed?: number;
  /** Tới nơi: khách trả tiền thế nào, chấm mấy sao, nói gì, boa bao nhiêu. */
  pay?: { kind: "transfer" } | { kind: "cash"; bill: number };
  stars?: number;
  comment?: string;
  tip?: number;
}

/** Một việc trên bảng việc xóm (KIENTRUC §3). */
export interface ContractView {
  id: string;
  templateId: string;
  /** Người đặt (NPC). */
  poster: string;
  /** Câu ghi trên bảng (đã điền số, món, chỗ, giờ). */
  text: string;
  productId: string;
  variantId: string;
  /** Chỗ giao. */
  lotId: string;
  qty: number;
  reward: number;
  deposit: number;
  /** Hạn giao (phút trong ngày). */
  deadline: number;
  minTrust: number;
  status: "OPEN" | "TAKEN" | "READY" | "DONE" | "FAILED" | "EXPIRED";
  /** Ai đã nhận (người khác thì chỉ thấy tên). */
  takerName: string | null;
  mine: boolean;
}

export interface ContractBoardView {
  day: number;
  /** 🤝 Điểm tin cậy của mình (0–100). */
  trust: number;
  /** Đang bị khoá nhận việc tới hết ngày này. */
  lockedUntil: number | null;
  offers: ContractView[];
}

/** Việc người chơi đăng cho nhau (1.20b, UC-M8) — hiện có 📸 chụp ảnh quầy. */
export interface GigView {
  id: string;
  kind: "photo";
  posterName: string;
  /** Tên quán / quầy cần chụp + chỗ. */
  shopName: string;
  lotId: string;
  reward: number;
  deposit: number;
  fee: number;
  /** Hạn làm (phút trong ngày). */
  deadline: number;
  status: "OPEN" | "TAKEN" | "SUBMITTED" | "DONE" | "REFUNDED" | "CANCELLED" | "EXPIRED" | "FAILED";
  takerName: string | null;
  /** Sao trung bình + số việc của người nhận (người đăng xem khi nghiệm thu). */
  takerRating: { gigs: number; avg: number } | null;
  /** Mình là người đăng / người nhận. */
  posted: boolean;
  taken: boolean;
  cameraPaid: boolean;
  /** Điểm từng tấm đã chụp; chất lượng bộ ảnh nộp. */
  shots: number[];
  quality: number | null;
  stars: number | null;
  /** Hạn nghiệm thu (phút trong ngày nếu cùng ngày). */
  reviewBy: number | null;
  verdict: "accepted" | "auto" | "dispute_taker" | "dispute_poster" | null;
}

export interface GigBoardView {
  day: number;
  trust: number;
  lockedUntil: number | null;
  /** Mình có quầy (đăng được việc chụp ảnh). */
  canPost: boolean;
  gigs: GigView[];
}

/** Bắt đầu buổi chụp: server sinh khoảnh khắc (ms kể từ lúc bắt đầu). */
export interface PhotoSessionView {
  gigId: string;
  sessionMs: number;
  shotsMax: number;
  moments: { at: number; kind: number }[];
}

export interface PhotoShotView {
  /** Điểm tấm vừa chụp + mọi tấm trong buổi. */
  score: number;
  shots: number[];
}

/** Một phiếu ca của nhân viên (KIENTRUC §2). */
export interface StaffShiftView {
  staffId: string;
  day: number;
  fromMinute: number;
  toMinute: number;
  served: number;
  wrong: number;
  lost: number;
  revenue: number;
  wages: number;
}

/** Nhân viên của quầy mình + vài phiếu ca gần nhất. */
export interface StaffView {
  employee: { staffId: string; shiftId: string; hiredDay: number } | null;
  recent: StaffShiftView[];
}

/** Một dòng trong "Chuyện của tôi" (docs/THEGIOI.md §1). */
export interface StoryEntryView {
  day: number;
  emoji: string;
  text: string;
}

export interface NotifyEvent {
  kind: "info" | "good" | "warn";
  text: string;
  /** Bấm vào thông báo thì mở bảng này (vd. "ride" khi khách vẫy xe). */
  open?: string;
}

const contentId = z.string().regex(/^[a-z0-9_]+$/);

/** Trả bằng gì: tự chọn (mặc định) · 💵 tiền mặt · 🏦 chuyển khoản. */
export const payMethodSchema = z.enum(["auto", "cash", "bank"]).default("auto");
export type PayMethod = "auto" | "cash" | "bank";

export const buyEquipmentSchema = z.object({ equipmentId: contentId, pay: payMethodSchema });
export const marketBuySchema = z.object({
  itemId: contentId,
  packs: z.number().int().min(1).max(50),
  pay: payMethodSchema,
});
export const repairSchema = z.object({ pay: payMethodSchema });
/** Thanh lý hết một loại hàng tồn cho chợ. */
export const marketSellSchema = z.object({ itemId: contentId });
export const updateBusinessSchema = z.object({ lotId: contentId });
export const menuSchema = z
  .object({
    variantId: contentId,
    on: z.boolean().optional(),
    price: z.number().int().min(1_000).max(1_000_000).optional(),
  })
  .refine((v) => v.on !== undefined || v.price !== undefined, "Không có gì để cập nhật");
const selection = z.union([
  z.string().max(40),
  z.array(z.string().max(40)).max(12),
  z.literal(true),
]);
export const makeOrderSchema = z.object({
  orderId: z.string().min(1).max(64),
  build: z.record(z.string().max(40), selection),
});
export const payOrderSchema = z.object({
  orderId: z.string().min(1).max(64),
  /** Tiền thối (null khi chuyển khoản / đưa đúng tiền). */
  change: z.number().int().min(0).max(1_000_000).nullable(),
  /** Món sai mà vẫn đưa, giảm 50%. */
  discount: z.boolean().default(false),
});
export const orderIdSchema = z.object({ orderId: z.string().min(1).max(64) });
/** Kiểm tra một bộ phận khi chẩn đoán (sửa xe, UC-G3). */
export const inspectSchema = z.object({
  orderId: z.string().min(1).max(64),
  part: z
    .string()
    .regex(/^[a-z0-9_]+$/)
    .max(32),
});
export const talkSchema = z.object({
  npcId: contentId,
  topic: z.enum(["greet", "price", "gossip"]),
});
export const saySchema = z.object({ phraseId: contentId });
export const workStartSchema = z.object({ jobId: contentId, role: contentId });
const taskId = z.string().min(1).max(64);
const cents = z.number().int().min(0).max(10_000_000);
/** Mọi thao tác trong ca làm (một intent, phân biệt bằng kind). */
export const workActSchema = z.discriminatedUnion("kind", [
  // Quán sống động: cầm dĩa ở cửa bếp; xin lỗi khách than; can ngăn; gọi lại khách quỵt.
  z.object({ kind: z.literal("grab"), taskId }),
  z.object({ kind: z.literal("sorry"), taskId }),
  z.object({ kind: z.literal("calm"), taskId }),
  z.object({ kind: z.literal("callback"), taskId }),
  z.object({ kind: z.literal("plate"), taskId, items: z.array(contentId).max(20) }),
  z.object({ kind: z.literal("refill"), foodId: contentId }),
  z.object({
    kind: z.literal("ring"),
    taskId,
    lines: z.record(contentId, z.number().int().min(1).max(20)),
    change: cents.nullable(),
  }),
  z.object({ kind: z.literal("serve"), taskId, table: z.number().int().min(1).max(20) }),
  z.object({ kind: z.literal("clean"), table: z.number().int().min(1).max(20) }),
  z.object({ kind: z.literal("take") }),
  z.object({ kind: z.literal("pick"), taskId, code: z.string().max(12) }),
  z.object({ kind: z.literal("ride"), fast: z.boolean() }),
  z.object({ kind: z.literal("call"), taskId, addressId: contentId }),
  z.object({ kind: z.literal("handover"), taskId, accept: z.boolean(), change: cents.nullable() }),
  z.object({ kind: z.literal("absent"), taskId, choice: z.enum(["neighbor", "later", "return"]) }),
  z.object({ kind: z.literal("settle") }),
]);
export type WorkAct = z.infer<typeof workActSchema>;
export const attendSchema = z.object({ on: z.boolean() });
/** Có nhân viên trong ca: chủ tự đứng bán (true) hay để nhân viên bán (false). */
export const selfSellSchema = z.object({ on: z.boolean() });
export const tutorialSchema = z.object({ step: contentId });
const coord = z.number().min(-200).max(200);
export const moveSchema = z.object({
  x: coord,
  z: coord,
  yaw: z.number().min(-10).max(10),
  moving: z.boolean(),
  inside: contentId.nullable(),
});
export type MovePayload = z.infer<typeof moveSchema>;
export const shopOrderSchema = z.object({
  businessId: z.string().uuid(),
  variantId: contentId,
  picks: z.record(contentId, contentId).default({}),
  mods: z.array(contentId).max(8).default([]),
  pay: payMethodSchema,
});
export const vendorBuySchema = z.object({
  vendorId: contentId,
  itemId: contentId,
  pay: payMethodSchema,
});
export const joinRoomSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[0-9a-f]{8}$/, "Mã xóm gồm 8 ký tự"),
});
export const emptySchema = z.object({}).optional();
/** Dev/test: cộng tiền mặt (qua sổ cái, lý do "debug") — production từ chối. */
export const debugGrantSchema = z.object({
  money: z.number().int().min(1_000).max(10_000_000).optional(),
  xp: z.number().int().min(1).max(100_000).optional(),
  /** Đặt mức no / khát (UC-B11). */
  food: z.number().int().min(0).max(100).optional(),
  drink: z.number().int().min(0).max(100).optional(),
});
/** Rút/gửi ở cây ATM (UC-I6): phải đứng gần cây ATM đó. */
const atmId = z.string().regex(/^atm_[0-9]+_[0-9]+$/);
const pin = z.string().max(12);
export const atmSchema = z.object({
  atmId,
  action: z.enum(["deposit", "withdraw"]),
  amount: z.number().int().min(1_000).max(100_000_000),
  pin,
});
export const atmAuthSchema = z.object({ atmId, pin });
export const atmPinSchema = z.object({ atmId, pin, old: pin.optional() });

/** Biên lai ATM (UC-I6). */
export interface AtmReceipt {
  code: string;
  atmId: string;
  action: "deposit" | "withdraw";
  amount: number;
  fee: number;
  /** Số dư tài khoản sau giao dịch. */
  balance: number;
  day: number;
  minute: number;
}
/** Dev/test: đặt giờ trong ngày của xóm mình (kịch bản dài không bị hết ngày giữa chừng). */
export const debugClockSchema = z.object({
  minute: z.number().int().min(360).max(1300),
  /** Nhảy tới ngày này (thử lịch tuần: chợ đêm thứ Bảy…). */
  day: z.number().int().min(1).max(10_000).optional(),
});
/** Dev/test: lần rời xóm tới ghi mốc như đã vắng `minutes` phút, xóm qua `days` ngày (thử "Trong lúc bạn vắng"). */
/** Dev/test: đặt số lần ghé của mọi cư dân ở quầy mình (thử khách quen). */
export const shopLeaseSchema = z.object({ lotId: contentId });
export const shopRegisterSchema = z.object({ name: z.string().min(1).max(60) });
export const rideRentSchema = z.object({ pay: payMethodSchema.optional() });
export const rideOfferSchema = z.object({ ratio: z.number().min(0.5).max(3) });
export const rideGoSchema = z.object({ route: z.enum(["road", "alley"]) });
export const ridePaySchema = z.object({
  change: z.number().int().min(0).max(1_000_000).nullable(),
});
export const contractIdSchema = z.object({ id: z.string().uuid() });
export const gigPostSchema = z.object({
  kind: z.literal("photo"),
  reward: z.number().int().positive(),
  hours: z.number().int().positive(),
});
/** Bấm máy: `at` = ms kể từ lúc bắt đầu buổi chụp theo máy người chơi (để bù trễ mạng). */
export const gigShotSchema = z.object({
  id: z.string().uuid(),
  at: z.number().int().min(0).max(120_000).optional(),
});
export const crewViewSchema = z.object({ siteId: z.string().uuid() });
export const crewMixSchema = z.object({
  siteId: z.string().uuid(),
  cement: z.number().int().min(0).max(20),
  sand: z.number().int().min(0).max(200),
  water: z.number().int().min(0).max(400),
});
export const gigReviewSchema = z.object({
  id: z.string().uuid(),
  stars: z.number().int().min(1).max(5),
});
/** Dev/test: đăng ngay một việc theo mẫu lên bảng xóm mình. */
export const debugContractSchema = z.object({ templateId: contentId });
export const staffHireSchema = z.object({ staffId: contentId, shiftId: contentId });
export const debugRegularsSchema = z.object({ visits: z.number().int().min(0).max(100) });
export const debugAwaySchema = z.object({
  minutes: z.number().int().min(1).max(100_000),
  days: z.number().int().min(0).max(1000),
});
export const hostEventSchema = z.object({ eventId: contentId, pay: payMethodSchema });
/** Chỉ dùng khi chạy dev/test (server tắt ở production): ép thời tiết của xóm mình để kiểm thử. */
export const debugWeatherSchema = z.object({
  kind: z.enum(["sunny", "cloudy", "rain", "storm"]),
  /** Bắt đầu sau bao nhiêu phút game kể từ bây giờ. */
  after: z.number().int().min(0).max(600).default(0),
  minutes: z.number().int().min(1).max(960),
});

const reviewText = z.string().trim().min(1).max(140);
export const reviewListSchema = z.object({ ownerId: z.string().uuid() });
export const reviewWriteSchema = z.object({
  ownerId: z.string().uuid(),
  stars: z.number().int().min(1).max(5),
  text: reviewText,
});
export const reviewReplySchema = z.object({ reviewId: z.string().uuid(), text: reviewText });

export const fundDonateSchema = z.object({
  amount: z.number().int().min(10_000).max(10_000_000),
  pay: payMethodSchema,
});
export const projectProposeSchema = z.object({ projectId: contentId });
export const projectVoteSchema = z.object({ id: z.string().uuid(), yes: z.boolean() });

/** Chat tự gõ (UC-D4): một dòng ngắn, server che từ tục. */
export const chatTextSchema = z.object({ text: z.string().trim().min(1).max(80) });
