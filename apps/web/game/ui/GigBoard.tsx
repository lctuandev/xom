"use client";

import { content } from "@xom/content";
import type { GigBoardView, GigView, PhotoSessionView } from "@xom/shared";
import { formatClock, gigDeposit, gigFee } from "@xom/sim";
import { useCallback, useEffect, useState } from "react";
import { vnd, vndShort } from "../format";
import { send } from "../net/socket";
import { useGame } from "../store";

type GigIntent =
  | "gig:post"
  | "gig:cancel"
  | "gig:take"
  | "gig:drop"
  | "gig:submit"
  | "gig:review"
  | "gig:dispute";

/**
 * 📸 Thuê nhau (docs/USECASES.md UC-M8): việc người chơi đăng cho nhau, Chú Hai giữ sổ. Chủ quầy trả trước tiền công vào
 * ví giữ hộ để thuê thợ chụp ảnh quầy; hàng xóm nhận việc (đặt cọc), tới tận quầy chụp đúng khoảnh khắc, nộp ảnh; chủ
 * nghiệm thu + chấm sao (quá hạn thì tự trả), không ưng thì khiếu nại để Chú Hai xem ảnh rồi phân xử.
 */
export function GigBoard() {
  const [board, setBoard] = useState<GigBoardView | null>(null);
  const [busy, setBusy] = useState(false);
  const minute = useGame((s) => s.clock?.minute ?? 0);
  const close = useGame((s) => s.openSheet);
  const setGoal = useGame((s) => s.setGoal);
  const setShoot = useGame((s) => s.setShoot);
  const tick = Math.floor(minute / 10);

  const load = useCallback(() => {
    void send("gig:list", {}).then((r) => r.ok && setBoard(r.data));
  }, []);
  useEffect(() => {
    void tick;
    load();
  }, [load, tick]);

  const act = async (event: GigIntent, body: Record<string, unknown>) => {
    setBusy(true);
    // biome-ignore lint/suspicious/noExplicitAny: payload theo từng intent
    const r = await send(event, body as any);
    setBusy(false);
    if (r.ok) setBoard(r.data as GigBoardView);
  };
  const shoot = async (id: string) => {
    setBusy(true);
    const r = await send("gig:shoot", { id });
    setBusy(false);
    if (!r.ok) return;
    close(null);
    setShoot({ ...(r.data as PhotoSessionView), startedAt: Date.now() });
  };

  if (!board) return <p className="text-sm text-ink/50">Đang xem sổ của Chú Hai…</p>;
  const p = content.data.gigs.photo;
  const posted = board.gigs.find(
    (g) => g.posted && (g.status === "OPEN" || g.status === "TAKEN" || g.status === "SUBMITTED"),
  );
  const mine = board.gigs.find(
    (g) => g.taken && (g.status === "TAKEN" || g.status === "SUBMITTED"),
  );
  const others = board.gigs.filter((g) => !g.posted && g !== mine);

  return (
    <section aria-label="Thuê nhau" className="flex flex-col gap-3">
      <p className="text-xs text-ink/60">
        Hàng xóm thuê nhau làm việc, {content.data.contracts.keeper} giữ sổ: người thuê{" "}
        <b>trả trước</b> tiền công cho Chú giữ, làm xong được nghiệm thu mới nhận tiền. Quá{" "}
        {content.data.gigs.reviewMinutes / 60} giờ không nghiệm thu thì Chú tự trả; cãi nhau thì Chú
        xem ảnh rồi phân xử.
      </p>

      {mine && (
        <TakenGig
          g={mine}
          busy={busy}
          onAct={act}
          onShoot={() => void shoot(mine.id)}
          onWalk={() => {
            close(null);
            setGoal({ kind: "drop", lotId: mine.lotId, open: "gigs" });
          }}
        />
      )}

      {posted ? (
        <PostedGig g={posted} busy={busy} onAct={act} />
      ) : (
        board.canPost && <PostForm busy={busy} minute={minute} onPost={act} />
      )}

      <div>
        <p className="mb-1.5 text-sm font-extrabold">📸 Việc chụp ảnh đang tìm người</p>
        <p className="mb-2 text-xs text-ink/60">
          {p.mentor} chỉ nghề: tới tận quầy đang mở, cầm máy chờ đúng lúc (khách cười, món bốc
          khói…) mới bấm. Thuê máy ảnh {vndShort(p.cameraRent)}/việc. Cần 🤝 ≥ {p.minTrust} (bạn
          đang {board.trust}).
        </p>
        {others.filter((g) => g.status === "OPEN").length === 0 && (
          <p className="rounded-2xl bg-white p-3 text-xs text-ink/50 shadow-sm">
            Chưa ai đăng việc. Chủ quầy nào muốn đông khách thì thuê người chụp ảnh quầy nha.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {others.map((g) => {
            const open = g.status === "OPEN" && g.deadline > minute;
            const why = board.lockedUntil
              ? `🔒 Bị khoá tới hết ngày ${board.lockedUntil}`
              : board.trust < p.minTrust
                ? `Cần 🤝 ${p.minTrust}`
                : mine
                  ? "Xong việc đang làm đã"
                  : null;
            return (
              <li
                key={g.id}
                data-gig={g.status}
                className={`rounded-2xl bg-white p-3 shadow-sm ${open ? "" : "opacity-60"}`}
              >
                <p className="text-xs font-semibold text-ink/60">📌 {g.posterName}</p>
                <p className="mt-0.5 text-sm font-semibold leading-snug">
                  Chụp ảnh {g.shopName} ({content.lot(g.lotId).name}) đăng nhóm xóm
                </p>
                <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink/70 tabular-nums">
                  <span>
                    💰 <b className="text-ink">{vnd(g.reward)}</b>
                  </span>
                  <span>🔒 cọc {vndShort(g.deposit)}</span>
                  <span>⏰ trước {formatClock(g.deadline)}</span>
                </p>
                {open ? (
                  <button
                    type="button"
                    disabled={busy || !!why}
                    onClick={() => void act("gig:take", { id: g.id })}
                    className="mt-2 h-10 w-full rounded-xl bg-leaf text-sm font-semibold text-cream disabled:opacity-40"
                  >
                    {why ?? `Nhận việc · đặt cọc ${vndShort(g.deposit)}`}
                  </button>
                ) : (
                  <p className="mt-1.5 text-xs font-semibold text-ink/60">{statusLine(g)}</p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function statusLine(g: GigView) {
  const who = g.taken ? "Bạn" : (g.takerName ?? "Có người");
  switch (g.status) {
    case "TAKEN":
      return `🙋 ${who} đang chụp`;
    case "SUBMITTED":
      return `🖼️ ${who} đã nộp ảnh, chờ nghiệm thu`;
    case "DONE":
      return `✅ ${who} xong việc${g.stars ? ` ${"⭐".repeat(g.stars)}` : ""}`;
    case "REFUNDED":
      return "⚖️ Chú Hai xử hoàn tiền";
    case "FAILED":
      return `❌ ${who} không làm kịp`;
    case "CANCELLED":
      return "Đã gỡ";
    default:
      return "⌛ Hết hạn";
  }
}

/** Chủ quầy đăng việc: chọn tiền công + hạn; trả trước tiền công + phí ghi sổ. */
function PostForm({
  busy,
  minute,
  onPost,
}: {
  busy: boolean;
  minute: number;
  onPost: (e: GigIntent, body: Record<string, unknown>) => Promise<void>;
}) {
  const p = content.data.gigs.photo;
  const [reward, setReward] = useState(p.rewards[1] ?? p.rewards[0] ?? 0);
  const [hours, setHours] = useState(p.hours[1] ?? p.hours[0] ?? 2);
  const fee = gigFee(content, reward);
  const until = Math.min(minute + hours * 60, content.economy.dayEndMinute - 1);
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm" data-gig-post>
      <p className="text-sm font-extrabold">📣 Thuê người chụp ảnh quầy mình</p>
      <p className="mt-0.5 text-xs text-ink/60">
        Ảnh đẹp đăng lên nhóm xóm: khách ghé quầy nhiều hơn tới +{Math.round(p.adBoost * 100)}%
        trong {p.adMinutes / 60} giờ. Nhớ <b>mở quầy</b> để thợ tới chụp.
      </p>
      <p className="mt-2 text-xs font-semibold">Tiền công</p>
      <div className="mt-1 grid grid-cols-3 gap-1.5">
        {p.rewards.map((r) => (
          <Chip key={r} on={r === reward} onClick={() => setReward(r)}>
            {vndShort(r)}
          </Chip>
        ))}
      </div>
      <p className="mt-2 text-xs font-semibold">Hạn làm</p>
      <div className="mt-1 grid grid-cols-3 gap-1.5">
        {p.hours.map((h) => (
          <Chip key={h} on={h === hours} onClick={() => setHours(h)}>
            {h} giờ
          </Chip>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink/70 tabular-nums">
        Trả trước {vnd(reward)} (Chú Hai giữ) + phí ghi sổ {vndShort(fee)} vào quỹ xóm · thợ đặt cọc{" "}
        {vndShort(gigDeposit(content, reward))} · hạn {formatClock(until)}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void onPost("gig:post", { kind: "photo", reward, hours })}
        className="mt-2 h-11 w-full rounded-xl bg-leaf font-semibold text-cream disabled:opacity-40"
      >
        Đăng việc · trả trước {vndShort(reward + fee)}
      </button>
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`h-9 rounded-xl text-sm font-semibold ${on ? "bg-ink text-cream" : "bg-cream ring-1 ring-ink/10"}`}
    >
      {children}
    </button>
  );
}

/** Việc mình đăng: chờ người nhận / đang chụp / nghiệm thu (chấm sao) hoặc khiếu nại. */
function PostedGig({
  g,
  busy,
  onAct,
}: {
  g: GigView;
  busy: boolean;
  onAct: (e: GigIntent, body: Record<string, unknown>) => Promise<void>;
}) {
  const [stars, setStars] = useState(5);
  const pass = content.data.gigs.photo.passQuality;
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm ring-2 ring-sun" data-gig-posted={g.status}>
      <p className="text-xs font-semibold text-ink/60">📣 Việc bạn đăng · {vnd(g.reward)}</p>
      <p className="mt-0.5 text-sm font-semibold">
        {g.status === "OPEN"
          ? `Đang chờ người nhận — hạn ${formatClock(g.deadline)}`
          : g.status === "TAKEN"
            ? `${g.takerName} đang tới chụp — giữ quầy mở nha`
            : `${g.takerName} đã nộp ${g.shots.length} kiểu ảnh`}
      </p>
      {g.status === "OPEN" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAct("gig:cancel", { id: g.id })}
          className="mt-2 w-full text-center text-xs font-semibold text-red"
        >
          Gỡ việc (hoàn {vndShort(g.reward)}, phí ghi sổ không hoàn)
        </button>
      )}
      {g.status === "SUBMITTED" && (
        <div className="mt-2 flex flex-col gap-2">
          <PhotoStrip shots={g.shots} />
          <p className="text-xs text-ink/70" data-gig-quality={g.quality ?? 0}>
            Bộ ảnh đẹp nhất: <b>{g.quality}/100</b>
            {g.takerRating && g.takerRating.gigs > 0
              ? ` · ${g.takerName} ⭐ ${g.takerRating.avg.toFixed(1)} (${g.takerRating.gigs} việc)`
              : ""}
            {g.reviewBy !== null && ` · tự trả lúc ${formatClock(g.reviewBy)}`}
          </p>
          <div className="flex justify-center gap-1" data-stars={stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={n === stars}
                aria-label={`${n} sao`}
                onClick={() => setStars(n)}
                className={`text-2xl ${n <= stars ? "" : "opacity-30 grayscale"}`}
              >
                ⭐
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onAct("gig:dispute", { id: g.id })}
              className="h-10 rounded-xl bg-white text-sm font-semibold shadow-sm ring-1 ring-ink/10"
            >
              ⚖️ Khiếu nại
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onAct("gig:review", { id: g.id, stars })}
              className="h-10 rounded-xl bg-leaf text-sm font-semibold text-cream disabled:opacity-40"
            >
              ✅ Nghiệm thu
            </button>
          </div>
          <p className="text-[11px] text-ink/50">
            Khiếu nại: Chú Hai xem ảnh — từ {pass}/100 là đạt (vẫn trả tiền, bạn mất 🤝), dưới thì
            hoàn tiền công cho bạn.
          </p>
        </div>
      )}
    </div>
  );
}

/** Các tấm đã chụp (điểm từng tấm) — kiểu ảnh thu nhỏ. */
function PhotoStrip({ shots }: { shots: number[] }) {
  if (!shots.length) return null;
  // Các tấm đẹp nhất sẽ được nộp (viền đậm).
  const kept = new Set(
    shots
      .map((s, i) => [s, i] as const)
      .sort((a, b) => b[0] - a[0])
      .slice(0, content.data.gigs.photo.keep)
      .map(([, i]) => i),
  );
  return (
    <div className="flex flex-wrap gap-1.5" data-photo-strip>
      {shots.map((s, i) => {
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: ảnh theo thứ tự chụp
            key={i}
            className={`flex h-12 w-10 flex-col items-center justify-center rounded-md text-[11px] font-bold tabular-nums ${
              s >= 80 ? "bg-leaf/20 text-leaf" : s >= 40 ? "bg-sun/30" : "bg-ink/10 text-ink/50"
            } ${kept.has(i) ? "ring-2 ring-ink/40" : ""}`}
          >
            <span className="text-base">{s >= 80 ? "🌟" : s >= 40 ? "🖼️" : "🌫️"}</span>
            {s}
          </span>
        );
      })}
    </div>
  );
}

/** Việc mình nhận: tới quầy → chụp (thuê máy lần đầu) → nộp; chờ nghiệm thu. */
function TakenGig({
  g,
  busy,
  onAct,
  onShoot,
  onWalk,
}: {
  g: GigView;
  busy: boolean;
  onAct: (e: GigIntent, body: Record<string, unknown>) => Promise<void>;
  onShoot: () => void;
  onWalk: () => void;
}) {
  const p = content.data.gigs.photo;
  const lot = content.lot(g.lotId).name;
  if (g.status === "SUBMITTED")
    return (
      <div
        className="rounded-2xl bg-white p-3 shadow-sm ring-2 ring-sun"
        data-gig-taken="SUBMITTED"
      >
        <p className="text-xs font-semibold text-ink/60">📸 Việc đang làm · {g.posterName}</p>
        <p className="mt-0.5 text-sm font-semibold">
          Đã nộp ảnh ({g.quality}/100) — chờ {g.posterName} nghiệm thu
          {g.reviewBy !== null ? `, chậm nhất ${formatClock(g.reviewBy)} Chú Hai tự trả` : ""}.
        </p>
      </div>
    );
  const left = p.shots - g.shots.length;
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm ring-2 ring-sun" data-gig-taken="TAKEN">
      <p className="text-xs font-semibold text-ink/60">📸 Việc đang làm · {g.posterName}</p>
      <p className="mt-0.5 text-sm font-semibold leading-snug">
        Chụp ảnh {g.shopName} ở {lot} trước {formatClock(g.deadline)}
      </p>
      <ol className="mt-2 flex flex-col gap-1 text-xs">
        <li>1. Tới {lot} khi quầy đang mở</li>
        <li className={g.cameraPaid ? "text-ink/50" : ""}>
          2. Cầm máy chụp — bấm đúng khoảnh khắc ({g.shots.length}/{p.shots} kiểu)
          {!g.cameraPaid && ` · thuê máy ${vndShort(p.cameraRent)}`}
        </li>
        <li>3. Nộp {p.keep} tấm đẹp nhất cho chủ quầy nghiệm thu</li>
      </ol>
      <div className="mt-2">
        <PhotoStrip shots={g.shots} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onWalk}
          className="h-10 rounded-xl bg-white text-sm font-semibold shadow-sm ring-1 ring-ink/10"
        >
          🚶 Tới quầy
        </button>
        <button
          type="button"
          disabled={busy || left <= 0}
          onClick={onShoot}
          className="h-10 rounded-xl bg-ink text-sm font-semibold text-cream disabled:opacity-40"
        >
          📷 Chụp
        </button>
      </div>
      <button
        type="button"
        disabled={busy || g.shots.length < p.keep}
        onClick={() => void onAct("gig:submit", { id: g.id })}
        className="mt-2 h-10 w-full rounded-xl bg-leaf text-sm font-semibold text-cream disabled:opacity-40"
      >
        {g.shots.length < p.keep ? `Chụp ít nhất ${p.keep} kiểu để nộp` : "🖼️ Nộp ảnh"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void onAct("gig:drop", { id: g.id })}
        className="mt-2 w-full text-center text-xs font-semibold text-red"
      >
        Bỏ việc (mất cọc {vndShort(g.deposit)}, 🤝 −{content.data.contracts.trust.fail})
      </button>
    </div>
  );
}
