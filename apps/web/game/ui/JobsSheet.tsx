"use client";

import { content } from "@xom/content";
import { FeatureSheet, GoToRow } from "../features/FeatureSheet";
import { vnd } from "../format";
import { useGame } from "../store";
import { ContractBoard } from "./ContractBoard";
import { GigBoard } from "./GigBoard";

/** 💼 Làm thuê (docs/USECASES.md nhóm W): mỗi việc ở một nơi có không gian riêng — tới tận nơi, bước vào, chọn vai. */
export function JobsSheet() {
  return (
    <FeatureSheet id="jobs">
      <JobList />
      <GoToRow to={["ride", "site", "contracts", "gigs"]} />
    </FeatureSheet>
  );
}

/** 📋 Việc xóm: việc NPC đặt — làm hàng, giao tận nơi trước hạn. */
export function ContractsSheet() {
  return (
    <FeatureSheet id="contracts">
      <ContractBoard />
    </FeatureSheet>
  );
}

/** 📸 Thuê nhau: người chơi thuê nhau (thợ ảnh…), ví giữ hộ, nghiệm thu. */
export function GigsSheet() {
  return (
    <FeatureSheet id="gigs">
      <GigBoard />
    </FeatureSheet>
  );
}

function JobList() {
  const me = useGame((s) => s.me);
  const shift = useGame((s) => s.shift);
  const nearPlace = useGame((s) => s.nearPlace);
  const _rented = useGame((s) => !!s.ride?.bikeToday);
  const close = useGame((s) => s.openSheet);
  const setGoal = useGame((s) => s.setGoal);
  const setInside = useGame((s) => s.setInside);
  if (!me) return null;
  // Quầy đang mở mà không có nhân viên trong ca thì chủ phải đứng bán (có nhân viên thì đi làm việc khác được).
  const minute = useGame.getState().clock?.minute ?? 0;
  const staff = me.business?.staff;
  const staffOnDuty = !!staff && minute >= staff.from && minute < staff.to;
  const shopOpen = (me.business?.open ?? false) && !staffOnDuty;
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
      {shopOpen && (
        <p className="mt-3 text-center text-sm text-ink/60">
          Quầy đang mở mà không có nhân viên trong ca — đóng quầy hoặc thuê người bán thay (👩‍🍳
          Nhân viên) rồi mới đi làm thuê được.
        </p>
      )}
    </>
  );
}
