"use client";

import { content } from "@xom/content";
import { openDue } from "@xom/sim";
import { useEffect, useState } from "react";
import { send, sendWork } from "../net/socket";
import { shopWords } from "../shopWords";
import { useGame } from "../store";
import { sheetForPlace } from "../world";

/**
 * Hành động theo ngữ cảnh, ngay trên thanh điều hướng (vùng ngón cái):
 * bưng cơm khi làm thuê → đưa hàng cho khách → quầy vắng chủ → vào địa điểm đang đứng gần.
 */
export function ActionBar() {
  const sheet = useGame((s) => s.sheet);
  const dialogue = useGame((s) => s.dialogue);
  const kitchen = useGame((s) => s.kitchen);
  const shoot = useGame((s) => s.shoot);
  if (sheet || dialogue || kitchen || shoot) return null;
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(var(--nav-h)+0.5rem)] z-20 flex flex-col items-center gap-2">
      <DoorButton />
      <PurchaseChip />
      <EatingChip />
      <VendorButton />
      <AtmButton />
      <SiteButton />
      <ShopButton />
      <KitchenButton />
      <AwayChip />
      <RideChip />
      <OpenStallButton />
      <EnterShopButton />
      <PlaceButton />
    </div>
  );
}

/** Đứng ở công trường đang thi công: phụ hồ cho Cai thầu (UC-J6). */
function SiteButton() {
  const id = useGame((s) => s.nearSite);
  const openSheet = useGame((s) => s.openSheet);
  if (!id) return null;
  return (
    <button
      type="button"
      onClick={() => openSheet("site")}
      className="pointer-events-auto h-12 w-full max-w-xs rounded-2xl bg-sun px-4 font-semibold shadow-lg active:scale-[0.97]"
    >
      🏗️ Phụ hồ · {content.data.crew.keeper}
    </button>
  );
}

/** Đứng trước cây ATM: rút / gửi tiền (UC-I6). */
function AtmButton() {
  const id = useGame((s) => s.nearAtm);
  const openSheet = useGame((s) => s.openSheet);
  if (!id) return null;
  return (
    <button
      type="button"
      onClick={() => openSheet("atm")}
      className="pointer-events-auto h-12 w-full max-w-xs rounded-2xl bg-[#2c5aa0] px-4 font-semibold text-cream shadow-lg active:scale-[0.97]"
    >
      🏧 Rút / gửi tiền · ATM
    </button>
  );
}

/** Đứng trước sạp đồ ăn NPC đang bày: mua ăn (UC-B9). */
function VendorButton() {
  const id = useGame((s) => s.nearVendor);
  const eating = useGame((s) => s.eating);
  const openSheet = useGame((s) => s.openSheet);
  const v = content.data.vendors.find((x) => x.id === id);
  if (!v || eating) return null;
  return (
    <button
      type="button"
      onClick={() => openSheet("vendor")}
      className="pointer-events-auto h-12 w-full max-w-xs rounded-2xl bg-red px-4 font-semibold text-cream shadow-lg active:scale-[0.97]"
    >
      🍜 Mua ở {v.sign}
    </button>
  );
}

/** Đang ngồi ăn ở sạp: đếm ngược rồi tự đứng dậy. */
function EatingChip() {
  const eating = useGame((s) => s.eating);
  const setEating = useGame((s) => s.setEating);
  useEffect(() => {
    if (!eating) return;
    const id = setTimeout(() => setEating(null), Math.max(0, eating.until - Date.now()));
    return () => clearTimeout(id);
  }, [eating, setEating]);
  if (!eating) return null;
  return (
    <output className="pointer-events-auto block w-full max-w-xs rounded-2xl bg-ink/85 px-3 py-2 text-center text-xs font-semibold text-cream shadow-lg">
      😋 Đang ăn… ngon quá!
    </output>
  );
}

/** Đứng trước quầy hàng xóm đang mở: gọi món (UC-J3). */
function ShopButton() {
  const nearShop = useGame((s) => s.nearShop);
  const purchase = useGame((s) => s.purchase);
  const lot = useGame((s) => s.world.lots.find((l) => l.businessId === s.nearShop));
  const openSheet = useGame((s) => s.openSheet);
  if (!nearShop || purchase || !lot) return null;
  return (
    <button
      type="button"
      onClick={() => openSheet("shop")}
      className="pointer-events-auto h-12 w-full max-w-xs rounded-2xl bg-red px-4 font-semibold text-cream shadow-lg active:scale-[0.97]"
    >
      🛒 Gọi món · quầy {lot.ownerName}
    </button>
  );
}

/** Món mình đã gọi ở quầy hàng xóm: đang chờ / làm sai / xong chờ tính tiền. */
function PurchaseChip() {
  const p = useGame((s) => s.purchase);
  if (!p) return null;
  const text =
    p.stage === "wrong"
      ? `❌ ${p.ownerName} làm sai — đang làm lại`
      : p.stage === "correct"
        ? `✅ Món xong — chờ ${p.ownerName} tính tiền`
        : `⏳ Chờ ${p.ownerName} làm: ${p.dish}`;
  return (
    <output className="pointer-events-auto block w-full max-w-xs rounded-2xl bg-ink/85 px-3 py-2 text-center text-xs font-semibold text-cream shadow-lg">
      {text} · {p.price.toLocaleString("vi-VN")}đ
    </output>
  );
}

/** Thanh đếm ngược cho việc cần làm kịp. */
function useCountdown(expiresAt: number | undefined, windowMs: number) {
  const [left, setLeft] = useState(1);
  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setLeft(Math.max(0, (expiresAt - Date.now()) / windowMs)), 100);
    return () => clearInterval(id);
  }, [expiresAt, windowMs]);
  return left;
}

function Countdown({ left }: { left: number }) {
  return (
    <span className="absolute inset-x-3 bottom-1 h-1 overflow-hidden rounded-full bg-black/15">
      <span className="block h-full rounded-full bg-cream" style={{ width: `${left * 100}%` }} />
    </span>
  );
}

/** Có khách chờ ở quầy: mở màn hình làm món cho khách đến trước. */
function KitchenButton() {
  const orders = useGame((s) => s.orders);
  const atStall = useGame((s) => s.atStall);
  const openKitchen = useGame((s) => s.openKitchen);
  const oldest = orders[0];
  const left = useCountdown(oldest?.expiresAt, oldest ? oldest.expiresAt - oldest.createdAt : 1);
  if (!oldest || !atStall) return null;
  return (
    <button
      type="button"
      onClick={() => openKitchen(oldest.orderId)}
      className="pointer-events-auto relative h-12 w-full max-w-xs rounded-2xl bg-leaf px-4 font-semibold text-cream shadow-lg active:scale-[0.97]"
    >
      👨‍🍳 Làm món cho khách
      {orders.length > 1 && <span className="ml-1 opacity-80">· {orders.length} khách chờ</span>}
      <Countdown left={left} />
    </button>
  );
}

/**
 * 🛵 Xe ôm (UC-N1): đã thuê xe thì đứng đâu cũng mở được bảng chạy xe; khách vẫy thì chip đỏ nhấp nháy, bấm vào để trả giá.
 * Một chip duy nhất theo từng bước (chờ khách → trả giá → chọn đường → chở → thu tiền).
 */
function RideChip() {
  const ride = useGame((s) => s.ride);
  const inside = useGame((s) => s.inside);
  const openSheet = useGame((s) => s.openSheet);
  if (!ride?.bikeToday || inside) return null;
  const who = ride.passenger?.name ?? "khách";
  const [text, tone] =
    ride.stage === "offer"
      ? [`🙋 ${who} vẫy xe — bấm để trả giá`, "bg-red text-cream animate-pulse"]
      : ride.stage === "route"
        ? [`🛵 Chốt giá với ${who} — chọn đường`, "bg-red text-cream"]
        : ride.stage === "riding"
          ? [`🛵 Chở ${who} tới ${ride.dest?.label ?? ""}`, "bg-ink/85 text-cream"]
          : ride.stage === "pay"
            ? [`💵 Tới nơi — thu tiền ${who}`, "bg-leaf text-cream"]
            : ride.stage === "waiting"
              ? ["⏳ Đang đậu xe chờ khách…", "bg-ink/85 text-cream"]
              : ["🛵 Đậu xe ở đây chờ khách", "bg-cream text-ink"];
  return (
    <button
      type="button"
      onClick={() => openSheet("ride")}
      data-ride-chip={ride.stage}
      className={`pointer-events-auto h-11 w-full max-w-xs truncate rounded-2xl px-4 text-sm font-semibold shadow-lg active:scale-[0.97] ${tone}`}
    >
      {text}
    </button>
  );
}

function AwayChip() {
  const open = useGame((s) => s.me?.business?.open ?? false);
  const staff = useGame((s) => s.me?.business?.staff);
  const minute = useGame((s) => s.clock?.minute ?? 0);
  const atStall = useGame((s) => s.atStall);
  const setGoal = useGame((s) => s.setGoal);
  const lotId = useGame((s) => s.me?.business?.lotId);
  if (!open || atStall) return null;
  // Nhân viên trong ca thì quầy vẫn bán (KIENTRUC §2) — không báo gì (góp ý đợt 3: bỏ thông báo "bán dùm"), chỉ nhắc khi vắng
  // chủ mà không ai bán.
  const onDuty = !!staff && minute >= staff.from && minute < staff.to;
  if (staff && onDuty) return null;
  return (
    <div
      className="pointer-events-auto flex w-full max-w-xs items-center justify-between gap-2 rounded-2xl bg-ink/85 py-2 pr-2 pl-3 text-cream shadow-lg"
      data-staff-duty={staff ? "off" : undefined}
    >
      <span className="text-xs font-semibold">
        {shopWords(lotId).Noun} vắng chủ — khách không mua được
        {staff && (
          <span className="block text-[11px] font-normal text-cream/80">
            {staff.name} ngoài giờ làm ({staff.shift})
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={() => setGoal({ kind: "stall" })}
        className="h-9 shrink-0 rounded-xl bg-cream px-3 text-sm font-semibold text-ink"
      >
        Về quầy
      </button>
    </div>
  );
}

function PlaceButton() {
  const nearPlace = useGame((s) => s.nearPlace);
  const openSheet = useGame((s) => s.openSheet);
  const setInside = useGame((s) => s.setInside);
  if (!nearPlace) return null;
  const place = content.place(nearPlace);
  return (
    <div className="pointer-events-auto flex w-full max-w-xs gap-2">
      <button
        type="button"
        onClick={() => {
          // Nơi làm thuê: bước vào không gian riêng; nơi mua bán: mở bảng.
          if (place.kind === "job") setInside(place.id);
          else openSheet(sheetForPlace(nearPlace));
        }}
        className="h-11 flex-1 rounded-2xl bg-red px-3 text-sm font-semibold text-cream shadow-lg active:scale-[0.97]"
      >
        {place.action} · {place.keeper.name}
      </button>
      <button
        type="button"
        onClick={() => openSheet("talk")}
        className="h-11 shrink-0 rounded-2xl bg-cream px-3 text-sm font-semibold shadow-lg active:scale-[0.97]"
      >
        💬 Nói chuyện
      </button>
    </div>
  );
}

/** Đứng ở quầy mà quầy đang đóng: mở hàng ngay tại chỗ. */
function OpenStallButton() {
  const atStall = useGame((s) => s.atStall);
  const biz = useGame((s) => s.me?.business);
  const [busy, setBusy] = useState(false);
  if (!atStall || !biz || biz.open) return null;
  const due = biz.lotId && !biz.rentPaidToday ? openDue(content, biz.lotId, biz.lotOwned) : null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await send("biz:open", {});
        setBusy(false);
      }}
      className="pointer-events-auto h-11 w-full max-w-xs rounded-2xl bg-leaf px-4 text-sm font-semibold text-cream shadow-lg active:scale-[0.97]"
    >
      🔓 {shopWords(biz.lotId).open}
      {due?.rent ? ` · thuê chỗ ${Math.round(due.rent / 1000)}k` : ""}
      {due?.fee
        ? ` · ${due.rent ? "phí" : biz.lotOwned ? "phí + thuế đất" : "thuế khoán"} ${Math.round(due.fee / 1000)}k`
        : ""}
    </button>
  );
}

/** Tiệm trong nhà (UC-W6): đứng trước cửa tiệm của mình → vào tiệm (vào là đứng quầy). */
function EnterShopButton() {
  const atStall = useGame((s) => s.atStall);
  const lotId = useGame((s) => s.me?.business?.lotId);
  const setInside = useGame((s) => s.setInside);
  if (!atStall || !lotId || content.findLot(lotId)?.kind !== "house") return null;
  return (
    <button
      type="button"
      onClick={() => setInside(`shop:${lotId}`)}
      className="pointer-events-auto h-12 w-full max-w-xs rounded-2xl bg-red px-4 font-semibold text-cream shadow-lg active:scale-[0.97]"
    >
      🏪 Vào tiệm
    </button>
  );
}

/** Giao hàng: đứng trước cửa nhà có đơn → gọi khách ra nhận (UC-W5). */
function DoorButton() {
  const nearAddress = useGame((s) => s.nearAddress);
  const shift = useGame((s) => s.shift);
  const [busy, setBusy] = useState(false);
  if (!nearAddress || !shift) return null;
  const here = shift.deliveries.filter(
    (d) => (d.stage === "picked" || d.stage === "later") && d.addressId === nearAddress,
  );
  const target =
    here[0] ?? shift.deliveries.find((d) => d.stage === "picked" || d.stage === "later");
  if (!target) return null;
  const addr = content.data.delivery.addresses.find((a) => a.id === nearAddress);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await sendWork(
          { kind: "call", taskId: target.id, addressId: nearAddress },
          `door:${nearAddress}`,
        );
        setBusy(false);
      }}
      className="pointer-events-auto h-12 w-full max-w-xs rounded-2xl bg-sun px-4 text-sm font-semibold shadow-lg active:scale-[0.97]"
    >
      🔔 Gọi khách · {addr?.label} ({target.code})
    </button>
  );
}
