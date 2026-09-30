"use client";

import { content } from "@xom/content";
import { useState } from "react";
import { vnd } from "../format";
import { useGame } from "../store";
import { EquipmentPicker } from "./EquipmentPicker";

/** Lần đầu vào xóm: "Bạn có 500.000đ. Bắt đầu thế nào?" — không có class cố định (GDD §1). */
export function Welcome() {
  const me = useGame((s) => s.me);
  const openSheet = useGame((s) => s.openSheet);
  const [dismissed, setDismissed] = useState(false);
  const [picking, setPicking] = useState(false);
  if (!me || dismissed || me.business || me.jobId) return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-end bg-ink/30">
      <div className="pb-safe max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl bg-cream px-5 pt-6">
        {!picking ? (
          <>
            <h2 className="text-2xl font-extrabold">Chào {me.displayName}!</h2>
            <p className="mt-2 text-lg">
              Bạn có <b className="text-red">{vnd(me.money)}</b>. Bạn muốn bắt đầu cuộc sống ở xóm
              thế nào?
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="rounded-2xl bg-red p-4 text-left text-cream"
              >
                <span className="block text-lg font-extrabold">🛒 Mua xe, ra buôn bán</span>
                <span className="block text-sm opacity-90">
                  {content.data.equipment.map((e) => e.name.toLowerCase()).join(", ")} — lời nhiều,
                  cũng dễ lỗ
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDismissed(true);
                  openSheet("jobs");
                }}
                className="rounded-2xl bg-white p-4 text-left shadow-sm"
              >
                <span className="block text-lg font-extrabold">💼 Đi làm thuê trước</span>
                <span className="block text-sm text-ink/70">Tích vốn an toàn rồi tính sau</span>
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="h-12 font-semibold text-ink/60"
              >
                Đi dạo xóm đã
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setPicking(false)}
              className="mb-2 h-11 font-semibold text-red"
            >
              ← Quay lại
            </button>
            <h2 className="mb-3 text-2xl font-extrabold">Chọn xe hàng</h2>
            <EquipmentPicker
              onDone={() => {
                setDismissed(true);
                openSheet("business");
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
