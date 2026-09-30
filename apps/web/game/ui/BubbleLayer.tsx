"use client";

import { content } from "@xom/content";
import { useEffect, useState } from "react";
import { bubbleEls } from "../scene/anchors";
import { type Bubble, useGame } from "../store";

const TONE = {
  say: "bg-cream text-ink ring-1 ring-ink/10",
  ask: "bg-cream text-ink ring-1 ring-ink/10",
  good: "bg-leaf text-cream",
  bad: "bg-red text-cream",
} as const;

/**
 * Khung thoại trên đầu nhân vật (docs/USECASES.md UC-D1): lời nói nhanh, lời NPC, lời khách,
 * và câu đang đọc trong hội thoại kịch bản. Vị trí do BubbleProjector (trong canvas) cập nhật mỗi frame.
 */
export function BubbleLayer() {
  const bubbles = useGame((s) => s.bubbles);
  const dialogue = useGame((s) => s.dialogue);
  const page = useGame((s) => s.dialoguePage);
  const myId = useGame((s) => s.me?.playerId);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const list: [string, Bubble][] = Object.entries(bubbles).filter(
    ([, b]) => !b.until || b.until > now,
  );
  if (dialogue) {
    const step = content.stepById.get(dialogue);
    const line = step?.lines[page];
    if (step?.speaker && line) {
      const i = list.findIndex(([k]) => k === step.speaker);
      if (i >= 0) list.splice(i, 1);
      list.push([step.speaker, { text: line, tone: "say", big: true }]);
    }
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden>
      {list.map(([key, b]) => {
        const name =
          key === myId
            ? null
            : (content.placeById.get(key)?.keeper.name ?? content.speakerById.get(key)?.name);
        return (
          <div
            key={key}
            data-bubble={key}
            ref={(el) => {
              if (el) bubbleEls.set(key, el);
              else bubbleEls.delete(key);
            }}
            className="absolute top-0 left-0 flex flex-col items-center"
            style={{ visibility: "hidden" }}
          >
            <div
              className={`rounded-2xl px-3 py-1.5 text-center leading-snug font-semibold shadow-lg ${TONE[b.tone]} ${
                b.big ? "w-56 text-[13px]" : "w-max max-w-48 text-xs"
              }`}
            >
              {name && <span className="block text-[10px] font-extrabold text-red">{name}</span>}
              {b.text}
            </div>
            <span
              className={`-mt-1.5 size-3 rotate-45 ${b.tone === "good" ? "bg-leaf" : b.tone === "bad" ? "bg-red" : "bg-cream"}`}
            />
          </div>
        );
      })}
    </div>
  );
}
