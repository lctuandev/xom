"use client";

import { Canvas } from "@react-three/fiber";
import { content } from "@xom/content";
import type { ShiftView } from "@xom/shared";
import { formatClock } from "@xom/sim";
import { Suspense, useEffect, useState } from "react";
import { vnd } from "../format";
import { send, sendWork } from "../net/socket";
import { BubbleProjector } from "../scene/BubbleProjector";
import { useGame } from "../store";
import { BubbleLayer } from "../ui/BubbleLayer";
import { Toasts } from "../ui/Hud";
import { DeliveryDesk } from "../ui/work/DeliveryDesk";
import { FloorAlerts } from "../ui/work/FloorAlerts";
import { PlatePanel, RegisterPanel, WaiterPanel } from "../ui/work/QuanComPanels";
import { RolePicker } from "../ui/work/RolePicker";
import { BuuCucScene } from "./BuuCuc";
import { type CamPreset, OrbitCam } from "./cam";
import { QuanComScene, serverClock } from "./QuanCom";
import { goTo, passStand, resetStaff, staff, tableStand } from "./quancom/staff";

/**
 * Mỗi vị trí một góc nhìn mặc định (docs/USECASES.md UC-W8), lùi xa để thấy cả phòng và khách ra vào;
 * kéo một ngón để xoay, chụm để thu/phóng (cam.tsx). Bưng bê: camera cao, trượt theo mình.
 */
const PRESETS: Record<string, CamPreset> = {
  quan_com: { focus: [0, 0, -3.2], dist: 14, pitch: 0.75, yaw: 0 },
  dung_quay: { focus: [-0.6, 0.8, -2.2], dist: 8, pitch: 1.0, yaw: 0.15 },
  thu_ngan: { focus: [1.2, 0.8, -2.2], dist: 8, pitch: 1.0, yaw: -0.3 },
  bung_be: { focus: [0, 0, -3], dist: 13, pitch: 0.62, yaw: 0 },
  buu_cuc: { focus: [-0.5, 0.6, -1.4], dist: 7.5, pitch: 1.0, yaw: 0.1 },
  giao_hang: { focus: [-0.5, 0.6, -1.4], dist: 7.5, pitch: 1.0, yaw: 0.1 },
};

/**
 * Không gian riêng khi vào làm (docs/USECASES.md UC-W1, W8): cảnh 3D bên trong thay cho bản đồ.
 * Quán cơm: ra ngoài = ra ca. Bưu cục: ra xe đi giao, ca vẫn tiếp tục.
 */
export default function Interior({ placeId }: { placeId: string }) {
  const shift = useGame((s) => s.shift);
  const me = useGame((s) => s.me);
  const clock = useGame((s) => s.clock);
  const setInside = useGame((s) => s.setInside);
  const [plate, setPlate] = useState<string[] | null>(null);
  const place = content.place(placeId);
  const here = shift && shift.placeId === placeId ? shift : null;
  const role = here?.role;
  const preset = PRESETS[role ?? placeId] ?? (PRESETS.quan_com as CamPreset);
  const waiter = role === "bung_be";

  // Bù lệch đồng hồ server để diễn đúng nhịp (ăn vơi dần…).
  useEffect(() => {
    if (here) serverClock.offset = here.now - Date.now();
  }, [here]);

  // Vào ca bưng bê: đứng ở cửa bếp.
  useEffect(() => {
    if (waiter) resetStaff();
  }, [waiter]);

  const leave = async () => {
    if (here && here.jobId === "phu_quan_com") {
      // Rời quán = ra ca, nhận phiếu lương.
      await send("work:stop", {});
    }
    setInside(null);
  };
  const pick = (code: string) => {
    const d = here?.deliveries.find((x) => x.stage === "shelf");
    if (d) void sendWork({ kind: "pick", taskId: d.id, code }, "buu_cuc");
  };

  const actions = waiterActions();

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink select-none">
      <Canvas
        camera={{ fov: 62, near: 0.05, far: 80 }}
        dpr={[1, 1.5]}
        flat
        gl={{ antialias: false }}
        style={{ touchAction: "none" }}
      >
        <color attach="background" args={["#2b2118"]} />
        <hemisphereLight args={["#fff6e5", "#8a7f70", 1.7]} />
        <directionalLight position={[3, 6, 4]} intensity={1.2} />
        <OrbitCam preset={preset} follow={waiter ? staff.walker.position : undefined} />
        <Suspense fallback={null}>
          {placeId === "quan_com" ? (
            <QuanComScene
              shift={here}
              plate={plate ?? []}
              onScoop={(f) => {
                const cur = plate ?? [];
                if ((here?.trays[f] ?? 0) > cur.filter((x) => x === f).length)
                  setPlate([...cur, f]);
              }}
              onPass={waiter ? () => actions.toPass() : undefined}
              onTable={waiter ? (n) => actions.toTable(n) : undefined}
              onFloor={waiter ? (x, z) => goTo(x, z) : undefined}
            />
          ) : (
            <BuuCucScene shift={here} onPick={pick} />
          )}
          <BubbleProjector fallbackTop={96} />
        </Suspense>
      </Canvas>
      <BubbleLayer />

      <header className="pt-safe pointer-events-auto absolute inset-x-0 top-0 flex items-center gap-2 px-3">
        <div className="rounded-full bg-cream/95 px-3 py-1.5 text-sm font-extrabold tabular-nums shadow-sm">
          {me ? vnd(me.money) : "…"}
        </div>
        <div className="rounded-full bg-cream/95 px-3 py-1.5 text-sm font-semibold tabular-nums shadow-sm">
          {clock ? formatClock(clock.minute) : "…"}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={leave}
          className="h-9 rounded-full bg-cream/95 px-3 text-sm font-semibold shadow-sm"
        >
          {here?.jobId === "phu_quan_com" ? "🚪 Ra ca" : "🚪 Ra ngoài"}
        </button>
      </header>

      {here && (
        <div className="pointer-events-none absolute inset-x-3 top-[calc(max(env(safe-area-inset-top),0.75rem)+2.9rem)] flex flex-col items-center gap-1.5">
          <div className="rounded-full bg-ink/80 px-3 py-1 text-xs font-semibold text-cream">
            {place.name} · xong {here.stats.done} việc · +{vnd(here.stats.earned)} · lỗi{" "}
            {here.stats.strikes}/{here.stats.maxStrikes}
            {here.stats.reviews > 0 &&
              ` · ⭐ ${(here.stats.stars / here.stats.reviews).toFixed(1)}`}
          </div>
          <FloorAlerts shift={here} onCalm={actions.calm} />
        </div>
      )}
      <Toasts />

      <section
        aria-label="Làm việc"
        className="pb-safe pointer-events-auto absolute inset-x-0 bottom-0 max-h-[44dvh] overflow-y-auto rounded-t-3xl bg-cream px-3 pt-3 shadow-[0_-8px_30px_rgba(0,0,0,0.25)]"
      >
        {!here ? (
          shift ? (
            <p className="p-3 text-center text-sm">Bạn đang trong ca ở nơi khác.</p>
          ) : (
            <RolePicker placeId={placeId} />
          )
        ) : here.role === "dung_quay" ? (
          <PlatePanel shift={here} plate={plate} setPlate={setPlate} />
        ) : here.role === "thu_ngan" ? (
          <RegisterPanel shift={here} />
        ) : here.role === "bung_be" ? (
          <WaiterPanel shift={here} actions={actions} />
        ) : (
          <DeliveryDesk shift={here} onPick={pick} />
        )}
      </section>
    </div>
  );
}

/** Khách đang ngồi ở một bàn (để lời cảm ơn/phàn nàn hiện đúng trên đầu người đó). */
function dinerAt(shift: ShiftView, table: number) {
  return shift.diners.find(
    (d) =>
      d.table === table && (d.stage === "seated" || d.stage === "eating" || d.stage === "to_table"),
  );
}

export type WaiterActions = ReturnType<typeof waiterActions>;

/**
 * Việc của bưng bê: chạm để đi tới (cửa bếp / bàn), tới nơi thì bấm nút hành động ở dưới
 * (lấy dĩa, giao món, lau bàn, can ngăn). Server kiểm thời gian đi bộ.
 */
function waiterActions() {
  const shiftNow = () => useGame.getState().shift;
  return {
    toPass: () => goTo(passStand.x, passStand.z, undefined, passStand.face),
    toTable: (n: number) => {
      const s = tableStand(n);
      goTo(s.x, s.z, undefined, s.face);
    },
    grab: (id: string) => void sendWork({ kind: "grab", taskId: id }, "quan_com"),
    serve: (n: number) => {
      const sh = shiftNow();
      if (!sh) return;
      const held = sh.pass.filter((p) => sh.holding.includes(p.id));
      const plate = held.find((p) => p.table === n) ?? held[0];
      const who = dinerAt(sh, n);
      if (plate)
        void sendWork(
          { kind: "serve", taskId: plate.id, table: n },
          who ? `diner:${who.id}` : "quan_com",
        );
    },
    wipe: (n: number, scale: number) => {
      // Lau vài giây (thấy khăn chạy trên bàn) rồi mới xong.
      const ms = Math.max(600, 1500 * Math.min(1, scale * 2));
      staff.wiping = { table: n, until: Date.now() + ms };
      setTimeout(() => {
        staff.wiping = null;
        void sendWork({ kind: "clean", table: n }, "quan_com");
      }, ms);
    },
    calm: (dinerId: string, table: number) => {
      if (shiftNow()?.role !== "bung_be") {
        void sendWork({ kind: "calm", taskId: dinerId }, `diner:${dinerId}`);
        return;
      }
      const s = tableStand(table);
      goTo(
        s.x,
        s.z,
        () => void sendWork({ kind: "calm", taskId: dinerId }, `diner:${dinerId}`),
        s.face,
      );
    },
  };
}
