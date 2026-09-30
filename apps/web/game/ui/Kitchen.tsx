"use client";

import { content, type RecipeStep } from "@xom/content";
import type { DishSelection, DishView } from "@xom/shared";
import { useEffect, useRef, useState } from "react";
import { vnd } from "../format";
import { send } from "../net/socket";
import { type OrderState, useGame } from "../store";

/**
 * Màn hình làm món theo đơn (docs/USECASES.md UC-F4…F7): làm từng bước → giao món →
 * (sai: làm lại / giảm giá) → tính tiền, thối tiền.
 */
export function Kitchen() {
  const orderId = useGame((s) => s.kitchen);
  const order = useGame((s) => s.orders.find((o) => o.orderId === s.kitchen));
  const close = useGame((s) => s.openKitchen);

  useEffect(() => {
    // Khách đã đi (hết kiên nhẫn / đã tính tiền) thì đóng màn hình.
    if (orderId && !order) close(null);
  }, [orderId, order, close]);

  if (!order) return null;
  return (
    <div
      className="pointer-events-auto fixed inset-x-0 top-[12dvh] bottom-0 z-45 flex flex-col rounded-t-3xl bg-cream shadow-[0_-8px_30px_rgba(0,0,0,0.2)]"
      role="dialog"
      aria-label="Làm món"
      data-spec={JSON.stringify(order.spec)}
      data-order={order.orderId}
    >
      <OrderHeader order={order} onClose={() => close(null)} />
      <div className="pb-safe min-h-0 flex-1 overflow-y-auto px-4">
        {order.made === "correct" ? (
          <Payment key="pay" order={order} discount={false} />
        ) : order.made === "wrong" ? (
          <Wrong key="wrong" order={order} />
        ) : (
          <Build key="build" order={order} />
        )}
      </div>
    </div>
  );
}

function useLeft(order: OrderState) {
  const [left, setLeft] = useState(1);
  useEffect(() => {
    const total = order.expiresAt - order.createdAt;
    const id = setInterval(() => setLeft(Math.max(0, (order.expiresAt - Date.now()) / total)), 200);
    return () => clearInterval(id);
  }, [order.expiresAt, order.createdAt]);
  return left;
}

function OrderHeader({ order, onClose }: { order: OrderState; onClose: () => void }) {
  const left = useLeft(order);
  const npc = content.data.npcs.find((n) => n.id === order.archetype);
  return (
    <header className="border-b border-ink/10 px-4 pt-3 pb-2">
      <div className="flex items-start gap-2">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sun text-lg"
          aria-hidden
        >
          🧑
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-ink/60">
            {order.buyerName ? `👤 ${order.buyerName} (hàng xóm)` : (npc?.name ?? "Khách")} nói:
          </p>
          <p className="text-[15px] leading-snug font-semibold">“{order.ask}”</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Để đó, làm sau"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink/5"
        >
          ✕
        </button>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10"
        title="Kiên nhẫn của khách"
      >
        <div
          className={`h-full rounded-full ${left > 0.5 ? "bg-leaf" : left > 0.25 ? "bg-sun" : "bg-red"}`}
          style={{ width: `${left * 100}%` }}
        />
      </div>
    </header>
  );
}

function stockOf(itemId: string | undefined): number {
  if (!itemId) return Number.POSITIVE_INFINITY;
  return useGame.getState().me?.inventory.find((i) => i.itemId === itemId)?.qty ?? 0;
}

/** Làm món từng bước; không có gì được chọn sẵn — phải tự tay làm đúng lời khách dặn. */
function Build({ order }: { order: OrderState }) {
  const recipe = content.product(order.productId).recipe;
  const steps = recipe.steps;
  const [build, setBuild] = useState<DishView>({});
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const step = steps[at];
  const inventory = useGame((s) => s.me?.inventory);

  const set = (id: string, v: DishSelection | undefined) =>
    setBuild((b) => {
      const next = { ...b };
      if (v === undefined) delete next[id];
      else next[id] = v;
      return next;
    });
  const advance = () => setAt((i) => Math.min(steps.length - 1, i + 1));

  const deliver = async () => {
    setBusy(true);
    const res = await send("order:make", { orderId: order.orderId, build });
    setBusy(false);
    if (res.ok && !res.data.correct) setBuild({});
  };

  if (!step) return null;
  return (
    <div className="flex flex-col gap-3 py-3" data-inventory={inventory?.length}>
      <ol className="flex gap-1 overflow-x-auto pb-1" aria-label="Các bước">
        {steps.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setAt(i)}
              aria-current={i === at ? "step" : undefined}
              className={`h-8 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap aria-[current=step]:bg-ink aria-[current=step]:text-cream ${
                build[s.id] !== undefined ? "bg-leaf/20" : "bg-ink/5"
              }`}
            >
              {i + 1}. {s.label}
            </button>
          </li>
        ))}
      </ol>

      <StepPanel
        step={step}
        value={build[step.id]}
        onChange={(v) => set(step.id, v)}
        onNext={advance}
      />

      <DishPreview steps={steps} build={build} />

      <button
        type="button"
        disabled={busy}
        onClick={deliver}
        className="h-12 rounded-2xl bg-red text-base font-semibold text-cream active:scale-[0.98] disabled:opacity-50"
      >
        {busy ? "…" : "🤲 Giao món cho khách"}
      </button>
      <button
        type="button"
        onClick={() => void send("order:decline", { orderId: order.orderId })}
        className="h-10 text-sm font-semibold text-ink/60"
      >
        🙏 Xin lỗi, hết món này rồi
      </button>
    </div>
  );
}

function StepPanel({
  step,
  value,
  onChange,
  onNext,
}: {
  step: RecipeStep;
  value: DishSelection | undefined;
  onChange: (v: DishSelection | undefined) => void;
  onNext: () => void;
}) {
  if (step.kind === "action") {
    const done = value === true;
    return (
      <section aria-label={step.label} className="rounded-2xl bg-white p-3 shadow-sm">
        <p className="mb-2 font-extrabold">{step.label}</p>
        <button
          type="button"
          disabled={!done && stockOf(step.ingredient) < 1}
          onClick={() => {
            onChange(done ? undefined : true);
            if (!done) onNext();
          }}
          className={`h-14 w-full rounded-xl text-lg font-semibold disabled:opacity-40 ${done ? "bg-leaf text-cream" : "bg-sun"}`}
        >
          {done ? `✓ ${step.label}` : step.verb}
        </button>
      </section>
    );
  }
  if (step.kind === "hold")
    return (
      <HoldStep
        step={step}
        done={value === true}
        onDone={(d) => {
          onChange(d ? true : undefined);
          if (d) onNext();
        }}
      />
    );

  const multi = step.kind === "multi";
  const chosen = new Set(Array.isArray(value) ? value : typeof value === "string" ? [value] : []);
  return (
    <section aria-label={step.label} className="rounded-2xl bg-white p-3 shadow-sm">
      <p className="mb-2 font-extrabold">
        {step.label}
        <span className="ml-2 text-xs font-semibold text-ink/50">
          {multi ? "chọn nhiều" : "chọn một"}
        </span>
      </p>
      <div className="grid grid-cols-3 gap-2">
        {step.options.map((o) => {
          const on = chosen.has(o.id);
          const stock = stockOf(o.ingredient);
          const out = stock < o.qty;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              disabled={out && !on}
              onClick={() => {
                if (multi) {
                  const next = new Set(chosen);
                  if (on) next.delete(o.id);
                  else next.add(o.id);
                  onChange([...next]);
                } else {
                  onChange(on ? undefined : o.id);
                  if (!on) onNext();
                }
              }}
              className="flex min-h-18 flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-transparent bg-ink/5 p-1.5 text-center aria-pressed:border-red aria-pressed:bg-red/10 disabled:opacity-35"
            >
              <span className="text-2xl leading-none" aria-hidden>
                {o.emoji}
              </span>
              <span className="text-xs leading-tight font-semibold">{o.label}</span>
              {o.ingredient && (
                <span className={`text-[10px] ${out ? "text-red" : "text-ink/50"}`}>
                  {out ? "hết" : `còn ${stock}`}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {multi && (
        <button
          type="button"
          onClick={onNext}
          className="mt-2 h-10 w-full rounded-xl bg-ink/5 font-semibold"
        >
          {chosen.size === 0 ? "Không bỏ gì ›" : "Xong bước này ›"}
        </button>
      )}
    </section>
  );
}

/** Giữ nút 1 giây (lắc ly). */
function HoldStep({
  step,
  done,
  onDone,
}: {
  step: RecipeStep;
  done: boolean;
  onDone: (d: boolean) => void;
}) {
  const [progress, setProgress] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  const start = () => {
    if (done) return onDone(false);
    const t0 = performance.now();
    timer.current = setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / 1000);
      setProgress(p);
      if (p >= 1) {
        clearInterval(timer.current);
        onDone(true);
      }
    }, 30);
  };
  const stop = () => {
    clearInterval(timer.current);
    if (!done) setProgress(0);
  };
  useEffect(() => () => clearInterval(timer.current), []);
  return (
    <section aria-label={step.label} className="rounded-2xl bg-white p-3 shadow-sm">
      <p className="mb-2 font-extrabold">{step.label}</p>
      <button
        type="button"
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        className={`relative h-14 w-full overflow-hidden rounded-xl text-lg font-semibold select-none ${done ? "bg-leaf text-cream" : "bg-sun"}`}
      >
        <span
          className="absolute inset-y-0 left-0 bg-leaf/40"
          style={{ width: `${(done ? 1 : progress) * 100}%` }}
        />
        <span className="relative">{done ? `✓ ${step.label}` : step.verb}</span>
      </button>
    </section>
  );
}

function DishPreview({ steps, build }: { steps: RecipeStep[]; build: DishView }) {
  const items: string[] = [];
  for (const s of steps) {
    const v = build[s.id];
    if (v === true) items.push(`✓ ${s.label}`);
    else
      for (const id of Array.isArray(v) ? v : v ? [v] : []) {
        const o = s.options.find((x) => x.id === id);
        if (o) items.push(`${o.emoji} ${o.label}`);
      }
  }
  return (
    <div className="rounded-xl bg-ink/5 p-2.5">
      <p className="mb-1 text-xs font-semibold text-ink/60">Món đang làm</p>
      <p className="text-sm leading-relaxed">{items.length ? items.join(" · ") : "Chưa có gì"}</p>
    </div>
  );
}

function Wrong({ order }: { order: OrderState }) {
  const [discount, setDiscount] = useState(false);
  const resetDish = useGame((s) => s.resetDish);
  const recipe = content.product(order.productId).recipe;
  if (discount) return <Payment order={order} discount />;
  return (
    <div className="flex flex-col gap-3 py-3">
      <div className="rounded-2xl bg-red/10 p-3">
        <p className="font-extrabold text-red">Khách phàn nàn: món sai!</p>
        <p className="text-sm">
          Sai ở:{" "}
          {order.mistakes
            .map((id) => recipe.steps.find((s) => s.id === id)?.label.toLowerCase())
            .join(", ")}
        </p>
      </div>
      <button
        type="button"
        onClick={() => resetDish(order.orderId)}
        className="h-12 rounded-2xl bg-sun font-semibold"
      >
        🔁 Làm lại món khác (tốn thêm nguyên liệu)
      </button>
      <button
        type="button"
        onClick={() => setDiscount(true)}
        className="h-12 rounded-2xl bg-ink/10 font-semibold"
      >
        💸 Đưa luôn, giảm 50%
      </button>
    </div>
  );
}

const DENOMS = [1_000, 2_000, 5_000, 10_000, 20_000, 50_000];

/** Tính tiền: chuyển khoản / đưa đủ / thối tiền từ các tờ tiền lẻ (UC-F7). */
function Payment({ order, discount }: { order: OrderState; discount: boolean }) {
  const price = discount ? Math.round(order.price / 2 / 1000) * 1000 : order.price;
  const [change, setChange] = useState<number[]>([]);
  const [hint, setHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const countServed = useGame((s) => s.countServed);
  const total = change.reduce((a, b) => a + b, 0);

  const pay = async (amount: number | null) => {
    setBusy(true);
    const res = await send("order:pay", { orderId: order.orderId, change: amount, discount });
    setBusy(false);
    if (res.ok) countServed();
  };

  const header = (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-ink/60">{order.dish}</span>
        <span className="text-xl font-extrabold tabular-nums">
          {discount && <s className="mr-1 text-sm text-ink/40">{vnd(order.price)}</s>}
          {vnd(price)}
        </span>
      </div>
    </div>
  );

  if (order.pay.kind === "transfer" || order.pay.bill === price) {
    return (
      <div className="flex flex-col gap-3 py-3">
        {header}
        <p className="text-center text-sm">
          {order.pay.kind === "transfer"
            ? "📱 Khách quét mã, chuyển khoản đủ tiền."
            : `💵 Khách đưa vừa đủ ${vnd(price)}.`}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => pay(null)}
          className="h-12 rounded-2xl bg-leaf text-base font-semibold text-cream"
        >
          ✓ Đã nhận tiền
        </button>
      </div>
    );
  }

  const bill = order.pay.bill;
  return (
    <div className="flex flex-col gap-3 py-3">
      {header}
      <p className="text-center text-sm">
        💵 Khách đưa tờ <b className="tabular-nums">{vnd(bill)}</b>. Thối lại bao nhiêu?
      </p>
      <div className="flex min-h-12 flex-wrap items-center gap-1.5 rounded-xl bg-ink/5 p-2">
        {change.length === 0 ? (
          <span className="text-sm text-ink/50">Chạm tờ tiền bên dưới để thối</span>
        ) : (
          change.map((d, i) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: xấp tiền thối, thứ tự không đổi
              key={i}
              type="button"
              onClick={() => setChange((c) => c.filter((_, j) => j !== i))}
              className="rounded-md bg-leaf/20 px-2 py-1 text-xs font-semibold tabular-nums"
            >
              {d / 1000}k ✕
            </button>
          ))
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {DENOMS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setChange((c) => [...c, d])}
            className="h-11 rounded-xl bg-white font-semibold tabular-nums shadow-sm active:scale-95"
          >
            {d / 1000}.000đ
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => pay(total)}
        className="h-12 rounded-2xl bg-leaf text-base font-semibold text-cream disabled:opacity-50"
      >
        Thối {vnd(total)} ✓
      </button>
      <button
        type="button"
        onClick={() => setHint((h) => !h)}
        className="h-9 text-xs font-semibold text-ink/50"
      >
        {hint ? `Cần thối ${vnd(bill - price)}` : "💡 Tính giúp"}
      </button>
    </div>
  );
}
