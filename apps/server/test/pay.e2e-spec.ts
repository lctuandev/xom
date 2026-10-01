import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type { MeView, NotifyEvent, OrderEvent, Snapshot } from "@xom/shared";
import { atmDeposit, emit, join, next, openBanhMiStall } from "./client.js";
import { startApp } from "./helpers.js";

// Chọn cách trả tiền (DESIGN §2, docs/USECASES.md UC-I8): 💵 tiền mặt · 🏦 chuyển khoản · tự chọn.

describe("Trả bằng gì (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  /** Vốn dự phòng có sẵn trong tài khoản người mới. */
  const B0 = content.economy.startingBank;

  it("mua xe: chọn chuyển khoản mà tài khoản không đủ thì báo; tự chọn thì khoản lớn đi tài khoản", async () => {
    const { socket, snap } = await join(url);
    const start = snap.me.money;
    const price = content.equipment("xe_banh_mi").price;
    expect(
      await emit(socket, "equipment:buy", { equipmentId: "xe_banh_mi", pay: "bank" }),
    ).toMatchObject({
      ok: false,
      error: "insufficient_funds",
      message: "Tài khoản không đủ số dư",
    });

    // Gửi gần hết tiền mặt vào tài khoản ở cây ATM.
    const atm = content.atms[0];
    if (!atm) throw new Error("bản đồ không có ATM");
    socket.emit("move", { x: atm.x, z: atm.z + 1, yaw: 0, moving: false, inside: null });
    await wait(80);
    const deposit = start - 100_000;
    await atmDeposit(socket, deposit);
    const yard = content.place("vua_xe").position;
    socket.emit("move", { x: yard.x, z: yard.z + 1.4, yaw: 0, moving: false, inside: null });
    await wait(80);

    // Chọn tiền mặt: không đủ → gợi ý chuyển khoản / rút ATM.
    expect(
      await emit(socket, "equipment:buy", { equipmentId: "xe_banh_mi", pay: "cash" }),
    ).toMatchObject({
      ok: false,
      message: "Không đủ tiền mặt — chọn chuyển khoản hoặc ra cây ATM rút",
    });
    const ting = next(socket, "notify", (n: NotifyEvent) => n.text.startsWith("🏦"));
    const bought = await emit(socket, "equipment:buy", { equipmentId: "xe_banh_mi" });
    expect(bought.ok && bought.data).toMatchObject({ money: 100_000, bank: B0 + deposit - price });
    expect((await ting).text).toBe(`🏦 Đã chuyển khoản ${price.toLocaleString("vi-VN")}đ`);

    // Mua lặt vặt ở chợ: tự chọn trả tiền mặt; chọn chuyển khoản thì trừ tài khoản.
    const market = content.place("cho_dau_moi").position;
    socket.emit("move", { ...market, yaw: 0, moving: false, inside: "cho_dau_moi" });
    await wait(300);
    const cashBuy = (await emit(socket, "market:buy", { itemId: "pate", packs: 1 })) as {
      ok: true;
      data: MeView;
    };
    expect(cashBuy.data.money).toBeLessThan(100_000);
    expect(cashBuy.data.bank).toBe(B0 + deposit - price);
    const bankBuy = (await emit(socket, "market:buy", {
      itemId: "pate",
      packs: 1,
      pay: "bank",
    })) as {
      ok: true;
      data: MeView;
    };
    expect(bankBuy.data.money).toBe(cashBuy.data.money);
    expect(bankBuy.data.bank).toBeLessThan(B0 + deposit - price);
    socket.disconnect();
  });

  it("sạp xôi chỉ nhận tiền mặt", async () => {
    const { socket } = await join(url);
    await emit(socket, "debug:clock", { minute: 400 });
    const xoi = content.data.vendors.find((v) => v.id === "xoi_ba_bay");
    if (!xoi?.cashOnly) throw new Error("sạp xôi phải chỉ nhận tiền mặt");
    socket.emit("move", { ...xoi.position, yaw: 0, moving: false, inside: null });
    await wait(120);
    expect(
      await emit(socket, "vendor:buy", { vendorId: xoi.id, itemId: "xoi_ga", pay: "bank" }),
    ).toMatchObject({ ok: false, message: "Sạp này chỉ nhận tiền mặt thôi con" });
    const ok = await emit(socket, "vendor:buy", { vendorId: xoi.id, itemId: "xoi_ga" });
    expect(ok.ok).toBe(true);
    socket.disconnect();
  });

  it("gọi món quầy hàng xóm: chọn chuyển khoản thì chủ quầy nhận vào tài khoản, không phải thối", async () => {
    const a = await openBanhMiStall(url);
    // Khách NPC xếp hàng kín quầy thì hàng xóm không gọi được — An mời khách NPC về bớt.
    const npcOrders: string[] = [];
    a.socket.on("order", (o: OrderEvent) => {
      if (!o.buyerId) npcOrders.push(o.orderId);
    });
    const b = await join(url);
    const moved = next(b.socket, "snapshot", (s: Snapshot) => s.roster.code === a.snap.roster.code);
    await emit(b.socket, "xom:join", { code: a.snap.roster.code });
    const stall = (await moved).world.lots.find((l) => l.ownerId === a.snap.me.playerId);
    if (!stall) throw new Error("không thấy quầy");
    // Bình gửi tiền vào tài khoản trước.
    const atm = content.atms[0];
    if (!atm) throw new Error("bản đồ không có ATM");
    b.socket.emit("move", { x: atm.x, z: atm.z + 1, yaw: 0, moving: false, inside: null });
    await wait(80);
    await atmDeposit(b.socket, 100_000);
    const lot = content.lot("dau_hem").position;
    b.socket.emit("move", { x: lot.x + 1, z: lot.z + 1.2, yaw: 0, moving: false, inside: null });
    await wait(120);

    const got = next(a.socket, "order", (o: OrderEvent) => o.buyerId === b.snap.me.playerId);
    for (const id of npcOrders.splice(0)) await emit(a.socket, "order:decline", { orderId: id });
    const placed = await emit(b.socket, "shop:order", {
      businessId: stall.businessId,
      variantId: "banh_mi_thit",
      pay: "bank",
    });
    if (!placed.ok) throw new Error(`gọi món: ${placed.message}`);
    const o = await got;
    expect(o.pay).toEqual({ kind: "transfer" });
    // Nghỉ chút cho khỏi chạm giới hạn 20 thao tác/giây (vừa mời bớt khách NPC).
    await wait(1100);
    await emit(a.socket, "order:make", { orderId: o.orderId, build: o.spec });
    const charged = next(b.socket, "me", (m: MeView) => m.bank === B0 + 100_000 - o.price);
    const paid = await emit(a.socket, "order:pay", { orderId: o.orderId, change: null });
    if (!paid.ok) throw new Error(`tính tiền: ${paid.error} ${paid.message}`);
    expect(paid.data.bank).toBe(B0 + o.price);
    const bMe = await charged;
    expect(bMe.money).toBe(b.snap.me.money - 100_000);
    a.socket.disconnect();
    b.socket.disconnect();
  });
});
