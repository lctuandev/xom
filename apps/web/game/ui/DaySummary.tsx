"use client";

import { stars, vnd } from "../format";
import { useGame } from "../store";

/** Tổng kết cuối ngày: doanh thu, chi phí, hàng hỏng, lãi/lỗ (docs/PLAN.md §3.6). */
export function DaySummary() {
  const report = useGame((s) => s.report);
  const setReport = useGame((s) => s.setReport);
  if (!report) return null;
  const rows: [string, number, "in" | "out"][] = [
    ["Doanh thu bán hàng", report.revenue, "in"],
    ["Tiền boa", report.tips, "in"],
    ["Lương làm thuê", report.wages, "in"],
    ["🏦 Lãi ngân hàng", report.interest, "in"],
    ["Nhập hàng", report.stockCost, "out"],
    ["Thuê chỗ", report.rent, "out"],
    ["Phí chợ, điện nước, sửa xe, sự kiện", report.fees, "out"],
  ];

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-5">
      <div
        role="dialog"
        aria-label={`Tổng kết ngày ${report.day}`}
        className="w-full max-w-sm rounded-3xl bg-cream p-6 shadow-xl"
      >
        <p className="text-sm font-semibold text-ink/60 uppercase">Hết ngày {report.day}</p>
        <p
          className={`mt-1 text-3xl font-extrabold tabular-nums ${report.profit >= 0 ? "text-leaf" : "text-red"}`}
        >
          {report.profit >= 0 ? "+" : ""}
          {vnd(report.profit)}
        </p>
        <p className="text-sm text-ink/60">Lãi/lỗ tiền mặt trong ngày</p>

        <dl className="mt-5 flex flex-col gap-2">
          {rows
            .filter(([, v]) => v !== 0)
            .map(([label, value, dir]) => (
              <div key={label} className="flex justify-between">
                <dt>{label}</dt>
                <dd
                  className={`font-semibold tabular-nums ${dir === "in" ? "text-leaf" : "text-red"}`}
                >
                  {dir === "in" ? "+" : "−"}
                  {vnd(value)}
                </dd>
              </div>
            ))}
          {report.spoiledQty > 0 && (
            <div className="flex justify-between text-ink/70">
              <dt>Hàng hỏng bỏ đi</dt>
              <dd className="tabular-nums">
                {report.spoiledQty} phần ({vnd(report.spoiledValue)})
              </dd>
            </div>
          )}
          {report.served + report.lost > 0 && (
            <>
              <div className="flex justify-between">
                <dt>Khách đã phục vụ</dt>
                <dd className="font-semibold tabular-nums">{report.served}</dd>
              </div>
              {report.wrong > 0 && (
                <div className="flex justify-between text-red">
                  <dt>Món làm sai (giảm giá)</dt>
                  <dd className="font-semibold tabular-nums">{report.wrong}</dd>
                </div>
              )}
              {report.lost > 0 && (
                <div className="flex justify-between text-red">
                  <dt>Khách hụt (hết hàng/đợi lâu)</dt>
                  <dd className="font-semibold tabular-nums">{report.lost}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt>Uy tín quầy</dt>
                <dd className="text-sun">{stars(report.reputation)}</dd>
              </div>
            </>
          )}
          <div className="mt-2 flex justify-between border-t border-ink/10 pt-3 text-lg">
            <dt className="font-semibold">Tiền hiện có</dt>
            <dd className="font-extrabold tabular-nums">{vnd(report.moneyEnd)}</dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={() => setReport(null)}
          className="mt-6 h-12 w-full rounded-2xl bg-red text-base font-semibold text-cream"
        >
          Sang ngày mới ☀️
        </button>
      </div>
    </div>
  );
}
