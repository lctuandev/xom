"use client";

import type { ReactNode } from "react";
import { useGame } from "../store";
import { Sheet } from "../ui/Sheet";
import { openFeature } from "./open";
import { type FeatureId, featureMeta } from "./registry";

/** Khung chung của mọi sheet chức năng: tiêu đề + icon lấy từ danh mục (registry), nút đóng. */
export function FeatureSheet({
  id,
  title,
  children,
  face,
}: {
  id: FeatureId;
  /** Ghi đè tiêu đề (vd. tên sạp, tên quầy hàng xóm). */
  title?: string;
  children: ReactNode;
  face?: ReactNode;
}) {
  const close = useGame((s) => s.openSheet);
  const meta = featureMeta(id);
  return (
    <Sheet title={title ?? `${meta.icon} ${meta.title}`} onClose={() => close(null)} face={face}>
      {children}
    </Sheet>
  );
}

/** Nút chuyển sang chức năng liên quan (không nhúng nội dung của nhau — docs/IA.md §4). */
export function GoTo({ to, label }: { to: FeatureId; label?: string }) {
  const meta = featureMeta(to);
  return (
    <button
      type="button"
      onClick={() => openFeature(to)}
      className="h-10 rounded-xl bg-white px-3 text-sm font-semibold shadow-sm active:bg-ink/5"
    >
      {meta.icon} {label ?? meta.title} ›
    </button>
  );
}

/** Hàng nút chuyển nhanh ở chân sheet. */
export function GoToRow({ to }: { to: FeatureId[] }) {
  return (
    <nav aria-label="Chức năng liên quan" className="mt-3 flex flex-wrap gap-2">
      {to.map((id) => (
        <GoTo key={id} to={id} />
      ))}
    </nav>
  );
}
