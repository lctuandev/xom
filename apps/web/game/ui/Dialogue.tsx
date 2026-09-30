"use client";

import { content } from "@xom/content";
import { useState } from "react";
import { useGame } from "../store";
import { chooseBranch } from "../tutorial";

const PORTRAIT: Record<string, string> = { chu_bay: "🛵" };

/** Hội thoại với NPC: lật từng câu, lựa chọn rẽ nhánh ở cuối (kịch bản trong @xom/content). */
export function Dialogue() {
  const stepId = useGame((s) => s.dialogue);
  // key theo bước: đổi bước thì lật lại từ câu đầu.
  return stepId ? <DialogueBox key={stepId} stepId={stepId} /> : null;
}

function DialogueBox({ stepId }: { stepId: string }) {
  const close = useGame((s) => s.showDialogue);
  const [page, setPage] = useState(0);

  const step = content.step(stepId);
  const speaker = step.speaker ? content.speaker(step.speaker) : null;
  const last = page >= step.lines.length - 1;

  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-(--nav-h) z-40 px-3 pb-3">
      <div
        role="dialog"
        aria-label={speaker?.name ?? "Hội thoại"}
        className="rounded-2xl bg-cream p-4 shadow-xl ring-1 ring-ink/10"
      >
        <div className="mb-2 flex items-center gap-2">
          <span
            className="flex size-9 items-center justify-center rounded-full bg-sun text-lg"
            aria-hidden
          >
            {PORTRAIT[speaker?.id ?? ""] ?? "🙂"}
          </span>
          <p className="font-extrabold">{speaker?.name}</p>
          <span className="ml-auto text-xs text-ink/50 tabular-nums">
            {page + 1}/{step.lines.length}
          </span>
        </div>
        <p className="min-h-12 text-[15px] leading-relaxed">{step.lines[page]}</p>
        <div className="mt-3 flex flex-col gap-2">
          {!last ? (
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              className="h-11 rounded-xl bg-ink/5 font-semibold"
            >
              Tiếp ›
            </button>
          ) : step.choices.length > 0 ? (
            step.choices.map((c) => (
              <button
                key={c.next}
                type="button"
                onClick={() => chooseBranch(c.next)}
                className="h-11 rounded-xl bg-red font-semibold text-cream first:bg-red [&:not(:first-child)]:bg-white [&:not(:first-child)]:text-ink [&:not(:first-child)]:shadow-sm"
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
