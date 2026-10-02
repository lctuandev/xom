"use client";

import { content } from "@xom/content";
import type { AtmReceipt } from "@xom/shared";
import { formatClock, pinError } from "@xom/sim";
import { useState } from "react";
import { vnd } from "../format";
import { send } from "../net/socket";
import { useGame } from "../store";
import { Modal } from "./Modal";

// Cây ATM như ngoài đời (docs/USECASES.md UC-I6): đưa thẻ → nhập PIN (lần đầu tạo PIN) → chọn giao dịch → xác nhận
// (rút mất phí) → máy đếm tiền → nhận tiền → in biên lai? → giao dịch khác / nhận lại thẻ. Sai PIN 3 lần máy giữ thẻ.
// Server kiểm vị trí, PIN, số dư; PIN chỉ nằm trong bộ nhớ màn hình này.

type Step =
  | { s: "card" }
  | { s: "newpin"; first?: string; old?: string }
  | { s: "pin" }
  | { s: "menu" }
  | { s: "withdraw" }
  | { s: "deposit" }
  | { s: "custom"; action: "withdraw" | "deposit" }
  | { s: "balance" }
  | { s: "oldpin" }
  | { s: "confirm"; action: "withdraw" | "deposit"; amount: number }
  | { s: "counting"; action: "withdraw" | "deposit" }
  | { s: "take"; receipt: AtmReceipt }
  | { s: "print"; receipt: AtmReceipt }
  | { s: "slip"; receipt: AtmReceipt }
  | { s: "more" }
  | { s: "eject" };

const WITHDRAW = [100_000, 200_000, 500_000, 1_000_000, 2_000_000];
const DEPOSIT = [50_000, 100_000, 200_000, 500_000];

export function AtmSheet() {
  const me = useGame((s) => s.me);
  const atmId = useGame((s) => s.nearAtm);
  const close = useGame((s) => s.openSheet);
  const [step, setStep] = useState<Step>({ s: "card" });
  const [pin, setPin] = useState("");
  const [typed, setTyped] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bank = content.economy.bank;

  if (!me) return null;
  const go = (next: Step) => {
    setMsg(null);
    setTyped("");
    setStep(next);
  };

  const enter = async () => {
    if (busy) return;
    if (step.s === "pin" || step.s === "oldpin") {
      if (typed.length !== 6) return setMsg("Nhập đủ 6 số");
      if (!atmId) return;
      setBusy(true);
      const r = await send("atm:auth", { atmId, pin: typed });
      setBusy(false);
      if (!r.ok) {
        setTyped("");
        setMsg(r.message ?? "Sai mã PIN");
        if (/giữ thẻ/.test(r.message ?? "")) setStep({ s: "card" });
        return;
      }
      if (step.s === "oldpin") return go({ s: "newpin", old: typed });
      setPin(typed);
      return go({ s: "menu" });
    }
    if (step.s === "newpin") {
      const bad = pinError(typed);
      if (bad) {
        setTyped("");
        return setMsg(bad);
      }
      if (!step.first) {
        setTyped("");
        return setStep({ ...step, first: typed });
      }
      if (step.first !== typed) {
        setTyped("");
        setStep({ s: "newpin", old: step.old });
        return setMsg("Hai lần nhập không khớp — nhập lại");
      }
      if (!atmId) return;
      setBusy(true);
      const r = await send("atm:pin", { atmId, pin: typed, old: step.old });
      setBusy(false);
      if (!r.ok) return setMsg(r.message ?? "Không đổi được PIN");
      setPin(typed);
      go({ s: "menu" });
      setMsg(step.old ? "Đổi PIN thành công" : "Tạo PIN thành công");
      return;
    }
    if (step.s === "custom") {
      const amount = Number(typed) * 1000;
      const stepVnd = step.action === "withdraw" ? bank.withdrawStep : bank.depositStep;
      if (!amount || amount % stepVnd !== 0)
        return setMsg(`Nhập bội số ${(stepVnd / 1000).toLocaleString("vi-VN")}.000đ`);
      return go({ s: "confirm", action: step.action, amount });
    }
  };

  const doIt = async (action: "withdraw" | "deposit", amount: number) => {
    if (!atmId) return;
    setBusy(true);
    setStep({ s: "counting", action });
    const [r] = await Promise.all([
      send("atm:use", { atmId, action, amount, pin }),
      new Promise((res) => setTimeout(res, 1200)),
    ]);
    setBusy(false);
    if (!r.ok) {
      go({ s: "menu" });
      setMsg(r.message ?? "Giao dịch không thành công");
      return;
    }
    go({ s: "take", receipt: r.data.receipt });
  };

  const keypadOn =
    step.s === "pin" || step.s === "oldpin" || step.s === "newpin" || step.s === "custom";
  const press = (k: string) => {
    if (!keypadOn) return;
    if (typed.length < 6) setTyped(typed + k);
  };

  const screen = (() => {
    switch (step.s) {
      case "card":
        return me.atm.locked ? (
          <Lines
            title="THẺ ĐANG BỊ GIỮ"
            lines={["Sai PIN quá số lần cho phép.", "Mai quay lại nhận thẻ."]}
          />
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Lines title="XIN CHÀO QUÝ KHÁCH" lines={["Mời đưa thẻ vào khe bên dưới"]} />
            <button
              type="button"
              onClick={() => go(me.atm.hasPin ? { s: "pin" } : { s: "newpin" })}
              className="flex h-14 w-44 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#f5c542] to-[#c98a10] font-bold text-ink shadow-lg active:translate-y-1"
            >
              💳 Đưa thẻ vào
            </button>
          </div>
        );
      case "newpin":
        return (
          <PinScreen
            title={step.old ? "ĐỔI MÃ PIN" : "TẠO MÃ PIN"}
            hint={
              step.first ? "Nhập lại mã PIN mới" : "Nhập mã PIN mới (6 số, không dãy liên tiếp)"
            }
            typed={typed}
          />
        );
      case "pin":
        return <PinScreen title="NHẬP MÃ PIN" hint="Che bàn phím khi nhập nha" typed={typed} />;
      case "oldpin":
        return <PinScreen title="ĐỔI MÃ PIN" hint="Nhập mã PIN hiện tại" typed={typed} />;
      case "menu":
        return (
          <SideMenu
            title="CHỌN GIAO DỊCH"
            items={[
              ["💵 Rút tiền", () => go({ s: "withdraw" })],
              ["🏦 Nộp tiền", () => go({ s: "deposit" })],
              ["🔎 Xem số dư", () => go({ s: "balance" })],
              ["🔑 Đổi PIN", () => go({ s: "oldpin" })],
              ["💳 Nhận lại thẻ", () => go({ s: "eject" })],
            ]}
          />
        );
      case "withdraw":
        return (
          <SideMenu
            title={`RÚT TIỀN · phí ${vnd(bank.withdrawFee)}`}
            items={[
              ...WITHDRAW.map(
                (a) => [vnd(a), () => go({ s: "confirm", action: "withdraw", amount: a })] as const,
              ),
              ["Số khác", () => go({ s: "custom", action: "withdraw" })],
            ]}
          />
        );
      case "deposit":
        return (
          <SideMenu
            title={`NỘP TIỀN · 💵 đang có ${vnd(me.money)}`}
            items={[
              ...DEPOSIT.map(
                (a) => [vnd(a), () => go({ s: "confirm", action: "deposit", amount: a })] as const,
              ),
              ["Số khác", () => go({ s: "custom", action: "deposit" })],
            ]}
          />
        );
      case "custom":
        return (
          <div className="text-center">
            <p className="font-bold">NHẬP SỐ TIỀN (nghìn đồng)</p>
            <p className="my-3 font-mono text-3xl tabular-nums" data-amount={typed}>
              {typed ? `${Number(typed).toLocaleString("vi-VN")}.000đ` : "_"}
            </p>
            <p className="text-xs opacity-80">Bấm Đồng ý để tiếp tục</p>
          </div>
        );
      case "balance":
        return (
          <div className="flex flex-col items-center gap-3 text-center">
            <Lines title="SỐ DƯ TÀI KHOẢN" lines={[]} />
            <p className="font-mono text-3xl tabular-nums" data-bank={me.bank}>
              {vnd(me.bank)}
            </p>
            <ScreenBtn onClick={() => go({ s: "menu" })}>Giao dịch khác</ScreenBtn>
          </div>
        );
      case "confirm": {
        const fee = step.action === "withdraw" ? bank.withdrawFee : 0;
        return (
          <div className="flex flex-col items-center gap-2 text-center">
            <Lines
              title={step.action === "withdraw" ? "XÁC NHẬN RÚT TIỀN" : "XÁC NHẬN NỘP TIỀN"}
              lines={[
                `Số tiền: ${vnd(step.amount)}`,
                step.action === "withdraw" ? `Phí: ${vnd(fee)}` : "Đặt tiền vào khay bên dưới",
              ]}
            />
            <div className="grid w-full grid-cols-2 gap-2">
              <ScreenBtn onClick={() => go({ s: "menu" })}>Huỷ</ScreenBtn>
              <ScreenBtn primary onClick={() => doIt(step.action, step.amount)}>
                Đồng ý
              </ScreenBtn>
            </div>
          </div>
        );
      }
      case "counting":
        return (
          <div className="flex flex-col items-center gap-3 py-4">
            <span className="size-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
            <p className="font-bold">
              {step.action === "withdraw" ? "Máy đang đếm tiền…" : "Máy đang kiểm tiền…"}
            </p>
          </div>
        );
      case "take":
        return (
          <div className="flex flex-col items-center gap-3 text-center">
            <Lines
              title={step.receipt.action === "withdraw" ? "MỜI NHẬN TIỀN" : "NỘP TIỀN THÀNH CÔNG"}
              lines={[vnd(step.receipt.amount)]}
            />
            <ScreenBtn primary onClick={() => go({ s: "print", receipt: step.receipt })}>
              {step.receipt.action === "withdraw" ? "💵 Đã nhận tiền" : "Tiếp tục"}
            </ScreenBtn>
          </div>
        );
      case "print":
        return (
          <div className="flex flex-col items-center gap-3 text-center">
            <Lines title="IN BIÊN LAI?" lines={["Giữ lại để đối chiếu nha"]} />
            <div className="grid w-full grid-cols-2 gap-2">
              <ScreenBtn onClick={() => go({ s: "more" })}>Không</ScreenBtn>
              <ScreenBtn primary onClick={() => go({ s: "slip", receipt: step.receipt })}>
                Có
              </ScreenBtn>
            </div>
          </div>
        );
      case "slip":
        return (
          <div className="flex flex-col items-center gap-2">
            <Receipt r={step.receipt} />
            <ScreenBtn primary onClick={() => go({ s: "more" })}>
              Đã lấy biên lai
            </ScreenBtn>
          </div>
        );
      case "more":
        return (
          <SideMenu
            title="BẠN MUỐN GIAO DỊCH KHÁC?"
            items={[
              ["Có", () => go({ s: "menu" })],
              ["Không — nhận lại thẻ", () => go({ s: "eject" })],
            ]}
          />
        );
      case "eject":
        return (
          <div className="flex flex-col items-center gap-3 text-center">
            <Lines title="MỜI NHẬN LẠI THẺ" lines={["Cảm ơn quý khách!"]} />
            <ScreenBtn
              primary
              onClick={() => {
                setPin("");
                close(null);
              }}
            >
              💳 Nhận thẻ
            </ScreenBtn>
          </div>
        );
    }
  })();

  return (
    <Modal title="🏧 Cây ATM" onClose={() => close(null)}>
      <div
        className="rounded-3xl bg-gradient-to-b from-[#2c5aa0] to-[#173a6e] p-3 shadow-inner"
        data-atm={step.s}
      >
        <div className="mb-1 flex items-center justify-between px-1 text-[10px] font-bold tracking-widest text-white/70">
          <span>NGÂN HÀNG XÓM</span>
          <span>
            💵 {vnd(me.money)} <span className="sr-only">tiền mặt</span>
          </span>
        </div>
        <section
          aria-label="Màn hình ATM"
          className="min-h-56 rounded-2xl border-4 border-[#0d2445] bg-gradient-to-b from-[#0b3d91] to-[#1565c0] p-3 text-white shadow-[inset_0_0_24px_rgba(0,0,0,0.35)]"
        >
          {msg && (
            <p
              className="mb-2 rounded-lg bg-white/15 px-2 py-1 text-center text-sm font-semibold"
              role="alert"
            >
              {msg}
            </p>
          )}
          {screen}
        </section>
        <Keypad
          on={keypadOn}
          onKey={press}
          onClear={() => setTyped(typed.slice(0, -1))}
          onCancel={() => go(pin ? { s: "menu" } : { s: "card" })}
          onEnter={enter}
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="flex h-6 items-center justify-center rounded-md bg-[#0d2445] text-[9px] tracking-widest text-white/50">
            KHE THẺ
          </div>
          <div className="relative flex h-6 items-center justify-center overflow-hidden rounded-md bg-[#0d2445] text-[9px] tracking-widest text-white/50">
            KHE TIỀN
            {step.s === "take" && step.receipt.action === "withdraw" && (
              <span
                className="absolute inset-x-3 -bottom-1 h-4 animate-bounce rounded-sm bg-[#7fbf7f]"
                aria-hidden
              />
            )}
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-ink/60">
        Khách chuyển khoản → tiền vào tài khoản. Rút tiền mất phí {vnd(bank.withdrawFee)}/lần. Lãi{" "}
        {(bank.interestRate * 100).toLocaleString("vi-VN")}%/ngày cho số dư từ{" "}
        {vnd(bank.interestMin)}, tối đa {vnd(bank.interestCap)}/ngày.
      </p>
    </Modal>
  );
}

function Lines({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="text-center">
      <p className="font-bold tracking-wide">{title}</p>
      {lines.map((l) => (
        <p key={l} className="text-sm opacity-90">
          {l}
        </p>
      ))}
    </div>
  );
}

function PinScreen({ title, hint, typed }: { title: string; hint: string; typed: string }) {
  return (
    <div className="text-center">
      <p className="font-bold tracking-wide">{title}</p>
      <p className="text-xs opacity-80">{hint}</p>
      <p className="my-4 flex justify-center gap-2" data-pin-len={typed.length}>
        <span className="sr-only">Đã nhập {typed.length}/6 số</span>
        {Array.from({ length: 6 }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: 6 ô cố định
            key={i}
            className={`size-4 rounded-full border-2 border-white ${i < typed.length ? "bg-white" : ""}`}
          />
        ))}
      </p>
    </div>
  );
}

function SideMenu({
  title,
  items,
}: {
  title: string;
  items: readonly (readonly [string, () => void])[];
}) {
  return (
    <div>
      <p className="mb-2 text-center font-bold tracking-wide">{title}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {items.map(([label, fn]) => (
          <ScreenBtn key={label} onClick={fn}>
            {label}
          </ScreenBtn>
        ))}
      </div>
    </div>
  );
}

function ScreenBtn({
  children,
  onClick,
  primary = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 rounded-lg border px-2 text-sm font-semibold active:scale-95 ${primary ? "border-[#ffe08a] bg-[#f5c542] text-ink" : "border-white/40 bg-white/10 text-white"}`}
    >
      {children}
    </button>
  );
}

function Keypad({
  on,
  onKey,
  onClear,
  onCancel,
  onEnter,
}: {
  on: boolean;
  onKey: (k: string) => void;
  onClear: () => void;
  onCancel: () => void;
  onEnter: () => void;
}) {
  const key =
    "h-10 rounded-lg bg-gradient-to-b from-[#e9eef3] to-[#b9c4cf] font-bold text-ink shadow active:translate-y-0.5 disabled:opacity-50";
  return (
    <fieldset
      className="m-0 mt-3 grid min-w-0 grid-cols-4 gap-1.5 border-0 p-0"
      aria-label="Bàn phím ATM"
    >
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k, i) => (
        <button
          key={k}
          type="button"
          disabled={!on}
          onClick={() => onKey(k)}
          className={key}
          style={{ gridColumn: (i % 3) + 1, gridRow: Math.floor(i / 3) + 1 }}
        >
          {k}
        </button>
      ))}
      <button
        type="button"
        disabled={!on}
        onClick={() => onKey("0")}
        className={key}
        style={{ gridColumn: 2, gridRow: 4 }}
      >
        0
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="h-10 rounded-lg bg-[#d63b2c] text-xs font-bold text-white shadow"
        style={{ gridColumn: 4, gridRow: 1 }}
      >
        Huỷ
      </button>
      <button
        type="button"
        disabled={!on}
        onClick={onClear}
        className="h-10 rounded-lg bg-[#f2c230] text-xs font-bold text-ink shadow disabled:opacity-50"
        style={{ gridColumn: 4, gridRow: 2 }}
      >
        Xoá
      </button>
      <button
        type="button"
        disabled={!on}
        onClick={onEnter}
        className="h-[5.75rem] rounded-lg bg-[#2e9e5b] text-xs font-bold text-white shadow disabled:opacity-50"
        style={{ gridColumn: 4, gridRow: "3 / span 2" }}
      >
        Đồng ý
      </button>
    </fieldset>
  );
}

function Receipt({ r }: { r: AtmReceipt }) {
  return (
    <div
      className="w-full max-w-60 rounded-sm bg-[#fffdf5] p-3 font-mono text-[11px] leading-5 text-ink shadow-lg"
      data-receipt={r.code}
    >
      <p className="text-center font-bold">NGÂN HÀNG XÓM</p>
      <p className="text-center">BIÊN LAI GIAO DỊCH</p>
      <p className="my-1 border-t border-dashed border-ink/40" />
      <p>Mã GD: {r.code}</p>
      <p>Máy: {r.atmId.toUpperCase()}</p>
      <p>
        Ngày {r.day} · {formatClock(r.minute)}
      </p>
      <p>Loại: {r.action === "withdraw" ? "RÚT TIỀN" : "NỘP TIỀN"}</p>
      <p>Số tiền: {vnd(r.amount)}</p>
      <p>Phí: {vnd(r.fee)}</p>
      <p className="my-1 border-t border-dashed border-ink/40" />
      <p className="font-bold">Số dư: {vnd(r.balance)}</p>
      <p className="mt-1 text-center">Cảm ơn quý khách!</p>
    </div>
  );
}
