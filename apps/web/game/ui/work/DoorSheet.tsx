"use client";

import type { DeliveryTaskView } from "@xom/shared";
import { useEffect, useRef, useState } from "react";
import { vnd } from "../../format";
import { sendWork } from "../../net/socket";
import { useGame } from "../../store";
import { CashChange } from "./CashChange";
import { addressLabel } from "./DeliveryDesk";

/**
 * Trước cửa nhà người nhận (UC-W5): đưa điện thoại ký nhận → kiểm tên người ký → giao / không giao
 * → thu tiền hộ. Khách vắng: gửi hàng xóm / hẹn lại / hoàn về.
 */
export function DoorSheet() {
  const nearAddress = useGame((s) => s.nearAddress);
  const shift = useGame((s) => s.shift);
  const d = shift?.deliveries.find(
    (x) =>
      x.addressId === nearAddress &&
      (x.stage === "at_door" || x.stage === "absent" || x.stage === "refused"),
  );
  if (!d) return null;
  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-(--nav-h) z-40 px-3 pb-3">
      <div
        role="dialog"
        aria-label="Giao hàng"
        className="rounded-2xl bg-cream p-3 shadow-xl ring-1 ring-ink/10"
      >
        <p className="text-xs font-semibold text-ink/60">
          Phiếu <span className="font-mono">{d.code}</span> · {d.item} · người nhận{" "}
          <b>{d.recipient}</b> · {addressLabel(d.addressId)}
        </p>
        {d.stage === "at_door" && <AtDoor key={d.id} d={d} />}
        {d.stage === "absent" && <Absent d={d} />}
        {d.stage === "refused" && (
          <p className="mt-2 rounded-xl bg-red/10 p-2.5 text-sm font-semibold text-red">
            Khách từ chối nhận — mang hàng về bưu cục hoàn.
          </p>
        )}
      </div>
    </div>
  );
}

/** Chữ ký hiện dần như người ta đang ký trên điện thoại. */
function Signature({ name, onDone }: { name: string; onDone: () => void }) {
  const [p, setP] = useState(0);
  // Ca làm cập nhật mỗi nhịp → cha render lại liên tục; giữ onDone qua ref để chữ ký không vẽ lại từ đầu.
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t0 = performance.now();
    const id = setInterval(() => {
      const v = Math.min(1, (performance.now() - t0) / 1200);
      setP(v);
      if (v >= 1) {
        clearInterval(id);
        done.current();
      }
    }, 30);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="mt-2 rounded-xl bg-white p-2 shadow-inner">
      <svg viewBox="0 0 200 60" className="h-14 w-full" role="img" aria-label="Chữ ký">
        <path
          d="M10 40 C 30 5, 45 55, 60 30 S 90 10, 100 35 S 130 50, 145 25 S 175 20, 190 38"
          fill="none"
          stroke="#1f5fa8"
          strokeWidth="3"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - p}
        />
      </svg>
      <p className="text-center text-xs text-ink/60">
        Người ký: <b className="text-ink">{name}</b>
      </p>
    </div>
  );
}

function AtDoor({ d }: { d: DeliveryTaskView }) {
  const [step, setStep] = useState<"ask" | "signing" | "check" | "pay">("ask");
  const [busy, setBusy] = useState(false);
  const door = d.door;
  if (!door) return null;
  const handover = async (accept: boolean, change: number | null) => {
    setBusy(true);
    await sendWork({ kind: "handover", taskId: d.id, accept, change }, `door:${d.addressId}`);
    setBusy(false);
  };
  const accept = () => {
    if (door.pay?.kind === "cash" && door.pay.bill !== d.cod) setStep("pay");
    else void handover(true, null);
  };

  return (
    <div className="mt-2 flex flex-col gap-2">
      <p className="text-sm">
        Người ra mở cửa: <b>{door.name}</b>
      </p>
      {step === "ask" && (
        <button
          type="button"
          onClick={() => setStep("signing")}
          className="h-11 rounded-xl bg-sun font-semibold"
        >
          📱 Đưa điện thoại ký nhận
        </button>
      )}
      {(step === "signing" || step === "check") && (
        <Signature name={door.name} onDone={() => setStep("check")} />
      )}
      {step === "check" && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handover(false, null)}
            className="h-11 rounded-xl bg-ink/10 text-sm font-semibold"
          >
            ✋ Không phải người nhận
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={accept}
            className="h-11 rounded-xl bg-leaf text-sm font-semibold text-cream"
          >
            ✅ Giao hàng{d.cod > 0 ? ` · thu ${vnd(d.cod)}` : ""}
          </button>
        </div>
      )}
      {step === "pay" && door.pay?.kind === "cash" && (
        <CashChange
          bill={door.pay.bill}
          due={d.cod}
          busy={busy}
          onDone={(c) => void handover(true, c)}
          label="Thối & giao"
        />
      )}
      {step === "check" && door.pay?.kind === "transfer" && (
        <p className="text-center text-xs text-ink/60">Khách chuyển khoản tiền thu hộ.</p>
      )}
    </div>
  );
}

function Absent({ d }: { d: DeliveryTaskView }) {
  const [busy, setBusy] = useState(false);
  const choose = async (choice: "neighbor" | "later" | "return") => {
    setBusy(true);
    await sendWork({ kind: "absent", taskId: d.id, choice }, `door:${d.addressId}`);
    setBusy(false);
  };
  return (
    <div className="mt-2 flex flex-col gap-2">
      <p className="text-sm font-semibold">📞 Gọi mấy cuộc không ai bắt máy…</p>
      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          disabled={busy || d.cod > 0}
          onClick={() => choose("neighbor")}
          className="h-12 rounded-xl bg-white text-xs font-semibold shadow-sm disabled:opacity-40"
        >
          🏠 Gửi hàng xóm
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => choose("later")}
          className="h-12 rounded-xl bg-white text-xs font-semibold shadow-sm"
        >
          ⏰ Hẹn giao lại
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => choose("return")}
          className="h-12 rounded-xl bg-white text-xs font-semibold shadow-sm"
        >
          ↩︎ Hoàn về
        </button>
      </div>
      {d.cod > 0 && <p className="text-xs text-ink/60">Đơn thu tiền hộ không gửi hàng xóm được.</p>}
    </div>
  );
}
