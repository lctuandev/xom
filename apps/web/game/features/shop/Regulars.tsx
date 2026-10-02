"use client";

import { content } from "@xom/content";
import type { RegularView } from "@xom/shared";
import { useEffect, useState } from "react";
import { send } from "../../net/socket";
import { ShopFeature } from "./common";

/**
 * Sổ khách quen (KIENTRUC §1): cư dân có tên đã mua ở quầy mấy lần; đủ lần thì ❤️. Làm sai / để chờ bỏ về liên tiếp thì
 * khách quen giận.
 */
function RegularBook() {
  const [list, setList] = useState<RegularView[] | null>(null);
  useEffect(() => {
    void send("regulars:list", {}).then((r) => setList(r.ok ? r.data : []));
  }, []);
  const need = content.data.regulars.regularAt;
  if (!list) return <p className="text-sm text-ink/50">Đang lật sổ…</p>;
  return (
    <section aria-label="Sổ khách quen" className="mb-3">
      <p className="mb-2 text-xs text-ink/60">
        Khách mua đúng món đủ {need} lần thì thành ❤️ khách quen: kiên nhẫn hơn, hay ghé hơn, có khi
        rủ bạn tới. Làm sai {content.data.regulars.angryStreak} lần liền là họ giận.
      </p>
      {list.length === 0 ? (
        <p className="text-sm text-ink/60">Chưa ai ghé — bán đi rồi sẽ có người quen mặt.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {list.map((r) => (
            <li
              key={r.residentId}
              className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm"
              data-resident={r.residentId}
            >
              <span aria-hidden className="text-lg">
                {r.regular ? "❤️" : "🙂"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{r.name}</span>
                <span className="block truncate text-xs text-ink/60">{r.bio}</span>
              </span>
              <span className="text-xs font-semibold tabular-nums">
                {r.regular ? `${r.visits} lần` : `${r.visits}/${need}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** ❤️ Khách quen. */
export function RegularsSheet() {
  return <ShopFeature id="regulars">{() => <RegularBook />}</ShopFeature>;
}
