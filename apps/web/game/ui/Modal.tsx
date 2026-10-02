"use client";

import type { ReactNode } from "react";

/**
 * Modal giữa màn hình (bên cạnh bottom sheet): dùng cho nội dung "xem" trọn vẹn, cần tập trung — bảng xếp hạng,
 * hướng dẫn cài đặt… Sheet vẫn dành cho thao tác trong lúc chơi (vẫn thấy bản đồ). Bấm nền tối hoặc ✕ để đóng.
 */
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center p-3">
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 animate-[fade-in_150ms_ease-out] bg-ink/50 backdrop-blur-[2px]"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[88dvh] w-full animate-[pop-in_180ms_ease-out] flex-col overflow-hidden rounded-3xl bg-cream shadow-2xl ${wide ? "max-w-lg" : "max-w-md"}`}
      >
        <header className="flex items-center justify-between px-4 pt-3 pb-2">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-full bg-ink/5 text-base"
            aria-label="Đóng"
          >
            ✕
          </button>
        </header>
        <div className="overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
      </section>
    </div>
  );
}
