import type {
  ClockView,
  DayReportView,
  JobTaskEvent,
  MeView,
  NotifyEvent,
  OrderEvent,
  OrderResultEvent,
  OrderUpdateEvent,
  SayEvent,
  Snapshot,
  WorldView,
} from "@xom/shared";
import { create } from "zustand";

export interface PerfStats {
  fps: number;
  calls: number;
  triangles: number;
  dpr: number;
}

/** Khung thoại trên đầu nhân vật; key = playerId / id NPC / "order:<id>". */
export interface Bubble {
  text: string;
  tone: "say" | "ask" | "good" | "bad";
  big?: boolean;
  /** Tự ẩn lúc này (ms epoch); bỏ trống = hiện tới khi bị xoá. */
  until?: number;
}

export type SheetId = "business" | "market" | "jobs" | "equipment" | "talk";

/** Đơn khách ở quầy mình + trạng thái món đã làm. */
export interface OrderState extends OrderEvent {
  made: "none" | "correct" | "wrong";
  mistakes: string[];
}

/** Nơi nhân vật đang tự đi tới; tới nơi thì mở sheet tương ứng (nếu có). */
export type Goal =
  | { kind: "place"; id: string; open?: SheetId }
  | { kind: "stall"; open?: SheetId };

export interface Toast extends NotifyEvent {
  id: number;
}

interface GameState {
  status: "connecting" | "online" | "offline";
  me: MeView | null;
  clock: ClockView | null;
  world: WorldView;
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
  jobTask: JobTaskEvent | null;
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
  setJobTask: (t: JobTaskEvent | null) => void;
  countServed: () => void;
  countJobTask: () => void;
  showDialogue: (step: string | null) => void;
  setDialoguePage: (page: number) => void;
  setPerf: (perf: PerfStats) => void;
  setPing: (pingMs: number | null) => void;
  setContextLost: (lost: boolean) => void;
}

let toastId = 0;

export const useGame = create<GameState>((set) => ({
  status: "connecting",
  me: null,
  clock: null,
  world: { lots: [] },
  report: null,
  sheet: null,
  toasts: [],
  nearPlace: null,
  atStall: false,
  goal: null,
  orders: [],
  kitchen: null,
  bubbles: {},
  jobTask: null,
  servedCount: 0,
  jobTasksDone: 0,
  dialogue: null,
  dialoguePage: 0,
  seenDialogues: [],
  perf: { fps: 0, calls: 0, triangles: 0, dpr: 1 },
  pingMs: null,
  contextLost: false,
  applySnapshot: (s) =>
    set({
      me: s.me,
      clock: s.clock,
      world: s.world,
      orders: s.orders.map((o) => ({ ...o, made: "none", mistakes: [] })),
    }),
  setMe: (me) => set({ me }),
  setClock: (clock) => set({ clock }),
  setWorld: (world) => set({ world }),
  setReport: (report) => set({ report }),
  setStatus: (status) => set({ status }),
  openSheet: (sheet) => set({ sheet }),
  toast: (n) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...n, id }] }));
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
          ? { ...o, made: u.stage, mistakes: u.mistakes, expiresAt: u.expiresAt }
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
  say: (e, ms = 4000) =>
    set((s) => ({
      bubbles: { ...s.bubbles, [e.who]: { text: e.text, tone: "say", until: Date.now() + ms } },
    })),
  setBubble: (key, b) =>
    set((s) => {
      const bubbles = { ...s.bubbles };
      if (b) bubbles[key] = b;
      else delete bubbles[key];
      return { bubbles };
    }),
  setJobTask: (jobTask) => set({ jobTask }),
  countServed: () => set((s) => ({ servedCount: s.servedCount + 1 })),
  countJobTask: () => set((s) => ({ jobTasksDone: s.jobTasksDone + 1 })),
  setDialoguePage: (dialoguePage) => set({ dialoguePage }),
  showDialogue: (dialogue) =>
    set((s) => ({
      dialogue,
      dialoguePage: 0,
      seenDialogues:
        dialogue && !s.seenDialogues.includes(dialogue)
          ? [...s.seenDialogues, dialogue]
          : s.seenDialogues,
    })),
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
