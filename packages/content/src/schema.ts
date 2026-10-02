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

/** Lịch tuần (docs/THEGIOI.md §2): ngày 1 của xóm là Thứ Hai; cuối tuần lưu lượng mỗi kiểu khu khác nhau. */
export const calendarSchema = z.object({
  weekdays: z
    .array(z.object({ name: z.string(), short: z.string(), weekend: z.boolean().default(false) }))
    .length(7),
  /** Ngày cuối tuần: nhân người qua lại theo kiểu khu (trafficProfile id); không khai báo = như ngày thường. */
  weekendTraffic: z.record(id, z.number().positive()).default({}),
});
export type Calendar = z.infer<typeof calendarSchema>;

export const trafficProfileSchema = z.object({
  id,
  name: z.string(),
  /** Số người qua lại mỗi giờ. */
  peoplePerHour: byHour,
  /** Bản sắc khu (THEGIOI §3): người ở khu này ưa nhóm hàng nào (category → hệ số; không ghi = 1). */
  likes: z.record(id, z.number().positive()).default({}),
  emoji: z.string().default("🏘️"),
});

/**
 * Tiếng khu (THEGIOI §3, emergent): nhiều quầy cùng nhóm hàng đang mở trong một khu thì khu "có tiếng" — người qua
 * lại tăng cho cả nhóm (mỗi quầy thêm `perShop`, tối đa `cap`). Khu đạt `minShops` thì bảng xóm gọi tên (vd. khu ăn uống).
 */
export const districtFameSchema = z.object({
  perShop: z.number().min(0).max(1),
  cap: z.number().min(0).max(2),
  minShops: z.number().int().min(2),
  groups: z
    .array(z.object({ id, name: z.string(), emoji: z.string(), categories: z.array(id).min(1) }))
    .min(1),
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
  /**
   * Khách ở chỗ này chịu giá cao hơn giá tham khảo bấy nhiêu lần — ngồi tiệm có mái, có ghế, có biển hiệu thì trả đắt hơn mua
   * ở xe đẩy. Giá "hợp lý" ở chỗ này = refPrice × priceTolerance.
   */
  priceTolerance: z.number().min(1).max(2).default(1),
});

/** Cư dân có tên trong xóm (KIENTRUC §1): khách tới quầy là một người cụ thể, có món ưa; quầy nhớ họ ghé mấy lần. */
export const residentSchema = z.object({
  id,
  name: z.string(),
  /** Kiểu khách (npcs id) — giọng nói, kiên nhẫn, model. */
  archetype: id,
  /** Nhóm hàng ưa (category) — hay ghé quầy bán nhóm này hơn. */
  favorite: id.optional(),
  /** Một dòng giới thiệu: "bán vé số đầu hẻm". */
  bio: z.string(),
});

/** Khách quen (KIENTRUC §1): ghé đủ lần thì thành ❤️; làm sai liên tiếp thì giận. */
export const regularsSchema = z.object({
  greetAt: z.number().int().min(1),
  regularAt: z.number().int().min(2),
  patienceMul: z.number().min(1).max(3),
  /** Khách quen ăn xong có thể dắt thêm bạn (thêm một khách ở nhịp sau). */
  friendChance: z.number().min(0).max(1),
  /** Làm sai / để chờ bỏ về liên tiếp chừng này lần thì khách quen giận, mất ❤️. */
  angryStreak: z.number().int().min(1),
  /** Câu mở lời: khách quay lại (đã ghé ≥ greetAt) / khách quen ❤️. */
  returning: z.array(z.string()).min(1),
  usual: z.array(z.string()).min(1),
});

/**
 * Nhân viên thuê đứng quầy thay (KIENTRUC §2): tay nghề (tỉ lệ làm đúng), tốc độ, lương/giờ; ca làm cố định trong ngày.
 * Nhân viên không tự nhập hàng, không tự mở quầy — chủ mở quầy rồi giao lại; hết hàng thì nghỉ bán.
 */
/**
 * Mở tiệm trong nhà mặt tiền theo quy trình đời thật (UC-F12): thuê nhà (đặt cọc + vốn dự phòng) → đăng ký hộ kinh doanh
 * (đặt tên quán, chờ xét) → ATTP cho quán ăn uống (tập huấn + đoàn kiểm tra tới tận tiệm) → biển hiệu → mở tiệm.
 */
/** Chủ nhà (UC-F13): tới nhắc trước hạn, cho hẹn, dẹp tiệm khi quá hạn nhiều lần. */
export const landlordSchema = z.object({
  id,
  name: z.string(),
  /** Chữ nhỏ dưới tên trong khung chân dung. */
  tag: z.string(),
  /** Model nhân vật (chân dung /portraits/{model}.webp). */
  model: z.string(),
  /** Nhà mặt tiền của người này. */
  lotIds: z.array(id).min(1),
  /** Câu thoại theo tình huống ({owed} = số nợ, {day} = ngày hẹn — "Thứ Tư, ngày 7", {fee} = phí trễ). */
  lines: z.object({
    /** Tới nhắc trước hạn. */
    remind: z.array(z.string()).min(1),
    /** Hôm nay tới ngày hẹn. */
    promised: z.array(z.string()).min(1),
    /** Đồng ý cho hẹn. */
    promise: z.array(z.string()).min(1),
    /** Nhận đủ tiền. */
    paid: z.array(z.string()).min(1),
    /** Quá hạn: trừ vào cọc. */
    late: z.array(z.string()).min(1),
    /** Dẹp tiệm. */
    evict: z.array(z.string()).min(1),
  }),
});

export const rentSchema = z
  .object({
    /** Phút trong ngày chủ nhà tới nhắc (nếu còn nợ). */
    remindMinute: z.number().int().min(0).max(1439),
    /** Chưa hẹn: hạn trả trong ngày; quá hạn thì trừ cọc + tính một lần trễ. Đã hẹn thì hẹn theo ngày, không theo giờ. */
    dueMinute: z.number().int().min(0).max(1439),
    /** Hẹn được tối đa bấy nhiêu ngày. */
    maxPromiseDays: z.number().int().min(1).max(7),
    /** Phí trễ (% số nợ, làm tròn lên nghìn) — khi xin hẹn hoặc bị trừ cọc. */
    lateFeePct: z.number().int().min(0).max(100),
    /** Trễ tới lần thứ bấy nhiêu thì dẹp tiệm. */
    evictAfterStrikes: z.number().int().min(1),
    /** 🤝 tin cậy bị trừ mỗi lần trễ. */
    trustLate: z.number().int().min(0),
    landlords: z.array(landlordSchema).min(1),
  })
  .refine((r) => r.remindMinute < r.dueMinute, "Chủ nhà phải nhắc trước hạn trả");

export const shopSetupSchema = z.object({
  /** Cọc = bấy nhiêu ngày tiền thuê (ngoài đời 3–6 tháng); trả nhà thì hoàn cọc. */
  depositDays: z.number().int().min(1),
  /** Phải còn đủ tiền thuê bấy nhiêu ngày sau khi đặt cọc (vốn dự phòng). */
  reserveDays: z.number().int().min(0),
  license: z.object({
    office: z.string(),
    fee: vnd,
    /** Phút game chờ xét hồ sơ. */
    minutes: z.number().int().positive(),
  }),
  foodCert: z.object({
    /** Template sản phẩm cần giấy ATTP. */
    templates: z.array(z.string()).min(1),
    trainingFee: vnd,
    /** Đoàn kiểm tra tới sau bấy nhiêu phút game kể từ lúc hẹn. */
    inspectAfter: z.number().int().positive(),
    /** Có mặt ở tiệm trong khoảng này (phút game) kể từ lúc đoàn tới. */
    inspectWindow: z.number().int().positive(),
  }),
  signFee: vnd,
  name: z.object({ min: z.number().int().min(1), max: z.number().int().max(40) }),
  rent: rentSchema,
});

/** Xe ôm (docs/KIENTRUC.md §4) + kẹt xe (§5). Tốc độ tính bằng mét/giây trong cảnh 3D. */
export const ridesSchema = z.object({
  /** Trạm xe ôm (place kind "ride"). */
  stationPlaceId: id,
  /** Lưu lượng khu nào quyết định độ kẹt xe (trafficProfiles). */
  jamProfile: id,
  /** Thuê xe Wave cũ một ngày. */
  bikeRentPerDay: vnd,
  /** Tiền xăng mỗi 100 m (cả lượt đi lẫn quay về trạm), làm tròn 500đ. */
  fuelPer100m: vnd,
  /** Giá chuẩn = mở cửa + theo quãng đường, làm tròn nghìn. */
  baseFare: vnd,
  farePer100m: vnd,
  /** Không chở chỗ gần hơn (đi bộ được). */
  minMeters: z.number().positive(),
  /** Các mức giá người chơi đưa ra so với giá chuẩn (trả giá). */
  haggle: z.array(z.object({ ratio: z.number().min(0.5).max(3), label: z.string() })).min(2),
  /** Khách đồng ý: 1 khi ≤ giá chuẩn, giảm dần theo mức nói thách; mưa bão khách dễ chịu hơn. */
  acceptSlope: z.number().positive(),
  rainAcceptBonus: z.number().min(0).max(1),
  routes: z.object({
    road: z.object({
      name: z.string(),
      /** m/s khi đường vắng. */
      speed: z.number().positive(),
      /** Giảm tốc tối đa khi kẹt cứng (congestion = 1). */
      jamSlow: z.number().min(0).max(0.9),
    }),
    alley: z.object({
      name: z.string(),
      speed: z.number().positive(),
      /** Mưa / bão: đường trơn, chạy chậm lại. */
      rainSlow: z.number().min(0).max(0.9),
    }),
  }),
  /** Khách chờ bao lâu là bình thường: m/s ước của "xe ôm vừa phải". */
  expectSpeed: z.number().positive(),
  /** Phút game chờ khách khi ngã tư đông nhất (vắng thì lâu hơn). */
  waitMinutes: z.number().positive(),
  /** Tiền boa theo sao (khoảng min–max, làm tròn nghìn). */
  tip: z.object({
    five: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
    four: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  }),
  lines: z.object({
    ask: z.array(z.string()).min(1),
    accept: z.array(z.string()).min(1),
    refuse: z.array(z.string()).min(1),
    stars: z.record(z.string(), z.array(z.string()).min(1)),
  }),
});

/** Bảng việc xóm + điểm tin cậy (docs/KIENTRUC.md §3). */
export const contractsSchema = z.object({
  /** Người giữ bảng, ghi sổ, phân xử. */
  keeper: z.string(),
  /** Số việc NPC đăng mỗi ngày ở mỗi xóm. */
  perDay: z.number().int().min(1).max(10),
  /** Cọc người nhận đặt (tỉ lệ tiền thưởng) — mất nếu bỏ ngang / trễ hạn. */
  depositRate: z.number().min(0).max(1),
  trust: z.object({
    start: z.number().int().min(0).max(100),
    /** Giao đúng hạn. */
    done: z.number().int().min(0),
    /** Trễ hạn / bỏ ngang. */
    fail: z.number().int().min(0),
    /** Bị khách bắt thối thiếu. */
    short: z.number().int().min(0),
    /** Dưới mức này: Chú Hai nhắc, chỉ nhận việc nhỏ. */
    lowAt: z.number().int().min(0).max(100),
    /** Dưới mức này: khoá nhận việc `lockDays` ngày. */
    lockAt: z.number().int().min(0).max(100),
    lockDays: z.number().int().min(1),
  }),
  templates: z
    .array(
      z.object({
        id,
        /** Người đăng (NPC) — ai đặt hàng. */
        poster: z.string(),
        productId: id,
        /** Món phải giao (công thức chuẩn). */
        variantId: id,
        qty: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
        /** Nơi giao (chỗ bán trên bản đồ). */
        lotId: id,
        /** Hạn giao (phút trong ngày). */
        deadline: z.number().int().min(360).max(1320),
        /** Thưởng = số phần × giá chuẩn × hệ số (đặt số lượng + giao tận nơi nên cao hơn bán lẻ). */
        priceMul: z.number().min(1).max(3),
        /** Tin cậy tối thiểu để nhận. */
        minTrust: z.number().int().min(0).max(100),
        /** Câu ghi trên bảng: {qty} {dish} {place} {deadline}. */
        text: z.string(),
      }),
    )
    .min(1),
});

/**
 * 📋 Việc người chơi đăng cho nhau (docs/KIENTRUC.md §3, 1.20b — UC-M8): người đăng trả tiền vào ví giữ hộ trước, người nhận
 * đặt cọc; nộp việc → người đăng nghiệm thu (quá hạn thì tự trả), khiếu nại → người giữ bảng xem sản phẩm rồi phân xử.
 */
export const gigsSchema = z.object({
  /** Phí ghi sổ (tỉ lệ tiền công, tối thiểu `feeMin`) — vào quỹ xóm. */
  feeRate: z.number().min(0).max(0.5),
  feeMin: z.number().int().min(0),
  /** Phút game người đăng có để nghiệm thu; quá hạn tự trả cho người nhận (như sàn freelance tự giải ngân). */
  reviewMinutes: z.number().int().min(10),
  /** Khiếu nại thua (việc đạt chuẩn mà vẫn kêu) / nộp việc kém bị xử thua: trừ tin cậy. */
  disputeLostTrust: z.number().int().min(0),
  /** 📸 Thợ ảnh (NGHE §3.3): chủ quầy thuê chụp ảnh quầy đăng lên nhóm xóm → khách ghé nhiều hơn vài giờ. */
  photo: z.object({
    /** Người dẫn nghề. */
    mentor: z.string(),
    /** Mức tiền công người đăng chọn. */
    rewards: z.array(z.number().int().min(1000)).min(1),
    /** Hạn làm (giờ game kể từ lúc đăng) người đăng chọn. */
    hours: z.array(z.number().int().min(1).max(12)).min(1),
    minTrust: z.number().int().min(0).max(100),
    /** Thuê máy ảnh mỗi buổi chụp (money sink). */
    cameraRent: z.number().int().min(0),
    /** Một buổi chụp kéo dài (ms thật) và số khoảnh khắc đẹp xuất hiện. */
    sessionMs: z.number().int().min(5000),
    moments: z.number().int().min(3),
    /** Bấm lệch khoảnh khắc trong khoảng này (ms) thì vẫn có điểm; trong `perfectMs` là 100 điểm. */
    windowMs: z.number().int().min(100),
    perfectMs: z.number().int().min(0),
    /** Số kiểu ảnh tối đa một buổi; nộp `keep` tấm đẹp nhất. */
    shots: z.number().int().min(3),
    keep: z.number().int().min(1),
    /** Điểm ảnh (trung bình `keep` tấm) từ mức này trở lên là đạt khi phân xử. */
    passQuality: z.number().int().min(0).max(100),
    /** Đăng ảnh lên nhóm xóm: khách ghé ×(1 + adBoost × chất lượng) trong `adMinutes`. */
    adBoost: z.number().min(0).max(2),
    adMinutes: z.number().int().min(10),
    /** Khoảnh khắc: emoji + chữ hiện trong khung ngắm. */
    kinds: z.array(z.object({ emoji: z.string(), label: z.string() })).min(1),
  }),
});

export const staffSchema = z.object({
  shifts: z
    .array(
      z.object({
        id,
        name: z.string(),
        from: z.number().int().min(0).max(1440),
        to: z.number().int().min(0).max(1440),
      }),
    )
    .min(1),
  people: z
    .array(
      z.object({
        id,
        name: z.string(),
        bio: z.string(),
        model: z.string(),
        /** Tỉ lệ làm đúng món (0–1); sai thì giảm nửa giá cho khách. */
        accuracy: z.number().min(0).max(1),
        /** Phút game cho mỗi khách. */
        serveMinutes: z.number().positive(),
        wagePerHour: vnd,
      }),
    )
    .min(1),
});

/**
 * Cấp tiệm (docs/IA.md bước E): nâng cấp (mở rộng, sửa sang — tốn tiền) thì tiệm to hơn, đông khách hơn, thuê được nhiều
 * nhân viên hơn. Xe đẩy vỉa hè chỉ cấp 1; cấp cao cần nhà mặt tiền (`houseOnly`).
 */
export const shopLevelSchema = z.object({
  level: z.number().int().min(1),
  name: z.string(),
  emoji: z.string(),
  /** Nhân lưu lượng khách tới quầy. */
  trafficMul: z.number().min(1),
  /** Số nhân viên thuê cùng lúc tối đa. */
  maxStaff: z.number().int().min(1),
  /** Tiền nâng lên cấp này (từ cấp dưới); cấp 1 = 0. */
  upgradeCost: z.number().int().min(0),
  houseOnly: z.boolean().default(false),
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
  kind: z.enum(["equipment_shop", "market", "job", "ride"]),
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
  /** Câu ghi vào "Chuyện của tôi" khi đạt (docs/THEGIOI.md §1); bỏ trống = không ghi. */
  story: z.string().optional(),
});
export type Achievement = z.infer<typeof achievementSchema>;

/**
 * Một mốc trong "Chuyện của tôi" (docs/THEGIOI.md §1): câu có chỗ trống {money}, {lot}, {product}…
 * Server điền và lưu nguyên câu lúc xảy ra — đổi content sau này không làm sai ký ức.
 */
export const storyBeatSchema = z.object({ id, emoji: z.string(), text: z.string() });
export type StoryBeat = z.infer<typeof storyBeatSchema>;

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
  /** Chỗ dựng công trường (mặc định cạnh chỗ bán đầu tiên trong `demand.lots`). */
  site: z.object({ x: z.number(), z: z.number() }).optional(),
  /** Số mẻ vữa bà con phụ hồ trộn đúng thì công trình xong sớm (UC-J6). */
  crewMixes: z.number().int().min(1).default(8),
});
export type Project = z.infer<typeof projectSchema>;

/**
 * 🏗️ Phụ hồ công trình xóm (NGHE §3.4, UC-J6): công trình đang thi công mở công trường, Cai thầu giao từng mẻ vữa; trộn đúng
 * công thức thật (xi măng : cát : nước) thì được trả công từ khoản nhân công của công trình (trích trong chi phí).
 */
export const crewSchema = z.object({
  keeper: z.string(),
  /** Phần chi phí công trình dành trả công phụ hồ (giữ trong ví riêng của công trình; dư thì trả nhà thầu khi xong). */
  laborShare: z.number().min(0).max(0.6),
  /** Tiền công một mẻ trộn đúng. */
  wagePerMix: vnd,
  /** Mỗi mẻ mất bấy nhiêu phút game (không trộn dồn). */
  mixMinutes: z.number().int().min(1),
  /** Nước lệch trong tỉ lệ này vẫn đạt (cát ẩm / khô). */
  waterTolerance: z.number().min(0).max(0.5),
  /** Số bao xi măng mỗi mẻ (thấp nhất, cao nhất). */
  bags: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
  mixes: z
    .array(
      z.object({
        id,
        name: z.string(),
        /** Dùng làm gì (đời thật). */
        use: z.string(),
        /** Thùng cát 18 lít mỗi bao xi măng 50 kg. */
        sandPerBag: z.number().int().min(1),
        /** Lít nước mỗi bao. */
        waterPerBag: z.number().int().min(1),
      }),
    )
    .min(1),
});
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
  /** Chuyển hàng giữa hai cửa hàng của mình: hàng tới sau bấy nhiêu phút game (docs/IA.md bước D). */
  transferMinutes: z.number().int().positive(),
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
    /** Theo lịch tuần (THEGIOI §2): đúng thứ đó thì diễn ra trong khung giờ (chợ đêm thứ Bảy). */
    z.object({
      kind: z.literal("weekly"),
      /** Thứ trong tuần (0 = Thứ Hai … 6 = Chủ nhật, theo calendar.weekdays). */
      weekdays: z.array(z.number().int().min(0).max(6)).min(1),
      from: z.number().int().min(0).max(1440),
    }),
  ]),
  effects: z.object({
    /** Hệ số khách cho quầy của người tổ chức. */
    demand: z.number().min(0).max(5).optional(),
    /** Giảm giá mọi món (tỉ lệ) trong lúc diễn ra. */
    discount: z.number().min(0).max(0.5).optional(),
    /** Đè thời tiết cả xóm. */
    weather: weatherIdSchema.optional(),
    /** Sự kiện cả xóm: nhân khách theo nhóm hàng (category) cho mọi quầy đang mở (chợ đêm: ăn vặt, đồ uống). */
    categoryDemand: z.record(id, z.number().min(0).max(5)).optional(),
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
  id: z.enum(["event_host"]),
  level: z.number().int().min(1),
  label: z.string(),
});

export const contentSchema = z.object({
  templates: z.array(templateSchema),
  products: z.array(productSchema),
  equipment: z.array(equipmentSchema),
  trafficProfiles: z.array(trafficProfileSchema),
  calendar: calendarSchema,
  districtFame: districtFameSchema,
  /** "Trong lúc bạn vắng" (THEGIOI §4): vắng ít nhất chừng này phút thật thì mới tóm tắt. */
  away: z.object({ minMinutes: z.number().int().positive() }),
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
  crew: crewSchema,
  achievements: z.array(achievementSchema).min(1),
  story: z.array(storyBeatSchema).min(1),
  residents: z.array(residentSchema).min(1),
  regulars: regularsSchema,
  staff: staffSchema,
  shopLevels: z.array(shopLevelSchema).min(1),
  contracts: contractsSchema,
  gigs: gigsSchema,
  rides: ridesSchema,
  shopSetup: shopSetupSchema,
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
export type Landlord = z.infer<typeof landlordSchema>;
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
