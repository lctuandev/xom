import { data } from "./data.js";
import { type ContentData, contentSchema } from "./schema.js";

export * from "./schema.js";

/** Validate và kiểm tra tham chiếu chéo; ném lỗi ngay khi build/khởi động nếu nội dung sai. */
export function loadContent(raw: unknown): Content {
  const parsed = contentSchema.parse(raw);
  const errors: string[] = [];
  const ids = (list: { id: string }[]) => new Set(list.map((x) => x.id));
  const products = ids(parsed.products);
  const profiles = ids(parsed.trafficProfiles);
  const templates = ids(parsed.templates);

  for (const list of [parsed.products, parsed.equipment, parsed.lots, parsed.jobs, parsed.npcs]) {
    const seen = new Set<string>();
    for (const x of list) {
      if (seen.has(x.id)) errors.push(`id trùng: ${x.id}`);
      seen.add(x.id);
    }
  }
  for (const p of parsed.products) {
    if (!templates.has(p.template)) errors.push(`${p.id}: template ${p.template} không tồn tại`);
    if (p.unitCost >= p.refPrice) errors.push(`${p.id}: giá nhập phải thấp hơn giá tham chiếu`);
    if (Object.keys(p.interestByHour).length === 0) errors.push(`${p.id}: thiếu interestByHour`);
  }
  for (const e of parsed.equipment) {
    for (const pid of e.products)
      if (!products.has(pid)) errors.push(`${e.id}: sản phẩm ${pid} không tồn tại`);
  }
  for (const l of parsed.lots) {
    if (!profiles.has(l.traffic)) errors.push(`${l.id}: traffic ${l.traffic} không tồn tại`);
  }
  const places = ids(parsed.places);
  const jobs = ids(parsed.jobs);
  const speakers = ids(parsed.speakers);
  const steps = ids(parsed.tutorial);
  for (const pl of parsed.places) {
    for (const j of pl.jobs) if (!jobs.has(j)) errors.push(`${pl.id}: việc ${j} không tồn tại`);
  }
  for (const st of parsed.tutorial) {
    if (st.speaker && !speakers.has(st.speaker))
      errors.push(`kịch bản ${st.id}: không có NPC ${st.speaker}`);
    if (st.target && st.target !== "stall" && !places.has(st.target))
      errors.push(`kịch bản ${st.id}: không có địa điểm ${st.target}`);
    if (st.next && !steps.has(st.next))
      errors.push(`kịch bản ${st.id}: bước tiếp ${st.next} không tồn tại`);
    for (const c of st.choices)
      if (!steps.has(c.next))
        errors.push(`kịch bản ${st.id}: lựa chọn tới ${c.next} không tồn tại`);
    if (st.until && !st.next) errors.push(`kịch bản ${st.id}: có điều kiện nhưng thiếu bước tiếp`);
  }
  for (const j of Object.keys(parsed.jobTasks))
    if (!jobs.has(j)) errors.push(`jobTasks: việc ${j} không tồn tại`);
  const eco = parsed.economy;
  if (eco.dayEndMinute <= eco.dayStartMinute)
    errors.push("economy: dayEndMinute phải sau dayStartMinute");
  if (errors.length) throw new Error(`Nội dung game không hợp lệ:\n- ${errors.join("\n- ")}`);
  return new Content(parsed);
}

/** Truy cập nội dung theo id, dùng chung cho server, web và tools/balance. */
export class Content {
  readonly productById: ReadonlyMap<string, ContentData["products"][number]>;
  readonly equipmentById: ReadonlyMap<string, ContentData["equipment"][number]>;
  readonly lotById: ReadonlyMap<string, ContentData["lots"][number]>;
  readonly trafficById: ReadonlyMap<string, ContentData["trafficProfiles"][number]>;
  readonly jobById: ReadonlyMap<string, ContentData["jobs"][number]>;
  readonly templateById: ReadonlyMap<string, ContentData["templates"][number]>;
  readonly placeById: ReadonlyMap<string, ContentData["places"][number]>;
  readonly speakerById: ReadonlyMap<string, ContentData["speakers"][number]>;
  readonly stepById: ReadonlyMap<string, ContentData["tutorial"][number]>;

  constructor(readonly data: ContentData) {
    this.productById = new Map(data.products.map((x) => [x.id, x]));
    this.equipmentById = new Map(data.equipment.map((x) => [x.id, x]));
    this.lotById = new Map(data.lots.map((x) => [x.id, x]));
    this.trafficById = new Map(data.trafficProfiles.map((x) => [x.id, x]));
    this.jobById = new Map(data.jobs.map((x) => [x.id, x]));
    this.templateById = new Map(data.templates.map((x) => [x.id, x]));
    this.placeById = new Map(data.places.map((x) => [x.id, x]));
    this.speakerById = new Map(data.speakers.map((x) => [x.id, x]));
    this.stepById = new Map(data.tutorial.map((x) => [x.id, x]));
  }

  get economy() {
    return this.data.economy;
  }

  product(id: string) {
    return must(this.productById.get(id), "product", id);
  }
  equipment(id: string) {
    return must(this.equipmentById.get(id), "equipment", id);
  }
  lot(id: string) {
    return must(this.lotById.get(id), "lot", id);
  }
  traffic(id: string) {
    return must(this.trafficById.get(id), "traffic", id);
  }
  job(id: string) {
    return must(this.jobById.get(id), "job", id);
  }
  template(id: string) {
    return must(this.templateById.get(id), "template", id);
  }
  place(id: string) {
    return must(this.placeById.get(id), "place", id);
  }
  speaker(id: string) {
    return must(this.speakerById.get(id), "speaker", id);
  }
  step(id: string) {
    return must(this.stepById.get(id), "tutorial step", id);
  }
  /** Địa điểm nhận việc làm thuê này. */
  placeForJob(jobId: string) {
    return this.data.places.find((p) => p.jobs.includes(jobId));
  }
}

function must<T>(value: T | undefined, kind: string, id: string): T {
  if (value === undefined) throw new Error(`Không có ${kind} "${id}"`);
  return value;
}

export const content = loadContent(data);
