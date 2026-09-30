"use client";

import { content } from "@xom/content";
import { useState } from "react";
import { send } from "../net/socket";
import { useGame } from "../store";

/** Câu nói nhanh & biểu cảm (UC-D3): hiện trên đầu nhân vật; câu rao hàng kéo thêm khách. */
export function QuickChat() {
  const [open, setOpen] = useState(false);
  const sheet = useGame((s) => s.sheet);
  const kitchen = useGame((s) => s.kitchen);
  const dialogue = useGame((s) => s.dialogue);
  if (sheet || kitchen || dialogue) return null;
  return (
    <div className="pointer-events-auto fixed right-3 bottom-[calc(var(--nav-h)+4.5rem)] z-20 flex flex-col items-end gap-2">
      {open && (
        <ul
          className="flex w-56 flex-col gap-1 rounded-2xl bg-cream p-2 shadow-xl"
          aria-label="Câu nói nhanh"
        >
          {content.data.quickPhrases.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  void send("chat:say", { phraseId: p.id });
                }}
                className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold active:bg-ink/5"
              >
                {p.shout ? "📣 " : ""}
                {p.text}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        aria-label="Nói"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex size-11 items-center justify-center rounded-full bg-cream text-xl shadow-lg"
      >
        💬
      </button>
    </div>
  );
}
