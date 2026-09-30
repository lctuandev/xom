"use client";

import { content } from "@xom/content";
import { useState } from "react";
import { vnd } from "../format";
import { send } from "../net/socket";
import { useGame } from "../store";
import { Sheet } from "./Sheet";

/** Đi làm thuê: an toàn, lương theo giờ game; không mở quầy được trong lúc làm. */
export function JobsSheet() {
  const me = useGame((s) => s.me);
  const close = useGame((s) => s.openSheet);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const shopOpen = me.business?.open ?? false;

  return (
    <Sheet title="Việc làm thuê" onClose={() => close(null)}>
      <p className="mb-3 text-sm text-ink/60">
        Lương trả mỗi giờ trong game. Tan làm lúc hết ngày.
        {me.today.wages > 0 && ` Hôm nay đã nhận ${vnd(me.today.wages)}.`}
      </p>
      <ul className="flex flex-col gap-3">
        {content.data.jobs.map((job) => {
          const current = me.jobId === job.id;
          return (
            <li
              key={job.id}
              className={`rounded-2xl bg-white p-4 shadow-sm ${current ? "ring-2 ring-leaf" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-extrabold">{job.name}</p>
                  <p className="text-sm text-ink/60">{job.description}</p>
                </div>
                <p className="shrink-0 font-extrabold tabular-nums">{vnd(job.wagePerHour)}/giờ</p>
              </div>
              <button
                type="button"
                disabled={busy || shopOpen || (me.jobId !== null && !current)}
                onClick={async () => {
                  setBusy(true);
                  await (current ? send("job:stop", {}) : send("job:start", { jobId: job.id }));
                  setBusy(false);
                }}
                className={`mt-3 h-12 w-full rounded-xl font-semibold disabled:opacity-40 ${
                  current ? "bg-ink/10" : "bg-leaf text-cream"
                }`}
              >
                {current ? "Nghỉ việc" : "Đi làm"}
              </button>
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
