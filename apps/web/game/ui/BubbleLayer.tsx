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
  tag: "bg-ink/70 text-cream",
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
  const roster = useGame((s) => s.roster);
  const inside = useGame((s) => s.inside);
  const facing = useGame((s) => s.facing);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  // Đang đứng nói chuyện trong khung chân dung thì lời hai bên đã hiện ở đó — không lặp trên đầu nhân vật.
  const list: [string, Bubble][] = Object.entries(bubbles).filter(
    ([k, b]) => (!b.until || b.until > now) && !(facing && (k === facing || k === myId)),
  );
  // Hàng xóm (người chơi thật): ngoài phố luôn có bảng tên trên đầu; trong quán chỉ nghe người cùng quán.
  const peers = new Map((roster?.peers ?? []).filter((p) => p.id !== myId).map((p) => [p.id, p]));
  for (let i = list.length - 1; i >= 0; i--) {
    const peer = peers.get(list[i]?.[0] ?? "");
    if (peer && peer.inside !== inside) list.splice(i, 1);
  }
  if (!inside) {
    for (const p of peers.values()) {
      if (!p.inside && !list.some(([k]) => k === p.id))
        list.push([p.id, { text: p.name, tone: "tag" }]);
    }
  }
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
            : b.tone === "tag"
              ? null
              : (peers.get(key)?.name ??
                content.placeById.get(key)?.keeper.name ??
                content.speakerById.get(key)?.name);
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
              className={`text-center leading-snug font-semibold ${TONE[b.tone]} ${
                b.tone === "tag"
                  ? "w-max max-w-32 truncate rounded-full px-2 py-0.5 text-[10px]"
                  : `rounded-2xl px-3 py-1.5 shadow-lg ${b.big ? "w-56 text-[13px]" : "w-max max-w-48 text-xs"}`
              }`}
            >
              {name && <span className="block text-[10px] font-extrabold text-red">{name}</span>}
              {b.text}
            </div>
            {b.tone !== "tag" && (
              <span
                className={`-mt-1.5 size-3 rotate-45 ${b.tone === "good" ? "bg-leaf" : b.tone === "bad" ? "bg-red" : "bg-cream"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
