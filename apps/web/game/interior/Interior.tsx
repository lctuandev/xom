"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { content } from "@xom/content";
import { formatClock } from "@xom/sim";
import { Suspense, useEffect, useState } from "react";
import { vnd } from "../format";
import { send, sendWork } from "../net/socket";
import { BubbleProjector } from "../scene/BubbleProjector";
import { useGame } from "../store";
import { BubbleLayer } from "../ui/BubbleLayer";
import { Toasts } from "../ui/Hud";
import { DeliveryDesk } from "../ui/work/DeliveryDesk";
import { PlatePanel, RegisterPanel, WaiterPanel } from "../ui/work/QuanComPanels";
import { RolePicker } from "../ui/work/RolePicker";
import { BuuCucScene } from "./BuuCuc";
import { QuanComScene } from "./QuanCom";

type Cam = { pos: [number, number, number]; look: [number, number, number] };

/** Góc nhìn ngang tầm mắt theo từng vai; màn hình dọc nên nội dung chính nằm nửa trên. */
const CAMERAS: Record<string, Cam> = {
  quan_com: { pos: [0, 3.4, 3.6], look: [0, 0.2, -2.2] },
  dung_quay: { pos: [0, 2.35, 1.75], look: [0, 0.55, -1.3] },
  thu_ngan: { pos: [1.45, 2.3, 1.7], look: [1.5, 0.6, -1.3] },
  bung_be: { pos: [0, 5.2, 1.4], look: [0, -0.8, -5.2] },
  buu_cuc: { pos: [-0.4, 1.9, 1.9], look: [-0.45, 0.35, -2.2] },
  giao_hang: { pos: [-0.4, 1.9, 1.9], look: [-0.45, 0.35, -2.2] },
};

function CameraRig({ cam }: { cam: Cam }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.set(...cam.pos);
    camera.lookAt(...cam.look);
  }, [camera, cam]);
  return null;
}

/**
 * Không gian riêng khi vào làm (docs/USECASES.md UC-W1): cảnh 3D bên trong thay cho bản đồ,
 * thao tác trong vùng ngón cái. Quán cơm: ra ngoài = ra ca. Bưu cục: ra xe đi giao, ca vẫn tiếp tục.
 */
export default function Interior({ placeId }: { placeId: string }) {
  const shift = useGame((s) => s.shift);
  const me = useGame((s) => s.me);
  const clock = useGame((s) => s.clock);
  const setInside = useGame((s) => s.setInside);
  const [plate, setPlate] = useState<string[] | null>(null);
  const [holding, setHolding] = useState<string | null>(null);
  const place = content.place(placeId);
  const here = shift && shift.placeId === placeId ? shift : null;
  const cam = CAMERAS[here?.role ?? placeId] ?? CAMERAS.quan_com;

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

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink select-none">
      <Canvas
        camera={{ fov: 58, near: 0.05, far: 60 }}
        dpr={[1, 1.5]}
        flat
        gl={{ antialias: false }}
        style={{ touchAction: "none" }}
      >
        <color attach="background" args={["#2b2118"]} />
        <hemisphereLight args={["#fff6e5", "#8a7f70", 1.7]} />
        <directionalLight position={[3, 6, 4]} intensity={1.2} />
        <CameraRig cam={cam} />
        <Suspense fallback={null}>
          {placeId === "quan_com" ? (
            <QuanComScene
              shift={here}
              plate={plate ?? []}
              onScoop={(f) => {
                if (plate !== null && (here?.trays[f] ?? 0) > plate.filter((x) => x === f).length)
                  setPlate([...plate, f]);
              }}
              onTable={(n) => {
                const t = here?.serve.find((x) => x.id === holding);
                if (t)
                  void sendWork({ kind: "serve", taskId: t.id, table: n }, "quan_com").then(
                    (ok) => ok && setHolding(null),
                  );
                else if (here?.tables[n - 1] === "dirty")
                  void sendWork({ kind: "clean", table: n }, "quan_com");
              }}
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
        <div className="pointer-events-none absolute inset-x-3 top-[calc(max(env(safe-area-inset-top),0.75rem)+2.9rem)] flex justify-center">
          <div className="rounded-full bg-ink/80 px-3 py-1 text-xs font-semibold text-cream">
            {place.name} · xong {here.stats.done} việc · +{vnd(here.stats.earned)} · lỗi{" "}
            {here.stats.strikes}/{here.stats.maxStrikes}
          </div>
        </div>
      )}
      <Toasts />

      <section
        aria-label="Làm việc"
        className="pb-safe pointer-events-auto absolute inset-x-0 bottom-0 max-h-[52dvh] overflow-y-auto rounded-t-3xl bg-cream px-3 pt-3 shadow-[0_-8px_30px_rgba(0,0,0,0.25)]"
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
          <WaiterPanel shift={here} holding={holding} setHolding={setHolding} />
        ) : (
          <DeliveryDesk shift={here} onPick={pick} />
        )}
      </section>
    </div>
  );
}
