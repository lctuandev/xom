"use client";

import { content } from "@xom/content";
import { useEffect, useRef, useState } from "react";
import { send } from "../net/socket";
import { useGame } from "../store";
import { IconChat } from "./icons";

/**
 * Chat (UC-D3, UC-D4): gõ chữ hoặc chọn câu nói nhanh — hiện trên đầu nhân vật cho cả xóm; câu rao hàng kéo thêm khách.
 * Icon bong bóng không nền (góp ý UX); bảng chat có lịch sử 30 câu gần nhất trong xóm.
 */
export function QuickChat() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const sheet = useGame((s) => s.sheet);
  const kitchen = useGame((s) => s.kitchen);
  const dialogue = useGame((s) => s.dialogue);
  const log = useGame((s) => s.chatLog);
  const [seen, setSeen] = useState(0);
  const listRef = useRef<HTMLOListElement>(null);
  const last = log.at(-1)?.id ?? 0;
  useEffect(() => {
    if (!open) return;
    setSeen(last);
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [open, last]);
  if (sheet || kitchen || dialogue) return null;
  const unread = log.filter((m) => m.id > seen && !m.mine).length;

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    const r = await send("chat:text", { text: t });
    setBusy(false);
    if (r.ok) setText("");
  };

  return (
    <div className="pointer-events-auto fixed right-2 bottom-[calc(var(--nav-h)+4.5rem)] z-20 flex flex-col items-end gap-2">
      {open && (
        <section
          aria-label="Chat xóm"
          className="flex w-[min(20rem,calc(100vw-1.5rem))] flex-col gap-2 rounded-2xl bg-cream p-2 shadow-xl"
        >
          <ol ref={listRef} className="flex max-h-40 flex-col gap-1 overflow-y-auto" data-chat-log>
            {log.length === 0 && (
              <li className="px-1 text-xs text-ink/50">Chưa ai nói gì — chào cả xóm một câu đi!</li>
            )}
            {log.map((m) => (
              <li
                key={m.id}
                className={`max-w-[85%] rounded-xl px-2.5 py-1.5 text-sm ${m.mine ? "self-end bg-sun/40" : "self-start bg-white shadow-sm"}`}
              >
                {!m.mine && <b className="mr-1 text-xs text-red">{m.name}</b>}
                {m.text}
              </li>
            ))}
          </ol>
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <input
              value={text}
              maxLength={80}
              onChange={(e) => setText(e.target.value)}
              placeholder="Nói gì với cả xóm…"
              aria-label="Tin nhắn"
              enterKeyHint="send"
              className="h-10 min-w-0 flex-1 rounded-xl border border-ink/15 bg-white px-3 text-sm"
            />
            <button
              type="submit"
              disabled={busy || !text.trim()}
              className="h-10 rounded-xl bg-red px-3 text-sm font-semibold text-cream disabled:opacity-40"
            >
              Gửi
            </button>
          </form>
          <ul className="flex flex-wrap gap-1" aria-label="Câu nói nhanh">
            {content.data.quickPhrases.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void send("chat:say", { phraseId: p.id });
                  }}
                  className="rounded-full bg-white px-2.5 py-1.5 text-xs font-semibold shadow-sm active:bg-ink/5"
                >
                  {p.shout ? "📣 " : ""}
                  {p.text}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <button
        type="button"
        aria-label="Nói"
        title="Chat với cả xóm"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-12 items-center justify-center active:scale-90"
      >
        <IconChat className="icon-halo size-11" />
        {unread > 0 && !open && (
          <span className="absolute -top-0.5 -right-0.5 rounded-full bg-red px-1.5 text-xs font-bold text-cream">
            {unread}
          </span>
        )}
      </button>
    </div>
  );
}
