"use client";

import { content } from "@xom/content";
import { useEffect, useState } from "react";

/** Đã xem hướng dẫn vai này chưa (tiện ích riêng từng máy; mất cũng không sao — xem lại thôi). */
const seenKey = (role: string) => `xom:guide:${role}`;
function seen(role: string): boolean {
  try {
    return localStorage.getItem(seenKey(role)) === "1";
  } catch {
    return false;
  }
}
function markSeen(role: string) {
  try {
    localStorage.setItem(seenKey(role), "1");
  } catch {}
}

/**
 * Hướng dẫn vào ca (docs/USECASES.md UC-W1): lần đầu làm một vai, người chủ chỉ từng bước cách làm;
 * nút "❓ Cách làm" mở lại bất cứ lúc nào. Nội dung nằm trong content (jobs[].roles[].guide).
 */
export function JobGuide({
  jobId,
  role,
  open,
  onClose,
}: {
  jobId: string;
  role: string;
  /** Mở lại bằng tay (nút ❓). */
  open: boolean;
  onClose: () => void;
}) {
  const job = content.data.jobs.find((j) => j.id === jobId);
  const r = job?.roles.find((x) => x.id === role);
  const place = job ? content.placeForJob(job.id) : undefined;
  const lines = r?.guide ?? [];
  const [page, setPage] = useState(0);
  const [auto, setAuto] = useState(false);

  // Lần đầu làm vai này: tự mở.
  useEffect(() => {
    if (lines.length > 0 && !seen(role)) setAuto(true);
    setPage(0);
  }, [role, lines.length]);

  if ((!open && !auto) || lines.length === 0 || !r) return null;
  const last = page >= lines.length - 1;
  const close = () => {
    markSeen(role);
    setAuto(false);
    setPage(0);
    onClose();
  };

  return (
    <div className="pointer-events-auto absolute inset-x-3 bottom-[46dvh] z-30 mx-auto max-w-sm">
      <section
        role="dialog"
        aria-label={`Cách làm: ${r.name}`}
        className="rounded-2xl bg-cream p-3 shadow-2xl ring-2 ring-sun"
      >
        <div className="flex items-center gap-2">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sun text-lg"
            aria-hidden
          >
            {r.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold text-red">
              {place?.keeper.name ?? "Chủ"} chỉ việc · {r.name}
            </p>
            <p className="text-[11px] text-ink/50">
              Bước {page + 1}/{lines.length}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="h-8 shrink-0 rounded-lg px-2 text-xs font-semibold text-ink/60"
          >
            Bỏ qua
          </button>
        </div>
        <p className="mt-2 text-[15px] leading-snug">{lines[page]}</p>
        <div className="mt-3 flex gap-2">
          {page > 0 && (
            <button
              type="button"
              onClick={() => setPage(page - 1)}
              className="h-10 rounded-xl bg-ink/10 px-3 text-sm font-semibold"
            >
              ‹ Trước
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? close() : setPage(page + 1))}
            className="h-10 flex-1 rounded-xl bg-red text-sm font-semibold text-cream"
          >
            {last ? "Đã hiểu, làm thôi!" : "Tiếp ›"}
          </button>
        </div>
      </section>
    </div>
  );
}
