import { z } from "zod";

// Schema nội dung game. Thêm nghề/sản phẩm mới = thêm dữ liệu, không sửa code (docs/PLAN.md §3.5, D6).

const id = z.string().regex(/^[a-z0-9_]+$/, "id chỉ gồm a-z, 0-9, _");
const vnd = z.number().int().positive();
/** Hệ số theo giờ (0–23); giờ không khai báo lấy nội suy từ giờ gần nhất. */
const byHour = z.record(z.string().regex(/^([0-9]|1[0-9]|2[0-3])$/), z.number().nonnegative());

/** Template quy định HÀNH VI; sản phẩm chỉ là số liệu. */
export const templateSchema = z.object({
  id: z.enum(["FOOD", "RETAIL", "SERVICE"]),
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
  /**
   * Dịch vụ (SERVICE, UC-G2): khách chỉ kể triệu chứng, không nói bệnh — "Bánh sau xẹp lép rồi".
   * Có symptoms thì câu khách nói lấy từ đây thay cho tên món.
   */
  symptoms: z.array(z.string()).optional(),
  /** Kết quả khi kiểm tra từng bộ phận (UC-G3); bộ phận không ghi = bình thường. */
  findings: z.record(id, z.string()).default({}),
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

/**
 * Bố trí quầy theo góc nhìn người bán (UC-F5): mỗi khu gắn với một bước công thức.
 * cups = chồng ly · jars = dãy bình có vòi · chips = dải chọn một · grid = lưới khay · shaker = giữ để lắc · sealer = máy dán.
 */
export const counterSchema = z.object({
  title: z.string(),
  zones: z
    .array(
      z.object({
        zone: z.enum(["cups", "jars", "chips", "grid", "shaker", "sealer"]),
        step: id,
        /** Số ô của lưới khay (ô trống hiện khoá). */
        slots: z.number().int().min(1).max(24).optional(),
      }),
    )
    .min(1),
});

/** Chẩn đoán trước khi sửa (SERVICE, UC-G3): các bộ phận chạm vào để kiểm tra. */
export const diagnosisSchema = z.object({
  parts: z.array(z.object({ id, label: z.string(), emoji: z.string() })).min(1),
  /** Thời gian một lần kiểm tra (ms thật) — kiểm tra lung tung thì khách sốt ruột. */
  checkMs: z.number().int().positive(),
  /** Câu khi bộ phận không có gì. */
  ok: z.string(),
  /** Khách chạy thử mà xe vẫn hư (sửa sai bệnh). */
  stillBroken: z.string(),
});

export const productSchema = z.object({
  id,
  template: z.enum(["FOOD", "RETAIL", "SERVICE"]),
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
  /** Quầy dạng lưới thay cho danh sách bước (bỏ trống = làm theo từng bước). */
  counter: counterSchema.optional(),
  /** Dịch vụ: kiểm tra bộ phận trước khi sửa (bỏ trống = không có bước chẩn đoán). */
  diagnosis: diagnosisSchema.optional(),
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
  /** cart = xe đẩy trên vỉa hè; house = nhà mặt tiền có không gian tiệm bên trong (UC-W6). */
  kind: z.enum(["cart", "house"]).default("cart"),
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
  /** Người chủ chỉ việc từng bước khi mới vào làm vai này (UC-W1). */
  guide: z.array(z.string()).default([]),
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
 * B nhà phố (tiệm tạp hoá, nhà ống) · T trụ sở xã / nhà văn hoá · K trường làng · H nhà dân (cấp nhà: content.housing) · P công viên · M chợ · S sân trường · L bãi xe · . đất trống
 * N cây ATM trên vỉa hè (rút/gửi tiền ngân hàng, UC-I6)
 */
export const MAP_WALKABLE = "=|+csaPMSLN";
export const mapSchema = z.object({
  tile: z.number().positive(),
  /** Tâm ô đầu tiên (hàng 0, cột 0). */
  origin: point,
  rows: z.array(z.string().regex(/^[=|+csaBTKHPMSLN.]+$/)).min(1),
});

/** Sạp đồ ăn NPC bày theo giờ (docs/USECASES.md UC-B9): người chơi mua ăn tại chỗ. */
export const vendorSchema = z.object({
  id,
  /** Người bán (hiện trong khung thoại). */
  name: z.string(),
  /** Chữ trên biển: "XÔI BÀ BẢY". */
  sign: z.string(),
  signColor: z.string(),
  /** Model xe/sạp trong city bundle. */
  model: z.string(),
  /** Dáng người bán (model nhân vật) — cũng là ảnh chân dung khi đứng trước sạp (UC-E5). */
  seller: z.string().default("character-male-c"),
  position: point,
  /** 0 = mặt quầy quay về +z. */
  facing: z.number(),
  /** Mở/dọn hàng (phút trong ngày). */
  open: z.number().int(),
  close: z.number().int(),
  seats: z.number().int().min(0).max(6).default(2),
  /** Sạp nhỏ không có mã QR — chỉ nhận tiền mặt. */
  cashOnly: z.boolean().default(false),
  lines: z.array(z.string()).min(1),
  items: z
    .array(
      z.object({
        id,
        name: z.string(),
        emoji: z.string(),
        price: vnd,
        /** Ăn xong no thêm / đỡ khát thêm bao nhiêu (0–100, UC-B11). */
        food: z.number().min(0).max(100).default(0),
        drink: z.number().min(0).max(100).default(0),
      }),
    )
    .min(1),
});
export type Vendor = z.infer<typeof vendorSchema>;

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

/** Sổ đánh giá quầy (UC-F11): khách NPC/người chơi chấm sao + viết vài chữ; chủ quầy trả lời. */
export const reviewTag = z.enum([
  "fast",
  "slow",
  "wrong",
  "pricey",
  "cheap",
  "short",
  "lost",
  "vip_good",
  "vip_bad",
  "ok",
]);
export type ReviewTag = z.infer<typeof reviewTag>;
export const reviewsSchema = z.object({
  /** Khách NPC tính tiền xong có viết đánh giá (khách sộp, reviewer luôn viết). */
  chance: z.number().min(0).max(1),
  /** Khách chờ lâu bỏ đi có viết đánh giá xấu. */
  lostChance: z.number().min(0).max(1),
  /** Trả lời khéo đánh giá ≤ 3 sao thì gỡ lại chút uy tín. */
  replyRep: z.number().min(0).max(0.1),
  maxText: z.number().int().min(20).max(500),
  /** Tên khách NPC ký dưới đánh giá. */
  names: z.array(z.string()).min(3),
  /** Câu theo tình huống; mỗi tình huống ≥ 2 câu. */
  lines: z.record(reviewTag, z.array(z.string()).min(2)),
  /** Câu trả lời nhanh cho chủ quầy. */
  quickReplies: z.object({
    good: z.array(z.string()).min(1),
    bad: z.array(z.string()).min(1),
  }),
  /** Từ bị che bằng *** trong chữ người chơi viết. */
  banned: z.array(z.string()),
});

/** Bảng giải của xóm (DESIGN §4, §13): nhiều con đường thành công, không chỉ "giàu nhất". */
export const awardMetric = z.enum([
  "revenue",
  "profit",
  "served",
  "rating",
  "growth",
  "wages",
  "friendly",
]);
export type AwardMetric = z.infer<typeof awardMetric>;
export const awardSchema = z.object({
  id,
  emoji: z.string(),
  name: z.string(),
  description: z.string(),
  metric: awardMetric,
  /** Ngưỡng tối thiểu để được xếp (vd. ít nhất 3 đánh giá). */
  min: z.number().nonnegative().default(0),
});
export type Award = z.infer<typeof awardSchema>;

/** Thành tựu: mở bằng làm thật, có tiến độ thấy được (DESIGN §4). */
export const achievementMetric = z.enum([
  "served",
  "revenue",
  "wages",
  "five_stars",
  "replies",
  "events",
  "level",
  "friends",
]);
export type AchievementMetric = z.infer<typeof achievementMetric>;
export const achievementSchema = z.object({
  id,
  emoji: z.string(),
  name: z.string(),
  description: z.string(),
  metric: achievementMetric,
  goal: z.number().int().positive(),
});
export type Achievement = z.infer<typeof achievementSchema>;

/**
 * Giọng thoại theo kiểu khách (#12): học sinh nói teencode, dân văn phòng Gen Z, cô chú kiểu xóm…
 * Câu có thể hơi "mặn"; người chơi tắt "thoại mặn" thì client đổi từ theo `soften`.
 */
const lineList = z.array(z.string()).min(2).optional();
export const voiceSchema = z.object({
  archetype: id,
  /** Câu gọi món, có {dish}. */
  ask: z.array(z.string()).min(2),
  cheap: lineList,
  fair: lineList,
  pricey: lineList,
  thanks: lineList,
  impatient: lineList,
});
export type Voice = z.infer<typeof voiceSchema>;
export const voicesSchema = z.object({
  voices: z.array(voiceSchema),
  /** Từ "mặn" → từ hiền (khi người chơi tắt thoại mặn). Khoá là chữ thường. */
  soften: z.record(z.string(), z.string()),
});

/**
 * Công trình chung của xóm (UC-J5): đề xuất → bỏ phiếu → góp quỹ → thi công → nghiệm thu.
 * Tiền lấy từ quỹ xóm (phí chợ một phần + hàng xóm góp) — chỗ tiêu chung (Luật 2.2).
 */
export const projectSchema = z.object({
  id,
  name: z.string(),
  emoji: z.string(),
  description: z.string(),
  /** Đời thật: vì sao cần (hiện khi đề xuất). */
  why: z.string(),
  cost: vnd,
  /** Số ngày game thi công. */
  buildDays: z.number().int().min(1).max(14),
  /** Hiệu ứng khi xong: khách ở các chỗ bán này ghé nhiều hơn. */
  demand: z.object({ lots: z.array(id).min(1), mult: z.number().min(1).max(1.5) }),
  /** Phải xong công trình này trước. */
  requires: id.optional(),
});
export type Project = z.infer<typeof projectSchema>;
export const fundSchema = z.object({
  /** Phần phí chợ / thuế khoán hằng ngày đi vào quỹ xóm (phần còn lại cho ban quản lý chợ). */
  feeShare: z.number().min(0).max(1),
  /** Hạn bỏ phiếu (phút game kể từ lúc đề xuất). */
  voteMinutes: z.number().int().min(30),
  /** Góp quỹ: bước tiền. */
  donateStep: vnd,
});

/**
 * Đói / khát (UC-B11): giảm dần theo giờ game, ăn uống thì hồi. Chỉ làm tay chậm đi chút + nhắc — KHÔNG khoá việc
 * chơi (DESIGN Luật 17: không ép giờ chơi).
 */
export const needsSchema = z.object({
  foodPerHour: z.number().min(0).max(50),
  drinkPerHour: z.number().min(0).max(50),
  /** Ban đêm (ngủ) chỉ tính bấy nhiêu phút game cho mỗi đêm. */
  nightMinutes: z.number().int().min(0).max(600),
  /** Dưới mức này là đói / khát: giữ nút lâu hơn hệ số `slowHold`. */
  lowAt: z.number().min(0).max(100),
  slowHold: z.number().min(1).max(2),
  /** Mua món ở quầy hàng xóm: no / đỡ khát theo loại hàng. */
  byCategory: z.record(z.string(), z.object({ food: z.number(), drink: z.number() })),
  /** Khách réo khi quầy mở mà chủ vắng. */
  callouts: z.array(z.string()).min(2),
});

export const economySchema = z.object({
  startingMoney: vnd,
  /** Vốn dự phòng gửi sẵn trong tài khoản 🏦 cho người mới (mua xe xong vẫn còn tiền sống, rút ở ATM). */
  startingBank: z.number().int().nonnegative().default(0),
  /** Phút trong ngày (game) khi ngày bắt đầu / kết thúc; ban đêm được bỏ qua. */
  dayStartMinute: z.number().int().min(0).max(1439),
  dayEndMinute: z.number().int().min(1).max(1440),
  /** Chu kỳ tính bán hàng, đơn vị phút game. */
  economyTickMinutes: z.number().int().positive(),
  /** Mỗi ngày giá chợ dao động trong ±biên độ này. */
  marketPriceSwing: z.number().min(0).max(0.5),
  /** Lựa chọn "không mua ai" trong mô hình chia khách. */
  outsideOption: z.number().positive(),
  /** Nhân số khách ghé quầy (nhịp chơi): 1 = theo lưu lượng thật; >1 cho quầy đông tay hơn. */
  demandScale: z.number().positive().default(1),
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
  /** Thanh lý hàng tồn cho chợ (đổi nghề, dư hàng): Bà Năm mua lại bằng tỉ lệ này của giá gốc. */
  resaleRate: z.number().min(0).max(1),
  /** Thân thiết với người bán từ mức này trở lên được bớt giá (UC-D2). */
  friendDiscountAt: z.number().int().min(0).max(100),
  friendDiscount: z.number().min(0).max(0.5),
  /**
   * Chỗ tiêu bắt buộc (Luật 2.2): phí chợ/vệ sinh/thuế khoán mỗi ngày mở quầy (theo kiểu chỗ bán),
   * điện nước của tiệm tính theo giờ mở cửa.
   */
  fees: z.object({
    daily: z.object({
      cart: z.number().int().nonnegative(),
      house: z.number().int().nonnegative(),
    }),
    utilitiesPerHour: z.number().int().nonnegative(),
  }),
  /**
   * Hao mòn xe đẩy/quầy: mỗi món bán được mòn thêm; mòn nhiều thì khách bớt ghé + làm món chậm hơn; hư hẳn thì
   * không mở được. Sửa ở vựa xe: giá = giá thiết bị × độ mòn × repairRate.
   */
  maintenance: z.object({
    wearPerServe: z.number().min(0).max(0.1),
    slowAt: z.number().min(0).max(1),
    slowDemand: z.number().min(0).max(1),
    slowHold: z.number().min(1).max(3),
    repairRate: z.number().min(0).max(1),
  }),
  /** Ngân hàng (DESIGN §2, Luật 2.3): lãi rất nhỏ mỗi ngày, có trần; rút/gửi ở cây ATM theo bội số. */
  bank: z.object({
    interestRate: z.number().min(0).max(0.01),
    interestCap: z.number().int().nonnegative(),
    /** Số dư dưới mức này không có lãi. */
    interestMin: z.number().int().nonnegative(),
    withdrawStep: vnd,
    depositStep: vnd,
    /** "Tự chọn" cách trả: dưới mức này trả tiền mặt trước, từ mức này chuyển khoản trước (như ngoài đời). */
    cashFirstBelow: vnd,
    /** Phí mỗi lần rút tiền ở ATM (nội mạng ~1.000đ ngoài đời). */
    withdrawFee: vnd,
    /** Sai PIN bấy nhiêu lần thì máy giữ thẻ tới hôm sau. */
    pinTries: z.number().int().min(1).max(5),
  }),
});

/** Bốn kiểu trời (docs/DESIGN.md §8): ảnh hưởng khách, giao hàng, ánh sáng, tiếng. */
export const WEATHER_IDS = ["sunny", "cloudy", "rain", "storm"] as const;
export const weatherIdSchema = z.enum(WEATHER_IDS);

export const weatherKindSchema = z.object({
  id: weatherIdSchema,
  name: z.string(),
  emoji: z.string(),
  /** Hệ số khách ghé chỗ bán ngoài trời (xe đẩy, sạp) và trong nhà có mái (tiệm, quán cơm). */
  outdoor: z.number().min(0).max(3),
  indoor: z.number().min(0).max(3),
  /** Hệ số khách theo danh mục sản phẩm (trời nóng đồ uống lạnh bán chạy…). */
  category: z.record(id, z.number().min(0).max(3)).default({}),
  delivery: z.object({
    /** Tốc độ chạy xe (hệ số). */
    speed: z.number().positive().max(2),
    /** Phụ phí khách trả thêm mỗi đơn (tỉ lệ tiền đơn) — người giao được hưởng. */
    surcharge: z.number().min(0).max(2),
    /** Hàng dễ vỡ chạy nhanh dễ móp hơn (nhân xác suất). */
    damage: z.number().min(0).max(5),
  }),
  /** Trời tối thêm 0–1 (mây, mưa). */
  dim: z.number().min(0).max(1),
  /** Mật độ hạt mưa 0–1 (0 = không mưa). */
  rain: z.number().min(0).max(1),
  /** Câu báo khi trời chuyển sang kiểu này (dải tin), và câu dự báo trước: {time} = giờ bắt đầu. */
  news: z.string(),
  forecast: z.string(),
});

export const weatherSchema = z.object({
  kinds: z.array(weatherKindSchema).length(WEATHER_IDS.length),
  /** Trời đổi theo từng khối thời gian này (phút game). */
  blockMinutes: z.number().int().min(30).max(480),
  /** Xác suất khối sau giữ nguyên trời của khối trước (trời không đổi xoành xoạch). */
  persist: z.number().min(0).max(1),
  /** Trọng số chọn từng kiểu trời theo giờ trong ngày. */
  weights: z.record(weatherIdSchema, byHour),
  /** Báo trước bao nhiêu phút game khi trời sắp đổi. */
  forecastMinutes: z.number().int().positive(),
});

/**
 * Sự kiện bằng dữ liệu (docs/DESIGN.md §9): ai/khi nào gây ra (trigger), kéo dài bao lâu, ảnh hưởng gì.
 * - player: người chơi tự tổ chức (khai trương) — trả tiền các khoản, có thời gian chờ giữa hai lần.
 * - daily: mỗi ngày tung xác suất một lần cho cả xóm (mưa lớn toàn xóm), giờ bắt đầu trong khung giờ.
 * - per_hour: cá nhân, xảy ra theo tỉ lệ khi điều kiện đúng (khách VIP ghé quầy đang mở).
 */
export const gameEventSchema = z.object({
  id,
  name: z.string(),
  emoji: z.string(),
  scope: z.enum(["personal", "neighborhood", "server", "player"]),
  /** Thời lượng (phút game). */
  minutes: z.number().int().positive(),
  trigger: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("player"),
      costs: z.array(z.object({ id, label: z.string(), emoji: z.string(), price: vnd })).min(1),
      cooldownDays: z.number().int().min(0),
    }),
    z.object({
      kind: z.literal("daily"),
      chance: z.number().min(0).max(1),
      from: z.number().int().min(0).max(1440),
      to: z.number().int().min(0).max(1440),
    }),
    z.object({ kind: z.literal("per_hour"), perHour: z.number().positive() }),
  ]),
  effects: z.object({
    /** Hệ số khách cho quầy của người tổ chức. */
    demand: z.number().min(0).max(5).optional(),
    /** Giảm giá mọi món (tỉ lệ) trong lúc diễn ra. */
    discount: z.number().min(0).max(0.5).optional(),
    /** Đè thời tiết cả xóm. */
    weather: weatherIdSchema.optional(),
    /** Khách VIP: dặn nhiều, ít kiên nhẫn, boa đậm; làm hoàn hảo thì uy tín lên, hỏng thì tụt. */
    vip: z
      .object({
        minMods: z.number().int().min(0).max(4),
        patience: z.number().positive().max(2),
        tipMult: z.number().min(1).max(10),
        repWin: z.number().min(0).max(0.2),
        repLose: z.number().min(0).max(0.2),
      })
      .optional(),
  }),
  /** Tin cho cả xóm ({name} = người tổ chức, {shop} = quầy). */
  news: z.string(),
});

/**
 * Cấp nhà (docs/DESIGN.md §5 — nhà ở nâng cấp dần): xóm quê bắt đầu bằng nhà tranh, nhà cấp 4; sau này người chơi
 * mua/xây nhà thì nâng lên nhà ống 1 lầu, 2 lầu. `models` là tên model trong bundle village (art/blender/nha_que.py).
 */
export const housingSchema = z.object({
  tiers: z
    .array(
      z.object({
        id,
        name: z.string(),
        models: z.array(z.string()).min(1),
        /** Tỉ lệ nhà dân (ô H) ở cấp này lúc xóm mới lập. */
        start: z.number().min(0).max(1),
      }),
    )
    .min(1),
  /** Nhà phố buôn bán (ô B), trụ sở xã (ô T), trường làng (ô K). */
  shops: z.array(z.string()).min(1),
  office: z.string(),
  school: z.string(),
});

/**
 * Kỹ năng (docs/DESIGN.md §4): tăng nhờ làm thật — mỗi việc làm đúng cho điểm vào kỹ năng tương ứng.
 * `per` = điểm cần cho mỗi bậc (bậc tối đa `max`); `effect` = hiệu quả mỗi bậc (đọc ở sim/progression).
 */
export const skillSchema = z.object({
  id: z.enum(["tay_nhanh", "nho_mon", "an_noi"]),
  name: z.string(),
  emoji: z.string(),
  description: z.string(),
  per: z.number().int().positive(),
  max: z.number().int().min(1).max(10),
  /** Mỗi bậc: tay nhanh = giảm thời gian giữ nút; ăn nói = tăng kiên nhẫn khách; nhớ món = bậc mở gợi ý. */
  effect: z.number().min(0).max(1),
});

/** Mở khoá theo cấp (Luật 4.2 — mở bằng làm thật). */
export const unlockSchema = z.object({
  id: z.enum(["lot_house", "event_host"]),
  level: z.number().int().min(1),
  label: z.string(),
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
  vendors: z.array(vendorSchema).default([]),
  restaurant: restaurantSchema,
  delivery: deliverySchema,
  ingredients: z.array(ingredientSchema),
  places: z.array(placeSchema),
  speakers: z.array(npcSpeakerSchema),
  tutorial: z.array(tutorialStepSchema).min(1),
  /** Câu nói nhanh của người chơi; shout = câu rao hàng, kéo thêm khách khi đứng quầy (UC-D3). */
  quickPhrases: z.array(z.object({ id, text: z.string(), shout: z.boolean().default(false) })),
  /** Câu chủ quầy hàng xóm "nói" trong khung đứng trước quầy (UC-E5); {dish} {price} được thay. */
  counterLines: z.object({
    hello: z.array(z.string()).min(1),
    picked: z.array(z.string()).min(1),
    soldOut: z.string(),
  }),
  customerLines: customerLinesSchema,
  voice: voicesSchema,
  reviews: reviewsSchema,
  awards: z.array(awardSchema).min(1),
  projects: z.array(projectSchema).min(1),
  needs: needsSchema,
  fund: fundSchema,
  achievements: z.array(achievementSchema).min(1),
  economy: economySchema,
  weather: weatherSchema,
  events: z.array(gameEventSchema).default([]),
  housing: housingSchema,
  skills: z.array(skillSchema).default([]),
  unlocks: z.array(unlockSchema).default([]),
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
export type WeatherId = z.infer<typeof weatherIdSchema>;
export type WeatherKind = z.infer<typeof weatherKindSchema>;
export type Weather = z.infer<typeof weatherSchema>;
export type GameEventDef = z.infer<typeof gameEventSchema>;
export type Housing = z.infer<typeof housingSchema>;
export type Skill = z.infer<typeof skillSchema>;
export type SkillId = Skill["id"];
export type ContentData = z.infer<typeof contentSchema>;
export type ContentInput = z.input<typeof contentSchema>;
