import type { INestApplication } from "@nestjs/common";
import type {
  Ack,
  ClientToServerEvents,
  DayReportView,
  DishView,
  MeView,
  OrderEvent,
  OrderResultEvent,
  ServerToClientEvents,
  Snapshot,
} from "@xom/shared";
import { io, type Socket } from "socket.io-client";
import { register, startApp } from "./helpers.js";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

function connect(url: string, token: string): Promise<{ socket: Client; snapshot: Snapshot }> {
  return new Promise((resolve, reject) => {
    const socket: Client = io(url, {
      path: "/socket.io",
      addTrailingSlash: false,
      transports: ["websocket"],
      auth: { token },
    });
    socket.once("snapshot", (snapshot) => resolve({ socket, snapshot }));
    socket.once("connect_error", (err) => {
      socket.close();
      reject(err);
    });
  });
}

function emit<T = MeView>(
  socket: Client,
  event: keyof ClientToServerEvents,
  payload: unknown,
): Promise<Ack<T>> {
  return new Promise((resolve) => {
    // biome-ignore lint/suspicious/noExplicitAny: emit generic qua union event
    (socket.emit as any)(event, payload, resolve);
  });
}

const nextOrder = (socket: Client) =>
  new Promise<OrderEvent>((resolve) => socket.once("order", resolve));
const nextResult = (socket: Client, orderId: string) =>
  new Promise<OrderResultEvent>((resolve) => {
    const on = (r: OrderResultEvent) => {
      if (r.orderId !== orderId) return;
      socket.off("orderResult", on);
      resolve(r);
    };
    socket.on("orderResult", on);
  });
const changeFor = (o: OrderEvent) => (o.pay.kind === "cash" ? o.pay.bill - o.price : null);

/** Nguyên liệu đủ làm bánh mì thịt (không có xíu mại, trứng, bơ). */
const BANH_MI_THIT = [
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
];

async function openBanhMiStall(url: string) {
  const { body } = await register(url);
  const { socket, snapshot } = await connect(url, body.accessToken);
  await emit(socket, "equipment:buy", { equipmentId: "xe_banh_mi" });
  for (const itemId of BANH_MI_THIT) {
    const r = await emit(socket, "market:buy", { itemId, packs: 1 });
    expect(r.ok).toBe(true);
  }
  await emit(socket, "biz:update", { lotId: "dau_hem" });
  await emit(socket, "biz:attend", { on: true });
  const opened = await emit(socket, "biz:open", {});
  expect(opened).toMatchObject({ ok: true });
  return { socket, snapshot };
}

describe("Vòng chơi làm thật (e2e)", () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  it("socket không token bị từ chối", async () => {
    await expect(connect(url, "sai")).rejects.toThrow("unauthorized");
  });

  it("mua nguyên liệu theo gói; thiếu tiền thì không mua được", async () => {
    const { body } = await register(url);
    const { socket, snapshot } = await connect(url, body.accessToken);
    expect(snapshot.me.money).toBe(500_000);
    const bought = await emit(socket, "market:buy", { itemId: "banh_mi_phoi", packs: 2 });
    expect(bought.ok && bought.data.inventory).toEqual([
      { itemId: "banh_mi_phoi", qty: 20, expiring: 20 },
    ]);
    const tooMuch = await emit(socket, "market:buy", { itemId: "kep_hong", packs: 50 });
    expect(tooMuch).toMatchObject({ ok: false, error: "insufficient_funds" });
    const unknown = await emit(socket, "market:buy", { itemId: "vang_bac", packs: 1 });
    expect(unknown.ok).toBe(false);
    socket.disconnect();
  });

  it("khách chỉ gọi món làm được; làm đúng + thối đúng → tiền vào ví, có boa", async () => {
    const { socket } = await openBanhMiStall(url);
    const order = await nextOrder(socket);
    expect(order.variantId).toBe("banh_mi_thit"); // chỉ đủ nguyên liệu bánh mì thịt
    expect(order.ask).toMatch(/^Cho con ổ bánh mì thịt/);

    // Chưa làm món mà tính tiền → từ chối.
    const early = await emit(socket, "order:pay", { orderId: order.orderId, change: 0 });
    expect(early.ok).toBe(false);

    const made = await emit<{ me: MeView; correct: boolean }>(socket, "order:make", {
      orderId: order.orderId,
      build: order.spec,
    });
    expect(made.ok && made.data.correct).toBe(true);
    // Nguyên liệu bị trừ theo món.
    const phoi = made.ok ? made.data.me.inventory.find((i) => i.itemId === "banh_mi_phoi") : null;
    expect(phoi?.qty).toBe(9);

    const result = nextResult(socket, order.orderId);
    const paid = await emit(socket, "order:pay", {
      orderId: order.orderId,
      change: changeFor(order),
    });
    expect(paid.ok && paid.data.today.revenue).toBe(order.price);
    expect(paid.ok && paid.data.today.tips).toBeGreaterThanOrEqual(1_000);
    // Làm thật mới có kinh nghiệm (DESIGN §4): bán đúng một món = +10 KN.
    expect(paid.ok && paid.data.progress).toMatchObject({ xp: 10, level: 1, served: 1 });
    expect(await result).toMatchObject({ served: true, received: order.price });
    socket.disconnect();
  });

  it("làm sai món: khách phàn nàn; phải làm lại hoặc giảm 50%", async () => {
    const { socket } = await openBanhMiStall(url);
    const order = await nextOrder(socket);
    const wrong: DishView = {
      ...order.spec,
      ot: order.spec.ot === "ot_nhieu" ? "ot_vua" : "ot_nhieu",
    };
    const made = await emit<{ correct: boolean; mistakes: string[] }>(socket, "order:make", {
      orderId: order.orderId,
      build: wrong,
    });
    expect(made.ok && made.data).toMatchObject({ correct: false, mistakes: ["ot"] });
    const noDiscount = await emit(socket, "order:pay", { orderId: order.orderId, change: 0 });
    expect(noDiscount).toMatchObject({ ok: false, message: expect.stringMatching(/làm lại/) });
    const half = Math.round(order.price / 2 / 1000) * 1000;
    const change = order.pay.kind === "cash" ? order.pay.bill - half : null;
    const paid = await emit(socket, "order:pay", {
      orderId: order.orderId,
      change,
      discount: true,
    });
    expect(paid.ok && paid.data.today.revenue).toBe(half);
    expect(paid.ok && paid.data.today.tips).toBe(0);
    socket.disconnect();
  });

  it("thối thiếu: khách đòi đủ, không lời thêm; thiếu nguyên liệu thì không làm được", async () => {
    const { socket } = await openBanhMiStall(url);
    let order = await nextOrder(socket);
    while (order.pay.kind !== "cash" || order.pay.bill === order.price) {
      await emit(socket, "order:decline", { orderId: order.orderId });
      order = await nextOrder(socket);
    }
    // Thử làm bằng xíu mại (không có trong kho) → bị từ chối, không trừ gì.
    const noStock = await emit(socket, "order:make", {
      orderId: order.orderId,
      build: { ...order.spec, nhan: "xiu_mai" },
    });
    expect(noStock).toMatchObject({ ok: false, message: expect.stringMatching(/Thiếu xíu mại/) });

    await emit(socket, "order:make", { orderId: order.orderId, build: order.spec });
    const result = nextResult(socket, order.orderId);
    const short = (changeFor(order) ?? 0) - 2_000;
    const paid = await emit(socket, "order:pay", { orderId: order.orderId, change: short });
    expect(paid.ok && paid.data.today.revenue).toBe(order.price);
    expect(await result).toMatchObject({ outcome: "short" });
    socket.disconnect();
  });

  it("vắng chủ thì không có khách; nói chuyện với Bà Năm tăng thân thiết; rao hàng", async () => {
    const { socket } = await openBanhMiStall(url);
    const greet = await emit<{ line: string; friendship: number }>(socket, "npc:talk", {
      npcId: "cho_dau_moi",
      topic: "greet",
    });
    // 10 lần mua ở chợ (+1 mỗi lần) + chào (+2).
    expect(greet.ok && greet.data.friendship).toBe(12);
    const again = await emit<{ friendship: number }>(socket, "npc:talk", {
      npcId: "cho_dau_moi",
      topic: "greet",
    });
    expect(again.ok && again.data.friendship).toBe(12);
    const gossip = await emit<{ line: string }>(socket, "npc:talk", {
      npcId: "cho_dau_moi",
      topic: "gossip",
    });
    expect(gossip.ok && gossip.data.line.length).toBeGreaterThan(5);

    const said = new Promise((resolve) => socket.once("say", resolve));
    const notified = new Promise((resolve) => socket.once("notify", resolve));
    await emit(socket, "chat:say", { phraseId: "rao_hang" });
    expect(await said).toMatchObject({ text: expect.stringMatching(/Mời ghé/) });
    expect(await notified).toMatchObject({ kind: "good" });

    await emit(socket, "biz:attend", { on: false });
    let orders = 0;
    socket.on("order", () => orders++);
    await new Promise((r) => setTimeout(r, 1500));
    expect(orders).toBe(0);
    socket.disconnect();
  });

  it("thực đơn: tắt hết món không được; hết ngày nguyên liệu tươi bị bỏ", async () => {
    const { socket } = await openBanhMiStall(url);
    for (const v of ["banh_mi_xiu_mai", "banh_mi_trung"]) {
      expect((await emit(socket, "biz:menu", { variantId: v, on: false })).ok).toBe(true);
    }
    const none = await emit(socket, "biz:menu", { variantId: "banh_mi_thit", on: false });
    expect(none).toMatchObject({ ok: false, message: expect.stringMatching(/ít nhất một món/) });
    const priced = await emit(socket, "biz:menu", { variantId: "banh_mi_thit", price: 20_000 });
    expect(
      priced.ok && priced.data.business?.menu.find((m) => m.variantId === "banh_mi_thit")?.price,
    ).toBe(20_000);

    const report = await new Promise<DayReportView>((resolve) => socket.once("dayEnd", resolve));
    expect(report.spoiledQty).toBeGreaterThan(0); // bánh mì phôi, rau hết hạn trong ngày
    const next = await new Promise<Snapshot>((resolve) => socket.once("snapshot", resolve));
    expect(next.me.business?.open).toBe(false);
    expect(next.me.inventory.some((i) => i.itemId === "banh_mi_phoi")).toBe(false);
    expect(next.me.inventory.some((i) => i.itemId === "sot")).toBe(true); // không hỏng
    socket.disconnect();
  });

  it("tiến độ kịch bản được lưu", async () => {
    const { body } = await register(url);
    const { socket, snapshot } = await connect(url, body.accessToken);
    expect(snapshot.me.tutorial).toBe("gap_chu_bay");
    expect((await emit(socket, "tutorial:set", { step: "khong_co" })).ok).toBe(false);
    const set = await emit(socket, "tutorial:set", { step: "den_vua_xe" });
    expect(set.ok && set.data.tutorial).toBe("den_vua_xe");
    socket.disconnect();
  });
});
