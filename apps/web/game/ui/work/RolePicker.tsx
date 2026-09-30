"use client";

import { content } from "@xom/content";
import { useState } from "react";
import { vnd } from "../../format";
import { send } from "../../net/socket";
import { useGame } from "../../store";

/** Vào quán/bưu cục: chọn vai rồi vào ca (UC-W1). */
export function RolePicker({ placeId }: { placeId: string }) {
  const place = content.place(placeId);
  const [busy, setBusy] = useState(false);
  const jobs = content.data.jobs.filter((j) => place.jobs.includes(j.id));
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        <b>{place.keeper.name}:</b> {place.keeper.greeting}
      </p>
      {jobs.map((job) =>
        job.roles.map((r) => (
          <button
            key={r.id}
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const res = await send("work:start", { jobId: job.id, role: r.id });
              setBusy(false);
              if (res.ok) useGame.getState().setShift(res.data.shift);
            }}
            className="rounded-2xl bg-white p-3 text-left shadow-sm active:scale-[0.98] disabled:opacity-50"
          >
            <span className="flex items-center justify-between">
              <span className="font-extrabold">
                {r.emoji} {r.name}
              </span>
              <span className="text-xs font-semibold text-leaf">{vnd(r.piecePay)}/việc</span>
            </span>
            <span className="block text-xs text-ink/60">
              {r.description} · lương cứng {vnd(job.wagePerHour)}/giờ khi có làm
            </span>
          </button>
        )),
      )}
    </div>
  );
}
