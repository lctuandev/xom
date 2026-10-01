import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type { DayReportView, MeView, OrderEvent } from "@xom/shared";
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

  it("ATM: phải đứng gần; bội số mệnh giá; không rút quá số dư; tiền chỉ đổi chỗ giữa ví và tài khoản", async () => {
    const { socket } = await join(url);
    const atm = content.atms[0];
    if (!atm) throw new Error("bản đồ không có ATM");
    const use = (action: string, amount: number) =>
      emit<MeView>(socket, "atm:use", { atmId: atm.id, action, amount });

    socket.emit("move", { x: atm.x + 20, z: atm.z, yaw: 0, moving: false, inside: null });
    await new Promise((r) => setTimeout(r, 80));
    expect(await use("deposit", 50_000)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/cây ATM/),
    });

    socket.emit("move", { x: atm.x, z: atm.z + 1, yaw: 0, moving: false, inside: null });
    await new Promise((r) => setTimeout(r, 80));
    const dep = await use("deposit", 200_000);
    expect(dep.ok && dep.data).toMatchObject({ money: 300_000, bank: 200_000 });
    expect(await use("withdraw", 15_000)).toMatchObject({ ok: false, error: "invalid_payload" });
    expect(await use("withdraw", 500_000)).toMatchObject({
      ok: false,
      error: "insufficient_funds",
      message: "Tài khoản không đủ số dư",
    });
    const wd = await use("withdraw", 50_000);
    expect(wd.ok && wd.data).toMatchObject({ money: 350_000, bank: 150_000 });
    expect(
      await emit(socket, "atm:use", { atmId: "atm_0_0", action: "deposit", amount: 10_000 }),
    ).toMatchObject({ ok: false, error: "invalid_payload" });
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
    expect(await balance(bankWallet(id))).toBe(50_000_000 + content.economy.bank.interestCap);
    socket.disconnect();
  });
});
