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
  /** Hàng tồn có bị hỏng theo ngày không. */
  perishable: z.boolean(),
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
  /** Giá nhập tham chiếu ở chợ đầu mối. */
  unitCost: vnd,
  /** Giá bán "hợp lý" mà khách kỳ vọng. */
  refPrice: vnd,
  /** Độ nhạy với giá: càng lớn khách càng bỏ đi khi giá cao. */
  elasticity: z.number().positive(),
  /** Số ngày giữ được; null = không hỏng. */
  shelfLifeDays: z.number().int().positive().nullable(),
  /** Tỉ lệ người qua đường quan tâm, theo giờ. */
  interestByHour: byHour,
});

export const equipmentSchema = z.object({
  id,
  name: z.string(),
  price: vnd,
  /** Sản phẩm mà thiết bị này bán được. */
  products: z.array(id).min(1),
  /** Số khách phục vụ tối đa mỗi giờ. */
  capacityPerHour: z.number().int().positive(),
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
  /** Model nhân vật dùng để minh họa. */
  model: z.string(),
  /** Mức ưa thích theo danh mục sản phẩm. */
  likes: z.record(id, z.number().nonnegative()),
});

export const jobSchema = z.object({
  id,
  name: z.string(),
  wagePerHour: vnd,
  description: z.string(),
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
  keeper: z.object({ name: z.string(), model: z.string(), greeting: z.string() }),
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
  /** Thời gian khách chờ được phục vụ (ms thật). */
  serveWindowMs: z.number().int().positive(),
  /** Tiền boa ≈ tỉ lệ giá trị đơn khi phục vụ kịp. */
  tipRate: z.number().min(0).max(1),
  /** Uy tín cộng thêm mỗi đơn phục vụ kịp. */
  serveReputationBonus: z.number().min(0).max(0.1),
  /** Làm thuê: cứ bao nhiêu phút game có một việc vặt, và tiền thưởng khi làm kịp. */
  jobTaskEveryMinutes: z.number().int().positive(),
  jobTaskBonus: z.number().int().nonnegative(),
  /** Bán kính (mét) coi như "đang ở" một địa điểm / quầy. */
  interactRadius: z.number().positive(),
});

export const contentSchema = z.object({
  templates: z.array(templateSchema),
  products: z.array(productSchema),
  equipment: z.array(equipmentSchema),
  trafficProfiles: z.array(trafficProfileSchema),
  lots: z.array(lotSchema),
  npcs: z.array(npcArchetypeSchema),
  jobs: z.array(jobSchema),
  places: z.array(placeSchema),
  speakers: z.array(npcSpeakerSchema),
  tutorial: z.array(tutorialStepSchema).min(1),
  customerLines: customerLinesSchema,
  jobTasks: z.record(id, z.array(z.string()).min(1)),
  economy: economySchema,
});

export type Template = z.infer<typeof templateSchema>;
export type Product = z.infer<typeof productSchema>;
export type Equipment = z.infer<typeof equipmentSchema>;
export type TrafficProfile = z.infer<typeof trafficProfileSchema>;
export type Lot = z.infer<typeof lotSchema>;
export type NpcArchetype = z.infer<typeof npcArchetypeSchema>;
export type Job = z.infer<typeof jobSchema>;
export type Economy = z.infer<typeof economySchema>;
export type Place = z.infer<typeof placeSchema>;
export type Speaker = z.infer<typeof npcSpeakerSchema>;
export type TutorialStep = z.infer<typeof tutorialStepSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type ContentData = z.infer<typeof contentSchema>;
export type ContentInput = z.input<typeof contentSchema>;
