"use client";

import { content } from "@xom/content";
import type { ShopSetupView } from "@xom/shared";
import { formatClock } from "@xom/sim";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { vnd, vndShort } from "../format";
import { send } from "../net/socket";
import { useGame } from "../store";
import { RentPanel } from "./RentModal";

type ShopIntent =
  | "shop:view"
  | "shop:lease"
  | "shop:unlease"
  | "shop:register"
  | "shop:train"
  | "shop:book"
  | "shop:meet"
  | "shop:sign";

const ORDER: ShopSetupView["step"][] = ["lease", "license", "cert", "sign", "ready"];

/**
 * 🏪 Mở tiệm trong nhà mặt tiền như ngoài đời (docs/USECASES.md UC-F12): ký hợp đồng thuê nhà (cọc + vốn dự phòng) →
 * đăng ký hộ kinh doanh ở UBND phường, đặt tên quán → quán ăn uống: tập huấn ATTP, đón đoàn kiểm tra tại tiệm → làm biển
 * hiệu → mở tiệm. Mỗi bước tốn tiền / thời gian thật trong game.
 */
export function ShopSetup() {
  const [v, setV] = useState<ShopSetupView | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const minute = useGame((s) => s.clock?.minute ?? 0);
  const close = useGame((s) => s.openSheet);
  const setGoal = useGame((s) => s.setGoal);
  const tick = Math.floor(minute / 10);

  const load = useCallback(() => {
    void send("shop:view", {}).then((r) => r.ok && setV(r.data));
  }, []);
  useEffect(() => {
    void tick;
    load();
  }, [load, tick]);

  const act = async (event: ShopIntent, body: Record<string, unknown> = {}) => {
    setBusy(true);
    // biome-ignore lint/suspicious/noExplicitAny: payload theo từng intent mở tiệm
    const r = await send(event, body as any);
    setBusy(false);
    if (r.ok) setV(r.data as ShopSetupView);
  };

  if (!v) return <p className="text-sm text-ink/50">Đang xem giấy tờ…</p>;
  const s = content.data.shopSetup;
  const at = ORDER.indexOf(v.step);
  const state = (step: ShopSetupView["step"]) =>
    ORDER.indexOf(step) < at ? "done" : step === v.step ? "now" : "later";
  const house = v.lease ? content.lot(v.lease.lotId) : null;

  return (
    <section aria-label="Mở tiệm" className="mb-3 flex flex-col gap-2" data-shop-step={v.step}>
      <p className="text-xs text-ink/60">
        Mở tiệm trong nhà mặt tiền phải làm đủ giấy tờ như ngoài đời: thuê nhà (đặt cọc), đăng ký hộ
        kinh doanh, quán ăn uống thì có giấy an toàn thực phẩm, treo biển hiệu — rồi mới khai
        trương.
      </p>

      <Step n={1} title="📝 Thuê nhà mặt tiền" state={state("lease")}>
        {v.lease && house ? (
          <div className="text-xs" data-lease={v.lease.lotId}>
            <p>
              Đang thuê <b>{house.name}</b> · cọc {vnd(v.lease.deposit)} (hoàn khi trả nhà).
            </p>
            <p className="text-ink/60" data-lease-rules>
              Tiền nhà tính <b>từ ngày sau ngày ký</b>, mỗi ngày <b>dù mở hay đóng</b>. Chiều{" "}
              {formatClock(content.data.shopSetup.rent.remindMinute)} chủ nhà tới đòi — trả ngay,
              hoặc hẹn ngày (có phí trễ). Mở tiệm <b>không trả tiền chỗ</b> nữa, chỉ thuế khoán{" "}
              {vndShort(content.economy.fees.daily.house)}/ngày có mở. Đang thuê nhà thì không ra
              vỉa hè bán được — muốn ra thì trả nhà (còn nợ tiền nhà thì trừ vào cọc).
            </p>
            {v.rent && (
              <div className="mt-1.5">
                <RentPanel rent={v.rent} onDone={load} />
              </div>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void act("shop:unlease")}
              className="mt-1 text-xs font-semibold text-red"
            >
              Trả nhà (hoàn cọc)
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {v.houses.map((h) => {
              const lot = content.lot(h.lotId);
              const e = h.estimate;
              return (
                <li key={h.lotId} className="rounded-xl bg-cream p-2" data-house={h.lotId}>
                  <p className="text-sm font-semibold">{lot.name}</p>
                  <p className="text-xs text-ink/60">{lot.hint}</p>
                  <p className="mt-1 text-xs text-ink/60">
                    Ký xong đồ nghề dọn vào nhà, thôi bán xe đẩy ngoài vỉa hè (khỏi trả tiền chỗ).
                    Mặt tiền có mái, ghế, biển hiệu: <b>khách đông hơn</b> và{" "}
                    <b>chịu giá cao hơn ~{Math.round((lot.priceTolerance - 1) * 100)}%</b> so với xe
                    đẩy.
                  </p>
                  <p className="mt-1 text-xs tabular-nums">
                    Tiền nhà {vndShort(h.rentPerDay)}/ngày · cọc {vndShort(e.deposit)} (
                    {s.depositDays} ngày) · dự phòng {vndShort(e.reserve)}
                  </p>
                  <p className="text-xs text-ink/70 tabular-nums">
                    Dự toán đủ giấy tờ: <b>{vnd(e.total)}</b> (lệ phí {vndShort(e.license)}
                    {e.training ? ` · tập huấn ${vndShort(e.training)}` : ""} · biển{" "}
                    {vndShort(e.sign)})
                  </p>
                  <button
                    type="button"
                    disabled={busy || !!h.leasedBy}
                    onClick={() => void act("shop:lease", { lotId: h.lotId })}
                    className="mt-1.5 h-10 w-full rounded-xl bg-leaf text-sm font-semibold text-cream disabled:opacity-40"
                  >
                    {h.leasedBy
                      ? `${h.leasedBy} đang thuê`
                      : `Ký hợp đồng · cọc ${vndShort(e.deposit)}`}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Step>

      <Step n={2} title={`🏛️ Đăng ký hộ kinh doanh (${s.license.office})`} state={state("license")}>
        {v.license === "none" ? (
          state("license") === "now" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-ink/60" htmlFor="shop-name">
                Tên quán ({s.name.min}–{s.name.max} ký tự, không trùng trong xóm) — sẽ in lên biển
                hiệu
              </label>
              <input
                id="shop-name"
                value={name}
                maxLength={s.name.max + 4}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Bánh Mì Cô Ba"
                className="h-10 rounded-xl bg-white px-3 text-sm ring-1 ring-ink/15"
              />
              <button
                type="button"
                disabled={busy || name.trim().length < s.name.min}
                onClick={() => void act("shop:register", { name })}
                className="h-10 rounded-xl bg-leaf text-sm font-semibold text-cream disabled:opacity-40"
              >
                Nộp hồ sơ · lệ phí {vndShort(s.license.fee)}
              </button>
            </div>
          )
        ) : (
          <p className="text-xs">
            Quán <b>"{v.shopName}"</b> ·{" "}
            {v.license === "pending" && v.licenseReady
              ? `đang xét hồ sơ, xong lúc ${formatClock(v.licenseReady.minute)}`
              : "đã có giấy đăng ký ✓"}
          </p>
        )}
      </Step>

      {v.needCert && (
        <Step n={3} title="🧑‍🍳 Giấy chứng nhận an toàn thực phẩm" state={state("cert")}>
          {v.certified ? (
            <p className="text-xs">Đã có giấy ATTP ✓</p>
          ) : state("cert") !== "now" ? (
            <p className="text-xs text-ink/60">Tập huấn ATTP + đoàn kiểm tra tới tận tiệm.</p>
          ) : !v.trained ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act("shop:train")}
              className="h-10 w-full rounded-xl bg-leaf text-sm font-semibold text-cream disabled:opacity-40"
            >
              Đi tập huấn ATTP · {vndShort(s.foodCert.trainingFee)}
            </button>
          ) : !v.inspect ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act("shop:book")}
              className="h-10 w-full rounded-xl bg-leaf text-sm font-semibold text-cream disabled:opacity-40"
            >
              Hẹn đoàn kiểm tra tới tiệm
            </button>
          ) : (
            <div
              className="flex flex-col gap-1.5 text-xs"
              data-inspect={v.inspect.arrived ? "arrived" : "booked"}
            >
              <p>
                {v.inspect.arrived
                  ? `👮 Đoàn đang ở tiệm — có mặt trước ${formatClock(v.inspect.until)}, vắng là phải hẹn lại.`
                  : `Đoàn kiểm tra tới lúc ${formatClock(v.inspect.minute)} — nhớ có mặt ở tiệm.`}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    close(null);
                    setGoal({ kind: "stall" });
                  }}
                  className="h-10 rounded-xl bg-white text-sm font-semibold shadow-sm ring-1 ring-ink/10"
                >
                  🚶 Về tiệm
                </button>
                <button
                  type="button"
                  disabled={busy || !v.inspect.arrived}
                  onClick={() => void act("shop:meet")}
                  className="h-10 rounded-xl bg-leaf text-sm font-semibold text-cream disabled:opacity-40"
                >
                  👮 Đón đoàn
                </button>
              </div>
            </div>
          )}
        </Step>
      )}

      <Step n={v.needCert ? 4 : 3} title="🪧 Biển hiệu tên quán" state={state("sign")}>
        {v.signed ? (
          <p className="text-xs">Biển "{v.shopName}" đã treo ✓</p>
        ) : (
          state("sign") === "now" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act("shop:sign")}
              className="h-10 w-full rounded-xl bg-leaf text-sm font-semibold text-cream disabled:opacity-40"
            >
              Làm biển "{v.shopName}" · {vndShort(s.signFee)}
            </button>
          )
        )}
      </Step>

      {v.step === "ready" && (
        <p className="rounded-xl bg-leaf/15 p-3 text-sm font-semibold text-leaf" data-shop-ready>
          🎉 Đủ giấy tờ! Ra tiệm, bấm mở hàng là khai trương được (muốn rình rang thì tổ chức khai
          trương ở tab Bán).
        </p>
      )}
    </section>
  );
}

function Step({
  n,
  title,
  state,
  children,
}: {
  n: number;
  title: string;
  state: "done" | "now" | "later";
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl bg-white p-3 shadow-sm ${state === "now" ? "ring-2 ring-sun" : ""} ${
        state === "later" ? "opacity-50" : ""
      }`}
      data-step-state={state}
    >
      <p className="mb-1 text-sm font-extrabold">
        {state === "done" ? "✅" : `${n}.`} {title}
      </p>
      {children}
    </div>
  );
}
