"use client";

import { content } from "@xom/content";
import { vnd } from "../../format";
import { useGame } from "../../store";

const REASON = {
  stop: "Ra ca",
  fired: "Chủ cho nghỉ sớm",
  day_end: "Hết ngày",
  left: "Bỏ ca giữa chừng",
} as const;

/** Phiếu lương cuối ca (UC-W1, W7): việc đã làm, lỗi, lương cứng, tiền việc, khấu trừ. */
export function Payslip() {
  const slip = useGame((s) => s.payslip);
  const close = useGame((s) => s.setPayslip);
  if (!slip) return null;
  const job = content.jobById.get(slip.jobId);
  const role = job?.roles.find((r) => r.id === slip.role);
  const rows: [string, string, string?][] = [
    ["Việc đã làm", String(slip.done)],
    ["Lỗi", String(slip.mistakes), slip.mistakes ? "text-red" : undefined],
    ["Khách bỏ về", String(slip.walked), slip.walked ? "text-red" : undefined],
    ["Lương cứng", vnd(slip.base)],
    ["Tiền theo việc", vnd(slip.piece)],
  ];
  if (slip.deductions) rows.push(["Khấu trừ (lệch tiền)", `−${vnd(slip.deductions)}`, "text-red"]);
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-5">
      <div
        role="dialog"
        aria-label="Phiếu lương"
        className="w-full max-w-sm rounded-3xl bg-cream p-5 shadow-xl"
      >
        <p className="text-xs font-semibold text-ink/60 uppercase">
          Phiếu lương · {REASON[slip.reason]}
        </p>
        <p className="mt-1 font-extrabold">
          {role?.emoji} {role?.name} — {job?.name}
        </p>
        <dl className="mt-3 flex flex-col gap-1.5 text-sm">
          {rows.map(([k, v, cls]) => (
            <div key={k} className="flex justify-between">
              <dt>{k}</dt>
              <dd className={`font-semibold tabular-nums ${cls ?? ""}`}>{v}</dd>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-ink/10 pt-2 text-base">
            <dt className="font-semibold">Thực nhận</dt>
            <dd className="font-extrabold text-leaf tabular-nums">{vnd(slip.total)}</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={() => close(null)}
          className="mt-4 h-11 w-full rounded-2xl bg-red font-semibold text-cream"
        >
          Xong
        </button>
      </div>
    </div>
  );
}
