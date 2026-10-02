"use client";

import { content } from "@xom/content";
import type { StaffView } from "@xom/shared";
import { formatClock } from "@xom/sim";
import { useEffect, useState } from "react";
import { vnd, vndShort } from "../../format";
import { send } from "../../net/socket";
import { useGame } from "../../store";
import { Section } from "../../ui/Sheet";
import { ShopFeature } from "./common";

/**
 * Bảng tuyển người của Anh Tám (KIENTRUC §2): chọn người + ca. Trong ca, mình rời quầy (hay thoát game) thì nhân viên bán
 * thay — theo tay nghề, không tự nhập hàng, lương trả theo giờ từ ví mình.
 */
function StaffBoard() {
  const minute = useGame((s) => s.clock?.minute ?? 0);
  const [view, setView] = useState<StaffView | null>(null);
  // Mặc định chọn ca đang diễn ra (thuê là bán thay được ngay).
  const [shift, setShift] = useState(
    () =>
      content.data.staff.shifts.find((s) => minute >= s.from && minute < s.to && s.id !== "ca_ngay")
        ?.id ??
      content.data.staff.shifts[0]?.id ??
      "",
  );
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void send("staff:view", {}).then((r) => r.ok && setView(r.data));
  }, []);
  useEffect(() => {
    if (view?.employee) setShift(view.employee.shiftId);
  }, [view?.employee]);
  if (!view) return <p className="text-sm text-ink/50">Đang hỏi Anh Tám…</p>;
  const { people, shifts } = content.data.staff;
  const emp = view.employee;
  const person = (id: string) => people.find((p) => p.id === id);
  const act = async (fn: () => Promise<{ ok: boolean; data?: StaffView }>) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r.ok && r.data) setView(r.data);
  };
  const hire = (staffId: string) =>
    act(
      () =>
        send("staff:hire", { staffId, shiftId: shift }) as Promise<{
          ok: boolean;
          data?: StaffView;
        }>,
    );
  const fire = () =>
    act(() => send("staff:fire", {}) as Promise<{ ok: boolean; data?: StaffView }>);
  const hours = (id: string) => {
    const s = shifts.find((x) => x.id === id);
    return s ? (s.to - s.from) / 60 : 0;
  };
  const empShift = emp ? shifts.find((s) => s.id === emp.shiftId) : undefined;
  const onDuty = !!empShift && minute >= empShift.from && minute < empShift.to;
  const picked = shifts.find((s) => s.id === shift);
  const pickedNow = !!picked && minute >= picked.from && minute < picked.to;
  return (
    <section aria-label="Nhân viên" className="mb-3 flex flex-col gap-3">
      <details className="rounded-2xl bg-sun/20 p-3 text-xs" open={!emp} data-staff-guide>
        <summary className="cursor-pointer text-sm font-extrabold">📘 Cách dùng nhân viên</summary>
        <ol className="mt-1.5 flex list-decimal flex-col gap-1 pl-4">
          <li>
            <b>Chọn ca</b> — nhân viên chỉ làm trong giờ ca (cần cả ngày thì chọn{" "}
            <i>Cả ngày 6–22h</i>).
          </li>
          <li>
            <b>Nhập đủ hàng</b> — nhân viên không tự nhập hàng, hết hàng là dọn về. Tới giờ ca mà
            quầy đang đóng thì <b>nhân viên tự mở cửa</b> (trả phí ngày như bạn mở).
          </li>
          <li>
            Trong giờ ca <b>nhân viên đứng bán</b>: bạn đi đâu cũng được (chợ, làm thuê, xe ôm,
            thoát game), hoặc ở lại quầy / trong tiệm xem — muốn tự bán thì bấm <b>🙋 Tôi bán</b>,
            bấm lại để trả quầy cho nhân viên. <b>Đừng đóng quầy</b> giữa ca: đóng rồi thì không ai
            bán.
          </li>
          <li>
            Tiền bán vào ví bạn, lương trừ theo giờ; xem kết quả ở <i>Phiếu ca</i> bên dưới.
          </li>
        </ol>
      </details>
      {emp && empShift && (
        <p
          className={`rounded-xl px-3 py-2 text-xs font-semibold ${onDuty ? "bg-leaf/15 text-leaf" : "bg-red/10 text-red"}`}
          data-staff-status={onDuty ? "on" : "off"}
        >
          {onDuty
            ? `Bây giờ ${formatClock(minute)}: ${person(emp.staffId)?.name} đang trong ca (${empShift.name}) — bạn rời quầy là có người bán thay.`
            : `Bây giờ ${formatClock(minute)}: ${person(emp.staffId)?.name} ngoài giờ làm (${empShift.name}) — rời quầy lúc này thì quầy vắng chủ. Đổi sang ca đang diễn ra nếu cần.`}
        </p>
      )}
      {emp && (
        <div
          className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm"
          data-employee={emp.staffId}
        >
          <span aria-hidden className="text-2xl">
            👩‍🍳
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              {person(emp.staffId)?.name} đang làm cho bạn
            </span>
            <span className="block text-xs text-ink/60">
              {shifts.find((s) => s.id === emp.shiftId)?.name} · từ ngày {emp.hiredDay}
            </span>
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void fire()}
            className="rounded-full bg-ink/10 px-3 py-1.5 text-xs font-semibold text-ink"
          >
            Cho nghỉ
          </button>
        </div>
      )}
      <fieldset>
        <legend className="mb-1 text-xs font-semibold text-ink/70">Ca làm</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {shifts.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={shift === s.id}
              onClick={() => setShift(s.id)}
              className={`rounded-xl px-2 py-2 text-xs font-semibold ${
                shift === s.id ? "bg-ink text-cream" : "bg-white shadow-sm"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </fieldset>
      {picked && !pickedNow && (
        <p className="-mt-1 text-[11px] text-ink/60" data-shift-later>
          ⏰ {picked.name} chưa tới / đã qua giờ — thuê ca này thì {formatClock(picked.from)} nhân
          viên mới vào làm.
        </p>
      )}
      <ul className="flex flex-col gap-1.5">
        {people.map((p) => {
          const mine = emp?.staffId === p.id && emp.shiftId === shift;
          return (
            <li key={p.id} className="rounded-xl bg-white px-3 py-2 shadow-sm" data-staff={p.id}>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{p.name}</span>
                  <span className="block truncate text-xs text-ink/60">{p.bio}</span>
                </span>
                <button
                  type="button"
                  disabled={busy || mine}
                  onClick={() => void hire(p.id)}
                  className="shrink-0 rounded-full bg-red px-3 py-1.5 text-xs font-bold text-cream disabled:opacity-40"
                >
                  {mine ? "Đang làm" : emp ? "Đổi người" : "Thuê"}
                </button>
              </div>
              <p className="mt-1 flex gap-3 text-[11px] text-ink/70 tabular-nums">
                <span>🎯 đúng {Math.round(p.accuracy * 100)}%</span>
                <span>⏱️ {p.serveMinutes} phút/món</span>
                <span>
                  💸 {vndShort(p.wagePerHour)}/giờ · ca {vndShort(p.wagePerHour * hours(shift))}
                </span>
              </p>
            </li>
          );
        })}
      </ul>
      {view.recent.length > 0 && (
        <Section title="Phiếu ca gần đây">
          <ul className="flex flex-col gap-1.5" data-shift-slips>
            {view.recent.map((r) => (
              <li
                key={`${r.day}-${r.fromMinute}-${r.staffId}`}
                className="rounded-xl bg-white px-3 py-2 text-xs shadow-sm"
              >
                <span className="font-semibold">
                  Ngày {r.day} · {person(r.staffId)?.name} · {formatClock(r.fromMinute)}–
                  {formatClock(r.toMinute)}
                </span>
                <span className="mt-0.5 block text-ink/70 tabular-nums">
                  Bán {r.served + r.wrong} món ({r.wrong} sai) · thu {vnd(r.revenue)} · lương{" "}
                  {vnd(r.wages)}
                  {r.lost > 0 ? ` · ${r.lost} khách hụt` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </section>
  );
}

/** 👩‍🍳 Nhân viên: thuê người bán thay theo ca, phiếu ca. */
export function StaffSheet() {
  return <ShopFeature id="staff">{() => <StaffBoard />}</ShopFeature>;
}
