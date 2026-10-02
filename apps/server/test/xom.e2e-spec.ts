import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type {
  Ack,
  ClientToServerEvents,
  MeView,
  OrderEvent,
  OrderResultEvent,
  OrderUpdateEvent,
  PeerPos,
  RosterView,
  SayEvent,
  ServerToClientEvents,
  Snapshot,
} from "@xom/shared";
import { billFor } from "@xom/sim";
import { io, type Socket } from "socket.io-client";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { changeFor } from "./client.js";
import { register, startApp } from "./helpers.js";

// Xóm chung (docs/USECASES.md UC-J1, J2): mời bằng mã, thấy nhau đi lại, nghe nhau nói.

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

async function join(url: string): Promise<{ socket: Client; snap: Snapshot }> {
  const { body } = await register(url);
  return new Promise((resolve, reject) => {
    const socket: Client = io(url, {
      path: "/socket.io",
      addTrailingSlash: false,
      transports: ["websocket"],
      auth: { token: body.accessToken },
    });
    socket.once("snapshot", (snap) => resolve({ socket, snap }));
    socket.once("connect_error", reject);
  });
}

function emit(
  socket: Client,
  event: keyof ClientToServerEvents,
  payload: unknown,
): Promise<Ack<MeView>> {
  return new Promise((resolve) => {
    // biome-ignore lint/suspicious/noExplicitAny: emit generic qua union event
    (socket.emit as any)(event, payload, resolve);
  });
}

function next<E extends keyof ServerToClientEvents>(
  socket: Client,
  event: E,
  pred: (v: Parameters<ServerToClientEvents[E]>[0]) => boolean,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve) => {
    const on = (v: Parameters<ServerToClientEvents[E]>[0]) => {
      if (!pred(v)) return;
      // biome-ignore lint/suspicious/noExplicitAny: off generic
      (socket.off as any)(event, on);
      resolve(v);
    };
    // biome-ignore lint/suspicious/noExplicitAny: on generic
    (socket.on as any)(event, on);
  });
}

describe("Xóm chung (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  it("mời bằng mã: vào xóm bạn, thấy nhau đi, nghe nhau nói, rời thì biến mất", async () => {
    const a = await join(url);
    const b = await join(url);
    const code = a.snap.roster.code;
    expect(a.snap.roster.peers.map((p) => p.id)).toEqual([a.snap.me.playerId]);

    // Mã sai, mã xóm mình → báo lỗi dễ hiểu.
    expect(await emit(b.socket, "xom:join", { code: "zz" })).toMatchObject({ ok: false });
    expect(await emit(b.socket, "xom:join", { code: "00000000" })).toMatchObject({
      ok: false,
      message: "Không có xóm nào mã này",
    });
    expect(await emit(b.socket, "xom:join", { code: b.snap.roster.code })).toMatchObject({
      ok: false,
    });

    const seen = next(a.socket, "roster", (r: RosterView) => r.peers.length === 2);
    const snapB = next(b.socket, "snapshot", (s: Snapshot) => s.roster.code === code);
    const joined = await emit(b.socket, "xom:join", { code: code.toUpperCase() });
    expect(joined.ok).toBe(true);
    expect((await seen).peers.map((p) => p.name)).toHaveLength(2);
    const sb = await snapB;
    expect(sb.roster.peers.map((p) => p.id).sort()).toEqual(
      [a.snap.me.playerId, b.snap.me.playerId].sort(),
    );
    expect(sb.clock.day).toBe(a.snap.clock.day);

    // B đi → A nhận vị trí ở nhịp 10 Hz.
    const pos = next(a.socket, "peers", (list: PeerPos[]) =>
      list.some((p) => p.id === b.snap.me.playerId),
    );
    b.socket.emit("move", { x: 3.456, z: -1.2, yaw: 1.5, moving: true, inside: null });
    expect((await pos).find((p) => p.id === b.snap.me.playerId)).toMatchObject({
      x: 3.46,
      z: -1.2,
      moving: true,
    });
    // Vị trí rác bị bỏ qua lặng lẽ.
    b.socket.emit("move", { x: 9999, z: 0, yaw: 0, moving: false, inside: null });

    // Vào quán → hàng xóm thấy "đang ở trong quán" (ẩn khỏi phố).
    const inside = next(a.socket, "roster", (r: RosterView) =>
      r.peers.some((p) => p.id === b.snap.me.playerId && p.inside === "quan_com"),
    );
    await new Promise((r) => setTimeout(r, 80));
    b.socket.emit("move", { x: 15, z: -4, yaw: 0, moving: false, inside: "quan_com" });
    await inside;

    // Nói câu nhanh → cả xóm nghe.
    const heard = next(a.socket, "say", (e: SayEvent) => e.who === b.snap.me.playerId);
    await emit(b.socket, "chat:say", { phraseId: "chao" });
    expect((await heard).text.length).toBeGreaterThan(0);

    // B tắt app → A thấy B rời xóm.
    const gone = next(a.socket, "roster", (r: RosterView) => r.peers.length === 1);
    b.socket.disconnect();
    await gone;
    a.socket.disconnect();
  });

  it("chuyển sang xóm lệch ngày: hàng tồn và sổ sách dời theo ngày xóm mới", async () => {
    const prisma = app.get(PrismaService);
    const b = await join(url);
    const bought = await emit(b.socket, "market:buy", { itemId: "banh_mi_phoi", packs: 1 });
    expect(bought.ok).toBe(true);
    const before = await prisma.inventoryItem.findFirstOrThrow({
      where: { playerId: b.snap.me.playerId },
    });
    const room = await prisma.room.create({
      data: { code: Math.random().toString(16).slice(2, 10).padEnd(8, "0"), day: 40, minute: 400 },
    });
    const moved = next(b.socket, "snapshot", (s: Snapshot) => s.clock.day === 40);
    expect(await emit(b.socket, "xom:join", { code: room.code })).toMatchObject({ ok: true });
    const snap = await moved;
    const after = await prisma.inventoryItem.findFirstOrThrow({
      where: { playerId: b.snap.me.playerId },
    });
    // Tuổi hàng giữ nguyên: lô vừa nhập ở xóm cũ vẫn là hàng mới ở xóm mới (đồng hồ test chạy nhanh
    // nên có thể đã qua một ngày giữa lúc mua và lúc chuyển).
    expect(before.batchDay).toBeLessThan(40);
    expect(40 - after.batchDay).toBeGreaterThanOrEqual(0);
    expect(40 - after.batchDay).toBeLessThanOrEqual(1);
    expect(snap.me.inventory.find((i) => i.itemId === "banh_mi_phoi")?.qty).toBeGreaterThan(0);
    b.socket.disconnect();
  });

  it("mua của nhau: gọi món ở quầy hàng xóm, chủ làm tay, tiền chuyển từ ví khách sang ví chủ", async () => {
    // An mở xe bánh mì ở Đầu hẻm.
    const a = await join(url);
    await emit(a.socket, "equipment:buy", { equipmentId: "xe_banh_mi" });
    for (const itemId of [
      "banh_mi_phoi",
      "pate",
      "thit_nguoi",
      "dua_leo",
      "do_chua",
      "hanh",
      "ngo",
      "ot",
      "sot",
      "giay_goi",
    ])
      expect((await emit(a.socket, "market:buy", { itemId, packs: 1 })).ok).toBe(true);
    await emit(a.socket, "biz:update", { lotId: "dau_hem" });
    await emit(a.socket, "biz:attend", { on: true });
    // Quầy đông khách NPC (Luật 7.2) thì An mời khách qua đường đi chỗ khác để chừa chỗ cho hàng xóm.
    const shoo = (o: OrderEvent) => {
      if (!o.buyerId) void emit(a.socket, "order:decline", { orderId: o.orderId });
    };
    a.socket.on("order", shoo);
    expect((await emit(a.socket, "biz:open", {})).ok).toBe(true);

    // Bình vào xóm An, thấy quầy An kèm thực đơn.
    const b = await join(url);
    const moved = next(b.socket, "snapshot", (s: Snapshot) => s.roster.code === a.snap.roster.code);
    await emit(b.socket, "xom:join", { code: a.snap.roster.code });
    const stall = (await moved).world.lots.find((l) => l.ownerId === a.snap.me.playerId);
    expect(stall?.menu.some((m) => m.variantId === "banh_mi_thit" && m.on)).toBe(true);
    if (!stall) throw new Error("không thấy quầy");
    // Chỉ đủ nguyên liệu bánh mì thịt → hàng xóm thấy các món khác "hết".
    expect(stall.available).toEqual(["banh_mi_thit"]);
    const order = { businessId: stall.businessId, variantId: "banh_mi_thit", mods: ["khong_hanh"] };

    // Đứng xa thì không gọi được.
    b.socket.emit("move", { x: 30, z: 5, yaw: 0, moving: false, inside: null });
    await new Promise((r) => setTimeout(r, 120));
    expect(await emit(b.socket, "shop:order", order)).toMatchObject({
      ok: false,
      message: "Lại gần quầy mới gọi món được",
    });
    const lot = content.lot("dau_hem").position;
    b.socket.emit("move", { x: lot.x + 1, z: lot.z + 1.2, yaw: 0, moving: false, inside: null });
    await new Promise((r) => setTimeout(r, 120));

    const got = next(a.socket, "order", (o: OrderEvent) => o.buyerId === b.snap.me.playerId);
    const placed = await emit(b.socket, "shop:order", order);
    expect(placed.ok ? "ok" : placed.message).toBe("ok");
    // Hàng xóm đã vào hàng: thôi mời khách khác đi (khỏi dính giới hạn thao tác/giây khi tính tiền).
    a.socket.off("order", shoo);
    await new Promise((r) => setTimeout(r, 1_100));
    const o = await got;
    expect(o).toMatchObject({ buyerName: "Tuấn Test", dish: "bánh mì thịt, không hành" });
    expect(o.spec.rau).not.toContain("hanh");
    // Gọi thêm khi đang chờ → từ chối.
    expect((await emit(b.socket, "shop:order", order)).ok).toBe(false);

    // An làm sai (quên bỏ hành) → Bình thấy báo sai; làm lại đúng.
    const wrongSeen = next(
      b.socket,
      "orderUpdate",
      (u: OrderUpdateEvent) => u.orderId === o.orderId,
    );
    await emit(a.socket, "order:make", {
      orderId: o.orderId,
      build: { ...o.spec, rau: ["dua_leo", "do_chua", "hanh", "ngo"] },
    });
    expect((await wrongSeen).line).toMatch(/^❌ Sai phần/);
    await emit(a.socket, "order:make", { orderId: o.orderId, build: o.spec });

    // Tính tiền: món lặt vặt nên Bình "tự chọn" trả tiền mặt — đưa một tờ, An thối lại; không boa tự động.
    expect(o.pay).toEqual({ kind: "cash", bill: billFor(o.price) });
    const bMoney = next(b.socket, "me", (m: MeView) => m.money === b.snap.me.money - o.price);
    const done = next(b.socket, "orderResult", (r: OrderResultEvent) => r.orderId === o.orderId);
    const paid = await emit(a.socket, "order:pay", { orderId: o.orderId, change: changeFor(o) });
    expect(paid.ok ? paid.data.today.revenue : paid.message).toBe(o.price);
    expect(paid.ok && paid.data.today.tips).toBe(0);
    await bMoney;
    expect(await done).toMatchObject({ served: true, received: o.price });
    a.socket.disconnect();
    b.socket.disconnect();
  });

  it("sạp đồ ăn theo giờ: đứng gần, sạp đang bày thì mua được; sạp tối chưa bày thì không", async () => {
    const b = await join(url);
    const xoi = content.data.vendors.find((v) => v.id === "xoi_ba_bay");
    if (!xoi) throw new Error("không có sạp xôi");
    b.socket.emit("move", { x: 20, z: 4, yaw: 0, moving: false, inside: null });
    await new Promise((r) => setTimeout(r, 120));
    expect(
      await emit(b.socket, "vendor:buy", { vendorId: xoi.id, itemId: "xoi_ga" }),
    ).toMatchObject({
      ok: false,
      message: "Lại gần sạp mới mua được",
    });
    b.socket.emit("move", { ...xoi.position, yaw: 0, moving: false, inside: null });
    await new Promise((r) => setTimeout(r, 120));
    const heard = next(b.socket, "say", (e: SayEvent) => e.who === `vendor:${xoi.id}`);
    const bought = await emit(b.socket, "vendor:buy", { vendorId: xoi.id, itemId: "xoi_ga" });
    expect(bought.ok && bought.data.money).toBe(b.snap.me.money - 20_000);
    expect((await heard).text).toMatch(/Xôi gà/);
    // Ốc đêm chưa bày buổi sáng.
    const oc = content.data.vendors.find((v) => v.id === "oc_dem");
    if (!oc) throw new Error("không có sạp ốc");
    b.socket.emit("move", { ...oc.position, yaw: 0, moving: false, inside: null });
    await new Promise((r) => setTimeout(r, 120));
    const closed = await emit(b.socket, "vendor:buy", { vendorId: oc.id, itemId: "oc_huong" });
    expect(closed.ok).toBe(false);
    b.socket.disconnect();
  });
});
