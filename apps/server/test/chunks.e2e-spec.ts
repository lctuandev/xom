import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type { MeView } from "@xom/shared";
import { landPrice, landRefund } from "@xom/sim";
import { connect, emit, next } from "./client.js";
import { register, startApp, uniqueName } from "./helpers.js";

// Bản đồ mở bước A (docs/BANDO.md): xóm mở thêm khu → cả xóm nhận lưới mới; vào lại vẫn thấy khu đã mở (lưu DB).

describe("Bản đồ mở: ghép khu (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  it("mở khu đông rồi khu đông thứ hai: nối tiếp, lưu lại, người mới vào thấy", async () => {
    const { body } = await register(url, uniqueName(), { solo: true });
    const a = await connect(url, body.accessToken);
    expect(a.snap.world.chunks ?? []).toEqual([]);

    const world = next(a.socket, "world", (w) => (w.chunks?.length ?? 0) === 1);
    expect((await emit(a.socket, "debug:chunk", { chunkId: "khu_dong" })).ok).toBe(true);
    expect((await world).chunks).toEqual([{ chunkId: "khu_dong", gx: 1, gz: 0 }]);
    expect((await emit(a.socket, "debug:chunk", { chunkId: "khu_dong" })).ok).toBe(true);
    expect((await emit(a.socket, "debug:chunk", { chunkId: "khong_co" })).ok).toBe(false);

    // Hàng xóm vào sau: snapshot có đủ khu đã mở.
    const b = await register(url, uniqueName(), { xom: a.snap.roster.code });
    const nb = await connect(url, b.body.accessToken);
    expect(nb.snap.world.chunks).toEqual([
      { chunkId: "khu_dong", gx: 1, gz: 0 },
      { chunkId: "khu_dong", gx: 2, gz: 0 },
    ]);
    a.socket.disconnect();
    nb.socket.disconnect();
  });

  it("chỗ bán của khu (bước B): chưa mở khu thì không chọn được; mở rồi chọn được, người khác không chiếm được", async () => {
    const { body } = await register(url, uniqueName(), { solo: true });
    const a = await connect(url, body.accessToken);
    expect((await emit(a.socket, "equipment:buy", { equipmentId: "xe_banh_mi" })).ok).toBe(true);
    const lotId = "khu_dong__dau_pho__1_0";
    expect(await emit(a.socket, "biz:update", { lotId })).toMatchObject({
      ok: false,
      message: "Không có chỗ này",
    });
    expect((await emit(a.socket, "debug:chunk", { chunkId: "khu_dong" })).ok).toBe(true);
    const moved = await emit<MeView>(a.socket, "biz:update", { lotId });
    if (!moved.ok) throw new Error(moved.message);
    expect(moved.data.business?.lotId).toBe(lotId);

    const b = await register(url, uniqueName(), { xom: a.snap.roster.code });
    const nb = await connect(url, b.body.accessToken);
    expect((await emit(nb.socket, "equipment:buy", { equipmentId: "xe_banh_mi" })).ok).toBe(true);
    expect((await emit(nb.socket, "biz:update", { lotId })).ok).toBe(false);
    a.socket.disconnect();
    nb.socket.disconnect();
  });

  it("sạp có mái (bước C): dọn tới ô đất trả phí dựng sạp qua sổ cái", async () => {
    const { body } = await register(url, uniqueName(), { solo: true });
    const a = await connect(url, body.accessToken);
    const bought = await emit<MeView>(a.socket, "equipment:buy", { equipmentId: "xe_banh_mi" });
    if (!bought.ok) throw new Error(bought.message);
    expect((await emit(a.socket, "debug:chunk", { chunkId: "khu_dong" })).ok).toBe(true);
    const lotId = "khu_dong__sap_mai_a__1_0";
    expect(content.lot(lotId).kind).toBe("stall");
    const moved = await emit<MeView>(a.socket, "biz:update", { lotId, pay: "cash" });
    if (!moved.ok) throw new Error(moved.message);
    expect(moved.data.money).toBe(bought.data.money - content.economy.stallBuild);
    expect(moved.data.business?.lotId).toBe(lotId);
    a.socket.disconnect();
  });

  it("mua đứt ô đất (bước D): phải đứng tại ô, chủ không trả tiền thuê, người khác không dùng được, bán lại 70%", async () => {
    const { body } = await register(url, uniqueName(), { solo: true });
    const a = await connect(url, body.accessToken);
    expect((await emit(a.socket, "equipment:buy", { equipmentId: "xe_banh_mi" })).ok).toBe(true);
    expect((await emit(a.socket, "debug:chunk", { chunkId: "khu_dong" })).ok).toBe(true);
    expect((await emit(a.socket, "debug:grant", { money: 5_000_000 })).ok).toBe(true);
    const lotId = "khu_dong__sap_mai_b__1_0";
    const lot = content.lot(lotId);
    const price = landPrice(content, lotId);
    // Vỉa hè không mua được; đứng xa không mua được.
    expect(await emit(a.socket, "land:buy", { lotId: "khu_dong__dau_pho__1_0" })).toMatchObject({
      ok: false,
    });
    expect((await emit(a.socket, "land:buy", { lotId })).ok).toBe(false);
    a.socket.emit("move", {
      x: lot.position.x,
      z: lot.position.z,
      yaw: 0,
      moving: false,
      inside: null,
    });
    await new Promise((r) => setTimeout(r, 200));
    const bought = await emit<MeView>(a.socket, "land:buy", { lotId, pay: "cash" });
    if (!bought.ok) throw new Error(bought.message);
    const world = next(a.socket, "world", (w) => (w.plots?.length ?? 0) === 1);
    expect((await world).plots?.[0]).toMatchObject({ lotId, ownerId: a.snap.me.playerId, price });
    // Dọn về ô của mình: không trả phí dựng sạp; lotOwned = true.
    const moved = await emit<MeView>(a.socket, "biz:update", { lotId, pay: "cash" });
    if (!moved.ok) throw new Error(moved.message);
    expect(moved.data.money).toBe(bought.data.money);
    expect(moved.data.business?.lotOwned).toBe(true);

    // Hàng xóm không dọn tới ô của người khác.
    const b = await register(url, uniqueName(), { xom: a.snap.roster.code });
    const nb = await connect(url, b.body.accessToken);
    expect((await emit(nb.socket, "equipment:buy", { equipmentId: "xe_banh_mi" })).ok).toBe(true);
    expect((await emit(nb.socket, "biz:update", { lotId })).ok).toBe(false);

    // Bán lại: +70% giá mua, quầy ra khỏi ô.
    const sold = await emit<MeView>(a.socket, "land:sell", { lotId });
    if (!sold.ok) throw new Error(sold.message);
    expect(sold.data.money).toBe(moved.data.money + landRefund(content, price));
    expect(sold.data.business?.lotId).toBeNull();
    a.socket.disconnect();
    nb.socket.disconnect();
  });

  it("xây tiệm trên ô của mình (bước E): theo thứ tự, đang xây không mở được, xong thì lên cấp; bán lại tính cả tiền xây", async () => {
    const { body } = await register(url, uniqueName(), { solo: true });
    const a = await connect(url, body.accessToken);
    expect((await emit(a.socket, "equipment:buy", { equipmentId: "xe_banh_mi" })).ok).toBe(true);
    expect((await emit(a.socket, "debug:chunk", { chunkId: "khu_dong" })).ok).toBe(true);
    expect((await emit(a.socket, "debug:grant", { money: 10_000_000 })).ok).toBe(true);
    const lotId = "khu_dong__sap_mai_a__1_0";
    const lot = content.lot(lotId);
    a.socket.emit("move", {
      x: lot.position.x,
      z: lot.position.z,
      yaw: 0,
      moving: false,
      inside: null,
    });
    await new Promise((r) => setTimeout(r, 200));
    expect((await emit(a.socket, "land:buy", { lotId, pay: "cash" })).ok).toBe(true);
    const moved = await emit<MeView>(a.socket, "biz:update", { lotId });
    if (!moved.ok) throw new Error(moved.message);
    expect(moved.data.business?.level).toBe(1);

    // Nhà 2 tầng phải xây tiệm 1 tầng trước.
    expect(
      await emit(a.socket, "land:build", { lotId, buildingId: "nha_2_tang", pay: "cash" }),
    ).toMatchObject({ ok: false, message: /Tiệm 1 tầng/ });
    const tiem = content.building("tiem_1_tang");
    const built = await emit<MeView>(a.socket, "land:build", {
      lotId,
      buildingId: "tiem_1_tang",
      pay: "cash",
    });
    if (!built.ok) throw new Error(built.message);
    expect(built.data.money).toBe(moved.data.money - tiem.cost);
    // Đang xây: không mở sạp.
    expect(await emit(a.socket, "biz:open", {})).toMatchObject({ ok: false, message: /Đang xây/ });

    // Sang ngày xong: ô lên cấp 2, cửa hàng trên ô cấp 2.
    const day = a.snap.clock.day + tiem.buildDays;
    const world = next(
      a.socket,
      "world",
      (w) => w.plots?.some((p) => p.lotId === lotId && p.level === 2) ?? false,
    );
    expect((await emit(a.socket, "debug:clock", { minute: 8 * 60, day })).ok).toBe(true);
    await world;
    const after = await emit<MeView>(a.socket, "biz:menu", {
      variantId: content.product("banh_mi").recipe.variants[0]?.id ?? "",
      on: true,
    });
    if (!after.ok) throw new Error(after.message);
    expect(after.data.business?.level).toBe(2);

    // Bán lại: 70% của (giá đất + tiền xây).
    const sold = await emit<MeView>(a.socket, "land:sell", { lotId });
    if (!sold.ok) throw new Error(sold.message);
    expect(sold.data.money).toBe(
      after.data.money + landRefund(content, landPrice(content, lotId) + tiem.cost),
    );
    a.socket.disconnect();
  });

  it("xóm lớn dần (bước F): ≥ 70% chỗ có người thì sang ngày tự mở khu kế tiếp", async () => {
    const carts = content.data.lots.filter((l) => l.kind === "cart").map((l) => l.id);
    const total = content.data.lots.length;
    const need = Math.ceil(total * content.economy.xomGrow.at);
    const first = await register(url, uniqueName(), { solo: true });
    const a = await connect(url, first.body.accessToken);
    const sockets = [a.socket];
    const take = async (socket: typeof a.socket, lotId: string) => {
      expect((await emit(socket, "equipment:buy", { equipmentId: "xe_banh_mi" })).ok).toBe(true);
      const r = await emit(socket, "biz:update", { lotId });
      if (!r.ok) throw new Error(r.message);
    };
    await take(a.socket, carts[0] ?? "");
    for (let i = 1; i < need - 1; i++) {
      const p = await register(url, uniqueName(), { xom: a.snap.roster.code });
      const c = await connect(url, p.body.accessToken);
      sockets.push(c.socket);
      await take(c.socket, carts[i] ?? "");
    }
    // Chưa đủ 70%: sang ngày không mở.
    expect(
      (await emit(a.socket, "debug:clock", { minute: 8 * 60, day: a.snap.clock.day + 1 })).ok,
    ).toBe(true);
    const p = await register(url, uniqueName(), { xom: a.snap.roster.code });
    const c = await connect(url, p.body.accessToken);
    sockets.push(c.socket);
    expect(c.snap.world.chunks ?? []).toEqual([]);
    await take(c.socket, carts[need - 1] ?? "");
    // Đủ 70%: sang ngày mở khu đông.
    const world = next(a.socket, "world", (w) => (w.chunks?.length ?? 0) === 1);
    expect(
      (await emit(a.socket, "debug:clock", { minute: 8 * 60, day: a.snap.clock.day + 2 })).ok,
    ).toBe(true);
    expect((await world).chunks).toEqual([{ chunkId: "khu_dong", gx: 1, gz: 0 }]);
    for (const s of sockets) s.disconnect();
  });
});
