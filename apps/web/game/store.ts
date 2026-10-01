import { content } from "@xom/content";
import type {
  ClockView,
  DayReportView,
  EventView,
  MeView,
  NotifyEvent,
  OrderEvent,
  OrderResultEvent,
  OrderUpdateEvent,
  PayslipView,
  RosterView,
  SayEvent,
  ShiftView,
  Snapshot,
  WorldView,
} from "@xom/shared";
import { create } from "zustand";
import { sfx, voice } from "./audio";

/** Đoán tâm trạng của câu nói để chọn giọng (bực thì gắt, vui thì cao). */
function moodOf(text: string, tone?: Bubble["tone"]): "calm" | "happy" | "angry" {
  if (tone === "bad") return "angry";
  if (tone === "good") return "happy";
  if (/sao lâu|bực|trời đất|ồn|giành|thiếu|đâu phải|không quay lại|chậm|kỳ vậy|đói/i.test(text))
    return "angry";
  if (/cảm ơn|ngon|giỏi|thơm|tuyệt|⭐⭐⭐⭐/i.test(text)) return "happy";
  return "calm";
}

/** Giọng cho câu thoại kịch bản đang hiện (người dẫn đường nói). */
function speakDialogue(step: string | null, page: number) {
  if (!step) return;
  const st = content.stepById.get(step);
  const line = st?.lines[page];
  if (st?.speaker && line) voice(st.speaker, line);
}

export interface PerfStats {
  fps: number;
  calls: number;
  triangles: number;
  dpr: number;
}

/** Khung thoại trên đầu nhân vật; key = playerId / id NPC / "order:<id>". */
export interface Bubble {
  text: string;
  tone: "say" | "ask" | "good" | "bad" | "tag";
  big?: boolean;
  /** Tự ẩn lúc này (ms epoch); bỏ trống = hiện tới khi bị xoá. */
  until?: number;
}

export type SheetId =
  | "business"
  | "market"
  | "jobs"
  | "equipment"
  | "talk"
  | "xom"
  | "shop"
  | "vendor"
  | "food"
  | "quests"
  | "profile"
  | "settings"
  | "recipes"
  | "atm"
  | "board"
  | "fund";

/** Đơn khách ở quầy mình + trạng thái món đã làm. */
export interface OrderState extends OrderEvent {
  made: "none" | "correct" | "wrong";
  mistakes: string[];
}

/** Nơi nhân vật đang tự đi tới; tới nơi thì mở sheet tương ứng (nếu có). */
export type Goal =
  | { kind: "place"; id: string; open?: SheetId }
  | { kind: "stall"; open?: SheetId }
  | { kind: "address"; id: string }
  /** Tới quầy hàng xóm (businessId) để gọi món. */
  | { kind: "shop"; id: string; lotId: string; open?: SheetId }
  /** Tới sạp đồ ăn NPC. */
  | { kind: "vendor"; id: string; open?: SheetId }
  /** Tới cây ATM. */
  | { kind: "atm"; id: string; open?: SheetId };

export interface Toast extends NotifyEvent {
  id: number;
}

interface GameState {
  status: "connecting" | "online" | "offline";
  me: MeView | null;
  clock: ClockView | null;
  world: WorldView;
  /** Sự kiện hôm nay trong xóm (khai trương, mưa lớn…). */
  events: EventView[];
  setEvents: (e: EventView[]) => void;
  report: DayReportView | null;
  sheet: SheetId | null;
  toasts: Toast[];
  /** Địa điểm nhân vật đang đứng gần (trong bán kính tương tác). */
  nearPlace: string | null;
  /** Nhân vật đang đứng sau quầy của mình. */
  atStall: boolean;
  goal: Goal | null;
  /** Đơn khách đang chờ ở quầy của mình (cũ nhất trước). */
  orders: OrderState[];
  /** Đơn đang mở màn hình làm món. */
  kitchen: string | null;
  bubbles: Record<string, Bubble>;
  /** Đang ở bên trong nơi làm (id địa điểm) — cảnh nội thất thay cho bản đồ. */
  inside: string | null;
  shift: ShiftView | null;
  payslip: PayslipView | null;
  /** Địa chỉ giao hàng đang đứng trước cửa. */
  nearAddress: string | null;
  /** Đếm trong phiên, dùng cho điều kiện kịch bản. */
  servedCount: number;
  jobTasksDone: number;
  /** Bước kịch bản đang hiện lời thoại (null = không có hội thoại). */
  dialogue: string | null;
  /** Câu đang hiện trong hội thoại (bắt đầu từ 0). */
  dialoguePage: number;
  seenDialogues: string[];
  perf: PerfStats;
  pingMs: number | null;
  contextLost: boolean;
  /** Ai đang online trong xóm (vị trí từng khung hình nằm ở net/peers.ts, không qua store). */
  roster: RosterView | null;
  /** Mã xóm từ link mời (?xom=…) đang chờ người chơi đồng ý vào. */
  invite: string | null;
  /** Quầy hàng xóm đang đứng gần (businessId) — gọi món được (UC-J3). */
  nearShop: string | null;
  /** Món mình đã gọi ở quầy hàng xóm, đang chờ. */
  purchase: Purchase | null;
  setNearShop: (id: string | null) => void;
  /** Cây ATM đang đứng gần (UC-I6). */
  nearAtm: string | null;
  setNearAtm: (id: string | null) => void;
  /** Sạp đồ ăn NPC đang đứng gần (UC-B9). */
  nearVendor: string | null;
  setNearVendor: (id: string | null) => void;
  /** Đang ngồi ăn ở sạp (tới lúc nào). */
  eating: { vendorId: string; until: number } | null;
  setEating: (e: { vendorId: string; until: number } | null) => void;
  /** Chuyện trong xóm cho dải tin chạy trên HUD (mới nhất cuối). */
  news: { id: number; text: string }[];
  pushNews: (text: string) => void;
  showPerf: boolean;
  setShowPerf: (v: boolean) => void;
  setPurchase: (p: Purchase | null) => void;
  setRoster: (r: RosterView) => void;
  setInvite: (code: string | null) => void;
  applySnapshot: (s: Snapshot) => void;
  setMe: (me: MeView) => void;
  setClock: (c: ClockView) => void;
  setWorld: (w: WorldView) => void;
  setReport: (r: DayReportView | null) => void;
  setStatus: (s: GameState["status"]) => void;
  openSheet: (s: SheetId | null) => void;
  toast: (n: NotifyEvent) => void;
  dismissToast: (id: number) => void;
  setProximity: (nearPlace: string | null, atStall: boolean) => void;
  setGoal: (goal: Goal | null) => void;
  addOrder: (o: OrderEvent) => void;
  updateOrder: (u: OrderUpdateEvent) => void;
  removeOrder: (orderId: string) => void;
  /** Làm lại món (sau khi khách chê sai). */
  resetDish: (orderId: string) => void;
  openKitchen: (orderId: string | null) => void;
  say: (s: SayEvent, ms?: number) => void;
  setBubble: (key: string, b: Bubble | null) => void;
  setInside: (placeId: string | null) => void;
  setShift: (s: ShiftView | null) => void;
  setPayslip: (p: PayslipView | null) => void;
  setNearAddress: (id: string | null) => void;
  countServed: () => void;
  countJobTask: () => void;
  showDialogue: (step: string | null) => void;
  setDialoguePage: (page: number) => void;
  setPerf: (perf: PerfStats) => void;
  setPing: (pingMs: number | null) => void;
  setContextLost: (lost: boolean) => void;
}

export interface Purchase {
  orderId: string;
  businessId: string;
  ownerName: string;
  dish: string;
  price: number;
  stage: "waiting" | "wrong" | "correct";
}

export function purchaseOf(o: OrderEvent | undefined, world: WorldView): Purchase | null {
  if (!o) return null;
  return {
    orderId: o.orderId,
    businessId: o.businessId,
    ownerName: world.lots.find((l) => l.businessId === o.businessId)?.ownerName ?? "hàng xóm",
    dish: o.dish,
    price: o.price,
    stage: "waiting",
  };
}

let toastId = 0;

export const useGame = create<GameState>((set) => ({
  status: "connecting",
  me: null,
  clock: null,
  world: { lots: [] },
  events: [],
  setEvents: (events) => set({ events }),
  report: null,
  sheet: null,
  toasts: [],
  nearPlace: null,
  atStall: false,
  goal: null,
  orders: [],
  kitchen: null,
  bubbles: {},
  inside: null,
  shift: null,
  payslip: null,
  nearAddress: null,
  servedCount: 0,
  jobTasksDone: 0,
  dialogue: null,
  dialoguePage: 0,
  seenDialogues: [],
  perf: { fps: 0, calls: 0, triangles: 0, dpr: 1 },
  pingMs: null,
  contextLost: false,
  roster: null,
  invite: null,
  nearShop: null,
  purchase: null,
  setNearShop: (nearShop) => set({ nearShop }),
  nearAtm: null,
  setNearAtm: (nearAtm) => set({ nearAtm }),
  nearVendor: null,
  setNearVendor: (nearVendor) => set({ nearVendor }),
  eating: null,
  setEating: (eating) => set({ eating }),
  news: [],
  pushNews: (text) =>
    set((s) =>
      s.news.at(-1)?.text === text ? s : { news: [...s.news, { id: ++toastId, text }].slice(-6) },
    ),
  showPerf: false,
  setShowPerf: (showPerf) => set({ showPerf }),
  setPurchase: (purchase) => set({ purchase }),
  setRoster: (roster) => set({ roster }),
  setInvite: (invite) => set({ invite }),
  applySnapshot: (s) =>
    set({
      roster: s.roster,
      me: s.me,
      shift: s.shift,
      clock: s.clock,
      world: s.world,
      events: s.events,
      orders: s.orders
        .filter((o) => o.ownerId === s.me.playerId)
        .map((o) => ({ ...o, made: "none", mistakes: [] })),
      purchase: purchaseOf(
        s.orders.find((o) => o.buyerId === s.me.playerId),
        s.world,
      ),
    }),
  setMe: (me) =>
    set((s) => {
      // Lên cấp (DESIGN §4): chúc mừng ngay khi KN qua ngưỡng.
      if (s.me && me.progress.level > s.me.progress.level) {
        sfx("bell");
        const id = ++toastId;
        setTimeout(() => set((x) => ({ toasts: x.toasts.filter((t) => t.id !== id) })), 4000);
        return {
          me,
          toasts: [
            ...s.toasts.slice(-2),
            { id, kind: "good", text: `🎉 Lên cấp ${me.progress.level}!` },
          ],
        };
      }
      return { me };
    }),
  setClock: (clock) => set({ clock }),
  setWorld: (world) => set({ world }),
  setReport: (report) => set({ report }),
  setStatus: (status) => set({ status }),
  openSheet: (sheet) => set({ sheet }),
  toast: (n) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...n, id }] }));
    sfx(n.kind === "warn" ? "error" : n.kind === "good" && n.text.startsWith("+") ? "coin" : "pop");
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setProximity: (nearPlace, atStall) => set({ nearPlace, atStall }),
  setGoal: (goal) => set({ goal }),
  addOrder: (o) => set((s) => ({ orders: [...s.orders, { ...o, made: "none", mistakes: [] }] })),
  updateOrder: (u) =>
    set((s) => ({
      orders: s.orders.map((o) =>
        o.orderId === u.orderId
          ? u.stage === "making"
            ? { ...o, expiresAt: u.expiresAt }
            : { ...o, made: u.stage, mistakes: u.mistakes, expiresAt: u.expiresAt }
          : o,
      ),
    })),
  removeOrder: (orderId) =>
    set((s) => ({
      orders: s.orders.filter((o) => o.orderId !== orderId),
      kitchen: s.kitchen === orderId ? null : s.kitchen,
    })),
  resetDish: (orderId) =>
    set((s) => ({
      orders: s.orders.map((o) =>
        o.orderId === orderId ? { ...o, made: "none", mistakes: [] } : o,
      ),
    })),
  openKitchen: (kitchen) => set({ kitchen, sheet: null }),
  say: (e, ms = 4000) => {
    voice(e.who, e.text, moodOf(e.text));
    set((s) => ({
      bubbles: { ...s.bubbles, [e.who]: { text: e.text, tone: "say", until: Date.now() + ms } },
    }));
  },
  setBubble: (key, b) =>
    set((s) => {
      if (b && b.tone !== "tag" && s.bubbles[key]?.text !== b.text)
        voice(key, b.text, moodOf(b.text, b.tone));
      const bubbles = { ...s.bubbles };
      if (b) bubbles[key] = b;
      else delete bubbles[key];
      return { bubbles };
    }),
  setInside: (inside) => set({ inside, sheet: null }),
  setShift: (shift) => set({ shift }),
  setPayslip: (payslip) => set({ payslip }),
  setNearAddress: (nearAddress) => set({ nearAddress }),
  countServed: () => set((s) => ({ servedCount: s.servedCount + 1 })),
  countJobTask: () => set((s) => ({ jobTasksDone: s.jobTasksDone + 1 })),
  setDialoguePage: (dialoguePage) =>
    set((s) => {
      speakDialogue(s.dialogue, dialoguePage);
      return { dialoguePage };
    }),
  showDialogue: (dialogue) =>
    set((s) => {
      speakDialogue(dialogue, 0);
      return {
        dialogue,
        dialoguePage: 0,
        seenDialogues:
          dialogue && !s.seenDialogues.includes(dialogue)
            ? [...s.seenDialogues, dialogue]
            : s.seenDialogues,
      };
    }),
  setPerf: (perf) => set({ perf }),
  setPing: (pingMs) => set({ pingMs }),
  setContextLost: (contextLost) => set({ contextLost }),
}));

/** Kênh sự kiện cho scene (khách tới / kết quả đơn); không qua store để khỏi re-render React. */
function createBus<T>() {
  const listeners = new Set<(v: T) => void>();
  return {
    emit: (v: T) => {
      for (const l of listeners) l(v);
    },
    on: (l: (v: T) => void) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

export const orderBus = createBus<OrderEvent>();
export const orderResultBus = createBus<OrderResultEvent>();
export const orderUpdateBus = createBus<OrderUpdateEvent>();
