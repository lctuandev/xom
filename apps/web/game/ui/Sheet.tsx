"use client";

import type { ReactNode } from "react";

/**
 * Bottom sheet cho mobile: nằm trong vùng ngón cái, ngay trên thanh điều hướng (vẫn bấm chuyển tab được),
 * vẫn thấy bản đồ phía trên (docs/PLAN.md §1).
 */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="pointer-events-auto fixed inset-x-0 top-0 bottom-(--nav-h) z-30 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 bg-ink/20"
      />
      <section
        role="dialog"
        aria-label={title}
        className="relative flex max-h-[68dvh] flex-col rounded-t-3xl bg-cream shadow-[0_-8px_30px_rgba(0,0,0,0.15)]"
      >
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-ink/20" />
        <header className="flex items-center justify-between px-4 pt-1 pb-2">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-full bg-ink/5 text-base"
            aria-label="Đóng"
          >
            ✕
          </button>
        </header>
        <div className="overflow-y-auto overscroll-contain px-4 pb-3">{children}</div>
      </section>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-ink/60 uppercase">{title}</h3>
      {children}
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  step,
  min,
  max,
  format = String,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
  format?: (v: number) => string;
  label: string;
}) {
  const btn =
    "flex size-11 shrink-0 items-center justify-center rounded-xl bg-ink/5 text-xl font-semibold active:bg-ink/10 disabled:opacity-30";
  return (
    <fieldset className="m-0 flex items-center gap-2 border-0 p-0" aria-label={label}>
      <button
        type="button"
        className={btn}
        disabled={value - step < min}
        onClick={() => onChange(Math.max(min, value - step))}
        aria-label={`Giảm ${label}`}
      >
        −
      </button>
      <output className="min-w-0 flex-1 text-center text-xl font-extrabold tabular-nums">
        {format(value)}
      </output>
      <button
        type="button"
        className={btn}
        disabled={value + step > max}
        onClick={() => onChange(Math.min(max, value + step))}
        aria-label={`Tăng ${label}`}
      >
        +
      </button>
    </fieldset>
  );
}
