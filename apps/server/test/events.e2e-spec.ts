import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type { EventView, MeView } from "@xom/shared";
import { LedgerService, playerWallet, SYSTEM } from "../src/economy/ledger.service.js";
import { GameService } from "../src/game/game.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { changeFor, emit, join, next, openBanhMiStall } from "./client.js";
import { startApp } from "./helpers.js";

// Sự kiện bằng dữ liệu (docs/USECASES.md UC-B5, DESIGN §9): khai trương do người chơi tạo, khách VIP.

async function fund(app: INestApplication, playerId: string, amount: number) {
  const prisma = app.get(PrismaService);
  await prisma.$transaction((tx) =>
    app.get(LedgerService).transfer(tx, SYSTEM.bank, playerWallet(playerId), amount, "test"),
  );
}

describe("Sự kiện (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  it("khai trương: phải mở quầy; trả tiền pháo/bong bóng; khách được giảm giá; không tổ chức chồng", async () => {
    const { socket: idle } = await join(url);
    expect(await emit(idle, "event:host", { eventId: "khai_truong" })).toMatchObject({
      ok: false,
    });
    expect(await emit(idle, "event:host", { eventId: "mua_lon" })).toMatchObject({
      ok: false,
      error: "invalid_payload",
    });
    idle.disconnect();

    const { socket, snap } = await openBanhMiStall(url);
    // Bán vài ngày mới có vốn khai trương — test nạp sẵn qua sổ cái.
    await fund(app, snap.me.playerId, 200_000);
    // Khai trương mở ở cấp 2 (Luật 4.2).
    await emit(socket, "debug:grant", { xp: 150 });
    const me = (await emit(socket, "biz:attend", { on: true })) as { ok: true; data: MeView };
    const announced = next(socket, "events", (list) =>
      list.some((e) => e.eventId === "khai_truong"),
    );
    const hosted = await emit(socket, "event:host", { eventId: "khai_truong" });
    if (!hosted.ok) throw new Error(`${hosted.error}: ${hosted.message} (tiền ${me.data.money})`);
    const after = (hosted.ok && hosted.data) as MeView;
    expect(me.data.money - after.money).toBe(100_000);
    expect(after.business?.promoDay).not.toBeNull();
    const ev = (await announced).find((e) => e.eventId === "khai_truong");
    expect(ev).toMatchObject({ businessId: after.business?.id, lotId: "dau_hem" });
    expect((ev?.to ?? 0) - (ev?.from ?? 0)).toBeLessThanOrEqual(
      content.event("khai_truong").minutes,
    );

    expect(await emit(socket, "event:host", { eventId: "khai_truong" })).toMatchObject({
      ok: false,
      message: expect.stringMatching(/khai trương rồi/),
    });

    const order = await next(socket, "order");
    expect(order.promo).toBe(true);
    expect(order.price % 500).toBe(0);
    expect(order.price).toBeLessThan(content.variant("banh_mi", order.variantId).refPrice);
    socket.disconnect();
  });

  it("khách VIP: dặn nhiều; làm chuẩn thì boa đậm + uy tín lên, bỏ khách thì uy tín tụt", async () => {
    const { socket, snap } = await openBanhMiStall(url);
    const game = app.get(GameService);
    const prisma = app.get(PrismaService);
    const room = game.roomFor(snap.me.playerId);
    if (!room) throw new Error("không có xóm");
    const vip = content.event("khach_vip").effects.vip;
    if (!vip) throw new Error("thiếu dữ liệu VIP");
    const spawnVip = async () => {
      const biz = await prisma.business.findFirstOrThrow({
        where: { ownerId: snap.me.playerId },
      });
      const got = next(socket, "order", (o) => !!o.vip);
      await room.run(() => game.orders.spawn(room, biz, 1, { vip }));
      return got;
    };

    const o = await spawnVip();
    const mods = content.product("banh_mi").recipe.mods.filter((m) => o.dish.includes(m.say));
    expect(mods.length).toBeGreaterThanOrEqual(vip.minMods);
    const before = await prisma.business.findFirstOrThrow({
      where: { ownerId: snap.me.playerId },
    });
    const made = await emit<{ correct: boolean }>(socket, "order:make", {
      orderId: o.orderId,
      build: o.spec,
    });
    // Không đủ nguyên liệu cho yêu cầu đặc biệt (thêm xíu mại…) thì xin lỗi khách → uy tín tụt.
    if (!made.ok) {
      await emit(socket, "order:decline", { orderId: o.orderId });
      const lost = await prisma.business.findFirstOrThrow({ where: { id: before.id } });
      expect(lost.reputation).toBeLessThanOrEqual(before.reputation - vip.repLose + 1e-9);
      socket.disconnect();
      return;
    }
    const paid = await emit(socket, "order:pay", { orderId: o.orderId, change: changeFor(o) });
    expect(paid.ok && paid.data.today.tips).toBeGreaterThanOrEqual(5_000);
    const won = await prisma.business.findFirstOrThrow({ where: { id: before.id } });
    expect(won.reputation).toBeGreaterThan(before.reputation + vip.repWin / 2);

    const o2 = await spawnVip();
    await emit(socket, "order:decline", { orderId: o2.orderId });
    const lost = await prisma.business.findFirstOrThrow({ where: { id: before.id } });
    expect(lost.reputation).toBeLessThanOrEqual(won.reputation - vip.repLose + 1e-9);
    socket.disconnect();
  });

  it("lịch tuần: thứ Bảy có chợ đêm 18:00–22:00 cho cả xóm; ngày thường thì không", async () => {
    const { socket } = await join(url);
    const sat = next(socket, "events", (list: EventView[]) =>
      list.some((e) => e.eventId === "cho_dem"),
    );
    await emit(socket, "debug:clock", { minute: 17 * 60, day: 6 });
    const list = await sat;
    expect(content.weekday(6).name).toBe("Thứ Bảy");
    expect(list.find((e) => e.eventId === "cho_dem")).toMatchObject({
      from: 18 * 60,
      to: 22 * 60,
      key: "cho_dem:6",
    });
    const wed = next(socket, "events", (l: EventView[]) => !l.some((e) => e.eventId === "cho_dem"));
    await emit(socket, "debug:clock", { minute: 17 * 60, day: 10 });
    expect((await wed).some((e) => e.eventId === "cho_dem")).toBe(false);
    socket.disconnect();
  });
});
