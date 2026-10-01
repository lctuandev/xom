"use client";

/**
 * Tab dính trên đầu sheet (góp ý UX: list dài thì chia tab, thanh tab nổi lên khi cuộn).
 * Nhiều tab thì cuộn ngang; tab đang chọn tô đậm. Dùng chung cho chợ, Làm ăn, Hồ sơ, Bảng xóm.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { id: T; label: string; badge?: number }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="sticky top-0 z-10 -mx-4 mb-3 bg-cream/95 px-4 pt-1 pb-2 shadow-[0_6px_10px_-8px_rgba(0,0,0,0.25)] backdrop-blur-sm">
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            data-tab={t.id}
            aria-selected={value === t.id}
            onClick={() => onChange(t.id)}
            className="h-10 shrink-0 grow rounded-xl bg-white px-3 text-sm font-semibold whitespace-nowrap shadow-sm aria-selected:bg-ink aria-selected:text-cream"
          >
            {t.label}
            {t.badge ? (
              <span className="ml-1.5 rounded-full bg-red px-1.5 text-xs text-cream">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
