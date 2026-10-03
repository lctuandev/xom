import { data } from "./data.js";
import {
  type Calendar,
  type ContentData,
  contentSchema,
  type Lot,
  MAP_WALKABLE,
  type Recipe,
  type WeatherId,
  type WeatherKind,
} from "./schema.js";

export * from "./schema.js";

/** Công thức: mọi bước/lựa chọn/nguyên liệu được tham chiếu phải tồn tại. */
function checkRecipe(pid: string, r: Recipe, ingredients: Set<string>): string[] {
  const errs: string[] = [];
  const steps = new Map(r.steps.map((s) => [s.id, s]));
  const hasOption = (stepId: string, opt: string) =>
    steps.get(stepId)?.options.some((o) => o.id === opt) ?? false;
  const checkSel = (where: string, sel: Record<string, string | string[]>) => {
    for (const [stepId, v] of Object.entries(sel)) {
      const st = steps.get(stepId);
      if (!st) {
        errs.push(`${pid} ${where}: không có bước ${stepId}`);
        continue;
      }
      if (st.kind === "single" && Array.isArray(v))
        errs.push(`${pid} ${where}: bước ${stepId} chỉ chọn 1`);
      if (st.kind === "multi" && !Array.isArray(v))
        errs.push(`${pid} ${where}: bước ${stepId} cần danh sách`);
      for (const opt of Array.isArray(v) ? v : [v]) {
        if (!hasOption(stepId, opt)) errs.push(`${pid} ${where}: bước ${stepId} không có ${opt}`);
      }
    }
  };
  for (const st of r.steps) {
    for (const o of st.options) {
      if (o.ingredient && !ingredients.has(o.ingredient))
        errs.push(`${pid}/${st.id}: không có nguyên liệu ${o.ingredient}`);
    }
    if (st.ingredient && !ingredients.has(st.ingredient))
      errs.push(`${pid}/${st.id}: không có nguyên liệu ${st.ingredient}`);
    for (const opt of Object.keys(st.pick ?? {}))
      if (!hasOption(st.id, opt)) errs.push(`${pid}/${st.id}: pick ${opt} không tồn tại`);
    if (
      st.kind === "single" &&
      !(st.id in r.defaults) &&
      !st.pick &&
      !r.variants.every((v) => st.id in v.fixed)
    )
      errs.push(`${pid}/${st.id}: bước chọn 1 cần mặc định, pick, hoặc được mọi món cố định`);
  }
  checkSel("defaults", r.defaults);
  for (const v of r.variants) checkSel(`món ${v.id}`, v.fixed);
  for (const m of r.mods) {
    const st = steps.get(m.step);
    if (!st) {
      errs.push(`${pid} mod ${m.id}: không có bước ${m.step}`);
      continue;
    }
    for (const opt of [m.add, m.remove, m.set])
      if (opt && !hasOption(m.step, opt)) errs.push(`${pid} mod ${m.id}: không có ${opt}`);
  }
  return errs;
}

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
  const ingredients = ids(parsed.ingredients);
  for (const p of parsed.products) {
    if (!templates.has(p.template)) errors.push(`${p.id}: template ${p.template} không tồn tại`);
    if (Object.keys(p.interestByHour).length === 0) errors.push(`${p.id}: thiếu interestByHour`);
    errors.push(...checkRecipe(p.id, p.recipe, ingredients));
    if (p.counter) {
      const used = new Set<string>();
      const kinds: Record<string, string[]> = {
        cups: ["single"],
        jars: ["single"],
        chips: ["single"],
        grid: ["multi"],
        shaker: ["hold"],
        sealer: ["action"],
      };
      for (const z of p.counter.zones) {
        const st = p.recipe.steps.find((s) => s.id === z.step);
        if (!st) errors.push(`${p.id} quầy: không có bước ${z.step}`);
        else if (!kinds[z.zone]?.includes(st.kind))
          errors.push(`${p.id} quầy: khu ${z.zone} không hợp bước ${z.step} (${st.kind})`);
        if (used.has(z.step)) errors.push(`${p.id} quầy: bước ${z.step} xếp hai khu`);
        used.add(z.step);
        if (z.zone === "grid" && st && (z.slots ?? 12) < st.options.length)
          errors.push(`${p.id} quầy: lưới ${z.step} ít ô hơn số lựa chọn`);
      }
      for (const st of p.recipe.steps)
        if (!used.has(st.id)) errors.push(`${p.id} quầy: bước ${st.id} chưa có chỗ trên quầy`);
    }
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
  const foods = ids(parsed.restaurant.foods);
  for (const d of parsed.restaurant.dishes) {
    for (const f of d.items)
      if (!foods.has(f)) errors.push(`quán cơm: món ${d.id} dùng ${f} không có trong khay`);
  }
  for (const m of parsed.restaurant.mods) {
    for (const f of [m.add, m.remove])
      if (f && !foods.has(f)) errors.push(`quán cơm: yêu cầu ${m.id} dùng ${f} không có`);
  }
  // Bản đồ: các hàng dài bằng nhau; địa điểm, chỗ bán, nhà giao hàng phải đứng trên ô đi được.
  const m = parsed.map;
  if (m.rows.some((r) => r.length !== m.rows[0]?.length))
    errors.push("bản đồ: các hàng phải dài bằng nhau");
  const cellAt = (x: number, z: number) => {
    const c = Math.round((x - m.origin.x) / m.tile);
    const r = Math.round((z - m.origin.z) / m.tile);
    return m.rows[r]?.[c] ?? "";
  };
  const onFoot = (label: string, x: number, z: number) => {
    if (!MAP_WALKABLE.includes(cellAt(x, z) || "?"))
      errors.push(`bản đồ: ${label} (${x}, ${z}) không đứng trên ô đi được`);
  };
  for (const pl of parsed.places)
    onFoot(`địa điểm ${pl.id}`, pl.position.x, pl.position.z + (pl.facing === 0 ? 1.4 : -1.4));
  for (const l of parsed.lots) onFoot(`chỗ bán ${l.id}`, l.position.x, l.position.z);
  for (const a of parsed.delivery.addresses)
    onFoot(`nhà ${a.id}`, a.position.x, a.position.z + (a.facing === 0 ? 1.3 : -1.3));
  for (const v of parsed.vendors) {
    onFoot(`sạp ${v.id}`, v.position.x, v.position.z);
    if (v.close <= v.open) errors.push(`sạp ${v.id}: giờ dọn phải sau giờ mở`);
  }
  // Mẫu khu: đúng kích thước theo phía, đường ở mép nối với đường của bản đồ gốc.
  const cols = m.rows[0]?.length ?? 0;
  const road = (ch: string | undefined) => "=|+c".includes(ch ?? ".");
  for (const k of parsed.chunks) {
    const w = k.rows[0]?.length ?? 0;
    if (k.rows.some((r) => r.length !== w)) errors.push(`khu ${k.id}: các hàng phải dài bằng nhau`);
    const across = k.side === "east" || k.side === "west";
    if (across ? k.rows.length !== m.rows.length : w !== cols)
      errors.push(`khu ${k.id}: ${across ? "phải cao bằng" : "phải rộng bằng"} bản đồ gốc`);
    const pairs: [string | undefined, string | undefined][] =
      k.side === "east"
        ? m.rows.map((r, i) => [r.at(-1), k.rows[i]?.[0]])
        : k.side === "west"
          ? m.rows.map((r, i) => [r[0], k.rows[i]?.at(-1)])
          : k.side === "north"
            ? [...(m.rows[0] ?? "")].map((ch, c) => [ch, k.rows.at(-1)?.[c]])
            : [...(m.rows.at(-1) ?? "")].map((ch, c) => [ch, k.rows[0]?.[c]]);
    if (pairs.some(([a, b]) => road(a) !== road(b)))
      errors.push(`khu ${k.id}: đường ở mép không nối với đường của bản đồ gốc`);
    // Cùng phía thì cùng kích thước — vị trí khu tính được chỉ từ (gx, gz), id chỗ bán không phụ thuộc khu khác.
    const same = parsed.chunks.find((o) => o.side === k.side);
    if (same && (same.rows.length !== k.rows.length || same.rows[0]?.length !== w))
      errors.push(`khu ${k.id}: khác kích thước khu ${same.id} cùng phía`);
    if (k.id.includes("__")) errors.push(`khu ${k.id}: id không được có "__"`);
    for (const l of k.lots) {
      if (l.id.includes("__")) errors.push(`khu ${k.id}: chỗ ${l.id} không được có "__"`);
      if (!MAP_WALKABLE.includes(k.rows[l.cell.r]?.[l.cell.c] ?? "?"))
        errors.push(`khu ${k.id}: chỗ ${l.id} không đứng trên ô đi được`);
      if (!parsed.trafficProfiles.some((t) => t.id === l.traffic))
        errors.push(`khu ${k.id}: chỗ ${l.id} không có khu khách ${l.traffic}`);
    }
  }
  if (parsed.restaurant.layout.tables.length !== parsed.restaurant.tables)
    errors.push("quán cơm: số bàn trong sơ đồ khác số bàn");
  for (const j of parsed.jobs) {
    if (!parsed.places.some((pl) => pl.jobs.includes(j.id)))
      errors.push(`việc ${j.id}: không có địa điểm nhận việc`);
  }
  const weatherIds = new Set(parsed.weather.kinds.map((k) => k.id));
  if (weatherIds.size !== parsed.weather.kinds.length) errors.push("thời tiết: kiểu trời bị trùng");
  for (const k of parsed.weather.kinds)
    for (const cat of Object.keys(k.category))
      if (!parsed.products.some((p) => p.category === cat))
        errors.push(`thời tiết ${k.id}: không có danh mục ${cat}`);
  const startSum = parsed.housing.tiers.reduce((s, t) => s + t.start, 0);
  if (Math.abs(startSum - 1) > 1e-6) errors.push("cấp nhà: tổng tỉ lệ lúc lập xóm phải bằng 1");
  const seenEvents = new Set<string>();
  for (const ev of parsed.events) {
    if (seenEvents.has(ev.id)) errors.push(`sự kiện trùng: ${ev.id}`);
    seenEvents.add(ev.id);
    if (ev.trigger.kind === "daily" && ev.trigger.to - ev.trigger.from < ev.minutes)
      errors.push(`sự kiện ${ev.id}: khung giờ ngắn hơn thời lượng`);
    if (Object.keys(ev.effects).length === 0) errors.push(`sự kiện ${ev.id}: không có ảnh hưởng`);
  }
  const eco = parsed.economy;
  if (eco.dayEndMinute <= eco.dayStartMinute)
    errors.push("economy: dayEndMinute phải sau dayStartMinute");
  // Công trình: chỗ bán và công trình tiên quyết phải có thật.
  const lotIds = new Set(parsed.lots.map((l) => l.id));
  const projectIds = new Set(parsed.projects.map((p) => p.id));
  for (const p of parsed.projects) {
    for (const l of p.demand.lots)
      if (!lotIds.has(l)) errors.push(`công trình ${p.id}: không có chỗ bán ${l}`);
    if (p.requires && !projectIds.has(p.requires))
      errors.push(`công trình ${p.id}: không có công trình ${p.requires}`);
  }
  // Giọng thoại: kiểu khách phải có thật, câu gọi món phải có chỗ điền món.
  const npcIds = new Set(parsed.npcs.map((n) => n.id));
  for (const v of parsed.voice.voices) {
    if (!npcIds.has(v.archetype)) errors.push(`giọng thoại: không có kiểu khách ${v.archetype}`);
    for (const a of v.ask)
      if (!a.includes("{dish}")) errors.push(`giọng thoại ${v.archetype}: câu "${a}" thiếu {dish}`);
  }
  // Xe ôm: trạm phải là địa điểm kind "ride".
  const station = parsed.places.find((p) => p.id === parsed.rides.stationPlaceId);
  if (!station || station.kind !== "ride")
    errors.push(`xe ôm: trạm ${parsed.rides.stationPlaceId} phải là địa điểm kind "ride"`);
  // Bảng việc xóm: món, chỗ giao phải có thật; số lượng hợp lệ.
  for (const t of parsed.contracts.templates) {
    const prod = parsed.products.find((p) => p.id === t.productId);
    if (!prod) errors.push(`việc ${t.id}: không có sản phẩm ${t.productId}`);
    else if (!prod.recipe.variants.some((v) => v.id === t.variantId))
      errors.push(`việc ${t.id}: ${t.productId} không có món ${t.variantId}`);
    if (!lotIds.has(t.lotId)) errors.push(`việc ${t.id}: không có chỗ ${t.lotId}`);
    if (t.qty[0] > t.qty[1]) errors.push(`việc ${t.id}: số lượng ${t.qty.join("–")} ngược`);
  }
  // Chủ nhà (UC-F13): mỗi nhà mặt tiền đúng một chủ nhà; chủ nhà chỉ giữ nhà mặt tiền.
  for (const lot of parsed.lots.filter((l) => l.kind === "house")) {
    const owners = parsed.shopSetup.rent.landlords.filter((l) => l.lotIds.includes(lot.id));
    if (owners.length !== 1)
      errors.push(`nhà ${lot.id}: cần đúng một chủ nhà (đang có ${owners.length})`);
  }
  for (const ll of parsed.shopSetup.rent.landlords)
    for (const lotId of ll.lotIds)
      if (parsed.lots.find((l) => l.id === lotId)?.kind !== "house")
        errors.push(`chủ nhà ${ll.id}: ${lotId} không phải nhà mặt tiền`);
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
  readonly ingredientById: ReadonlyMap<string, ContentData["ingredients"][number]>;
  /** Cây ATM suy ra từ ô "N" trên bản đồ: vị trí giữa ô, mặt quay ra đường. */
  readonly atms: { id: string; x: number; z: number; facing: number }[];

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
    this.ingredientById = new Map(data.ingredients.map((x) => [x.id, x]));
    const m = data.map;
    const road = (r: number, c: number) => "=|+c".includes(m.rows[r]?.[c] ?? ".");
    this.atms = m.rows.flatMap((row, r) =>
      [...row].flatMap((ch, c) =>
        ch === "N"
          ? [
              {
                id: `atm_${r}_${c}`,
                x: m.origin.x + c * m.tile,
                z: m.origin.z + r * m.tile,
                facing: road(r + 1, c) ? 0 : road(r - 1, c) ? Math.PI : 0,
              },
            ]
          : [],
      ),
    );
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
  lot(id: string): Lot {
    return must(this.findLot(id), "lot", id);
  }
  /** Chỗ bán theo id (cả chỗ của khu đã mở), không có thì undefined. */
  findLot(id: string): Lot | undefined {
    return this.lotById.get(id) ?? this.chunkLot(id);
  }

  /** Id chỗ bán của một khu đã mở (docs/BANDO.md bước B): "<khu>__<chỗ>__<gx>_<gz>", số âm viết "m1". */
  static chunkLotId(chunkId: string, lotId: string, gx: number, gz: number) {
    const n = (v: number) => (v < 0 ? `m${-v}` : String(v));
    return `${chunkId}__${lotId}__${n(gx)}_${n(gz)}`;
  }

  private readonly chunkLots = new Map<string, Lot | null>();
  /** Giải id chỗ bán của khu: vị trí = gốc khu (tính từ gx, gz — mẫu cùng phía cùng kích thước) + ô trong mẫu. */
  private chunkLot(id: string): Lot | undefined {
    if (!id.includes("__")) return undefined;
    const hit = this.chunkLots.get(id);
    if (hit !== undefined) return hit ?? undefined;
    const [chunkId, lotId, at] = id.split("__");
    const [gx, gz] = (at ?? "")
      .split("_")
      .map((v) => (v.startsWith("m") ? -Number(v.slice(1)) : Number(v)));
    const chunk = this.data.chunks.find((c) => c.id === chunkId);
    const def = chunk?.lots.find((l) => l.id === lotId);
    let lot: Lot | null = null;
    if (chunk && def && Number.isInteger(gx) && Number.isInteger(gz)) {
      const m = this.data.map;
      const cols = m.rows[0]?.length ?? 0;
      const w = chunk.rows[0]?.length ?? 0;
      const h = chunk.rows.length;
      const k = Math.abs(chunk.side === "east" || chunk.side === "west" ? (gx ?? 0) : (gz ?? 0));
      const c0 = chunk.side === "east" ? cols + (k - 1) * w : chunk.side === "west" ? -k * w : 0;
      const r0 =
        chunk.side === "south" ? m.rows.length + (k - 1) * h : chunk.side === "north" ? -k * h : 0;
      const { cell, offset, ...rest } = def;
      lot = {
        ...rest,
        id,
        kind: "cart",
        position: {
          x: m.origin.x + (c0 + cell.c) * m.tile + offset.x,
          z: m.origin.z + (r0 + cell.r) * m.tile + offset.z,
        },
      };
    }
    this.chunkLots.set(id, lot);
    return lot ?? undefined;
  }

  /** Mọi chỗ bán của một xóm: chỗ gốc + chỗ của các khu đã mở. */
  lotsIn(chunks: readonly { chunkId: string; gx: number; gz: number }[] | undefined): Lot[] {
    const extra = (chunks ?? []).flatMap((o) =>
      (this.data.chunks.find((c) => c.id === o.chunkId)?.lots ?? []).map((l) =>
        this.lot(Content.chunkLotId(o.chunkId, l.id, o.gx, o.gz)),
      ),
    );
    return [...this.data.lots, ...extra];
  }
  /** Chủ nhà của một nhà mặt tiền (UC-F13). */
  landlordOf(lotId: string) {
    return must(
      this.data.shopSetup.rent.landlords.find((l) => l.lotIds.includes(lotId)),
      "landlord of",
      lotId,
    );
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
  ingredient(id: string) {
    return must(this.ingredientById.get(id), "ingredient", id);
  }
  /** Món (variant) theo id trong công thức của một sản phẩm. */
  variant(productId: string, variantId: string) {
    const v = this.product(productId).recipe.variants.find((x) => x.id === variantId);
    return must(v, "variant", variantId);
  }
  /** Sự kiện theo id. */
  event(id: string) {
    return must(
      this.data.events.find((e) => e.id === id),
      "event",
      id,
    );
  }
  /** Kiểu trời theo id (luôn có đủ 4 kiểu — đã kiểm khi nạp). */
  /** Thứ trong tuần của ngày game (ngày 1 = Thứ Hai), kèm chỉ số 0–6 (THEGIOI §2). */
  weekday(day: number): Calendar["weekdays"][number] & { index: number } {
    const index = (((day - 1) % 7) + 7) % 7;
    const w = this.data.calendar.weekdays[index] ?? this.data.calendar.weekdays[0];
    if (!w) throw new Error("Lịch không có thứ nào");
    return { ...w, index };
  }

  weatherKind(id: WeatherId): WeatherKind {
    return must(
      this.data.weather.kinds.find((k) => k.id === id),
      "weather",
      id,
    );
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
