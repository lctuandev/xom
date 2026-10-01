import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type { AtmReceipt, DayReportView, MeView, OrderEvent } from "@xom/shared";
import { bankWallet, LedgerService, playerWallet, SYSTEM } from "../src/economy/ledger.service.js";
import { GameService } from "../src/game/game.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { changeFor, emit, join, next, openBanhMiStall } from "./client.js";
import { startApp } from "./helpers.js";

// Tách 💵 tiền mặt / 🏦 ngân hàng (docs/USECASES.md UC-I6, DESIGN §2).

describe("Ngân hàng (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  const START = content.economy.startingMoney;
  /** Vốn dự phòng có sẵn trong tài khoản người mới. */
  const B0 = content.economy.startingBank;
  const balance = (key: string) => app.get(LedgerService).balance(app.get(PrismaService), key);

  it("khách chuyển khoản → tiền vào 🏦 tài khoản; trả tiền mặt → vào 💵 ví", async () => {
    const { socket, snap } = await openBanhMiStall(url);
    const id = snap.me.playerId;
    const seen = { transfer: false, cash: false };
    while (!seen.transfer || !seen.cash) {
      const o: OrderEvent = await next(socket, "order");
      // Server giới hạn 20 thao tác/giây (UC-L4) — đừng bấm dồn dập.
      await new Promise((r) => setTimeout(r, 120));
      const kind = o.pay.kind;
      if (seen[kind]) {
        await emit(socket, "order:decline", { orderId: o.orderId });
        continue;
      }
      const [cash0, bank0] = [await balance(playerWallet(id)), await balance(bankWallet(id))];
      const made = await emit(socket, "order:make", { orderId: o.orderId, build: o.spec });
      if (!made.ok) {
        await emit(socket, "order:decline", { orderId: o.orderId });
        continue;
      }
      const paid = await emit(socket, "order:pay", { orderId: o.orderId, change: changeFor(o) });
      if (!paid.ok) throw new Error(`pay: ${paid.message}`);
      const [cash1, bank1] = [await balance(playerWallet(id)), await balance(bankWallet(id))];
      const tip = (paid.ok && paid.data.today.tips) || 0;
      if (kind === "transfer") {
        expect(bank1 - bank0).toBe(o.price);
        expect(cash1 - cash0).toBeLessThanOrEqual(tip); // tiền boa đưa tay
      } else {
        expect(bank1).toBe(bank0);
        expect(cash1 - cash0).toBeGreaterThanOrEqual(o.price);
      }
      expect(paid.ok && paid.data.bank).toBe(bank1);
      seen[kind] = true;
    }
    socket.disconnect();
  }, 60_000);

  it("ATM: phải đứng gần; tạo PIN; bội số mệnh giá; rút mất phí; không rút quá số dư; có biên lai", async () => {
    const { socket } = await join(url);
    const atm = content.atms[0];
    if (!atm) throw new Error("bản đồ không có ATM");
    const PIN = "270915";
    type Res = { me: MeView; receipt: AtmReceipt };
    const use = (action: string, amount: number, pin = PIN) =>
      emit<Res>(socket, "atm:use", { atmId: atm.id, action, amount, pin });

    socket.emit("move", { x: atm.x + 20, z: atm.z, yaw: 0, moving: false, inside: null });
    await new Promise((r) => setTimeout(r, 80));
    expect(await use("deposit", 50_000)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/cây ATM/),
    });

    socket.emit("move", { x: atm.x, z: atm.z + 1, yaw: 0, moving: false, inside: null });
    await new Promise((r) => setTimeout(r, 80));
    expect(await use("deposit", 50_000)).toMatchObject({ ok: false, message: /chưa có mã PIN/ });
    expect(await emit(socket, "atm:pin", { atmId: atm.id, pin: "123456" })).toMatchObject({
      ok: false,
      message: /liên tiếp/,
    });
    const set = await emit<MeView>(socket, "atm:pin", { atmId: atm.id, pin: PIN });
    expect(set.ok && set.data.atm).toEqual({ hasPin: true, locked: false });
    // Đổi PIN phải có PIN cũ.
    expect(await emit(socket, "atm:pin", { atmId: atm.id, pin: "482613" })).toMatchObject({
      ok: false,
      message: /PIN cũ/,
    });

    const dep = await use("deposit", 200_000);
    if (!dep.ok) throw new Error(`nộp: ${dep.message}`);
    expect(dep.data.me).toMatchObject({ money: START - 200_000, bank: B0 + 200_000 });
    expect(dep.data.receipt).toMatchObject({
      action: "deposit",
      amount: 200_000,
      fee: 0,
      balance: B0 + 200_000,
    });
    expect(dep.data.receipt.code).toMatch(/^FT\d{3}[0-9A-F]{6}$/);
    expect(await use("withdraw", 15_000)).toMatchObject({ ok: false, error: "invalid_payload" });
    expect(await use("withdraw", B0 + 500_000)).toMatchObject({
      ok: false,
      error: "insufficient_funds",
      message: expect.stringMatching(/Tài khoản không đủ số dư/),
    });
    const fee = content.economy.bank.withdrawFee;
    const wd = await use("withdraw", 50_000);
    if (!wd.ok) throw new Error(`rút: ${wd.message}`);
    expect(wd.data.me).toMatchObject({ money: START - 150_000, bank: B0 + 150_000 - fee });
    expect(wd.data.receipt).toMatchObject({ fee, balance: B0 + 150_000 - fee });
    expect(
      await emit(socket, "atm:use", {
        atmId: "atm_0_0",
        action: "deposit",
        amount: 10_000,
        pin: PIN,
      }),
    ).toMatchObject({ ok: false, error: "invalid_payload" });
    socket.disconnect();
  });

  it("ATM: sai PIN 3 lần thì máy giữ thẻ tới hôm sau", async () => {
    const { socket, snap } = await join(url);
    const atm = content.atms[0];
    if (!atm) throw new Error("bản đồ không có ATM");
    socket.emit("move", { x: atm.x, z: atm.z + 1, yaw: 0, moving: false, inside: null });
    await new Promise((r) => setTimeout(r, 80));
    await emit(socket, "atm:pin", { atmId: atm.id, pin: "270915" });
    const auth = (pin: string) => emit<MeView>(socket, "atm:auth", { atmId: atm.id, pin });
    expect(await auth("111222")).toMatchObject({
      ok: false,
      message: "Sai mã PIN — còn 2 lần thử",
    });
    expect(await auth("111222")).toMatchObject({
      ok: false,
      message: "Sai mã PIN — còn 1 lần thử",
    });
    expect(await auth("111222")).toMatchObject({ ok: false, message: /máy giữ thẻ/ });
    expect(await auth("270915")).toMatchObject({ ok: false, message: /giữ thẻ của bạn/ });
    // Sang ngày mới thì được trả thẻ.
    const room = app.get(GameService).roomFor(snap.me.playerId);
    if (!room) throw new Error("không có xóm");
    room.day += 1;
    const ok = await auth("270915");
    expect(ok.ok && ok.data.atm).toEqual({ hasPin: true, locked: false });
    socket.disconnect();
  });

  it("cuối ngày có lãi rất nhỏ, có trần (Luật 2.3)", async () => {
    const { socket, snap } = await join(url);
    const id = snap.me.playerId;
    const prisma = app.get(PrismaService);
    await prisma.$transaction((tx) =>
      app.get(LedgerService).transfer(tx, SYSTEM.bank, bankWallet(id), 50_000_000, "test"),
    );
    const room = app.get(GameService).roomFor(id);
    if (!room) throw new Error("không có xóm");
    const report = next(socket, "dayEnd");
    room.minute = content.economy.dayEndMinute - 2;
    const r: DayReportView = await report;
    expect(r.interest).toBe(content.economy.bank.interestCap);
    expect(await balance(bankWallet(id))).toBe(B0 + 50_000_000 + content.economy.bank.interestCap);
    socket.disconnect();
  });
});
