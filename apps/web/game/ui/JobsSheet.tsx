"use client";

import { content } from "@xom/content";
import { useState } from "react";
import { vnd } from "../format";
import { send } from "../net/socket";
import { useGame } from "../store";
import { Sheet } from "./Sheet";

/**
 * Việc làm thuê: phải tới tận chỗ làm để xin việc; đang làm thì định kỳ có việc vặt
 * (bấm "Bưng ra" kịp để được thưởng); rời chỗ làm = nghỉ.
 */
export function JobsSheet() {
  const me = useGame((s) => s.me);
  const nearPlace = useGame((s) => s.nearPlace);
  const close = useGame((s) => s.openSheet);
  const setGoal = useGame((s) => s.setGoal);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const shopOpen = me.business?.open ?? false;

  return (
    <Sheet title="Việc làm thuê" onClose={() => close(null)}>
      <p className="mb-3 text-sm text-ink/60">
        Lương trả mỗi giờ trong game, làm việc vặt kịp thì có thưởng. Rời chỗ làm là nghỉ.
        {me.today.wages > 0 && ` Hôm nay đã nhận ${vnd(me.today.wages)}.`}
      </p>
      <ul className="flex flex-col gap-3">
        {content.data.jobs.map((job) => {
          const place = content.placeForJob(job.id);
          const current = me.jobId === job.id;
          const here = place ? nearPlace === place.id : true;
          return (
            <li
              key={job.id}
              className={`rounded-2xl bg-white p-3 shadow-sm ${current ? "ring-2 ring-leaf" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-extrabold">{job.name}</p>
                  <p className="text-sm text-ink/60">{job.description}</p>
                  {place && <p className="text-xs text-ink/50">📍 {place.name}</p>}
                </div>
                <p className="shrink-0 text-sm font-extrabold tabular-nums">
                  {vnd(job.wagePerHour)}/giờ
                </p>
              </div>
              {!here && !current ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!place) return;
                    setGoal({ kind: "place", id: place.id, open: "jobs" });
                    close(null);
                  }}
                  className="mt-2 h-11 w-full rounded-xl bg-ink/5 font-semibold"
                >
                  🚶 Đi tới {place?.name}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy || shopOpen || (me.jobId !== null && !current)}
                  onClick={async () => {
                    setBusy(true);
                    const res = await (current
                      ? send("job:stop", {})
                      : send("job:start", { jobId: job.id }));
                    setBusy(false);
                    if (res.ok && !current) close(null);
                  }}
                  className={`mt-2 h-11 w-full rounded-xl font-semibold disabled:opacity-40 ${
                    current ? "bg-ink/10" : "bg-leaf text-cream"
                  }`}
                >
                  {current ? "Nghỉ việc" : `Xin làm với ${place?.keeper.name ?? "chủ"}`}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {shopOpen && (
        <p className="mt-3 text-center text-sm text-ink/60">
          Đang mở quầy — đóng quầy rồi mới đi làm được.
        </p>
      )}
    </Sheet>
  );
}
