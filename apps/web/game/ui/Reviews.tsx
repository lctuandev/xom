"use client";

import { content } from "@xom/content";
import type { ReviewsView, ReviewView } from "@xom/shared";
import { useCallback, useEffect, useState } from "react";
import { send } from "../net/socket";

const starText = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);
const MAX = content.data.reviews.maxText;

/** Điểm + số đánh giá gọn một dòng (đầu bảng quầy hàng xóm). */
export function RatingLine({ view }: { view: ReviewsView | null }) {
  if (!view) return null;
  if (view.count === 0) return <span className="text-ink/50">Chưa có đánh giá</span>;
  return (
    <span data-rating={view.avg}>
      <span className="text-sun">★</span> <b className="tabular-nums">{view.avg.toFixed(1)}</b>{" "}
      <span className="text-ink/60">({view.count} đánh giá)</span>
    </span>
  );
}

/** Tải sổ đánh giá một chủ quầy; `reload` gọi lại sau khi viết/trả lời. */
export function useReviews(ownerId: string | null | undefined) {
  const [view, setView] = useState<ReviewsView | null>(null);
  const reload = useCallback(async () => {
    if (!ownerId) return;
    const res = await send("review:list", { ownerId });
    if (res.ok) setView(res.data);
  }, [ownerId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { view, setView, reload };
}

/**
 * Sổ đánh giá quầy (docs/USECASES.md UC-F11): điểm trung bình, phân bố sao, đánh giá mới nhất.
 * Chủ quầy trả lời từng đánh giá (một lần); hàng xóm vừa mua thì viết đánh giá.
 */
export function ReviewBook({
  ownerId,
  owner,
  onChange,
}: {
  ownerId: string;
  owner: boolean;
  /** Báo sổ mới (để dòng tóm tắt bên ngoài cập nhật theo). */
  onChange?: (v: ReviewsView) => void;
}) {
  const { view, setView: set } = useReviews(ownerId);
  const setView = (v: ReviewsView) => {
    set(v);
    onChange?.(v);
  };
  if (!view) return <p className="text-sm text-ink/50">Đang mở sổ…</p>;
  return (
    <section aria-label="Sổ đánh giá" className="flex flex-col gap-2" data-reviews={view.count}>
      <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
        <div className="text-center">
          <p className="text-3xl font-extrabold tabular-nums">
            {view.count ? view.avg.toFixed(1) : "–"}
          </p>
          <p className="text-xs text-ink/60">{view.count} đánh giá</p>
        </div>
        <ul className="flex flex-1 flex-col gap-0.5">
          {[5, 4, 3, 2, 1].map((s) => {
            const n = view.dist[s - 1] ?? 0;
            return (
              <li key={s} className="flex items-center gap-1.5 text-xs">
                <span className="w-3 tabular-nums">{s}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
                  <span
                    className="block h-full rounded-full bg-sun"
                    style={{ width: `${view.count ? (n / view.count) * 100 : 0}%` }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      {view.canWrite && <WriteBox ownerId={ownerId} onDone={setView} />}
      {view.items.length === 0 && (
        <p className="text-sm text-ink/60">
          {owner ? "Chưa ai đánh giá — bán kỹ, khách sẽ ghi sổ." : "Chưa có đánh giá nào."}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {view.items.map((r) => (
          <Item key={r.id} r={r} owner={owner} onDone={setView} />
        ))}
      </ul>
    </section>
  );
}

function Item({
  r,
  owner,
  onDone,
}: {
  r: ReviewView;
  owner: boolean;
  onDone: (v: ReviewsView) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-2xl bg-white p-3 shadow-sm" data-review={r.stars}>
      <p className="flex items-center gap-2 text-xs text-ink/60">
        <span className="text-sm text-sun" title={`${r.stars} sao`}>
          {starText(r.stars)}
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold text-ink">
          {r.authorName}
          {r.fromPlayer && " · 🧑 hàng xóm"}
        </span>
        <span>ngày {r.day}</span>
      </p>
      <p className="mt-1 text-sm">{r.text}</p>
      {r.reply && (
        <p className="mt-1.5 rounded-xl bg-ink/5 px-2.5 py-1.5 text-sm">
          <b>Chủ quầy:</b> {r.reply}
        </p>
      )}
      {owner && !r.reply && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-1.5 h-9 rounded-xl bg-ink/5 px-3 text-sm font-semibold"
        >
          💬 Trả lời
        </button>
      )}
      {owner && !r.reply && open && (
        <ReplyBox
          r={r}
          onDone={(v) => {
            setOpen(false);
            onDone(v);
          }}
        />
      )}
    </li>
  );
}

function ReplyBox({ r, onDone }: { r: ReviewView; onDone: (v: ReviewsView) => void }) {
  const quick = content.data.reviews.quickReplies[r.stars <= 3 ? "bad" : "good"];
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (t: string) => {
    if (!t.trim()) return;
    setBusy(true);
    const res = await send("review:reply", { reviewId: r.id, text: t });
    setBusy(false);
    if (res.ok) onDone(res.data);
  };
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {quick.map((q) => (
          <button
            key={q}
            type="button"
            disabled={busy}
            onClick={() => submit(q)}
            className="rounded-full bg-leaf/15 px-2.5 py-1.5 text-left text-xs font-semibold"
          >
            {q}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          value={text}
          maxLength={MAX}
          onChange={(e) => setText(e.target.value)}
          placeholder="Hoặc tự viết…"
          aria-label="Câu trả lời"
          className="h-10 min-w-0 flex-1 rounded-xl border border-ink/15 bg-white px-3 text-sm"
        />
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={() => submit(text)}
          className="h-10 rounded-xl bg-ink px-3 text-sm font-semibold text-cream disabled:opacity-40"
        >
          Gửi
        </button>
      </div>
      {r.stars <= 3 && (
        <p className="text-xs text-ink/60">Trả lời đàng hoàng đánh giá xấu thì khách bớt giận.</p>
      )}
    </div>
  );
}

function WriteBox({ ownerId, onDone }: { ownerId: string; onDone: (v: ReviewsView) => void }) {
  const [stars, setStars] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-2xl bg-sun/20 p-3" data-write-review>
      <p className="text-sm font-semibold">Bạn vừa mua ở đây — chấm mấy sao?</p>
      <div className="my-1.5 flex gap-1" role="radiogroup" aria-label="Số sao">
        {[1, 2, 3, 4, 5].map((s) => (
          // biome-ignore lint/a11y/useSemanticElements: nút sao to dễ bấm trên mobile, không dùng radio gốc
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={stars === s}
            aria-label={`${s} sao`}
            onClick={() => setStars(s)}
            className={`size-10 rounded-xl text-2xl ${s <= stars ? "text-sun" : "text-ink/25"}`}
          >
            ★
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          value={text}
          maxLength={MAX}
          onChange={(e) => setText(e.target.value)}
          placeholder="Vài chữ cho quầy…"
          aria-label="Lời đánh giá"
          className="h-10 min-w-0 flex-1 rounded-xl border border-ink/15 bg-white px-3 text-sm"
        />
        <button
          type="button"
          disabled={busy || stars === 0 || !text.trim()}
          onClick={async () => {
            setBusy(true);
            const res = await send("review:write", { ownerId, stars, text });
            setBusy(false);
            if (res.ok) onDone(res.data);
          }}
          className="h-10 rounded-xl bg-red px-3 text-sm font-semibold text-cream disabled:opacity-40"
        >
          Gửi
        </button>
      </div>
    </div>
  );
}
