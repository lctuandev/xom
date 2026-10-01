"use client";

import { content } from "@xom/content";
import { useGame } from "../store";
import { Modal } from "./Modal";

function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} phút`;
  const h = Math.round(minutes / 60);
  return h < 48 ? `${h} giờ` : `${Math.round(h / 24)} ngày`;
}

/**
 * "Trong lúc bạn vắng…" (docs/THEGIOI.md §4, UC-M4): vào lại game thì kể chuyện thật đã xảy ra ở xóm — đánh giá mới,
 * hàng xóm mới, quầy đang mở, công trình, giá chợ. Không có tiền tự sinh (chỉ khi có nhân viên bán thay — làm sau).
 */
export function AwayModal() {
  const away = useGame((s) => s.away);
  const setAway = useGame((s) => s.setAway);
  if (!away) return null;
  const close = () => setAway(null);
  const rows: { icon: string; text: string; key: string }[] = [];
  if (away.days > 0)
    rows.push({
      key: "days",
      icon: "📅",
      text: `Xóm đã qua ${away.days} ngày — hàng xóm vẫn buôn bán, đi làm.`,
    });
  if (away.reviews.count > 0) {
    const r = away.reviews;
    rows.push({
      key: "reviews",
      icon: "⭐",
      text: `${r.count} đánh giá mới về quầy bạn · trung bình ${r.avg.toFixed(1)}★${
        r.latest ? ` — ${r.latest.name}: “${r.latest.text}”` : ""
      }`,
    });
  }
  if (away.newNeighbors.length)
    rows.push({
      key: "neighbors",
      icon: "🧳",
      text: `Hàng xóm mới dọn về: ${away.newNeighbors.join(", ")}`,
    });
  if (away.stalls.length)
    rows.push({
      key: "stalls",
      icon: "🏪",
      text: `Đang mở quầy: ${away.stalls
        .map((s) => `${s.name} (${content.product(s.productId).name.toLowerCase()})`)
        .join(", ")}`,
    });
  for (const p of away.projects.done)
    rows.push({ key: `done-${p}`, icon: "🏗️", text: `Cả xóm xây xong: ${p}` });
  for (const p of away.projects.voting)
    rows.push({ key: `vote-${p}`, icon: "🗳️", text: `Đề xuất mới chờ bỏ phiếu: ${p}` });
  for (const m of away.prices) {
    const ing = content.ingredient(m.itemId);
    const pct = Math.round(m.change * 100);
    rows.push({
      key: `price-${m.itemId}`,
      icon: pct > 0 ? "📈" : "📉",
      text: `Giá ${ing.emoji} ${ing.name.toLowerCase()} ở chợ ${pct > 0 ? "lên" : "xuống"} ${Math.abs(pct)}%`,
    });
  }
  return (
    <Modal title={`🌙 Trong lúc bạn vắng (${duration(away.minutes)})…`} onClose={close}>
      <ul className="flex flex-col gap-2" data-away>
        {rows.map((r) => (
          <li key={r.key} className="flex gap-2 rounded-xl bg-white p-2.5 text-sm shadow-sm">
            <span aria-hidden className="text-lg leading-none">
              {r.icon}
            </span>
            <span className="leading-snug">{r.text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink/60">
        Quầy đóng khi bạn vắng — tiền chỉ vào khi có người đứng bán.
      </p>
      <button
        type="button"
        onClick={close}
        className="mt-3 h-12 w-full rounded-2xl bg-red font-semibold text-cream"
      >
        Vào xóm thôi 👋
      </button>
    </Modal>
  );
}
