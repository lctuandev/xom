import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type { MeView } from "@xom/shared";
import { repairCost } from "@xom/sim";
import { LedgerService, playerWallet, SYSTEM } from "../src/economy/ledger.service.js";
import { GameService } from "../src/game/game.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { BANH_MI_THIT, emit, join, next } from "./client.js";
import { startApp } from "./helpers.js";

// Chỗ tiêu bắt buộc (Luật 2.2, docs/USECASES.md UC-I7): phí chợ/thuế, điện nước tiệm, hao mòn + sửa xe.

describe("Money sink (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());
  const eco = content.economy;

  async function stall(lotId: string) {
    const { socket, snap } = await join(url);
    await emit(socket, "debug:weather", { kind: "sunny", minutes: 960 });
    // Nhà mặt tiền mở ở cấp 3 (Luật 4.2) — kịch bản cộng sẵn KN.
    await emit(socket, "debug:grant", { xp: 300 });
    // Vốn đủ thuê nhà mặt tiền (người mới thường phải bán vài ngày).
    await app
      .get(PrismaService)
      .$transaction((tx) =>
        app
          .get(LedgerService)
          .transfer(tx, SYSTEM.bank, playerWallet(snap.me.playerId), 300_000, "test"),
      );
    await emit(socket, "equipment:buy", { equipmentId: "xe_banh_mi" });
    for (const itemId of BANH_MI_THIT) await emit(socket, "market:buy", { itemId, packs: 1 });
    await emit(socket, "biz:update", { lotId });
    await emit(socket, "biz:attend", { on: true });
    return { socket, id: snap.me.playerId };
  }

  it("mở quầy: trả tiền thuê + phí chợ một lần/ngày; mở lại trong ngày không mất thêm", async () => {
    const { socket } = await stall("dau_hem");
    const before = (await emit(socket, "biz:attend", { on: true })) as { ok: true; data: MeView };
    const opened = await emit(socket, "biz:open", {});
    const lot = content.lot("dau_hem");
    expect(opened.ok && before.data.money - opened.data.money).toBe(
      lot.rentPerDay + eco.fees.daily.cart,
    );
    expect(opened.ok && opened.data.today.fees).toBe(eco.fees.daily.cart);
    await emit(socket, "biz:close", {});
    const again = await emit(socket, "biz:open", {});
    expect(again.ok && opened.ok && again.data.money).toBe(opened.ok && opened.data.money);
    socket.disconnect();
  });

  it("tiệm (nhà mặt tiền) trả thêm điện nước mỗi giờ mở cửa", async () => {
    const { socket } = await stall("nha_so_10");
    const opened = await emit(socket, "biz:open", {});
    expect(opened.ok).toBe(true);
    const billed = await next(socket, "me", (m) => m.today.fees > eco.fees.daily.house);
    expect(billed.today.fees - eco.fees.daily.house).toBe(eco.fees.utilitiesPerHour);
    socket.disconnect();
  });

  it("bán món làm xe mòn; xe hư không mở được; sửa ở vựa xe tốn tiền theo độ mòn", async () => {
    const { socket, id } = await stall("dau_hem");
    const prisma = app.get(PrismaService);
    const biz = await prisma.business.findFirstOrThrow({ where: { ownerId: id } });
    await prisma.business.update({ where: { id: biz.id }, data: { wear: 1 } });
    expect(await emit(socket, "biz:open", {})).toMatchObject({
      ok: false,
      message: expect.stringMatching(/Xe hư/),
    });

    // Đứng xa vựa xe thì không sửa được.
    socket.emit("move", { x: 40, z: 20, yaw: 0, moving: false, inside: null });
    await new Promise((r) => setTimeout(r, 80));
    expect(await emit(socket, "biz:repair", {})).toMatchObject({ ok: false });
    const v = content.place("vua_xe").position;
    socket.emit("move", { x: v.x, z: v.z + 1.4, yaw: 0, moving: false, inside: null });
    await new Promise((r) => setTimeout(r, 80));
    const cost = repairCost(content.equipment("xe_banh_mi").price, 1, eco.maintenance);
    const before = (await emit(socket, "biz:attend", { on: false })) as { ok: true; data: MeView };
    const fixed = await emit(socket, "biz:repair", {});
    if (!fixed.ok) throw new Error(`sửa: ${fixed.message}`);
    expect(fixed.ok && fixed.data.business?.wear).toBe(0);
    expect(fixed.ok && before.data.money - fixed.data.money).toBe(cost);
    expect(await emit(socket, "biz:repair", {})).toMatchObject({
      ok: false,
      message: expect.stringMatching(/còn tốt/),
    });

    // Bán một món: xe mòn thêm wearPerServe (nghỉ chút cho khỏi chạm giới hạn 20 thao tác/giây).
    await new Promise((r) => setTimeout(r, 1100));
    const room = app.get(GameService).roomFor(id);
    const lot = content.lot("dau_hem").position;
    socket.emit("move", { x: lot.x, z: lot.z - 0.9, yaw: 0, moving: false, inside: null });
    await emit(socket, "biz:attend", { on: true });
    const reopened = await emit(socket, "biz:open", {});
    if (!reopened.ok) throw new Error(`mở: ${reopened.error} ${reopened.message}`);
    if (!room) throw new Error("không có xóm");
    const o = await next(socket, "order");
    await emit(socket, "order:make", { orderId: o.orderId, build: o.spec });
    const paid = await emit(socket, "order:pay", {
      orderId: o.orderId,
      change: o.pay.kind === "cash" ? o.pay.bill - o.price : null,
    });
    expect(paid.ok && paid.data.business?.wear).toBeCloseTo(eco.maintenance.wearPerServe);
    socket.disconnect();
  });
});
