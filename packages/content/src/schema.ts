import { z } from "zod";

// Schema nội dung game. Thêm nghề/sản phẩm mới = thêm dữ liệu, không sửa code (docs/PLAN.md §3.5, D6).

const id = z.string().regex(/^[a-z0-9_]+$/, "id chỉ gồm a-z, 0-9, _");
const vnd = z.number().int().positive();
/** Hệ số theo giờ (0–23); giờ không khai báo lấy nội suy từ giờ gần nhất. */
const byHour = z.record(z.string().regex(/^([0-9]|1[0-9]|2[0-3])$/), z.number().nonnegative());

/** Template quy định HÀNH VI; sản phẩm chỉ là số liệu. */
export const templateSchema = z.object({
  id: z.enum(["FOOD", "RETAIL"]),
  name: z.string(),
});

/** Nguyên liệu / hàng nhập ở chợ, mua theo gói, dùng theo phần. */
export const ingredientSchema = z.object({
  id,
  name: z.string(),
  emoji: z.string(),
  /** Đơn vị một phần: "ổ", "phần", "ly"… */
  unit: z.string(),
  /** Số phần trong một gói ở chợ. */
  packSize: z.number().int().positive(),
  /** Giá gốc một phần. */
  costPerUnit: vnd,
  /** Số ngày dùng được kể từ ngày nhập; null = không hỏng. */
  shelfLifeDays: z.number().int().positive().nullable(),
  /** Hàng tươi: buổi chiều ở chợ đắt hơn. */
  fresh: z.boolean().default(false),
});

/** Một lựa chọn trong một bước làm món (ví dụ: "Hành lá" ở bước "Rau"). */
export const recipeOptionSchema = z.object({
  id,
  label: z.string(),
  emoji: z.string(),
  /** Nguyên liệu tiêu hao khi chọn (bỏ trống = không tốn, ví dụ mức đường). */
  ingredient: id.optional(),
  qty: z.number().int().positive().default(1),
  /** Khách yêu cầu thêm thứ này (ngoài mặc định) thì tính thêm tiền. */
  extraPrice: z.number().int().nonnegative().default(0),
  /** Cách khách nói khi chọn lựa chọn này khác mặc định: "size L", "ít đá". */
  say: z.string().optional(),
});

/**
 * Một bước làm món. single: chọn 1; multi: chọn nhiều; action: bấm 1 lần; hold: giữ nút.
 * pick: khách tự chọn lựa chọn cho bước này theo trọng số (ví dụ size ly, mức đường).
 */
export const recipeStepSchema = z.object({
  id,
  label: z.string(),
  kind: z.enum(["single", "multi", "action", "hold"]),
  /** Chữ trên nút cho bước action/hold: "🔪 Xẻ bánh", "Lắc". */
  verb: z.string().optional(),
  options: z.array(recipeOptionSchema).default([]),
  /** Nguyên liệu cho bước action (ví dụ giấy gói). */
  ingredient: id.optional(),
  pick: z.record(id, z.number().nonnegative()).optional(),
  /** Mức quan trọng khi chấm điểm món (sai nhân nặng hơn sai rau). */
  weight: z.number().positive().default(1),
});

export const recipeVariantSchema = z.object({
  id,
  name: z.string(),
  /** Lựa chọn cố định của món này (ví dụ nhân = xíu mại). */
  fixed: z.record(id, z.union([id, z.array(id)])).default({}),
  /** Giá khách thấy hợp lý. */
  refPrice: vnd,
  /** Độ phổ biến khi khách chọn món. */
  popularity: z.number().positive().default(1),
});

/** Yêu cầu riêng của khách: "không hành", "nhiều ớt", "thêm pudding". */
export const recipeModSchema = z.object({
  id,
  step: id,
  add: id.optional(),
  remove: id.optional(),
  set: id.optional(),
  say: z.string(),
  chance: z.number().min(0).max(1),
});

export const recipeSchema = z.object({
  steps: z.array(recipeStepSchema).min(1),
  /** Lựa chọn mặc định của các bước single/multi. */
  defaults: z.record(id, z.union([id, z.array(id)])).default({}),
  variants: z.array(recipeVariantSchema).min(1),
  mods: z.array(recipeModSchema).default([]),
  /** Cách khách mở lời: "Cho con {món}" — {dish} được thay bằng tên món + yêu cầu. */
  ask: z.string(),
});

export const productSchema = z.object({
  id,
  template: z.enum(["FOOD", "RETAIL"]),
  category: id,
  name: z.string(),
  emoji: z.string(),
  /** Chữ trên biển hiệu, ghép với tên chủ quầy: "BÁNH MÌ TUẤN". */
  sign: z.string(),
  /** Màu nền biển hiệu. */
  signColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  /** Độ nhạy với giá: càng lớn khách càng bỏ đi khi giá cao. */
  elasticity: z.number().positive(),
  /** Tỉ lệ người qua đường quan tâm, theo giờ. */
  interestByHour: byHour,
  recipe: recipeSchema,
});

export const equipmentSchema = z.object({
  id,
  name: z.string(),
  price: vnd,
  /** Sản phẩm mà thiết bị này bán được. */
  products: z.array(id).min(1),
  /** Số khách tối đa đứng chờ trước quầy; đông hơn thì khách mới bỏ đi. */
  queueSize: z.number().int().positive(),
  /** Tên model trong city bundle (packages/assets). */
  model: z.string(),
});

export const trafficProfileSchema = z.object({
  id,
  name: z.string(),
  /** Số người qua lại mỗi giờ. */
  peoplePerHour: byHour,
});

export const lotSchema = z.object({
  id,
  name: z.string(),
  hint: z.string(),
  traffic: id,
  /** Nhân hệ số lưu lượng của profile. */
  trafficScale: z.number().positive(),
  rentPerDay: vnd,
  /** Vị trí trên bản đồ (mét), phía vỉa hè. */
  position: z.object({ x: z.number(), z: z.number() }),
  /** Hướng quầy quay ra (radian quanh trục Y). */
  facing: z.number(),
});

export const npcArchetypeSchema = z.object({
  id,
  name: z.string(),
  /** Thời gian chờ tối đa trước quầy (giây thật). */
  patienceSec: z.number().int().positive(),
  /** Tỉ lệ trả bằng chuyển khoản (không cần thối tiền). */
  transferRate: z.number().min(0).max(1),
  /** Model nhân vật dùng để minh họa. */
  model: z.string(),
  /** Mức ưa thích theo danh mục sản phẩm. */
  likes: z.record(id, z.number().nonnegative()),
});

/** Một vai trong nơi làm (đứng quầy, thu ngân, bưng bê, giao hàng…). */
export const jobRoleSchema = z.object({
  id,
  name: z.string(),
  emoji: z.string(),
  description: z.string(),
  /** Tiền cho mỗi việc làm đúng (một dĩa, một lượt tính tiền, một đơn giao…). */
  piecePay: vnd,
});

export const jobSchema = z.object({
  id,
  name: z.string(),
  /** Lương cứng mỗi giờ game — chỉ tính giờ nào có làm ít nhất một việc. */
  wagePerHour: vnd,
  description: z.string(),
  roles: z.array(jobRoleSchema).min(1),
  /** Lỗi + khách bỏ về trong một ca đến mức này thì chủ cho nghỉ. */
  maxStrikes: z.number().int().positive(),
});

/** Quán cơm Cô Tư: món trong khay, dĩa khách gọi, đồ uống (docs/USECASES.md UC-W2…W4). */
const point = z.object({ x: z.number(), z: z.number() });

/**
 * Bản đồ xóm (docs/USECASES.md UC-B6): lưới ô vuông, mỗi ký tự một ô.
 * = đường ngang · | đường dọc · + ngã ba/ngã tư · c vạch sang đường · s vỉa hè · a hẻm
 * B nhà phố · T nhà cao tầng · K trường học · H nhà ở · P công viên · M chợ · S sân trường · L bãi xe · . đất trống
 */
export const MAP_WALKABLE = "=|+csaPMSL";
export const mapSchema = z.object({
  tile: z.number().positive(),
  /** Tâm ô đầu tiên (hàng 0, cột 0). */
  origin: point,
  rows: z.array(z.string().regex(/^[=|+csaBTKHPMSL.]+$/)).min(1),
});

export const restaurantSchema = z.object({
  foods: z.array(z.object({ id, name: z.string(), emoji: z.string(), model: z.string() })),
  dishes: z.array(
    z.object({
      id,
      name: z.string(),
      items: z.array(id).min(1),
      price: vnd,
      popularity: z.number().positive(),
    }),
  ),
  mods: z.array(
    z.object({
      id,
      say: z.string(),
      add: id.optional(),
      remove: id.optional(),
      price: z.number().int(),
      chance: z.number(),
    }),
  ),
  drinks: z.array(
    z.object({ id, name: z.string(), emoji: z.string(), price: vnd, chance: z.number() }),
  ),
  /** Số phần mỗi khay trước khi phải báo bếp. */
  trayPortions: z.number().int().positive(),
  /** Bếp mang khay mới sau chừng này giây thật. */
  refillSec: z.number().int().positive(),
  tables: z.number().int().positive(),
  /** Khách tới mỗi giờ game theo giờ (mỗi vai). */
  customersPerHour: byHour,
  patienceSec: z.number().int().positive(),
  /** Sơ đồ trong quán (mét): cửa, hàng chờ, cửa bếp, quầy tính tiền, bàn (UC-W8). */
  layout: z.object({
    door: point,
    queue: point,
    queueStep: point,
    pass: point,
    cashier: point,
    cashierStep: point,
    tables: z.array(point).min(1),
  }),
});

/** Bưu cục: địa chỉ giao, người nhận, hàng (UC-W5). */
export const deliverySchema = z.object({
  addresses: z.array(
    z.object({
      id,
      label: z.string(),
      position: z.object({ x: z.number(), z: z.number() }),
      facing: z.number(),
    }),
  ),
  recipients: z.array(z.string()).min(4),
  relatives: z.array(z.string()).min(1),
  items: z.array(z.object({ name: z.string(), fragile: z.boolean(), value: vnd })),
  /** Tỉ lệ người nhận vắng nhà. */
  absentRate: z.number().min(0).max(1),
  /** Tỉ lệ đơn thu tiền hộ (COD). */
  codRate: z.number().min(0).max(1),
  /** Hàng dễ vỡ mà chạy nhanh thì xác suất bị móp. */
  fragileDamageFast: z.number().min(0).max(1),
  maxPerTrip: z.number().int().positive(),
  /** Số gói trên kệ (1 đúng + gói khác để phải đọc mã). */
  shelfSize: z.number().int().positive(),
});

const position = z.object({ x: z.number(), z: z.number() });

/** Địa điểm có người đứng quầy; muốn làm việc ở đó phải đi tới tận nơi. */
export const placeSchema = z.object({
  id,
  name: z.string(),
  kind: z.enum(["equipment_shop", "market", "job"]),
  /** Chữ trên biển hiệu. */
  sign: z.string(),
  signColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  /** Nút hành động khi đứng gần, ví dụ "🧺 Vào chợ". */
  action: z.string(),
  keeper: z.object({
    name: z.string(),
    model: z.string(),
    greeting: z.string(),
    /** Chuyện để nói khi người chơi hỏi (UC-D2). */
    talk: z.object({ price: z.array(z.string()).min(1), gossip: z.array(z.string()).min(1) }),
  }),
  /** Với kind = job: các việc nhận ở đây. */
  jobs: z.array(id).default([]),
  position,
  facing: z.number(),
  /** Prop trang trí quanh địa điểm (tên model trong city bundle). */
  props: z.array(
    z.object({ model: z.string(), dx: z.number(), dz: z.number(), rot: z.number().default(0) }),
  ),
});

export const npcSpeakerSchema = z.object({
  id,
  name: z.string(),
  model: z.string(),
  position,
  facing: z.number(),
});

/** Điều kiện hoàn thành một bước kịch bản; client đánh giá theo trạng thái game. */
export const conditionSchema = z.enum([
  "has_business",
  "has_stock",
  "has_lot",
  "shop_open",
  "served_3",
  "has_job",
  "job_tasks_2",
]);

export const tutorialStepSchema = z.object({
  id,
  /** Lời thoại hiện ra khi bắt đầu bước (bỏ trống = chỉ đổi dòng nhiệm vụ). */
  speaker: id.optional(),
  lines: z.array(z.string()).default([]),
  /** Lựa chọn rẽ nhánh ở cuối lời thoại. */
  choices: z.array(z.object({ text: z.string(), next: id })).default([]),
  objective: z.string().optional(),
  /** Nơi cần tới: id địa điểm, "stall" (quầy của mình), hoặc "guide". */
  target: z.string().optional(),
  until: conditionSchema.optional(),
  next: id.optional(),
});

export const customerLinesSchema = z.object({
  cheap: z.array(z.string()).min(1),
  fair: z.array(z.string()).min(1),
  pricey: z.array(z.string()).min(1),
  thanks: z.array(z.string()).min(1),
  impatient: z.array(z.string()).min(1),
});

export const economySchema = z.object({
  startingMoney: vnd,
  /** Phút trong ngày (game) khi ngày bắt đầu / kết thúc; ban đêm được bỏ qua. */
  dayStartMinute: z.number().int().min(0).max(1439),
  dayEndMinute: z.number().int().min(1).max(1440),
  /** Chu kỳ tính bán hàng, đơn vị phút game. */
  economyTickMinutes: z.number().int().positive(),
  /** Mỗi ngày giá chợ dao động trong ±biên độ này. */
  marketPriceSwing: z.number().min(0).max(0.5),
  /** Lựa chọn "không mua ai" trong mô hình chia khách. */
  outsideOption: z.number().positive(),
  /** Tốc độ reputation bám theo độ hài lòng. */
  reputationRate: z.number().positive().max(1),
  startingReputation: z.number().min(0).max(1),
  /** Buổi chiều (từ 12:00) hàng tươi ở chợ đắt hơn tỉ lệ này. */
  afternoonMarkup: z.number().min(0).max(1),
  /** Tiền boa ≈ tỉ lệ giá trị đơn khi phục vụ kịp. */
  tipRate: z.number().min(0).max(1),
  /** Uy tín cộng thêm mỗi đơn phục vụ kịp. */
  serveReputationBonus: z.number().min(0).max(0.1),
  /** Bán kính (mét) coi như "đang ở" một địa điểm / quầy. */
  interactRadius: z.number().positive(),
  /** Rao hàng: hệ số khách, thời gian hiệu lực và hồi chiêu (phút game). */
  shoutBoost: z.number().min(1),
  shoutMinutes: z.number().int().positive(),
  shoutCooldownMinutes: z.number().int().positive(),
  /** Mua sỉ từ số gói này trở lên được giảm giá. */
  bulkPacks: z.number().int().positive(),
  bulkDiscount: z.number().min(0).max(0.5),
  /** Thân thiết với người bán từ mức này trở lên được bớt giá (UC-D2). */
  friendDiscountAt: z.number().int().min(0).max(100),
  friendDiscount: z.number().min(0).max(0.5),
});

export const contentSchema = z.object({
  templates: z.array(templateSchema),
  products: z.array(productSchema),
  equipment: z.array(equipmentSchema),
  trafficProfiles: z.array(trafficProfileSchema),
  lots: z.array(lotSchema),
  npcs: z.array(npcArchetypeSchema),
  jobs: z.array(jobSchema),
  map: mapSchema,
  restaurant: restaurantSchema,
  delivery: deliverySchema,
  ingredients: z.array(ingredientSchema),
  places: z.array(placeSchema),
  speakers: z.array(npcSpeakerSchema),
  tutorial: z.array(tutorialStepSchema).min(1),
  /** Câu nói nhanh của người chơi; shout = câu rao hàng, kéo thêm khách khi đứng quầy (UC-D3). */
  quickPhrases: z.array(z.object({ id, text: z.string(), shout: z.boolean().default(false) })),
  customerLines: customerLinesSchema,
  economy: economySchema,
});

export type Template = z.infer<typeof templateSchema>;
export type Product = z.infer<typeof productSchema>;
export type Equipment = z.infer<typeof equipmentSchema>;
export type TrafficProfile = z.infer<typeof trafficProfileSchema>;
export type Lot = z.infer<typeof lotSchema>;
export type NpcArchetype = z.infer<typeof npcArchetypeSchema>;
export type Job = z.infer<typeof jobSchema>;
export type JobRole = z.infer<typeof jobRoleSchema>;
export type Restaurant = z.infer<typeof restaurantSchema>;
export type Delivery = z.infer<typeof deliverySchema>;
export type Economy = z.infer<typeof economySchema>;
export type Place = z.infer<typeof placeSchema>;
export type Ingredient = z.infer<typeof ingredientSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type RecipeStep = z.infer<typeof recipeStepSchema>;
export type RecipeVariant = z.infer<typeof recipeVariantSchema>;
export type Speaker = z.infer<typeof npcSpeakerSchema>;
export type TutorialStep = z.infer<typeof tutorialStepSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type ContentData = z.infer<typeof contentSchema>;
export type ContentInput = z.input<typeof contentSchema>;
