"use client";

import { content } from "@xom/content";
import { useState } from "react";
import { vnd } from "../format";
import { useGame } from "../store";
import { ContractBoard } from "./ContractBoard";
import { Sheet } from "./Sheet";
import { Tabs } from "./Tabs";

type JobsTab = "jobs" | "board";
/** Mở lại sheet thì về tab lần trước (đang làm việc trên bảng xóm thì khỏi chọn lại). */
let lastTab: JobsTab = "jobs";

/**
 * Việc làm thuê (docs/USECASES.md nhóm W): mỗi việc ở một nơi có không gian riêng —
 * phải tới tận nơi, bước vào, chọn vai rồi vào ca.
 */
export function JobsSheet() {
  const me = useGame((s) => s.me);
  const close = useGame((s) => s.openSheet);
  const [tab, setTabState] = useState<JobsTab>(lastTab);
  const setTab = (t: JobsTab) => {
    lastTab = t;
    setTabState(t);
  };
  if (!me) return null;

  return (
    <Sheet title="Việc làm" onClose={() => close(null)}>
      <Tabs
        label="Việc làm"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "jobs", label: "💼 Làm thuê" },
          { id: "board", label: "📋 Việc xóm" },
        ]}
      />
      {tab === "board" ? <ContractBoard /> : <JobList />}
    </Sheet>
  );
}

function JobList() {
  const me = useGame((s) => s.me);
  const shift = useGame((s) => s.shift);
  const nearPlace = useGame((s) => s.nearPlace);
  const rented = useGame((s) => !!s.ride?.bikeToday);
  const close = useGame((s) => s.openSheet);
  const setGoal = useGame((s) => s.setGoal);
  const setInside = useGame((s) => s.setInside);
  if (!me) return null;
  const shopOpen = me.business?.open ?? false;
  return (
    <>
      <p className="mb-3 text-sm text-ink/60">
        Tiền = lương cứng giờ nào có làm + tiền từng việc làm đúng. Đứng không thì không có tiền.
        {me.today.wages > 0 && ` Hôm nay đã nhận ${vnd(me.today.wages)}.`}
      </p>
      <ul className="flex flex-col gap-3">
        {content.data.jobs.map((job) => {
          const place = content.placeForJob(job.id);
          if (!place) return null;
          const current = shift?.jobId === job.id;
          const here = nearPlace === place.id;
          return (
            <li
              key={job.id}
              className={`rounded-2xl bg-white p-3 shadow-sm ${current ? "ring-2 ring-leaf" : ""}`}
            >
              <p className="font-extrabold">{job.name}</p>
              <p className="text-sm text-ink/60">{job.description}</p>
              <ul className="mt-1.5 flex flex-col gap-0.5 text-xs">
                {job.roles.map((r) => (
                  <li key={r.id}>
                    {r.emoji} {r.name} · <b>{vnd(r.piecePay)}</b>/việc
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={shopOpen && !current}
                onClick={() => {
                  close(null);
                  if (here) setInside(place.id);
                  else setGoal({ kind: "place", id: place.id });
                }}
                className="mt-2 h-11 w-full rounded-xl bg-leaf font-semibold text-cream disabled:opacity-40"
              >
                {current
                  ? `↩︎ Quay lại ${place.name}`
                  : here
                    ? `${place.action}`
                    : `🚶 Đi tới ${place.name}`}
              </button>
            </li>
          );
        })}
      </ul>
      <RideCard
        here={nearPlace === content.data.rides.stationPlaceId}
        rented={rented}
        onGo={() => {
          close(null);
          // Đã thuê xe: đứng đâu cũng chạy được, mở thẳng bảng xe ôm.
          if (rented || nearPlace === content.data.rides.stationPlaceId) close("ride");
          else setGoal({ kind: "place", id: content.data.rides.stationPlaceId, open: "ride" });
        }}
      />
      {shopOpen && (
        <p className="mt-3 text-center text-sm text-ink/60">
          Đang mở quầy — đóng quầy rồi mới đi làm thuê được.
        </p>
      )}
    </>
  );
}

/** 🛵 Xe ôm (KIENTRUC §4): tự chạy, không có chủ trả lương — thuê xe, đón khách ở trạm. */
function RideCard({ here, rented, onGo }: { here: boolean; rented: boolean; onGo: () => void }) {
  const r = content.data.rides;
  const place = content.place(r.stationPlaceId);
  return (
    <div className="mt-3 rounded-2xl bg-white p-3 shadow-sm" data-job="xe_om">
      <p className="font-extrabold">🛵 Chạy xe ôm · {place.name}</p>
      <p className="text-sm text-ink/60">
        Thuê xe của {place.keeper.name} {vnd(r.bikeRentPerDay)}/ngày ở trạm, rồi đậu xe đâu ngoài
        đường cũng đón được khách: trả giá, chọn đường lớn hay hẻm. Xăng tự trả, khách chấm sao.
      </p>
      <button
        type="button"
        onClick={onGo}
        className="mt-2 h-11 w-full rounded-xl bg-leaf font-semibold text-cream"
      >
        {rented ? "🛵 Chạy xe ôm (đã thuê xe)" : here ? place.action : `🚶 Đi tới ${place.name}`}
      </button>
    </div>
  );
}
