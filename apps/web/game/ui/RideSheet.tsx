"use client";

import { content } from "@xom/content";
import type { RideView } from "@xom/shared";
import { congestion, formatClock } from "@xom/sim";
import { useEffect, useState } from "react";
import { vnd, vndShort } from "../format";
import { send } from "../net/socket";
import { useGame } from "../store";
import { PlaceFace } from "./PlaceGate";
import { Sheet } from "./Sheet";
import { CashChange } from "./work/CashChange";

type RideIntent =
  | "ride:view"
  | "ride:rent"
  | "ride:wait"
  | "ride:offer"
  | "ride:go"
  | "ride:arrive"
  | "ride:pay"
  | "ride:quit";

/**
 * 🛵 Trạm xe ôm gốc me của Chú Lực (docs/KIENTRUC.md §4, UC-N1): thuê xe → chờ khách → trả giá → chọn đường lớn / hẻm →
 * chạy tới nơi → thu tiền, thối tiền → khách chấm sao, boa; xăng trừ mỗi cuốc.
 */
export function RideSheet() {
  const ride = useGame((s) => s.ride);
  const setRide = useGame((s) => s.setRide);
  const close = useGame((s) => s.openSheet);
  const setGoal = useGame((s) => s.setGoal);
  const minute = useGame((s) => s.clock?.minute ?? 0);
  const [busy, setBusy] = useState(false);
  const station = content.data.rides.stationPlaceId;

  useEffect(() => {
    void send("ride:view", {}).then((r) => r.ok && setRide(r.data));
  }, [setRide]);

  const act = async (event: RideIntent, body: Record<string, unknown> = {}) => {
    setBusy(true);
    // biome-ignore lint/suspicious/noExplicitAny: payload theo từng intent xe ôm
    const r = await send(event, body as any);
    setBusy(false);
    if (r.ok) setRide(r.data as RideView);
    return r.ok ? (r.data as RideView) : null;
  };
  const driveTo = (r: RideView) => {
    if (!r.dest) return;
    close(null);
    setGoal({ kind: "point", x: r.dest.x, z: r.dest.z, open: "ride" });
  };

  return (
    <Sheet
      title="Trạm xe ôm gốc me"
      onClose={() => close(null)}
      face={ride?.stage === "idle" || !ride ? <PlaceFace placeId={station} /> : undefined}
    >
      {!ride ? (
        <p className="text-sm text-ink/50">Đang ra trạm…</p>
      ) : (
        <div className="flex flex-col gap-3" data-ride={ride.stage}>
          <Stats ride={ride} />
          {ride.stage === "idle" && <Idle ride={ride} busy={busy} minute={minute} onAct={act} />}
          {ride.stage === "waiting" && (
            <div className="rounded-2xl bg-white p-3 text-sm shadow-sm">
              {ride.comment && <p className="mb-1.5 text-red">{ride.comment}</p>}
              <p className="font-semibold">⏳ Đang đứng trạm chờ khách…</p>
              {ride.readyAt !== undefined && (
                <p className="text-xs text-ink/60">
                  Khoảng {formatClock(ride.readyAt)} sẽ có người vẫy.
                </p>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void act("ride:quit")}
                className="mt-2 h-10 w-full rounded-xl bg-ink/10 text-sm font-semibold"
              >
                Nghỉ chạy
              </button>
            </div>
          )}
          {ride.stage === "offer" && <Offer ride={ride} busy={busy} onAct={act} />}
          {ride.stage === "route" && (
            <Route
              ride={ride}
              busy={busy}
              onGo={async (route) => {
                const r = await act("ride:go", { route });
                if (r) driveTo(r);
              }}
            />
          )}
          {ride.stage === "riding" && (
            <div className="rounded-2xl bg-white p-3 text-sm shadow-sm">
              <p className="font-semibold">
                🛵 Đang chở {ride.passenger?.name} tới {ride.dest?.label}
              </p>
              <p className="text-xs text-ink/60">
                {ride.route === "road" ? "🛣️ Đường lớn" : "🏘️ Đi hẻm"} · giá đã chốt{" "}
                {vnd(ride.price ?? 0)}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => driveTo(ride)}
                  className="h-10 rounded-xl bg-white text-sm font-semibold shadow-sm ring-1 ring-ink/10"
                >
                  🛵 Chạy tiếp
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act("ride:arrive")}
                  className="h-10 rounded-xl bg-leaf text-sm font-semibold text-cream disabled:opacity-40"
                >
                  🛬 Tới nơi rồi
                </button>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act("ride:quit")}
                className="mt-2 w-full text-center text-xs font-semibold text-red"
              >
                Bỏ khách giữa đường (không có tiền)
              </button>
            </div>
          )}
          {ride.stage === "pay" && <Pay ride={ride} busy={busy} onAct={act} />}
        </div>
      )}
    </Sheet>
  );
}

function Stats({ ride }: { ride: RideView }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-center" data-ride-stats>
      <div className="rounded-xl bg-white p-2 shadow-sm">
        <p className="text-[11px] text-ink/60">Hôm nay</p>
        <p className="font-extrabold tabular-nums">
          {ride.today.rides} cuốc · {vndShort(ride.today.earned)}
        </p>
      </div>
      <div className="rounded-xl bg-white p-2 shadow-sm">
        <p className="text-[11px] text-ink/60">Khách chấm</p>
        <p className="font-extrabold tabular-nums">
          {ride.rating.rides
            ? `⭐ ${ride.rating.avg.toFixed(1)} (${ride.rating.rides})`
            : "Chưa có"}
        </p>
      </div>
    </div>
  );
}

function Idle({
  ride,
  busy,
  minute,
  onAct,
}: {
  ride: RideView;
  busy: boolean;
  minute: number;
  onAct: (e: RideIntent) => Promise<RideView | null>;
}) {
  const r = content.data.rides;
  const jam = Math.round(congestion(content, minute) * 100);
  if (!ride.bikeToday)
    return (
      <div className="rounded-2xl bg-white p-3 text-sm shadow-sm">
        <p className="font-semibold">🛵 Thuê xe Wave cũ của Chú Lực</p>
        <p className="text-xs text-ink/60">
          {vnd(r.bikeRentPerDay)}/ngày · xăng tự trả ~{vndShort(r.fuelPer100m)}/100 m (tính cả lượt
          về trạm). Giá chuẩn: mở cửa {vndShort(r.baseFare)} + {vndShort(r.farePer100m)}/100 m.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAct("ride:rent")}
          className="mt-2 h-11 w-full rounded-xl bg-leaf font-semibold text-cream disabled:opacity-40"
        >
          Thuê xe · {vndShort(r.bikeRentPerDay)}
        </button>
      </div>
    );
  return (
    <div className="rounded-2xl bg-white p-3 text-sm shadow-sm">
      <p className="text-xs text-ink/60" data-jam={jam}>
        🚦 Giờ này đường lớn {jam >= 60 ? "kẹt cứng" : jam >= 30 ? "hơi đông" : "thông thoáng"} (
        {jam}%) — {jam >= 50 ? "chui hẻm cho lẹ." : "chạy đường lớn cho êm."}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void onAct("ride:wait")}
        className="mt-2 h-11 w-full rounded-xl bg-leaf font-semibold text-cream disabled:opacity-40"
      >
        🙋 Đứng chờ khách
      </button>
    </div>
  );
}

function Offer({
  ride,
  busy,
  onAct,
}: {
  ride: RideView;
  busy: boolean;
  onAct: (e: RideIntent, body?: Record<string, unknown>) => Promise<RideView | null>;
}) {
  const fare = ride.fare ?? 0;
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm" data-passenger={ride.passenger?.residentId}>
      <p className="text-xs text-ink/60">
        🙋 {ride.passenger?.name} · {ride.passenger?.bio}
      </p>
      <p className="mt-1 font-semibold leading-snug">"{ride.passenger?.line}"</p>
      <p className="mt-1 text-xs text-ink/70 tabular-nums">
        📍 {ride.dest?.label} · ~{ride.meters} m · giá chuẩn <b>{vnd(fare)}</b>
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {content.data.rides.haggle.map((h) => {
          const price = Math.max(1000, Math.round((fare * h.ratio) / 1000) * 1000);
          return (
            <button
              key={h.ratio}
              type="button"
              disabled={busy}
              onClick={() => void onAct("ride:offer", { ratio: h.ratio })}
              className={`h-12 rounded-xl text-sm font-semibold shadow-sm disabled:opacity-40 ${
                h.ratio === 1
                  ? "bg-leaf text-cream"
                  : h.ratio > 1.3
                    ? "bg-red/10 text-red"
                    : "bg-white ring-1 ring-ink/10"
              }`}
            >
              {h.label} · {vndShort(price)}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-ink/50">
        Nói thách quá thì khách đi bộ; trời mưa khách dễ chịu giá hơn.
      </p>
    </div>
  );
}

function Route({
  ride,
  busy,
  onGo,
}: {
  ride: RideView;
  busy: boolean;
  onGo: (route: "road" | "alley") => void;
}) {
  const r = ride.routes;
  const names = content.data.rides.routes;
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
      {ride.comment && (
        <p className="text-sm">
          {ride.passenger?.name}: "{ride.comment}"
        </p>
      )}
      <p className="mt-1 text-xs text-ink/60">
        Chốt {vnd(ride.price ?? 0)} tới {ride.dest?.label}. Đi đường nào?
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onGo("road")}
          className="rounded-xl bg-white p-2 text-left shadow-sm ring-1 ring-ink/10 disabled:opacity-40"
        >
          <span className="block text-sm font-semibold">🛣️ {names.road.name}</span>
          <span className="block text-xs text-ink/60 tabular-nums">
            ~{r?.road}s · kẹt {Math.round((r?.jam ?? 0) * 100)}%
          </span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onGo("alley")}
          className="rounded-xl bg-white p-2 text-left shadow-sm ring-1 ring-ink/10 disabled:opacity-40"
        >
          <span className="block text-sm font-semibold">🏘️ {names.alley.name}</span>
          <span className="block text-xs text-ink/60 tabular-nums">
            ~{r?.alley}s · {r?.wet ? "trơn, xóc" : "hẹp, không kẹt"}
          </span>
        </button>
      </div>
    </div>
  );
}

function Pay({
  ride,
  busy,
  onAct,
}: {
  ride: RideView;
  busy: boolean;
  onAct: (e: RideIntent, body?: Record<string, unknown>) => Promise<RideView | null>;
}) {
  const price = ride.price ?? 0;
  const pay = ride.pay;
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-2xl bg-white p-3 shadow-sm" data-stars={ride.stars}>
        <p className="text-lg">{"⭐".repeat(ride.stars ?? 0)}</p>
        <p className="text-sm font-semibold">
          {ride.passenger?.name}: "{ride.comment}"
        </p>
        {(ride.tip ?? 0) > 0 && (
          <p className="text-xs text-leaf">Khách boa thêm {vnd(ride.tip ?? 0)}</p>
        )}
      </div>
      {!pay || pay.kind === "transfer" || pay.bill === price ? (
        <>
          <p className="text-center text-sm">
            {pay?.kind === "transfer"
              ? `📱 Khách chuyển khoản ${vnd(price)}.`
              : `💵 Khách đưa vừa đủ ${vnd(price)}.`}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onAct("ride:pay", { change: null })}
            className="h-12 rounded-2xl bg-leaf font-semibold text-cream disabled:opacity-40"
          >
            ✓ Đã nhận tiền
          </button>
        </>
      ) : (
        <CashChange
          bill={pay.bill}
          due={price}
          dueLabel="🛵 Tiền cuốc xe"
          busy={busy}
          onDone={(change) => void onAct("ride:pay", { change })}
        />
      )}
    </div>
  );
}
