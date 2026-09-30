"use client";

import { content } from "@xom/content";
import { useGame } from "../store";
import { chooseBranch } from "../tutorial";

/**
 * Điều khiển hội thoại kịch bản. Lời thoại hiện trong khung trên đầu người nói (SpeechBubbles);
 * ở đây chỉ có nút Tiếp / lựa chọn trả lời trong vùng ngón cái (docs/USECASES.md UC-D1).
 */
export function Dialogue() {
  const stepId = useGame((s) => s.dialogue);
  const page = useGame((s) => s.dialoguePage);
  const setPage = useGame((s) => s.setDialoguePage);
  const close = useGame((s) => s.showDialogue);
  if (!stepId) return null;

  const step = content.step(stepId);
  const speaker = step.speaker ? content.speaker(step.speaker) : null;
  const last = page >= step.lines.length - 1;

  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-(--nav-h) z-40 px-3 pb-3">
      <div
        role="dialog"
        aria-label={speaker?.name ?? "Hội thoại"}
        className="rounded-2xl bg-cream/95 p-3 shadow-xl ring-1 ring-ink/10"
      >
        <div className="mb-2 flex items-center gap-2 text-sm">
          <span aria-hidden>🛵</span>
          <p className="font-extrabold">{speaker?.name}</p>
          <span className="ml-auto text-xs text-ink/50 tabular-nums">
            {page + 1}/{step.lines.length}
          </span>
        </div>
        {/* Cho trình đọc màn hình: câu đang nói (khung thoại trên đầu là bản hiển thị). */}
        <p className="sr-only" aria-live="polite">
          {step.lines[page]}
        </p>
        <div className="flex flex-col gap-2">
          {!last ? (
            <button
              type="button"
              onClick={() => setPage(page + 1)}
              className="h-11 rounded-xl bg-ink/5 font-semibold"
            >
              Tiếp ›
            </button>
          ) : step.choices.length > 0 ? (
            step.choices.map((c, i) => (
              <button
                key={c.next}
                type="button"
                onClick={() => {
                  // Câu trả lời của mình hiện trên đầu nhân vật mình.
                  const me = useGame.getState().me;
                  if (me) useGame.getState().say({ who: me.playerId, text: c.text }, 2500);
                  chooseBranch(c.next);
                }}
                className={`h-11 rounded-xl font-semibold ${i === 0 ? "bg-red text-cream" : "bg-white shadow-sm"}`}
              >
                {c.text}
              </button>
            ))
          ) : (
            <button
              type="button"
              onClick={() => close(null)}
              className="h-11 rounded-xl bg-red font-semibold text-cream"
            >
              Dạ, con hiểu rồi
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
