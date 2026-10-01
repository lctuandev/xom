"use client";

import type { StoryEntryView } from "@xom/shared";
import { useEffect, useState } from "react";
import { send } from "../net/socket";

/**
 * Chuyện của tôi (docs/THEGIOI.md §1): dòng thời gian các mốc đời người chơi — server ghi lúc xảy ra, ở đây chỉ
 * đọc lại. Nhìn lại để thấy: "quầy này mình bắt đầu từ 1,5 triệu".
 */
export function StoryTimeline({ name }: { name: string }) {
  const [list, setList] = useState<StoryEntryView[] | null>(null);
  useEffect(() => {
    void send("story:list", {}).then((r) => setList(r.ok ? r.data : []));
  }, []);
  if (!list) return <p className="py-6 text-center text-sm text-ink/50">Đang lật sổ…</p>;
  return (
    <section aria-label="Chuyện của tôi" className="mb-3 rounded-2xl bg-[#fffaf0] p-3 shadow-sm">
      <p className="text-sm font-extrabold">📖 Chuyện của {name}</p>
      <p className="mb-3 text-xs text-ink/60">Mỗi mốc được ghi lại đúng ngày nó xảy ra.</p>
      {list.length === 0 ? (
        <p className="text-sm text-ink/60">Chưa có gì — chuyện bắt đầu từ việc đầu tiên bạn làm.</p>
      ) : (
        <ol className="relative ml-3.5 border-l-2 border-dashed border-ink/15 pl-5">
          {list.map((s, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: dòng thời gian chỉ thêm vào cuối
              key={i}
              className="relative mb-3 last:mb-0"
              data-story-day={s.day}
            >
              <span
                aria-hidden
                className="absolute top-0 -left-[2.15rem] flex size-7 items-center justify-center rounded-full bg-cream text-base shadow ring-2 ring-sun"
              >
                {s.emoji}
              </span>
              <p className="text-[11px] font-extrabold tracking-wide text-red uppercase">
                Ngày {s.day}
              </p>
              <p className="text-sm leading-snug font-semibold">{s.text}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
