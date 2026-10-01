"use client";

import { content } from "@xom/content";
import { baseSpec, FAME_LABEL, skillLevel } from "@xom/sim";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { audioLevels, setAudioLevels } from "../audio";
import { logout } from "../auth/store";
import { vnd } from "../format";
import { getPlayer } from "../scene/player";
import { useGame } from "../store";
import { isSpicy, setSpicy } from "../voice";
import { nearestAtm } from "../world";
import { Achievements, useMyStats } from "./BoardSheet";
import { Sheet } from "./Sheet";
import { Tabs } from "./Tabs";

// Các bảng của thanh điều hướng mới (docs/PLAN.md — HUD): Nhiệm vụ, Hồ sơ, Cài đặt, Công thức.

function Check({ done, text, hint }: { done: boolean; text: string; hint?: string }) {
  return (
    <li className="flex items-start gap-2 rounded-xl bg-white px-3 py-2 shadow-sm">
      <span
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-leaf text-cream" : "bg-ink/10"}`}
      >
        {done ? "✓" : ""}
      </span>
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${done ? "text-ink/50 line-through" : ""}`}>{text}</p>
        {hint && !done && <p className="text-xs text-ink/60">{hint}</p>}
      </div>
    </li>
  );
}

/**
 * Nhiệm vụ: việc cần làm tiếp theo trong kịch bản + các bước buôn bán (tự tích theo tiến độ thật)
 * + mục tiêu hôm nay. Không thưởng tiền (tiền chỉ đến từ làm việc thật).
 */
export function QuestsSheet() {
  const me = useGame((s) => s.me);
  const roster = useGame((s) => s.roster);
  const atStall = useGame((s) => s.atStall);
  const close = useGame((s) => s.openSheet);
  if (!me) return null;
  const step = content.stepById.get(me.tutorial);
  const biz = me.business;
  const hasStock = me.inventory.some((i) => i.qty > 0);
  return (
    <Sheet title="Nhiệm vụ" onClose={() => close(null)}>
      {step?.objective && (
        <div className="mb-3 rounded-2xl bg-sun/30 p-3">
          <p className="text-xs font-extrabold text-ink/60">ĐANG LÀM</p>
          <p className="font-semibold">🎯 {step.objective}</p>
        </div>
      )}
      <p className="mb-1.5 text-sm font-extrabold">Cách buôn bán (tự tích khi làm xong)</p>
      <ul className="mb-4 flex flex-col gap-1.5">
        <Check done={!!biz} text="1. Mua xe hàng ở vựa xe Ông Sáu" hint="Làm ăn → Tới vựa xe" />
        <Check done={hasStock} text="2. Ra chợ Bà Năm mua nguyên liệu" hint="Nút 🧺 Chợ bên trái" />
        <Check done={!!biz?.lotId} text="3. Chọn chỗ bán, đẩy xe tới" hint="Làm ăn → Chỗ bán" />
        <Check
          done={!!biz?.open && atStall}
          text="4. Đứng sau quầy và mở quầy"
          hint="Khách chỉ ghé khi mình đứng quầy và còn đủ nguyên liệu làm món"
        />
        <Check
          done={me.today.sold > 0}
          text="5. Khách gọi món → làm đúng theo công thức → tính tiền"
          hint="Làm ăn → 📖 Công thức để xem mỗi món cần những gì"
        />
      </ul>
      <p className="mb-1.5 text-sm font-extrabold">Hôm nay</p>
      <ul className="flex flex-col gap-1.5">
        <Check done={me.today.sold >= 5} text={`Bán 5 món (${Math.min(5, me.today.sold)}/5)`} />
        <Check
          done={me.today.wages >= 50_000}
          text={`Làm thuê kiếm 50.000đ (${vnd(Math.min(50_000, me.today.wages))})`}
        />
        <Check
          done={(roster?.peers.length ?? 0) > 1}
          text="Có hàng xóm cùng chơi"
          hint="Hàng xóm → 📨 Mời bạn"
        />
      </ul>
    </Sheet>
  );
}

/** Hồ sơ: tiền, uy tín, hôm nay làm được gì, thân thiết với ai. */
export function ProfileSheet() {
  const me = useGame((s) => s.me);
  const close = useGame((s) => s.openSheet);
  const stats = useMyStats();
  const [tab, setTab] = useState<"me" | "skills" | "badges" | "friends">("me");
  if (!me) return null;
  const friends = Object.entries(me.friendship)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const nameOf = (id: string) =>
    content.placeById.get(id)?.keeper.name ??
    content.speakerById.get(id)?.name ??
    content.data.vendors.find((v) => v.id === id)?.name ??
    id;
  const row = (k: string, v: string) => (
    <div className="flex justify-between border-b border-ink/5 py-1.5 text-sm">
      <span className="text-ink/60">{k}</span>
      <b className="tabular-nums">{v}</b>
    </div>
  );
  return (
    <Sheet title={me.displayName} onClose={() => close(null)}>
      <Tabs
        label="Hồ sơ"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "me", label: "🧑 Tôi" },
          { id: "skills", label: "📈 Kỹ năng" },
          {
            id: "badges",
            label: "🏅 Thành tựu",
            badge: stats?.achievements.filter((a) => a.done).length,
          },
          { id: "friends", label: "🫶 Người quen" },
        ]}
      />
      {tab === "me" && (
        <>
          <div className="mb-3 rounded-2xl bg-white p-3 shadow-sm">
            <div className="flex items-baseline justify-between">
              <p className="font-extrabold">Cấp {me.progress.level}</p>
              <p className="text-xs text-ink/60 tabular-nums">
                {me.progress.into}/{me.progress.need} KN
              </p>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full rounded-full bg-leaf"
                style={{
                  width: `${Math.round((me.progress.into / Math.max(1, me.progress.need)) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-2 text-sm">
              Danh tiếng: <b>{FAME_LABEL[me.progress.fame]}</b> · đã phục vụ {me.progress.served}{" "}
              khách
            </p>
            <p className="text-xs text-ink/60">
              KN có được khi bán món, làm thuê, giao hàng — làm thật mới lên cấp.
            </p>
          </div>
          <div className="rounded-2xl bg-white p-3 shadow-sm">
            {row("💵 Tiền mặt", vnd(me.money))}
            {row("🏦 Tài khoản ngân hàng", vnd(me.bank))}
            {me.business &&
              row(
                "Uy tín quầy",
                `${"★".repeat(Math.round(me.business.reputation * 5))} (${Math.round(me.business.reputation * 100)}%)`,
              )}
            {row("Hôm nay bán", `${me.today.sold} món · ${vnd(me.today.revenue)}`)}
            {row("Tiền boa", vnd(me.today.tips))}
            {row("Làm thuê", vnd(me.today.wages))}
          </div>
          <button
            type="button"
            onClick={() => {
              const p = getPlayer().position;
              const atm = nearestAtm(p.x, p.z);
              if (!atm) return;
              close(null);
              useGame.getState().setGoal({ kind: "atm", id: atm.id, open: "atm" });
            }}
            className="mt-2 h-11 w-full rounded-xl bg-[#2c5aa0] font-semibold text-cream"
          >
            🚶 Tới cây ATM gần nhất
          </button>
        </>
      )}
      {tab === "skills" && <Skills points={me.progress.skills} level={me.progress.level} />}
      {tab === "badges" && <Achievements stats={stats} />}
      {tab === "friends" &&
        (friends.length === 0 ? (
          <p className="text-sm text-ink/60">Chưa thân ai — nói chuyện, mua hàng nhiều sẽ thân.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {friends.map(([id, v]) => (
              <li
                key={id}
                className="flex justify-between rounded-xl bg-white px-3 py-2 text-sm shadow-sm"
              >
                <span className="font-semibold">{nameOf(id)}</span>
                <span>{"❤️".repeat(Math.min(5, Math.ceil(v / 4)))}</span>
              </li>
            ))}
          </ul>
        ))}
    </Sheet>
  );
}

/** Âm lượng nhạc nền, hiệu ứng, giọng nói; tắt tiếng. */
function AudioSettings() {
  const [lv, setLv] = useState(audioLevels);
  const set = (patch: Partial<ReturnType<typeof audioLevels>>) => {
    setAudioLevels(patch);
    setLv(audioLevels());
  };
  const slider = (label: string, key: "music" | "sfx" | "voice" | "ambient") => (
    <label className="flex items-center gap-2 text-sm font-semibold">
      <span className="w-24 shrink-0">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={lv[key]}
        onChange={(e) => set({ [key]: Number(e.target.value) })}
        className="flex-1 accent-red"
        aria-label={label}
      />
    </label>
  );
  return (
    <div className="mb-3 flex flex-col gap-2 rounded-xl bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-extrabold">🔊 Âm thanh</p>
        <button
          type="button"
          onClick={() => set({ muted: !lv.muted })}
          className="h-8 rounded-lg bg-ink/10 px-3 text-xs font-semibold"
        >
          {lv.muted ? "🔇 Đang tắt tiếng" : "Tắt tiếng"}
        </button>
      </div>
      {slider("🎵 Nhạc nền", "music")}
      {slider("🔔 Hiệu ứng", "sfx")}
      {slider("🗣️ Giọng nói", "voice")}
      {slider("🌧️ Môi trường", "ambient")}
    </div>
  );
}

/** Cài đặt: âm thanh, kết nối, hiệu năng, xem lại hướng dẫn, đăng xuất. */
export function SettingsSheet() {
  const router = useRouter();
  const status = useGame((s) => s.status);
  const ping = useGame((s) => s.pingMs);
  const showPerf = useGame((s) => s.showPerf);
  const setShowPerf = useGame((s) => s.setShowPerf);
  const close = useGame((s) => s.openSheet);
  const toast = useGame((s) => s.toast);
  const [resetDone, setResetDone] = useState(false);
  const btn =
    "h-12 w-full rounded-xl bg-white px-3 text-left font-semibold shadow-sm active:bg-ink/5";
  return (
    <Sheet title="Cài đặt" onClose={() => close(null)}>
      <div className="mb-3 flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm shadow-sm">
        <span className={`size-2.5 rounded-full ${status === "online" ? "bg-leaf" : "bg-red"}`} />
        {status === "online" ? `Đang kết nối · ${ping ?? "…"} ms` : "Mất kết nối — đang thử lại"}
      </div>
      <AudioSettings />
      <div className="flex flex-col gap-2">
        <SpicyToggle className={btn} />
        <button type="button" className={btn} onClick={() => setShowPerf(!showPerf)}>
          📊 {showPerf ? "Ẩn số đo hiệu năng" : "Hiện số đo hiệu năng"}
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => {
            try {
              for (const k of Object.keys(localStorage))
                if (k.startsWith("xom:guide:")) localStorage.removeItem(k);
            } catch {}
            setResetDone(true);
            toast({ kind: "info", text: "Lần tới vào làm sẽ được chỉ việc lại từ đầu" });
          }}
        >
          🎓 {resetDone ? "Đã bật lại hướng dẫn" : "Xem lại hướng dẫn vào làm"}
        </button>
        <button
          type="button"
          className={`${btn} text-red`}
          onClick={async () => {
            await logout();
            router.replace("/dang-nhap");
          }}
        >
          🚪 Đăng xuất
        </button>
      </div>
    </Sheet>
  );
}

/**
 * Công thức (sổ tay): mỗi món trong nghề của mình gồm những bước nào, mỗi bước bỏ gì;
 * khách hay dặn thêm những gì. Chưa có nghề thì xem được mọi nghề.
 */
export function RecipeSheet() {
  const me = useGame((s) => s.me);
  const close = useGame((s) => s.openSheet);
  const products = content.data.products;
  const [pid, setPid] = useState(me?.business?.productId ?? products[0]?.id ?? "");
  const product = content.product(pid);
  const recipe = product.recipe;
  return (
    <Sheet title="📖 Công thức" onClose={() => close(null)}>
      <div className="mb-3 flex gap-1.5 overflow-x-auto">
        {products.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={p.id === pid}
            onClick={() => setPid(p.id)}
            className="h-9 shrink-0 rounded-full bg-white px-3 text-sm font-semibold shadow-sm aria-pressed:bg-ink aria-pressed:text-cream"
          >
            {p.emoji} {p.name}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {recipe.variants.map((v) => {
          const spec = baseSpec(recipe, v.id);
          return (
            <section key={v.id} aria-label={v.name} className="rounded-2xl bg-white p-3 shadow-sm">
              <p className="font-extrabold first-letter:uppercase">
                {v.name}{" "}
                <span className="text-sm font-semibold text-ink/50">· {vnd(v.refPrice)}</span>
              </p>
              <ol className="mt-1 flex flex-col gap-0.5 text-sm">
                {recipe.steps.map((st, i) => {
                  const sel = spec[st.id];
                  const ids = Array.isArray(sel) ? sel : typeof sel === "string" ? [sel] : [];
                  const opts = ids
                    .map((id) => st.options.find((o) => o.id === id))
                    .filter((o) => o !== undefined);
                  return (
                    <li key={st.id}>
                      <b>
                        {i + 1}. {st.label}:
                      </b>{" "}
                      {st.kind === "action" || st.kind === "hold"
                        ? (st.verb ?? "làm bước này")
                        : opts.length
                          ? opts.map((o) => `${o.emoji} ${o.label}`).join(", ")
                          : "không bỏ gì"}
                      {st.pick && <span className="text-ink/50"> (khách tự chọn)</span>}
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
        {recipe.mods.length > 0 && (
          <p className="rounded-xl bg-sun/20 p-2.5 text-sm">
            <b>Khách hay dặn:</b> {recipe.mods.map((m) => m.say).join(" · ")} — nhớ làm đúng lời
            dặn.
          </p>
        )}
      </div>
    </Sheet>
  );
}

/** Kỹ năng (DESIGN §4) + những thứ mở khoá theo cấp (Luật 4.2). */
function Skills({ points, level }: { points: Record<string, number | undefined>; level: number }) {
  return (
    <section aria-label="Kỹ năng" className="mb-3 rounded-2xl bg-white p-3 shadow-sm">
      <p className="mb-1.5 text-sm font-extrabold">Kỹ năng</p>
      <ul className="flex flex-col gap-2">
        {content.data.skills.map((s) => {
          const p = points[s.id] ?? 0;
          const lv = skillLevel(s, p);
          const into = lv >= s.max ? s.per : p - lv * s.per;
          return (
            <li key={s.id} data-skill={s.id} data-level={lv}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-semibold">
                  {s.emoji} {s.name}
                </span>
                <span className="text-xs text-ink/60">
                  Bậc {lv}/{s.max}
                </span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-ink/10">
                <div
                  className="h-full rounded-full bg-sun"
                  style={{ width: `${Math.round((into / s.per) * 100)}%` }}
                />
              </div>
              <p className="text-[11px] text-ink/60">{s.description}</p>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 mb-1 text-sm font-extrabold">Mở khoá theo cấp</p>
      <ul className="flex flex-col gap-1 text-sm">
        {content.data.unlocks.map((u) => (
          <li key={u.id} className={level >= u.level ? "" : "text-ink/50"}>
            {level >= u.level ? "✅" : "🔒"} Cấp {u.level}: {u.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Bật/tắt "thoại mặn": khách teencode, đôi khi hơi tục nhẹ (UC-D6). */
function SpicyToggle({ className }: { className: string }) {
  const [on, setOn] = useState(isSpicy);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={className}
      onClick={() => {
        setSpicy(!on);
        setOn(!on);
      }}
    >
      🌶️ Thoại mặn: {on ? "Bật — khách nói teencode, đôi khi hơi tục" : "Tắt — lời lẽ hiền"}
    </button>
  );
}
