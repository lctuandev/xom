"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { content } from "@xom/content";
import type { ShiftView } from "@xom/shared";
import { formatClock } from "@xom/sim";
import { Suspense, useEffect, useState } from "react";
import { Vector3 } from "three";
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
import { QuanComScene } from "./QuanCom";
import { ROOM } from "./quancom/Room";
import { goTo, passStand, resetStaff, staff, tableStand } from "./quancom/staff";

type Cam = { pos: [number, number, number]; look: [number, number, number] };

/**
 * Mỗi vị trí một góc nhìn (docs/USECASES.md UC-W8), đủ rộng để thấy khách ra vào:
 * đứng quầy/thu ngân nhìn từ sau quầy ra cửa và phòng ăn; bưng bê thì camera trên cao đi theo mình.
 */
const CAMERAS: Record<string, Cam> = {
  quan_com: { pos: [0, 8.6, 5.4], look: [0, 0, -3.4] },
  // Đứng sau quầy nhìn qua vai (không thấy chính mình): khay trước mặt, hàng khách, cửa, phòng ăn.
  dung_quay: { pos: [0.3, 3.0, 1.8], look: [-1.2, 0.3, -3.2] },
  thu_ngan: { pos: [2.6, 3.0, 1.8], look: [0.6, 0.3, -3.2] },
  buu_cuc: { pos: [0.4, 3.2, 3.9], look: [-0.5, 0.6, -2.0] },
  giao_hang: { pos: [0.4, 3.2, 3.9], look: [-0.5, 0.6, -2.0] },
};

function CameraRig({ cam }: { cam: Cam }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.set(...cam.pos);
    camera.lookAt(...cam.look);
  }, [camera, cam]);
  return null;
}

const camPos = new Vector3();
const camLook = new Vector3();

/** Bưng bê: camera nhìn chéo từ trên cao, trượt theo nhân vật (vẫn thấy gần hết phòng ăn). */
function FollowCam() {
  const camera = useThree((s) => s.camera);
  useFrame((_, dt) => {
    const p = staff.walker.position;
    const x = p.x * 0.55;
    const z = Math.min(0.5, Math.max(ROOM.minZ + 3, p.z));
    camPos.set(x, 7.4, z + 5.6);
    camLook.set(x, 0, z - 1.6);
    camera.position.lerp(camPos, Math.min(1, dt * 3));
    camera.lookAt(camLook);
  });
  return null;
}

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
  const cam = CAMERAS[role ?? placeId] ?? CAMERAS.quan_com;
  const waiter = role === "bung_be";

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
        {waiter ? <FollowCam /> : <CameraRig cam={cam} />}
        <Suspense fallback={null}>
          {placeId === "quan_com" ? (
            <QuanComScene
              shift={here}
              plate={plate ?? []}
              onScoop={(f) => {
                if (plate !== null && (here?.trays[f] ?? 0) > plate.filter((x) => x === f).length)
                  setPlate([...plate, f]);
              }}
              onPass={waiter ? (id) => actions.grab(id) : undefined}
              onTable={waiter ? (n) => actions.table(n) : undefined}
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
          <WaiterPanel shift={here} onPass={actions.grab} onTable={actions.table} />
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

/**
 * Việc của bưng bê: đi tới nơi rồi mới làm (server kiểm thời gian đi bộ).
 * Vai khác gọi `calm` thì làm tại chỗ (nói vọng ra).
 */
function waiterActions() {
  const shiftNow = () => useGame.getState().shift;
  const walkThen = (spot: { x: number; z: number; face: number }, act: () => void) => {
    if (shiftNow()?.role !== "bung_be") return act();
    goTo(spot.x, spot.z, act, spot.face);
  };
  return {
    grab: (id: string) =>
      walkThen(passStand, () => void sendWork({ kind: "grab", taskId: id }, "quan_com")),
    table: (n: number) =>
      walkThen(tableStand(n), () => {
        const sh = shiftNow();
        if (!sh) return;
        const who = dinerAt(sh, n);
        const speaker = who ? `diner:${who.id}` : "quan_com";
        const argue = sh.diners.find((d) => d.table === n && d.incident === "argue");
        if (argue) {
          void sendWork({ kind: "calm", taskId: argue.id }, `diner:${argue.id}`);
          return;
        }
        const held = sh.pass.filter((p) => sh.holding.includes(p.id));
        const plate = held.find((p) => p.table === n) ?? held[0];
        if (plate) void sendWork({ kind: "serve", taskId: plate.id, table: n }, speaker);
        else if (sh.tables[n - 1] === "dirty")
          void sendWork({ kind: "clean", table: n }, "quan_com");
      }),
    calm: (dinerId: string, table: number) =>
      walkThen(
        tableStand(table),
        () => void sendWork({ kind: "calm", taskId: dinerId }, `diner:${dinerId}`),
      ),
  };
}
