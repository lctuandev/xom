"use client";

import { content } from "@xom/content";
import type { CashierTaskView, ShiftView } from "@xom/shared";
import { ringTotal } from "@xom/sim";
import { useEffect, useState } from "react";
import { sfx } from "../../audio";
import { vnd } from "../../format";
import type { WaiterActions } from "../../interior/Interior";
import { staff, whereIsStaff } from "../../interior/quancom/staff";
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

/** Đếm số lần mỗi món xuất hiện. */
function countOf(list: string[]) {
  const m = new Map<string, number>();
  for (const x of list) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

/**
 * Đứng quầy (UC-W2): phiếu ghi rõ phải múc những gì (tích dần khi múc), quầy khay như ngoài đời
 * (mỗi khay có tên + số phần còn lại), chạm khay để múc lên dĩa, xong bấm "Đưa món".
 */
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
  const onPlate = plate ?? [];
  const want = countOf(task.items);
  const got = countOf(onPlate);
  const foodOf = (id: string) => R.foods.find((f) => f.id === id);
  const done =
    [...want].every(([id, n]) => (got.get(id) ?? 0) === n) && onPlate.length === task.items.length;

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
        {/* Công thức dĩa: phải múc đủ những thứ này (thêm/bớt theo lời dặn đã tính sẵn). */}
        <ul className="mt-1 flex flex-wrap gap-1" aria-label="Cần múc">
          {[...want].map(([id, n]) => {
            const have = got.get(id) ?? 0;
            const f = foodOf(id);
            return (
              <li
                key={id}
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${have === n ? "bg-leaf text-cream" : have > n ? "bg-red text-cream" : "bg-ink/5"}`}
              >
                {have >= n ? "✓" : ""} {f?.emoji} {f?.name}
                {n > 1 ? ` ×${n}` : ""}
              </li>
            );
          })}
          {[...got]
            .filter(([id]) => !want.has(id))
            .map(([id]) => (
              <li
                key={id}
                className="rounded-full bg-red px-2 py-0.5 text-xs font-semibold text-cream"
              >
                ✗ {foodOf(id)?.emoji} {foodOf(id)?.name}
              </li>
            ))}
        </ul>
        <Patience left={left} />
      </div>

      <p className="text-xs font-extrabold text-ink/60">QUẦY KHAY · chạm để múc lên dĩa</p>
      <fieldset className="m-0 grid min-w-0 grid-cols-4 gap-1.5 border-0 p-0" aria-label="Khay món">
        {R.foods.map((f) => {
          const n = got.get(f.id) ?? 0;
          const portions = (shift.trays[f.id] ?? 0) - n;
          const refillAt = shift.refilling[f.id];
          // Khay hết (kể cả khi đã múc dở lên dĩa) → nút báo bếp; còn ít mà khách gọi nhiều hơn → vẫn múc được phần còn
          // lại và có nút báo bếp nhỏ (góp ý chơi thử: trước đây bị kẹt, không báo bếp được, cũng không múc được).
          const short = (want.get(f.id) ?? 0) - n > portions;
          if (portions <= 0) {
            return (
              <button
                key={f.id}
                type="button"
                disabled={!!refillAt}
                onClick={() => void sendWork({ kind: "refill", foodId: f.id }, "quan_com")}
                className="flex min-h-18 flex-col items-center justify-center rounded-xl border-2 border-dashed border-red/40 bg-red/5 p-1 text-center text-[11px] font-semibold text-red disabled:opacity-60"
              >
                <span className="text-lg" aria-hidden>
                  {f.emoji}
                </span>
                {refillAt
                  ? `Bếp làm… ${Math.max(0, Math.ceil((refillAt - now) / 1000))}s`
                  : `🔔 Báo bếp: hết ${f.name.toLowerCase()}`}
                {n > 0 && <span className="text-[10px] text-ink/60">đã múc {n}</span>}
              </button>
            );
          }
          const tile = (
            <button
              key={f.id}
              type="button"
              aria-label={`Múc ${f.name}`}
              disabled={portions <= 0}
              onClick={() => {
                sfx("scoop");
                setPlate([...onPlate, f.id]);
              }}
              className="relative flex min-h-18 flex-col items-center justify-center rounded-xl border border-ink/10 bg-gradient-to-b from-white to-[#eef1f3] p-1 text-center shadow-sm active:scale-95 disabled:opacity-40"
            >
              <span className="absolute top-1 right-1 rounded-full bg-ink/80 px-1.5 text-[10px] font-bold text-cream tabular-nums">
                {portions}
              </span>
              <span className="text-2xl leading-none" aria-hidden>
                {f.emoji}
              </span>
              <span className="mt-0.5 text-[11px] leading-tight font-semibold">{f.name}</span>
              {n > 0 && (
                <span className="absolute -top-1 -left-1 flex size-5 items-center justify-center rounded-full bg-leaf text-[11px] font-bold text-cream">
                  {n}
                </span>
              )}
            </button>
          );
          if (!short) return tile;
          return (
            <div key={f.id} className="flex flex-col gap-1">
              {tile}
              <button
                type="button"
                disabled={!!refillAt}
                onClick={() => void sendWork({ kind: "refill", foodId: f.id }, "quan_com")}
                className="h-7 rounded-lg bg-red/10 text-[10px] font-bold text-red disabled:opacity-60"
              >
                {refillAt
                  ? `Bếp làm… ${Math.max(0, Math.ceil((refillAt - now) / 1000))}s`
                  : "🔔 Không đủ · báo bếp"}
              </button>
            </div>
          );
        })}
      </fieldset>

      <section
        className="flex min-h-11 flex-wrap items-center gap-1 rounded-xl bg-ink/5 p-1.5"
        aria-label="Dĩa đang múc"
      >
        <span className="px-1 text-xs font-semibold text-ink/60">🍽️ Dĩa:</span>
        {onPlate.length === 0 ? (
          <span className="text-xs text-ink/50">trống</span>
        ) : (
          onPlate.map((id, i) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: thứ tự múc
              key={i}
              type="button"
              aria-label={`Bỏ ${foodOf(id)?.name} ra`}
              onClick={() => setPlate(onPlate.filter((_, j) => j !== i))}
              className="rounded-md bg-white px-1.5 py-0.5 text-sm shadow-sm"
            >
              {foodOf(id)?.emoji}
            </button>
          ))
        )}
      </section>
      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <button
          type="button"
          disabled={onPlate.length === 0}
          onClick={() => setPlate(null)}
          className="h-12 rounded-xl bg-ink/10 font-semibold disabled:opacity-40"
        >
          🗑️ Đổ bỏ
        </button>
        <button
          type="button"
          disabled={busy || onPlate.length === 0}
          onClick={async () => {
            setBusy(true);
            sfx("plate");
            await sendWork({ kind: "plate", taskId: task.id, items: onPlate }, `diner:${task.id}`);
            setPlate(null);
            setBusy(false);
          }}
          className={`h-12 rounded-xl font-semibold text-cream disabled:opacity-40 ${done ? "bg-leaf" : "bg-ink/60"}`}
        >
          🤲 Đưa món
        </button>
      </div>
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
    const ok = await sendWork({ kind: "ring", taskId: task.id, lines, change }, `diner:${task.id}`);
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

/**
 * Bưng bê (UC-W4, W8): như người thật — đi tới cửa bếp lấy dĩa, bưng tới bàn, tới nơi mới bấm "Giao món".
 * Nút hành động chỉ hiện khi đang đứng đúng chỗ; danh sách "việc cần làm" để chạm là tự đi tới.
 * Không có lưới bàn cố định → quán lớn cỡ nào cũng dùng được.
 */
export function WaiterPanel({ shift, actions }: { shift: ShiftView; actions: WaiterActions }) {
  const [where, setWhere] = useState(whereIsStaff);
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      const w = whereIsStaff();
      setWhere((p) => (p.pass === w.pass && p.table === w.table ? p : w));
      setMoving(!!staff.walker.target);
    }, 200);
    return () => clearInterval(id);
  }, []);
  const now = Date.now();
  const held = shift.pass.filter((p) => shift.holding.includes(p.id));
  const ready = shift.serve.filter(
    (t) => !shift.holding.includes(t.id) && t.createdAt <= now + 500,
  );
  const dirty = shift.tables.flatMap((st, i) => (st === "dirty" ? [i + 1] : []));
  const here = where.table;
  const argue = here ? shift.diners.find((d) => d.table === here && d.incident === "argue") : null;

  const act: { label: string; run: () => void; tone: string }[] = [];
  if (!moving) {
    if (where.pass && held.length < 2)
      for (const t of ready.slice(0, 3))
        act.push({
          label: `🍽️ Lấy dĩa bàn ${t.table}`,
          run: () => actions.grab(t.id),
          tone: "bg-sun",
        });
    if (here && argue)
      act.push({
        label: "✋ Can ngăn",
        run: () => actions.calm(argue.id, here),
        tone: "bg-red text-cream",
      });
    if (here && held.length > 0)
      act.push({
        label: `🤲 Giao món bàn ${here}`,
        run: () => actions.serve(here),
        tone: "bg-leaf text-cream",
      });
    if (here && held.length === 0 && shift.tables[here - 1] === "dirty")
      act.push({
        label: `🧽 Lau bàn ${here}`,
        run: () => actions.wipe(here, shift.scale),
        tone: "bg-sun",
      });
  }

  const todo: { label: string; run: () => void }[] = [];
  if (ready.length > 0 && held.length < 2 && !where.pass)
    todo.push({ label: `📍 Tới cửa bếp lấy dĩa (${ready.length} dĩa chờ)`, run: actions.toPass });
  for (const p of held)
    if (here !== p.table)
      todo.push({ label: `📍 Mang dĩa tới bàn ${p.table}`, run: () => actions.toTable(p.table) });
  for (const n of dirty.slice(0, 2))
    if (held.length === 0 && here !== n)
      todo.push({ label: `📍 Tới lau bàn ${n}`, run: () => actions.toTable(n) });

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-ink/60">
        {held.length > 0
          ? `Đang cầm: ${held.map((p) => `dĩa bàn ${p.table}`).join(", ")}`
          : "Tay không"}
        {moving
          ? " · đang đi…"
          : where.pass
            ? " · đang ở cửa bếp"
            : here
              ? ` · đang ở bàn ${here}`
              : ""}
      </p>
      {act.length > 0 && (
        <section className="grid grid-cols-2 gap-2" aria-label="Làm tại chỗ">
          {act.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.run}
              className={`h-12 rounded-2xl text-sm font-semibold shadow-sm active:scale-95 ${a.tone}`}
            >
              {a.label}
            </button>
          ))}
        </section>
      )}
      {todo.length > 0 ? (
        <ul className="flex flex-col gap-1" aria-label="Việc cần làm">
          {todo.map((t) => (
            <li key={t.label}>
              <button
                type="button"
                onClick={t.run}
                className="h-10 w-full rounded-xl bg-white px-3 text-left text-sm font-semibold shadow-sm"
              >
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        act.length === 0 && (
          <Waiting text="Chưa có việc — chạm sàn để đi, chạm bàn/cửa bếp để tới đó." />
        )
      )}
    </div>
  );
}
