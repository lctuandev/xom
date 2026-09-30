import type {
  ClockView,
  DayReportView,
  MarketView,
  MeView,
  NotifyEvent,
  SaleEvent,
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

export type SheetId = "business" | "market" | "jobs";

export interface Toast extends NotifyEvent {
  id: number;
}

interface GameState {
  status: "connecting" | "online" | "offline";
  me: MeView | null;
  clock: ClockView | null;
  world: WorldView;
  market: MarketView | null;
  report: DayReportView | null;
  sheet: SheetId | null;
  toasts: Toast[];
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
  market: null,
  report: null,
  sheet: null,
  toasts: [],
  perf: { fps: 0, calls: 0, triangles: 0, dpr: 1 },
  pingMs: null,
  contextLost: false,
  applySnapshot: (s) => set({ me: s.me, clock: s.clock, world: s.world, market: s.market }),
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
  setPerf: (perf) => set({ perf }),
  setPing: (pingMs) => set({ pingMs }),
  setContextLost: (contextLost) => set({ contextLost }),
}));

/** Kênh sự kiện "có khách mua" cho scene; không qua store để khỏi re-render React. */
type SaleListener = (sale: SaleEvent) => void;
const saleListeners = new Set<SaleListener>();
export const saleBus = {
  emit: (sale: SaleEvent) => {
    for (const l of saleListeners) l(sale);
  },
  on: (l: SaleListener) => {
    saleListeners.add(l);
    return () => {
      saleListeners.delete(l);
    };
  },
};
