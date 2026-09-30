"use client";

import { content } from "@xom/content";
import type { CashierTaskView, ShiftView } from "@xom/shared";
import { ringTotal } from "@xom/sim";
import { useEffect, useState } from "react";
import { vnd } from "../../format";
import { sendWork } from "../../net/socket";
import { CashChange } from "./CashChange";

const R = content.data.restaurant;

function usePatience(t: { createdAt: number; expiresAt: number } | undefined) {
  const [left, setLeft] = useState(1);
  useEffect(() => {
    if (!t) return;
    const id = setInterval(
      () => setLeft(Math.max(0, (t.expiresAt - Date.now()) / (t.expiresAt - t.createdAt))),
      200,
    );
    return () => clearInterval(id);
  }, [t]);
  return left;
}

function Patience({ left }: { left: number }) {
  return (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/10">
      <div
        className={`h-full rounded-full ${left > 0.5 ? "bg-leaf" : left > 0.25 ? "bg-sun" : "bg-red"}`}
        style={{ width: `${left * 100}%` }}
      />
    </div>
  );
}

function Waiting({ text }: { text: string }) {
  return <p className="rounded-xl bg-ink/5 p-3 text-center text-sm text-ink/60">{text}</p>;
}

/** Đứng quầy (UC-W2): lấy dĩa → múc từng món → đưa dĩa. */
export function PlatePanel({
  shift,
  plate,
  setPlate,
}: {
  shift: ShiftView;
  plate: string[] | null;
  setPlate: (p: string[] | null) => void;
}) {
  const task = shift.plates[0];
  const left = usePatience(task);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  if (!task)
    return <Waiting text="Chưa có khách — đứng quầy chờ, giờ trưa với chiều tối đông lắm." />;
  const scooped = (id: string) => (plate ?? []).filter((x) => x === id).length;

  return (
    <div
      className="flex flex-col gap-2"
      data-task={task.id}
      data-items={JSON.stringify(task.items)}
    >
      <div className="rounded-xl bg-white p-2.5 shadow-sm">
        <p className="text-xs font-semibold text-ink/60">
          Phiếu của {task.customer}
          {shift.plates.length > 1 && ` · còn ${shift.plates.length - 1} khách chờ`}
        </p>
        <p className="font-extrabold">{task.text}</p>
        <Patience left={left} />
      </div>
      {plate === null ? (
        <button
          type="button"
          onClick={() => setPlate([])}
          className="h-12 rounded-2xl bg-sun font-semibold"
        >
          🍽️ Lấy dĩa
        </button>
      ) : (
        <>
          <fieldset
            className="grid grid-cols-4 gap-1.5 m-0 min-w-0 border-0 p-0"
            aria-label="Khay món"
          >
            {R.foods.map((f) => {
              const n = scooped(f.id);
              // Khay vơi ngay khi múc (server trừ khi đưa dĩa).
              const portions = (shift.trays[f.id] ?? 0) - n;
              const refillAt = shift.refilling[f.id];
              if (portions <= 0 && n === 0) {
                return (
                  <button
                    key={f.id}
                    type="button"
                    disabled={!!refillAt}
                    onClick={() => void sendWork({ kind: "refill", foodId: f.id }, "quan_com")}
                    className="flex min-h-16 flex-col items-center justify-center rounded-xl bg-red/10 p-1 text-center text-[11px] font-semibold text-red disabled:opacity-60"
                  >
                    <span className="text-lg" aria-hidden>
                      {f.emoji}
                    </span>
                    {refillAt
                      ? `Bếp làm… ${Math.max(0, Math.ceil((refillAt - now) / 1000))}s`
                      : `🔔 Báo bếp: hết ${f.name.toLowerCase()}`}
                  </button>
                );
              }
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-label={`Múc ${f.name}`}
                  disabled={portions <= 0}
                  onClick={() => setPlate([...(plate ?? []), f.id])}
                  className="relative flex min-h-16 flex-col items-center justify-center rounded-xl bg-white p-1 text-center shadow-sm active:scale-95 disabled:opacity-40"
                >
                  <span className="text-xl leading-none" aria-hidden>
                    {f.emoji}
                  </span>
                  <span className="text-[11px] leading-tight font-semibold">{f.name}</span>
                  <span className="text-[10px] text-ink/50">còn {portions}</span>
                  {n > 0 && (
                    <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-red text-[11px] font-bold text-cream">
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </fieldset>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPlate(null)}
              className="h-11 rounded-xl bg-ink/10 font-semibold"
            >
              🗑️ Đổ bỏ
            </button>
            <button
              type="button"
              disabled={busy || plate.length === 0}
              onClick={async () => {
                setBusy(true);
                await sendWork({ kind: "plate", taskId: task.id, items: plate }, `task:${task.id}`);
                setPlate(null);
                setBusy(false);
              }}
              className="h-11 rounded-xl bg-leaf font-semibold text-cream disabled:opacity-40"
            >
              🤲 Đưa dĩa
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const KEYS = [
  ...R.dishes.map((d) => ({ id: d.id, name: d.name, price: d.price })),
  ...R.mods.filter((m) => m.price > 0).map((m) => ({ id: m.id, name: m.say, price: m.price })),
  ...R.drinks.map((d) => ({ id: d.id, name: `${d.emoji} ${d.name}`, price: d.price })),
];

/** Thu ngân (UC-W3): bấm món trên máy → báo giá → thu tiền, thối tiền. */
export function RegisterPanel({ shift }: { shift: ShiftView }) {
  const task = shift.cashier[0];
  if (!task) return <Waiting text="Chưa có khách tới tính tiền." />;
  return <Register key={task.id} task={task} queue={shift.cashier.length} />;
}

function Register({ task, queue }: { task: CashierTaskView; queue: number }) {
  const left = usePatience(task);
  const [lines, setLines] = useState<Record<string, number>>({});
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const total = ringTotal(R, lines);
  const add = (id: string, d: number) =>
    setLines((l) => {
      const n = (l[id] ?? 0) + d;
      const next = { ...l };
      if (n <= 0) delete next[id];
      else next[id] = n;
      return next;
    });
  const ring = async (change: number | null) => {
    setBusy(true);
    const ok = await sendWork({ kind: "ring", taskId: task.id, lines, change }, `task:${task.id}`);
    setBusy(false);
    if (!ok) setQuoting(false);
  };

  return (
    <div className="flex flex-col gap-2" data-task={task.id}>
      <div className="rounded-xl bg-white p-2.5 shadow-sm">
        <p className="text-xs font-semibold text-ink/60">
          Phiếu của {task.customer}
          {queue > 1 && ` · còn ${queue - 1} khách chờ`}
        </p>
        {task.ticket.map((line) => (
          <p key={line} className="font-extrabold">
            • {line}
          </p>
        ))}
        <Patience left={left} />
      </div>
      {!quoting ? (
        <>
          <fieldset
            className="grid grid-cols-2 gap-1.5 m-0 min-w-0 border-0 p-0"
            aria-label="Máy tính tiền"
          >
            {KEYS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => add(k.id, 1)}
                className="flex items-center justify-between rounded-xl bg-white px-2.5 py-2 text-left text-xs font-semibold shadow-sm active:scale-95"
              >
                <span className="first-letter:uppercase">{k.name}</span>
                <span className="text-ink/50 tabular-nums">
                  {lines[k.id] ? `×${lines[k.id]}` : `${k.price / 1000}k`}
                </span>
              </button>
            ))}
          </fieldset>
          <div className="flex items-center justify-between rounded-xl bg-ink px-3 py-2 font-mono text-cream">
            <span className="text-xs">TỔNG</span>
            <span className="text-lg font-bold tabular-nums">{vnd(total)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setLines({})}
              className="h-11 rounded-xl bg-ink/10 font-semibold"
            >
              Xóa máy
            </button>
            <button
              type="button"
              disabled={total === 0}
              onClick={() => setQuoting(true)}
              className="h-11 rounded-xl bg-sun font-semibold disabled:opacity-40"
            >
              Báo giá {vnd(total)}
            </button>
          </div>
        </>
      ) : task.pay.kind === "transfer" || task.pay.bill === total ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => ring(null)}
          className="h-12 rounded-2xl bg-leaf font-semibold text-cream"
        >
          {task.pay.kind === "transfer"
            ? "📱 Khách chuyển khoản — Đã nhận ✓"
            : "💵 Khách đưa vừa đủ — Nhận tiền ✓"}
        </button>
      ) : (
        <CashChange bill={task.pay.bill} due={total} busy={busy} onDone={(c) => void ring(c)} />
      )}
    </div>
  );
}

/** Bưng bê (UC-W4): chọn dĩa ở cửa bếp → đặt đúng bàn; dọn bàn khách ăn xong. */
export function WaiterPanel({
  shift,
  holding,
  setHolding,
}: {
  shift: ShiftView;
  holding: string | null;
  setHolding: (id: string | null) => void;
}) {
  const task = shift.serve.find((t) => t.id === holding);
  const [busy, setBusy] = useState(false);
  const onTable = async (n: number) => {
    const state = shift.tables[n - 1];
    setBusy(true);
    if (task) {
      const ok = await sendWork({ kind: "serve", taskId: task.id, table: n }, "quan_com");
      if (ok) setHolding(null);
    } else if (state === "dirty") {
      await sendWork({ kind: "clean", table: n }, "quan_com");
    }
    setBusy(false);
  };
  const ICON = { free: "🪑", waiting: "🧍", eating: "🍽️", dirty: "🧽" } as const;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-ink/60">Cửa bếp — dĩa đã ra (kẹp phiếu số bàn)</p>
      {shift.serve.length === 0 ? (
        <Waiting text="Chưa có dĩa nào ra — dọn bàn bẩn trong lúc chờ." />
      ) : (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {shift.serve.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={holding === t.id}
              onClick={() => setHolding(holding === t.id ? null : t.id)}
              className="shrink-0 rounded-xl bg-white px-3 py-2 text-left text-xs font-semibold shadow-sm aria-pressed:ring-2 aria-pressed:ring-red"
            >
              <span className="block text-sm font-extrabold">Bàn {t.table}</span>
              {t.dish}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs font-semibold text-ink/60">
        {task
          ? `Đang bưng dĩa bàn ${task.table} — chạm đúng bàn để đặt`
          : "Chạm bàn bẩn (🧽) để dọn"}
      </p>
      <fieldset className="grid grid-cols-3 gap-1.5 m-0 min-w-0 border-0 p-0" aria-label="Bàn">
        {shift.tables.map((st, i) => (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: bàn cố định theo số
            key={i}
            type="button"
            disabled={busy || (!task && st !== "dirty")}
            onClick={() => onTable(i + 1)}
            className="h-12 rounded-xl bg-white text-sm font-semibold shadow-sm disabled:opacity-50"
          >
            {ICON[st]} Bàn {i + 1}
          </button>
        ))}
      </fieldset>
    </div>
  );
}
