"use client";

import { content } from "@xom/content";
import { useState } from "react";
import { send } from "../net/socket";
import { useGame } from "../store";
import { Counterpart } from "./Counterpart";
import { Sheet } from "./Sheet";

const TOPICS = [
  { id: "greet", label: "👋 Chào hỏi" },
  { id: "price", label: "💰 Hỏi giá cả" },
  { id: "gossip", label: "🗞️ Hỏi chuyện xóm" },
] as const;

/**
 * Nói chuyện với người đứng quầy (UC-D2): lời NPC hiện trên đầu NPC; chào hỏi mỗi ngày tăng
 * thân thiết — thân rồi thì được bớt giá.
 */
export function TalkSheet() {
  const nearPlace = useGame((s) => s.nearPlace);
  const me = useGame((s) => s.me);
  const close = useGame((s) => s.openSheet);
  const say = useGame((s) => s.say);
  const [log, setLog] = useState<{ who: string; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  if (!nearPlace || !me) return null;
  const place = content.place(nearPlace);
  const friendship = me.friendship[nearPlace] ?? 0;
  // Câu mới nhất hiện ở khung đối diện (UC-E5); các câu trước đó lùi xuống lịch sử trong sheet.
  const lastNpc = log.findLast((l) => l.who === "npc");
  const lastMe = log.findLast((l) => l.who === "me");
  const earlier = log.slice(0, -2);

  const ask = async (topic: (typeof TOPICS)[number]) => {
    setBusy(true);
    // Câu hỏi của mình hiện trên đầu nhân vật mình.
    say({ who: me.playerId, text: topic.label.slice(3) }, 2000);
    const res = await send("npc:talk", { npcId: nearPlace, topic: topic.id });
    setBusy(false);
    if (res.ok) {
      setLog((l) => [
        ...l.slice(-4),
        { who: "me", text: topic.label },
        { who: "npc", text: res.data.line },
      ]);
      if (res.data.friendship !== friendship) {
        useGame.setState((s) =>
          s.me
            ? {
                me: {
                  ...s.me,
                  friendship: { ...s.me.friendship, [nearPlace]: res.data.friendship },
                },
              }
            : {},
        );
      }
    }
  };

  return (
    <Sheet
      title={`Nói chuyện với ${place.keeper.name}`}
      onClose={() => close(null)}
      face={
        <Counterpart
          model={place.keeper.model}
          name={place.keeper.name}
          anchor={nearPlace}
          line={lastNpc?.text ?? place.keeper.greeting}
          me={lastMe?.text}
        />
      }
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-semibold text-ink/60">Thân thiết</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10">
          <div className="h-full rounded-full bg-red" style={{ width: `${friendship}%` }} />
        </div>
        <span className="text-xs font-semibold tabular-nums">{friendship}</span>
      </div>
      <ul className="mb-3 flex flex-col gap-1.5">
        {earlier.map((l, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: lịch sử hội thoại chỉ thêm vào cuối
            key={i}
            className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${l.who === "me" ? "self-end bg-red/10" : "self-start bg-white shadow-sm"}`}
          >
            {l.text}
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-3 gap-2">
        {TOPICS.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={busy}
            onClick={() => ask(t)}
            className="h-11 rounded-xl bg-white text-xs font-semibold shadow-sm disabled:opacity-50"
          >
            {t.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
