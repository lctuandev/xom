import type { Restaurant } from "@xom/content";
import { type Payment, pickPayment } from "./recipe.js";
import { type PlateOrder, plateOrder, restaurantArrivals } from "./work.js";

// Quán sống động (docs/USECASES.md UC-W8): vòng đời từng khách trong quán — vào cửa, xếp hàng gọi cơm,
// đi tới bàn ngồi chờ, ăn, tới quầy trả tiền, ra về để lại đánh giá — cùng các tình huống đời thật
// (than chờ lâu, gây lộn, quỵt tiền). Vị trí nào người chơi không làm thì đồng nghiệp NPC làm.
// Thuần logic, thời gian truyền vào: server chạy bằng đồng hồ thật, unit test lái bằng đồng hồ giả.

export interface Pt {
  x: number;
  z: number;
}

/** Sơ đồ quán (mét, toạ độ trong nhà): dùng chung cho server (kiểm thời gian đi bộ) và client (diễn). */
export interface FloorLayout {
  /** Ngoài cửa (khách xuất hiện / biến mất). */
  door: Pt;
  /** Đầu hàng trước quầy cơm và bước lùi của mỗi người sau. */
  queue: Pt;
  queueStep: Pt;
  /** Cửa bếp: dĩa đã múc chờ bưng. */
  pass: Pt;
  /** Đầu hàng trước máy tính tiền. */
  cashier: Pt;
  cashierStep: Pt;
  tables: Pt[];
}

export type Role = "dung_quay" | "thu_ngan" | "bung_be";

export type DinerStage =
  | "entering"
  | "queue"
  | "to_table"
  | "seated"
  | "eating"
  | "to_cashier"
  | "paying"
  | "leaving"
  | "gone";

export type Tone = "ask" | "bad" | "good";

export interface Diner {
  id: string;
  name: string;
  /** Dáng nhân vật (client chọn model theo số này). */
  look: number;
  order: PlateOrder;
  pay: Payment;
  stage: DinerStage;
  /** Lúc vào bước hiện tại (ms). */
  since: number;
  /** Bàn đã giữ khi vào quán (1..n). */
  table: number;
  /** Bắt đầu chờ ở bước chờ hiện tại (xếp hàng / ngồi chờ cơm / chờ tính tiền). */
  waitFrom: number;
  patienceMs: number;
  /** Ăn xong ở phút game này. */
  eatUntil: number;
  /** Hài lòng 0..1 → số sao khi về. */
  mood: number;
  complained: boolean;
  apologized: boolean;
  say: { text: string; tone: Tone; until: number } | null;
  incident: "argue" | "dash" | null;
  incidentAt: number;
  /** Ghi chú để viết câu đánh giá. */
  notes: string[];
  review: { stars: number; text: string } | null;
}

export interface PassPlate {
  id: string;
  dinerId: string;
  table: number;
  dish: string;
  /** Dĩa ra tới cửa bếp lúc này (sau khi múc ở quầy). */
  readyAt: number;
  /** Đồng nghiệp đang bưng dĩa này (từ lúc nào), null = chờ người bưng. */
  npcTakenAt: number | null;
}

export interface Floor {
  diners: Diner[];
  pass: PassPlate[];
  /** Dĩa người chơi (bưng bê) đang cầm trên tay. */
  holding: string[];
  /** Bàn bẩn → lúc bẩn (ms). */
  dirty: Record<number, number>;
  /** Người chơi bưng bê đang ở đâu (sau thao tác gần nhất) và lúc nào. */
  waiter: { at: Pt; t: number };
  carry: number;
  /** Đồng nghiệp đang phục vụ ai, từ lúc nào. */
  npc: { counter: [string, number] | null; cashier: [string, number] | null };
  lastIncidentHour: number;
  stats: { reviews: number; stars: number; dashed: number; lostMoney: number };
}

export const FLOOR = {
  enterMs: 3500,
  toTableMs: 3000,
  toCashierMs: 3000,
  leaveMs: 4000,
  /** Khách đã ra cửa vẫn giữ lại chừng này để client diễn nốt và hiện đánh giá. */
  goneMs: 3500,
  queuePatienceMs: 60_000,
  seatedPatienceMs: 60_000,
  payPatienceMs: 45_000,
  npcPlateMs: 7000,
  npcCashMs: 6000,
  npcCarryMs: 6000,
  npcCleanMs: 12_000,
  plateToPassMs: 1200,
  eatMinutes: 20,
  /** Chờ quá phần này của kiên nhẫn thì than. */
  complainAt: 0.6,
  argueChancePerHour: 0.2,
  argueMs: 25_000,
  dashChance: 0.06,
  dashMs: 7000,
  /** Tốc độ đi trong quán (m/s); server cho nhanh hơn chút vì mạng trễ. */
  walkSpeed: 2.2,
  maxHold: 2,
  /** Tối đa khách trong quán cùng lúc (ngoài số bàn còn có người đang trả tiền, đang ra). */
  maxInside: 12,
} as const;

export type FloorEvent =
  | { kind: "walked"; dinerId: string }
  | { kind: "review"; dinerId: string; stars: number; tip: number }
  | { kind: "dashed"; dinerId: string; amount: number };

export interface FloorClock {
  now: number;
  /** Phút game trong ngày. */
  minute: number;
  rand: () => number;
}

export interface FloorConfig {
  r: Restaurant;
  /** Hệ số thời gian = ms thật của một phút game / 1000 (đồng hồ tăng tốc thì mọi thứ nhanh theo). */
  scale: number;
  layout: FloorLayout;
  role: Role;
  names: string[];
  newId: () => string;
}

const COMPLAINTS = ["Sao lâu quá vậy!", "Còn lâu không em?", "Đói muốn xỉu rồi nè!"];
const ARGUES = ["Ê, nói nhỏ nhỏ thôi!", "Bàn kia ồn quá vậy!", "Ai cho giành ghế tui!"];

/** Khoảng thời gian theo đồng hồ của xóm. */
export const ms = (cfg: Pick<FloorConfig, "scale">, v: number) => v * cfg.scale;

const pick = <T>(list: readonly T[], rand: () => number): T =>
  list[Math.floor(rand() * list.length)] ?? (list[0] as T);
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);

export function newFloor(layout: FloorLayout, now: number): Floor {
  return {
    diners: [],
    pass: [],
    holding: [],
    dirty: {},
    waiter: { at: layout.pass, t: now },
    carry: 0.6,
    npc: { counter: null, cashier: null },
    lastIncidentHour: -1,
    stats: { reviews: 0, stars: 0, dashed: 0, lostMoney: 0 },
  };
}

/** Bàn đang có khách giữ (từ lúc vào cửa tới lúc đứng dậy đi trả tiền). */
const HOLDS_TABLE: DinerStage[] = ["entering", "queue", "to_table", "seated", "eating"];

export function freeTables(f: Floor, cfg: FloorConfig): number[] {
  const taken = new Set(f.diners.filter((d) => HOLDS_TABLE.includes(d.stage)).map((d) => d.table));
  const out: number[] = [];
  for (let t = 1; t <= cfg.layout.tables.length; t++) {
    if (!taken.has(t) && f.dirty[t] === undefined) out.push(t);
  }
  return out;
}

export type TableView = "free" | "waiting" | "eating" | "dirty";

export function tableStates(f: Floor, cfg: FloorConfig): TableView[] {
  return cfg.layout.tables.map((_, i) => {
    const t = i + 1;
    if (f.dirty[t] !== undefined) return "dirty";
    const d = f.diners.find((x) => x.table === t && HOLDS_TABLE.includes(x.stage));
    if (!d) return "free";
    return d.stage === "eating" ? "eating" : "waiting";
  });
}

/** Hàng chờ ở quầy cơm / quầy tính tiền theo thứ tự tới. */
export const queueOf = (f: Floor) =>
  f.diners.filter((d) => d.stage === "queue").sort((a, b) => a.waitFrom - b.waitFrom);
export const payingOf = (f: Floor) =>
  f.diners.filter((d) => d.stage === "paying").sort((a, b) => a.waitFrom - b.waitFrom);

function setStage(d: Diner, stage: DinerStage, now: number) {
  d.stage = stage;
  d.since = now;
}

function startWait(d: Diner, now: number, patienceMs: number) {
  d.waitFrom = now;
  d.patienceMs = patienceMs;
  d.complained = false;
  d.apologized = false;
}

/** Chờ lâu thì bớt vui (quá 35% kiên nhẫn mới bắt đầu tính). */
function endWait(d: Diner, now: number) {
  const frac = (now - d.waitFrom) / d.patienceMs;
  if (frac > 0.35) d.mood -= (frac - 0.35) * 0.5;
  if (frac > 0.7 && !d.notes.includes("chờ lâu")) d.notes.push("chờ lâu");
}

export function starsOf(mood: number): number {
  return Math.max(1, Math.min(5, Math.round(1 + Math.max(0, mood) * 4)));
}

export function reviewText(stars: number, notes: string[]): string {
  const why = notes.length ? ` (${notes.join(", ")})` : "";
  if (stars >= 5) return "Cơm ngon, phục vụ lẹ!";
  if (stars === 4) return `Ngon, bữa sau ghé nữa${why}`;
  if (stars === 3) return `Tạm được${why}`;
  if (stars === 2) return `Hơi thất vọng${why}`;
  return `Không quay lại nữa${why}`;
}

function leave(
  f: Floor,
  cfg: FloorConfig,
  d: Diner,
  now: number,
  rand: () => number,
  stars?: number,
): FloorEvent {
  const s = stars ?? starsOf(d.mood);
  d.review = { stars: s, text: reviewText(s, d.notes) };
  d.say = {
    text: `${"⭐".repeat(s)} ${d.review.text}`,
    tone: s >= 4 ? "good" : s <= 2 ? "bad" : "ask",
    until: now + ms(cfg, FLOOR.leaveMs + FLOOR.goneMs),
  };
  setStage(d, "leaving", now);
  f.stats.reviews++;
  f.stats.stars += s;
  const tip = s === 5 && rand() < 0.4 ? pick([2000, 3000, 5000], rand) : 0;
  return { kind: "review", dinerId: d.id, stars: s, tip };
}

/** Khách bỏ về giữa chừng (chờ quá lâu, bị làm phiền): nhả bàn, bỏ dĩa đang chờ bưng. */
function walkOut(
  f: Floor,
  cfg: FloorConfig,
  d: Diner,
  now: number,
  rand: () => number,
  note: string,
): FloorEvent[] {
  if (!d.notes.includes(note)) d.notes.push(note);
  if (d.stage === "eating") f.dirty[d.table] = now;
  f.pass = f.pass.filter((p) => p.dinerId !== d.id);
  f.holding = f.holding.filter((id) => f.pass.some((p) => p.id === id));
  const review = leave(f, cfg, d, now, rand, 1);
  return [{ kind: "walked", dinerId: d.id }, review];
}

// ───────────────────────── Chuyển bước (server gọi khi người chơi/NPC làm xong) ─────────────────────────

/** Quầy múc xong dĩa cho khách đầu hàng: dĩa ra cửa bếp, khách đi tới bàn đã giữ. */
export function plated(f: Floor, d: Diner, now: number, cfg: FloorConfig) {
  endWait(d, now);
  setStage(d, "to_table", now);
  const dish = cfg.r.dishes.find((x) => x.id === d.order.dishId)?.name ?? "Cơm";
  f.pass.push({
    id: cfg.newId(),
    dinerId: d.id,
    table: d.table,
    dish,
    readyAt: now + ms(cfg, FLOOR.plateToPassMs),
    npcTakenAt: null,
  });
  if (f.npc.counter?.[0] === d.id) f.npc.counter = null;
}

/** Dĩa tới bàn: khách bắt đầu ăn. */
export function served(f: Floor, plate: PassPlate, now: number, minute: number) {
  f.pass = f.pass.filter((p) => p.id !== plate.id);
  f.holding = f.holding.filter((id) => id !== plate.id);
  const d = f.diners.find((x) => x.id === plate.dinerId);
  if (!d) return;
  if (d.stage === "seated") endWait(d, now);
  setStage(d, "eating", now);
  d.eatUntil = minute + FLOOR.eatMinutes;
  const line =
    ["Ngon quá!", "Cảm ơn nha!", "Thơm ghê!"][plate.id.charCodeAt(0) % 3] ?? "Cảm ơn nha!";
  d.say = { text: line, tone: "good", until: now + 2500 };
}

/** Trả tiền xong: khách ra về, để lại đánh giá. */
export function paid(
  f: Floor,
  cfg: FloorConfig,
  d: Diner,
  now: number,
  rand: () => number,
): FloorEvent {
  endWait(d, now);
  if (f.npc.cashier?.[0] === d.id) f.npc.cashier = null;
  return leave(f, cfg, d, now, rand);
}

/** Khách bực vì bị làm sai (múc sai, bưng nhầm bàn…). */
export function annoy(d: Diner, amount: number, note: string) {
  d.mood -= amount;
  if (!d.notes.includes(note)) d.notes.push(note);
}

/** Xin lỗi khách đang than: khách chờ thêm một chút, bớt bực. */
export function apologize(d: Diner, now: number): boolean {
  if (!d.complained || d.apologized) return false;
  d.apologized = true;
  d.patienceMs += d.patienceMs * 0.5;
  d.mood += 0.15;
  d.say = { text: "Thôi được, lẹ lẹ nha em.", tone: "ask", until: now + 3000 };
  return true;
}

/** Can ngăn khách đang cãi nhau. */
export function calm(d: Diner, now: number): boolean {
  if (d.incident !== "argue") return false;
  d.incident = null;
  d.mood += 0.1;
  d.say = { text: "Ờ thôi, bỏ qua.", tone: "ask", until: now + 3000 };
  return true;
}

/** Gọi lại khách đang đi ra mà chưa trả tiền. */
export function callBack(cfg: FloorConfig, d: Diner, now: number): boolean {
  if (d.incident !== "dash" || now - d.incidentAt > ms(cfg, FLOOR.dashMs)) return false;
  d.incident = null;
  d.mood -= 0.1;
  d.say = { text: "Ơ quên, xin lỗi nha!", tone: "ask", until: now + 3000 };
  setStage(d, "to_cashier", now);
  return true;
}

export function clean(f: Floor, table: number): boolean {
  if (f.dirty[table] === undefined) return false;
  delete f.dirty[table];
  return true;
}

/** Thời gian đi bộ tối thiểu giữa hai điểm (ms), có chừa cho mạng trễ. */
export function walkMs(cfg: FloorConfig, a: Pt, b: Pt): number {
  return ms(cfg, (dist(a, b) / (FLOOR.walkSpeed * 1.4)) * 1000);
}

/** Người chơi bưng bê tới `to` kịp chưa (tính từ chỗ và lúc thao tác trước). */
export function waiterCanReach(f: Floor, cfg: FloorConfig, to: Pt, now: number): boolean {
  return now - f.waiter.t >= walkMs(cfg, f.waiter.at, to);
}

// ───────────────────────── Nhịp của quán ─────────────────────────

/** Một khách bước vào: còn bàn sạch thì giữ bàn và vào xếp hàng, hết bàn thì đi quán khác. */
export function admit(f: Floor, cfg: FloorConfig, t: FloorClock): Diner | null {
  const { now, rand } = t;
  const free = freeTables(f, cfg);
  const inside = f.diners.filter((d) => d.stage !== "gone").length;
  if (free.length === 0 || inside >= FLOOR.maxInside) return null;
  const order = plateOrder(cfg.r, rand);
  const d: Diner = {
    id: cfg.newId(),
    name: pick(cfg.names, rand),
    look: Math.floor(rand() * 1000),
    order,
    pay: pickPayment(order.total, 0.3, rand),
    stage: "entering",
    since: now,
    table: pick(free, rand),
    waitFrom: now,
    patienceMs: ms(cfg, FLOOR.queuePatienceMs),
    eatUntil: 0,
    mood: 0.85 + rand() * 0.15,
    complained: false,
    apologized: false,
    say: null,
    incident: null,
    incidentAt: 0,
    notes: [],
    review: null,
  };
  f.diners.push(d);
  return d;
}

export function floorTick(f: Floor, cfg: FloorConfig, t: FloorClock, minutes = 1): FloorEvent[] {
  const { now, minute, rand } = t;
  const events: FloorEvent[] = [];

  // 1. Khách tới: còn bàn trống thì vào (giữ bàn ngay), hết bàn thì đi quán khác.
  const { arrivals, carry } = restaurantArrivals(cfg.r, minute, minutes, f.carry);
  f.carry = carry;
  for (let k = 0; k < arrivals; k++) admit(f, cfg, t);

  // 2. Đi lại theo thời gian.
  for (const d of f.diners) {
    const inStage = now - d.since;
    if (d.stage === "entering" && inStage >= ms(cfg, FLOOR.enterMs)) {
      setStage(d, "queue", now);
      startWait(d, now, ms(cfg, FLOOR.queuePatienceMs));
      d.say = { text: d.order.text, tone: "ask", until: now + 5000 };
    } else if (d.stage === "to_table" && inStage >= ms(cfg, FLOOR.toTableMs)) {
      setStage(d, "seated", now);
      startWait(d, now, ms(cfg, FLOOR.seatedPatienceMs));
    } else if (d.stage === "to_cashier" && inStage >= ms(cfg, FLOOR.toCashierMs)) {
      setStage(d, "paying", now);
      startWait(d, now, ms(cfg, FLOOR.payPatienceMs));
    } else if (d.stage === "eating" && minute >= d.eatUntil) {
      // Ăn xong: đứng dậy, để lại chén dĩa bẩn. Thỉnh thoảng có người tính "quên" trả tiền.
      f.dirty[d.table] = now;
      if (rand() < FLOOR.dashChance) {
        setStage(d, "leaving", now);
        d.incident = "dash";
        d.incidentAt = now;
      } else setStage(d, "to_cashier", now);
    } else if (d.stage === "leaving") {
      if (d.incident === "dash") {
        if (now - d.incidentAt >= ms(cfg, FLOOR.dashMs)) {
          d.incident = null;
          setStage(d, "gone", now);
          f.stats.dashed++;
          f.stats.lostMoney += d.order.total;
          events.push({ kind: "dashed", dinerId: d.id, amount: d.order.total });
        }
      } else if (inStage >= ms(cfg, FLOOR.leaveMs)) setStage(d, "gone", now);
    }
    if (d.say && d.say.until <= now) d.say = null;
  }
  f.diners = f.diners.filter(
    (d) => !(d.stage === "gone" && now - d.since >= ms(cfg, FLOOR.goneMs)),
  );

  // 3. Kiên nhẫn: chờ lâu thì than, quá hạn thì bỏ về.
  for (const d of f.diners) {
    if (d.stage !== "queue" && d.stage !== "seated" && d.stage !== "paying") continue;
    const frac = (now - d.waitFrom) / d.patienceMs;
    if (frac >= 1) {
      if (f.npc.counter?.[0] === d.id) f.npc.counter = null;
      if (f.npc.cashier?.[0] === d.id) f.npc.cashier = null;
      events.push(...walkOut(f, cfg, d, now, rand, "chờ lâu quá"));
    } else if (frac >= FLOOR.complainAt && !d.complained) {
      d.complained = true;
      d.mood -= 0.2;
      d.say = { text: pick(COMPLAINTS, rand), tone: "bad", until: now + 8000 };
    }
  }

  // 4. Đồng nghiệp NPC làm những vị trí người chơi không làm.
  if (cfg.role !== "dung_quay") {
    const front = queueOf(f)[0];
    if (front) {
      if (f.npc.counter?.[0] !== front.id) f.npc.counter = [front.id, now];
      else if (now - f.npc.counter[1] >= ms(cfg, FLOOR.npcPlateMs)) plated(f, front, now, cfg);
    }
  }
  if (cfg.role !== "thu_ngan") {
    const front = payingOf(f)[0];
    if (front) {
      if (f.npc.cashier?.[0] !== front.id) f.npc.cashier = [front.id, now];
      else if (now - f.npc.cashier[1] >= ms(cfg, FLOOR.npcCashMs))
        events.push(paid(f, cfg, front, now, rand));
    }
  }
  if (cfg.role !== "bung_be") {
    // Bé Út bưng tối đa 2 dĩa một lượt; ăn xong có người dọn bàn.
    const carrying = f.pass.filter((p) => p.npcTakenAt !== null);
    for (const p of f.pass) {
      if (p.npcTakenAt === null && p.readyAt <= now && carrying.length < FLOOR.maxHold) {
        p.npcTakenAt = now;
        carrying.push(p);
      }
    }
    for (const p of carrying) {
      if (p.npcTakenAt !== null && now - p.npcTakenAt >= ms(cfg, FLOOR.npcCarryMs))
        served(f, p, now, minute);
    }
    for (const [table, at] of Object.entries(f.dirty)) {
      if (now - at >= ms(cfg, FLOOR.npcCleanMs)) delete f.dirty[Number(table)];
    }
  }

  // 5. Gây lộn: mỗi giờ game xét một lần khi quán có từ 2 bàn trở lên.
  const hour = Math.floor(minute / 60);
  if (hour !== f.lastIncidentHour) {
    f.lastIncidentHour = hour;
    const sitting = f.diners.filter(
      (d) => (d.stage === "seated" || d.stage === "eating") && !d.incident,
    );
    if (sitting.length >= 2 && rand() < FLOOR.argueChancePerHour) {
      const d = pick(sitting, rand);
      d.incident = "argue";
      d.incidentAt = now;
      d.say = { text: pick(ARGUES, rand), tone: "bad", until: now + ms(cfg, FLOOR.argueMs) };
    }
  }
  for (const d of f.diners) {
    if (d.incident !== "argue" || now - d.incidentAt < ms(cfg, FLOOR.argueMs)) continue;
    // Không ai can: khách đó và bàn gần nhất bỏ về, đánh giá thấp.
    d.incident = null;
    const at = (x: Diner): Pt => cfg.layout.tables[x.table - 1] ?? { x: 0, z: 0 };
    const near = f.diners
      .filter((x) => x !== d && (x.stage === "seated" || x.stage === "eating"))
      .sort((a, b) => dist(at(a), at(d)) - dist(at(b), at(d)))[0];
    for (const x of near ? [d, near] : [d])
      events.push(...walkOut(f, cfg, x, now, rand, "quán ồn ào"));
  }
  return events;
}
