"use client";

import { content, type Product, type RecipeStep } from "@xom/content";
import type { DishSelection, DishView } from "@xom/shared";
import { holdFactor, needsHold, wearState } from "@xom/sim";
import { useEffect, useRef, useState } from "react";
import { send } from "../net/socket";
import { type OrderState, useGame } from "../store";

// Quầy dạng lưới theo góc nhìn người bán (docs/USECASES.md UC-F5, góp ý chơi thử + ảnh tham khảo):
// chồng ly M/L · dãy bình trà có vòi · máy dán miệng ly · ô "pha ly" · dải chọn đường/đá · lưới khay topping · lắc.
// Bố trí khai báo trong content (product.counter): mỗi khu gắn với một bước công thức → nghề khác dùng lại được.

type Zone = NonNullable<Product["counter"]>["zones"][number];

function stockOf(itemId: string | undefined): number {
  if (!itemId) return Number.POSITIVE_INFINITY;
  return useGame.getState().me?.inventory.find((i) => i.itemId === itemId)?.qty ?? 0;
}

const shortLabel = (label: string) => label.split(" · ")[0] ?? label;
const capitalize = (t: string) => t.charAt(0).toLocaleUpperCase("vi") + t.slice(1);

export function Counter({ order }: { order: OrderState }) {
  const product = content.product(order.productId);
  const recipe = product.recipe;
  const layout = product.counter;
  const [build, setBuild] = useState<DishView>({});
  const [busy, setBusy] = useState(false);
  const inventory = useGame((s) => s.me?.inventory);
  if (!layout) return null;
  const step = (id: string) => recipe.steps.find((s) => s.id === id) as RecipeStep;
  const zone = (kind: Zone["zone"]) => layout.zones.filter((z) => z.zone === kind);
  const set = (id: string, v: DishSelection | undefined) =>
    setBuild((b) => {
      const next = { ...b };
      if (v === undefined) delete next[id];
      else next[id] = v;
      return next;
    });

  const deliver = async () => {
    setBusy(true);
    const res = await send("order:make", { orderId: order.orderId, build });
    setBusy(false);
    if (res.ok && !res.data.correct) setBuild({});
  };

  // Bước kế tiếp theo thứ tự công thức (ly → trà → đường → đá → topping → lắc → dán nắp): tô sáng khu đó
  // và dải bước trên đầu — người chơi khỏi phải dò cả quầy (góp ý chơi thử: quầy khó dùng).
  const next = recipe.steps.find((st) => build[st.id] === undefined)?.id;
  const hot = (id: string) =>
    id === next ? "rounded-2xl ring-2 ring-sun ring-offset-2 ring-offset-cream" : "";

  return (
    <div className="flex flex-col gap-2.5 py-3" data-counter data-inventory={inventory?.length}>
      <ol
        className="flex flex-wrap items-center gap-1"
        aria-label="Các bước pha"
        data-next-step={next}
      >
        {recipe.steps.map((st, i) => {
          const done = build[st.id] !== undefined;
          return (
            <li
              key={st.id}
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                done
                  ? "bg-leaf/15 text-leaf"
                  : st.id === next
                    ? "bg-sun text-ink"
                    : "bg-ink/5 text-ink/50"
              }`}
            >
              {done ? "✓" : `${i + 1}.`} {capitalize(shortLabel(st.label).replace(/^Chọn /, ""))}
            </li>
          );
        })}
      </ol>

      {/* Hàng trên: ly · bình trà. */}
      <div className="flex items-end gap-2 rounded-2xl bg-[#f3e2c7] p-2 shadow-inner">
        {zone("cups").map((z) => (
          <div key={z.step} className={hot(z.step)}>
            <Cups step={step(z.step)} value={build[z.step]} onPick={(v) => set(z.step, v)} />
          </div>
        ))}
        <div
          className={`flex min-w-0 flex-1 gap-1 overflow-x-auto p-0.5 ${zone("jars").some((z) => z.step === next) ? hot(next ?? "") : ""}`}
        >
          {zone("jars").map((z) => (
            <Jars
              key={z.step}
              step={step(z.step)}
              value={build[z.step]}
              onPick={(v) => set(z.step, v)}
            />
          ))}
        </div>
      </div>

      {/* Ô pha ly + đường/đá. */}
      <div className="grid grid-cols-[6.5rem_1fr] gap-2">
        <CupPreview product={product} build={build} />
        <div className="flex min-w-0 flex-col gap-1.5">
          {zone("chips").map((z) => (
            <div key={z.step} className={`p-0.5 ${hot(z.step)}`}>
              <Chips step={step(z.step)} value={build[z.step]} onPick={(v) => set(z.step, v)} />
            </div>
          ))}
        </div>
      </div>

      {/* Khay topping: chỉ những món đang bán (không còn ô khoá trống chiếm chỗ). */}
      {zone("grid").map((z) => (
        <div key={z.step} className={hot(z.step)}>
          <Grid step={step(z.step)} value={build[z.step]} onChange={(v) => set(z.step, v)} />
        </div>
      ))}

      {/* Cuối quy trình: lắc → dán nắp → giao. */}
      <div className="flex gap-2">
        {zone("shaker").map((z) => (
          <div key={z.step} className={`min-w-0 flex-1 ${hot(z.step)}`}>
            <Shaker
              step={step(z.step)}
              done={build[z.step] === true}
              onDone={(d) => set(z.step, d ? true : undefined)}
            />
          </div>
        ))}
        {zone("sealer").map((z) => (
          <div key={z.step} className={hot(z.step)}>
            <Sealer
              step={step(z.step)}
              done={build[z.step] === true}
              onDone={(d) => set(z.step, d ? true : undefined)}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={deliver}
        className={`h-14 rounded-2xl bg-red text-base font-semibold text-cream active:scale-[0.98] disabled:opacity-50 ${
          next ? "" : "ring-2 ring-sun ring-offset-2 ring-offset-cream"
        }`}
      >
        {busy ? "…" : next ? "🤲 Giao món cho khách" : "✓ Xong rồi — 🤲 Giao món cho khách"}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setBuild({})}
          className="h-10 rounded-xl bg-ink/5 text-xs font-semibold text-ink/60"
        >
          🗑️ Đổ ly, làm lại
        </button>
        <button
          type="button"
          aria-label="🙏 Xin lỗi, hết món này rồi"
          onClick={() => void send("order:decline", { orderId: order.orderId })}
          className="h-10 rounded-xl bg-ink/5 text-xs font-semibold text-ink/60"
        >
          🙏 Hết món này rồi
        </button>
      </div>
    </div>
  );
}

/** Chồng ly theo size (số còn lại trong kho); chạm để lấy ly. */
function Cups({
  step,
  value,
  onPick,
}: {
  step: RecipeStep;
  value: DishSelection | undefined;
  onPick: (v: string | undefined) => void;
}) {
  return (
    <section aria-label={step.label} className="flex gap-1">
      {step.options.map((o) => {
        const left = stockOf(o.ingredient);
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            aria-label={`Lấy ly ${shortLabel(o.label)}`}
            disabled={left < o.qty}
            onClick={() => onPick(on ? undefined : o.id)}
            className="relative flex h-20 w-11 flex-col items-center justify-end rounded-lg border-2 border-transparent bg-white/70 pb-1 text-xs font-extrabold shadow-sm aria-pressed:border-red disabled:opacity-35"
          >
            <span className="text-2xl leading-none" aria-hidden>
              🥤
            </span>
            {o.label.replace("Size ", "")}
            {Number.isFinite(left) && <Badge n={left} />}
          </button>
        );
      })}
    </section>
  );
}

/** Dãy bình trà có vòi: chạm để rót trà nền vào ly. */
function Jars({
  step,
  value,
  onPick,
}: {
  step: RecipeStep;
  value: DishSelection | undefined;
  onPick: (v: string | undefined) => void;
}) {
  return (
    <section aria-label={step.label} className="flex gap-1">
      {step.options.map((o) => {
        const left = stockOf(o.ingredient);
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            aria-label={`Rót ${o.label}`}
            disabled={left < o.qty}
            onClick={() => onPick(on ? undefined : o.id)}
            className="relative flex h-20 w-14 shrink-0 flex-col items-center justify-between rounded-t-2xl rounded-b-md border-2 border-white/80 bg-gradient-to-b from-white/90 to-[#e9cfa6] px-0.5 pt-1 pb-0.5 text-[10px] leading-tight font-extrabold shadow-sm aria-pressed:border-red disabled:opacity-35"
          >
            <span className="text-lg" aria-hidden>
              {o.emoji}
            </span>
            <span className="rounded bg-white/90 px-0.5 uppercase">{o.label}</span>
            <span className="text-[9px] text-ink/50" aria-hidden>
              ▼ vòi
            </span>
            {Number.isFinite(left) && <Badge n={left} />}
          </button>
        );
      })}
    </section>
  );
}

/** Dải chọn một (đường, đá) — nhãn bằng chữ như khách nói. */
function Chips({
  step,
  value,
  onPick,
}: {
  step: RecipeStep;
  value: DishSelection | undefined;
  onPick: (v: string | undefined) => void;
}) {
  return (
    <section aria-label={step.label}>
      <p className="mb-0.5 text-[11px] font-extrabold text-ink/60 uppercase">{step.label}</p>
      <div className="flex flex-wrap gap-1">
        {step.options.map((o) => {
          const on = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              aria-label={o.label}
              disabled={stockOf(o.ingredient) < o.qty}
              onClick={() => onPick(on ? undefined : o.id)}
              className="h-8 rounded-lg bg-white px-2 text-[11px] font-semibold shadow-sm aria-pressed:bg-ink aria-pressed:text-cream disabled:opacity-35"
            >
              {shortLabel(o.label)}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Lưới khay topping (như khay inox): ô có món + số còn lại; hết hàng thì mờ. */
function Grid({
  step,
  value,
  onChange,
}: {
  step: RecipeStep;
  value: DishSelection | undefined;
  onChange: (v: string[] | undefined) => void;
}) {
  const picked = Array.isArray(value) ? value : [];
  return (
    <section aria-label={step.label} className="rounded-2xl bg-[#c9ced3] p-1.5 shadow-inner">
      <div className="grid grid-cols-4 gap-1.5">
        {step.options.map((o) => {
          const left = stockOf(o.ingredient);
          const on = picked.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              aria-label={`Thêm ${o.label}`}
              disabled={!on && left < o.qty}
              onClick={() => {
                const next = on ? picked.filter((x) => x !== o.id) : [...picked, o.id];
                onChange(next);
              }}
              className="relative flex h-16 flex-col items-center justify-center rounded-lg border-2 border-transparent bg-gradient-to-b from-white to-[#e4e7ea] text-center shadow-sm aria-pressed:border-red disabled:opacity-35"
            >
              <span className="text-2xl leading-none" aria-hidden>
                {o.emoji}
              </span>
              <span className="text-[10px] leading-tight font-semibold">{o.label}</span>
              {Number.isFinite(left) && <Badge n={left} />}
              {on && (
                <span className="absolute -top-1 -left-1 flex size-5 items-center justify-center rounded-full bg-leaf text-[11px] font-bold text-cream">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => onChange([])}
        aria-pressed={picked.length === 0 && Array.isArray(value)}
        className="mt-1.5 h-8 w-full rounded-lg bg-white/70 text-xs font-semibold aria-pressed:bg-ink aria-pressed:text-cream"
      >
        Không topping
      </button>
    </section>
  );
}

/** Máy dán miệng ly: chạm để dán (tốn màng). */
function Sealer({
  step,
  done,
  onDone,
}: {
  step: RecipeStep;
  done: boolean;
  onDone: (d: boolean) => void;
}) {
  return (
    <section aria-label={step.label}>
      <button
        type="button"
        aria-pressed={done}
        disabled={!done && stockOf(step.ingredient) < 1}
        onClick={() => onDone(!done)}
        className="flex h-14 w-24 items-center justify-center gap-1 rounded-2xl bg-gradient-to-b from-[#ffb36b] to-[#7f8a96] text-xs font-extrabold text-cream shadow-sm aria-pressed:ring-2 aria-pressed:ring-leaf disabled:opacity-35"
      >
        <span className="text-xl" aria-hidden>
          {done ? "✅" : "🔒"}
        </span>
        {done ? "Đã dán" : (step.verb ?? step.label)}
      </button>
    </section>
  );
}

/** Lắc đều: giữ nút cho đủ giờ (xe ọp ẹp thì lâu hơn). */
function Shaker({
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
  useEffect(() => () => clearInterval(timer.current), []);
  const start = () => {
    if (done) return onDone(false);
    const t0 = performance.now();
    const biz = useGame.getState().me?.business;
    const m = content.economy.maintenance;
    const skills = useGame.getState().me?.progress.skills ?? {};
    const slow =
      (biz && wearState(biz.wear, m) !== "ok" ? m.slowHold : 1) *
      holdFactor(content, skills) *
      needsHold(content, useGame.getState().me?.needs ?? { food: 100, drink: 100 });
    timer.current = setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / (1000 * slow));
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
  return (
    <section aria-label={step.label}>
      <button
        type="button"
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        className={`relative h-14 w-full overflow-hidden rounded-2xl text-sm font-semibold select-none ${done ? "bg-leaf text-cream" : "bg-sun"}`}
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

/** Ly đang pha: các lớp theo những gì đã cho vào. */
function CupPreview({ product, build }: { product: Product; build: DishView }) {
  const steps = product.recipe.steps;
  const parts: string[] = [];
  for (const s of steps) {
    const v = build[s.id];
    if (v === undefined) continue;
    if (v === true) parts.push(`✓ ${s.label}`);
    else
      for (const id of Array.isArray(v) ? v : [v]) {
        const o = s.options.find((x) => x.id === id);
        if (o) parts.push(`${o.emoji} ${shortLabel(o.label)}`);
      }
  }
  return (
    <section
      aria-label="Ly đang pha"
      className="flex flex-col items-center rounded-2xl bg-[#f6e7cf] p-1.5 text-center shadow-sm"
    >
      <p className="text-[10px] font-extrabold text-ink/60">PHA LY</p>
      <span className="text-4xl leading-none" aria-hidden>
        {build.ly ? "🧋" : "⬜"}
      </span>
      <p className="mt-1 text-[10px] leading-snug">
        {parts.length ? parts.join(" · ") : "Lấy ly M hoặc L"}
      </p>
    </section>
  );
}

function Badge({ n }: { n: number }) {
  return (
    <span className="absolute -top-1.5 -right-1 rounded-full bg-ink/85 px-1 text-[9px] font-bold text-cream tabular-nums">
      {n}
    </span>
  );
}
