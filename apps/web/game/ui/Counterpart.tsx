"use client";

import { useEffect } from "react";
import { portraitUrl } from "../looks";
import { useGame } from "../store";

/**
 * Khung "đứng trước quầy" (UC-E5): chân dung người bán / hàng xóm và ô thoại nằm phía trên bottom sheet,
 * như đang đứng đối diện nói chuyện — thay vì dồn hết lời nói vào trong sheet. `me` là câu mình vừa nói
 * (bong bóng tối màu, canh phải). Đổi câu thì bong bóng bật lại cho dễ thấy.
 */
export function Counterpart({
  model,
  name,
  tag,
  line,
  me,
  anchor,
}: {
  model: string;
  name: string;
  /** Chữ nhỏ dưới tên: "Chủ quầy", "Bán xôi"… */
  tag?: string;
  line: string;
  me?: string | null;
  /** Id người nói trong cảnh (khung thoại trên đầu) — ẩn khung đó khi đang đứng đối diện. */
  anchor?: string;
}) {
  useEffect(() => {
    if (!anchor) return;
    useGame.setState({ facing: anchor });
    return () => useGame.setState((s) => (s.facing === anchor ? { facing: null } : {}));
  }, [anchor]);
  return (
    <div
      className="pointer-events-none relative mx-3 mb-2 flex items-end gap-2"
      data-counterpart={name}
    >
      <figure className="m-0 flex shrink-0 flex-col items-center">
        {/* biome-ignore lint/performance/noImgElement: ảnh tĩnh 160px trong public, không cần next/image */}
        <img
          src={portraitUrl(model)}
          alt={`Chân dung ${name}`}
          width={80}
          height={80}
          className="size-20 rounded-full bg-gradient-to-b from-sky-200 to-amber-100 shadow-lg ring-4 ring-cream"
        />
        <figcaption className="-mt-3 rounded-full bg-ink px-2.5 py-0.5 text-center text-xs leading-tight font-extrabold text-cream shadow">
          {name}
          {tag && <span className="block text-[10px] font-semibold text-cream/70">{tag}</span>}
        </figcaption>
      </figure>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pb-6">
        <output
          key={line}
          aria-live="polite"
          data-line
          className="relative m-0 block w-fit max-w-full animate-[pop-in_180ms_ease-out] rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm leading-snug shadow-lg before:absolute before:bottom-0 before:-left-1.5 before:size-3 before:-skew-x-[30deg] before:bg-white"
        >
          <span className="sr-only">{name}: </span>
          {line}
        </output>
        {me && (
          <p
            key={me}
            data-me
            className="m-0 w-fit max-w-full animate-[pop-in_180ms_ease-out] self-end rounded-2xl rounded-br-sm bg-ink px-3 py-2 text-sm leading-snug text-cream shadow-lg"
          >
            <span className="sr-only">Bạn: </span>
            {me}
          </p>
        )}
      </div>
    </div>
  );
}
