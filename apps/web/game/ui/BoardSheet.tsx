"use client";

import { content } from "@xom/content";
import type { AwardView, MyStatsView, XomBoardView } from "@xom/shared";
import { useEffect, useState } from "react";
import { districtLikes, xomFame } from "../districts";
import { vndShort } from "../format";
import { send } from "../net/socket";
import { useGame } from "../store";
import { Modal } from "./Modal";
import { Tabs } from "./Tabs";

/** Hiện giá trị theo kiểu hạng mục: tiền, số món, sao, phần trăm, điểm. */
function valueText(metric: AwardView["metric"], v: number): string {
  switch (metric) {
    case "revenue":
    case "profit":
    case "wages":
      return vndShort(v);
    case "served":
      return `${v} món`;
    case "rating":
      return `★ ${v.toFixed(1)}`;
    case "growth":
      return `+${Math.round(v * 100)}%`;
    case "friendly":
      return `${v} điểm`;
  }
}

type Tab = "awards" | "shares" | "trends" | "districts";
const TABS: { id: Tab; label: string }[] = [
  { id: "awards", label: "🏆 Giải tuần" },
  { id: "shares", label: "📊 Thị phần" },
  { id: "trends", label: "🔥 Đang hot" },
  { id: "districts", label: "🏙️ Khu phố" },
];

/**
 * Bảng xóm (docs/USECASES.md UC-P2): nhiều hạng mục — ai cũng có đường nổi bật, không chỉ người giàu nhất;
 * tính 7 ngày gần nhất nên người mới vẫn có cửa. Thị phần theo món, tin "đang hot".
 */
export function BoardSheet() {
  const close = useGame((s) => s.openSheet);
  const myId = useGame((s) => s.me?.playerId);
  const [tab, setTab] = useState<Tab>("awards");
  const [board, setBoard] = useState<XomBoardView | null>(null);
  useEffect(() => {
    void send("stats:xom", {}).then((res) => {
      if (res.ok) setBoard(res.data);
    });
  }, []);

  return (
    <Modal title="Bảng xóm" onClose={() => close(null)}>
      <Tabs label="Bảng xóm" value={tab} onChange={setTab} tabs={TABS} />
      {!board && tab !== "districts" && <p className="text-sm text-ink/50">Đang tổng hợp…</p>}
      {tab === "districts" && <Districts />}
      {board && tab === "awards" && (
        <>
          <p className="mb-2 text-xs text-ink/60">
            7 ngày gần nhất (ngày {Math.max(1, board.day - 6)}–{board.day}) · {board.players} người
            trong xóm. Mỗi giải một kiểu giỏi — không chỉ người nhiều tiền.
          </p>
          <ul className="flex flex-col gap-2">
            {board.awards.map((a) => (
              <li
                key={a.id}
                className="overflow-hidden rounded-2xl bg-gradient-to-b from-[#fff6dc] to-white p-3 shadow-sm"
                data-award={a.id}
              >
                <p className="text-center font-extrabold">
                  {a.emoji} {a.name}
                </p>
                <p className="mb-2 text-center text-xs text-ink/60">{a.description}</p>
                <Podium award={a} myId={myId} />
              </li>
            ))}
          </ul>
        </>
      )}
      {board && tab === "shares" && (
        <>
          <p className="mb-2 text-xs text-ink/60">
            Phần trăm số món bán ra trong xóm 7 ngày qua — đối thủ giảm giá, khai trương, làm ngon
            hơn thì thị phần đổi.
          </p>
          {board.shares.length === 0 && (
            <p className="text-sm text-ink/50">Chưa quầy nào bán được món nào.</p>
          )}
          <ul className="flex flex-col gap-2">
            {board.shares.map((s) => (
              <li
                key={s.productId}
                className="rounded-2xl bg-white p-3 shadow-sm"
                data-share={s.productId}
              >
                <p className="mb-1.5 font-extrabold">
                  {content.product(s.productId).emoji} {content.product(s.productId).name}
                  <span className="font-normal text-ink/60"> · {s.total} món</span>
                </p>
                <ul className="flex flex-col gap-1">
                  {s.entries.map((e) => (
                    <li key={e.playerId} className="text-sm">
                      <div className="flex justify-between">
                        <span className={e.playerId === myId ? "font-extrabold text-red" : ""}>
                          {e.name}
                        </span>
                        <span className="tabular-nums">{Math.round(e.share * 100)}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
                        <div
                          className="h-full rounded-full bg-leaf"
                          style={{ width: `${e.share * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
      {board && tab === "trends" && (
        <ul className="flex flex-col gap-1.5" data-trends>
          {board.trends.map((t) => (
            <li
              key={t.text}
              className="flex items-start gap-2 rounded-xl bg-white px-3 py-2.5 text-sm shadow-sm"
            >
              <span aria-hidden>{t.emoji}</span>
              <span>{t.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** Khung từng hạng: vàng (vương miện, viền sáng xoay), bạc, đồng; bục cao thấp theo hạng. */
const RANKS = [
  {
    ring: "from-[#fff7c2] via-[#f5c542] to-[#b8780a]",
    avatar: "size-16 text-2xl",
    block: "h-20 from-[#ffe08a] to-[#d99a1e]",
    label: "text-[#8a5a00]",
  },
  {
    ring: "from-white via-[#cfd8e2] to-[#7d8b99]",
    avatar: "size-13 text-xl",
    block: "h-14 from-[#eef2f6] to-[#a9b6c3]",
    label: "text-[#4f5b66]",
  },
  {
    ring: "from-[#ffe1c2] via-[#d4894a] to-[#7c4318]",
    avatar: "size-12 text-lg",
    block: "h-10 from-[#f5c49a] to-[#b8682e]",
    label: "text-[#6e3a12]",
  },
] as const;

/** Bục vinh danh 2 – 1 – 3 (hạng 1 ở giữa, cao nhất). */
function Podium({ award, myId }: { award: AwardView; myId: string | undefined }) {
  if (award.entries.length === 0)
    return <p className="text-center text-sm text-ink/50">Chưa ai — cơ hội cho bạn!</p>;
  return (
    <ol className="grid grid-cols-3 items-end gap-1.5" aria-label={`Top ${award.name}`}>
      {[1, 0, 2].map((rank) => {
        const e = award.entries[rank];
        const r = RANKS[rank];
        if (!r) return null;
        const me = e?.playerId === myId;
        return (
          <li key={rank} className="flex min-w-0 flex-col items-center" data-rank={rank + 1}>
            {e ? (
              <>
                <div className="relative mb-1 flex flex-col items-center">
                  {rank === 0 && (
                    <span className="-mb-1.5 text-2xl drop-shadow" aria-hidden>
                      👑
                    </span>
                  )}
                  <div className="relative">
                    {rank === 0 && (
                      <span
                        aria-hidden
                        className="motion-safe-only absolute -inset-1.5 animate-[spin-slow_6s_linear_infinite] rounded-full bg-[conic-gradient(from_0deg,#fff3b0,#f5c542,#fff,#e0a020,#fff3b0)] opacity-80"
                      />
                    )}
                    <div
                      className={`relative rounded-full bg-gradient-to-br p-[3px] shadow-md ${r.ring} ${rank === 0 ? "motion-safe-only animate-[glow_2.4s_ease-in-out_infinite]" : ""}`}
                    >
                      <div
                        className={`flex items-center justify-center rounded-full bg-cream font-extrabold ${r.avatar} ${me ? "text-red" : "text-ink"}`}
                      >
                        {e.name.trim().charAt(0).toUpperCase()}
                      </div>
                    </div>
                    {rank === 0 && (
                      <span className="absolute -top-1 -right-2 text-sm" aria-hidden>
                        ✨
                      </span>
                    )}
                  </div>
                </div>
                <p
                  className={`w-full truncate text-center text-xs font-extrabold ${me ? "text-red" : ""}`}
                >
                  {e.name}
                  {me && " (bạn)"}
                </p>
                <p className="mb-1 text-center text-[11px] tabular-nums text-ink/70">
                  {valueText(award.metric, e.value)}
                </p>
              </>
            ) : (
              <div className="mb-1 flex size-12 items-center justify-center rounded-full border-2 border-dashed border-ink/15 text-ink/30">
                ?
              </div>
            )}
            <div
              className={`flex w-full items-start justify-center rounded-t-xl bg-gradient-to-b pt-1 shadow-inner ${r.block}`}
            >
              <span className={`text-lg font-black ${r.label}`}>{rank + 1}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Tải số liệu của mình (7 ngày + thành tựu). */
export function useMyStats() {
  const [stats, setStats] = useState<MyStatsView | null>(null);
  useEffect(() => {
    void send("stats:me", {}).then((res) => {
      if (res.ok) setStats(res.data);
    });
  }, []);
  return stats;
}

/** Biểu đồ 7 ngày của quầy + so với trung bình quầy cùng món trong xóm (chỉ đưa số, người chơi tự rút ra). */
export function WeekChart({ stats }: { stats: MyStatsView | null }) {
  if (!stats) return <p className="text-sm text-ink/50">Đang tính…</p>;
  const max = Math.max(1, ...stats.days.map((d) => Math.max(d.revenue, d.profit)));
  const sold = stats.days.filter((d) => d.served > 0);
  const myRevenue = sold.length ? sold.reduce((a, d) => a + d.revenue, 0) / sold.length : 0;
  const myServed = sold.length ? sold.reduce((a, d) => a + d.served, 0) / sold.length : 0;
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm" data-week>
      <div className="flex h-28 items-end justify-center gap-1.5" title="Doanh thu 7 ngày">
        {stats.days.map((d) => (
          <div
            key={d.day}
            className="flex h-full max-w-12 flex-1 flex-col items-center justify-end gap-0.5"
          >
            <span className="text-[10px] tabular-nums text-ink/60">
              {d.revenue ? vndShort(d.revenue) : ""}
            </span>
            <div className="relative flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t-md bg-sun"
                style={{ height: `${(d.revenue / max) * 100}%` }}
                title={`Doanh thu ngày ${d.day}`}
              />
              {d.profit > 0 && (
                <div
                  className="absolute bottom-0 left-1/4 w-1/2 rounded-t-sm bg-leaf"
                  style={{ height: `${(d.profit / max) * 100}%` }}
                  title={`Lãi ngày ${d.day}`}
                />
              )}
            </div>
            <span className="text-[10px] text-ink/60">N{d.day}</span>
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs text-ink/60">
        <span className="mr-1 inline-block size-2 rounded-sm bg-sun" />
        Doanh thu
        <span className="mr-1 ml-3 inline-block size-2 rounded-sm bg-leaf" />
        Lãi (sau tiền hàng, thuê, phí)
      </p>
      {stats.avg && stats.avg.stalls > 1 && (
        <table className="mt-2 w-full text-sm" data-compare>
          <thead>
            <tr className="text-xs text-ink/60">
              <th className="text-left font-normal">Mỗi ngày có bán</th>
              <th className="text-right font-normal">Bạn</th>
              <th className="text-right font-normal">TB {stats.avg.stalls} quầy</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            <tr>
              <td>Doanh thu</td>
              <td className="text-right">{vndShort(myRevenue)}</td>
              <td className="text-right">{vndShort(stats.avg.revenue)}</td>
            </tr>
            <tr>
              <td>Số món</td>
              <td className="text-right">{Math.round(myServed)}</td>
              <td className="text-right">{stats.avg.served}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Thành tựu: cái đã mở + tiến độ cái chưa (Hồ sơ). */
export function Achievements({ stats }: { stats: MyStatsView | null }) {
  if (!stats) return null;
  const done = stats.achievements.filter((a) => a.done).length;
  return (
    <section aria-label="Thành tựu" className="rounded-2xl bg-white p-3 shadow-sm">
      <p className="mb-2 font-extrabold">
        🏅 Thành tựu{" "}
        <span className="font-normal text-ink/60">
          {done}/{stats.achievements.length}
        </span>
      </p>
      <ul className="grid grid-cols-2 gap-1.5">
        {stats.achievements.map((a) => (
          <li
            key={a.id}
            data-achievement={a.id}
            data-done={a.done}
            className={`rounded-xl p-2 text-xs ${a.done ? "bg-sun/30" : "bg-ink/5 text-ink/60"}`}
          >
            <p className="text-sm font-semibold">
              <span className={a.done ? "" : "grayscale"}>{a.emoji}</span> {a.name}
            </p>
            <p>{a.description}</p>
            {!a.done && (
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink/10">
                <div className="h-full bg-leaf" style={{ width: `${(a.value / a.goal) * 100}%` }} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Khu phố (docs/THEGIOI.md §3): mỗi khu hợp hàng gì, đang có bao nhiêu quầy mở; khu tụ đủ quầy cùng nhóm thì "có tiếng"
 * (khu ăn uống, phố sửa xe…) — người qua lại tăng cho cả nhóm. Người chơi mở quầy là đang xây khu phố.
 */
function Districts() {
  const lots = useGame((s) => s.world.lots);
  const fame = xomFame(lots);
  const groups = content.data.districtFame.groups;
  return (
    <>
      <p className="mb-2 text-xs text-ink/60">
        Nhiều quầy cùng loại hàng mở chung một khu thì khu có tiếng — người qua lại đông hơn cho cả
        khu.
      </p>
      <ul className="flex flex-col gap-2">
        {content.data.trafficProfiles.map((t) => {
          const here = fame.filter((f) => f.trafficId === t.id);
          const open = here.reduce((n, f) => n + f.shops, 0);
          const named = here.filter((f) => f.named).sort((a, b) => b.shops - a.shops);
          return (
            <li key={t.id} className="rounded-2xl bg-white p-3 shadow-sm" data-district={t.id}>
              <p className="flex items-center justify-between font-extrabold">
                <span>
                  {t.emoji} {t.name}
                </span>
                <span className="text-xs font-semibold text-ink/60">{open} quầy đang mở</span>
              </p>
              <p className="text-xs text-leaf">{districtLikes(t.id)}</p>
              {named.map((f) => {
                const g = groups.find((x) => x.id === f.groupId);
                return (
                  <p key={f.groupId} className="mt-1 text-sm font-semibold" data-fame={f.groupId}>
                    {g?.emoji} Đang thành {g?.name} · +{Math.round(f.bonus * 100)}% người qua lại
                  </p>
                );
              })}
            </li>
          );
        })}
      </ul>
    </>
  );
}
