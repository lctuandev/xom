import type { INestApplication } from "@nestjs/common";
import type {
  Ack,
  ClientToServerEvents,
  DayReportView,
  JobTaskEvent,
  MeView,
  OrderResultEvent,
  SaleEvent,
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

function emit<E extends keyof ClientToServerEvents>(
  socket: Client,
  event: E,
  payload: Parameters<ClientToServerEvents[E]>[0],
): Promise<Ack<MeView>> {
  return new Promise((resolve) => {
    // biome-ignore lint/suspicious/noExplicitAny: emit generic qua union event
    (socket.emit as any)(event, payload, resolve);
  });
}

describe("Vòng chơi (e2e)", () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  it("socket không token bị từ chối", async () => {
    await expect(connect(url, "sai")).rejects.toThrow("unauthorized");
  });

  it("mua xe → nhập hàng → chọn chỗ → mở → bán được → cuối ngày có báo cáo", async () => {
    const { body } = await register(url);
    const { socket, snapshot } = await connect(url, body.accessToken);
    expect(snapshot.me.money).toBe(500_000);
    expect(snapshot.me.business).toBeNull();

    const noBiz = await emit(socket, "biz:open", {});
    expect(noBiz).toMatchObject({ ok: false, error: "invalid_state" });

    const bought = await emit(socket, "equipment:buy", { equipmentId: "xe_banh_mi" });
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    expect(bought.data.money).toBe(500_000 - 320_000);
    expect(bought.data.business?.productId).toBe("banh_mi");

    const tooMuch = await emit(socket, "market:buy", { productId: "banh_mi", qty: 500 });
    expect(tooMuch).toMatchObject({ ok: false, error: "insufficient_funds" });

    const stocked = await emit(socket, "market:buy", { productId: "banh_mi", qty: 10 });
    expect(stocked.ok && stocked.data.inventory).toEqual([{ productId: "banh_mi", qty: 10 }]);

    const noLot = await emit(socket, "biz:open", {});
    expect(noLot).toMatchObject({ ok: false, message: expect.stringMatching(/Chọn chỗ/) });

    // Chỗ đắt (ngã tư 150k) không đủ tiền thuê → phải chọn chỗ vừa túi.
    await emit(socket, "biz:update", { lotId: "nga_tu" });
    // Chưa đứng ở quầy thì không mở được.
    const notThere = await emit(socket, "biz:open", {});
    expect(notThere).toMatchObject({ ok: false, message: expect.stringMatching(/Tới tận quầy/) });
    const attended = await emit(socket, "biz:attend", { on: true });
    expect(attended.ok && attended.data.attending).toBe(true);
    const tooExpensive = await emit(socket, "biz:open", {});
    expect(tooExpensive).toMatchObject({ ok: false, error: "insufficient_funds" });
    await emit(socket, "biz:update", { lotId: "cong_truong", price: 14_000 });
    const opened = await emit(socket, "biz:open", {});
    expect(opened).toMatchObject({ ok: true });
    expect(opened.ok && opened.data.business?.open).toBe(true);

    // Có khách mua → server phát đơn; "Đưa hàng" kịp thì được boa.
    const sale = await new Promise<SaleEvent>((resolve) => socket.once("sale", resolve));
    expect(sale.line.length).toBeGreaterThan(0);
    const result = new Promise<OrderResultEvent>((resolve) => socket.once("orderResult", resolve));
    const served = await emit(socket, "order:serve", { orderId: sale.orderId });
    expect(served.ok && served.data.today.tips).toBeGreaterThanOrEqual(1_000);
    expect(await result).toMatchObject({ orderId: sale.orderId, served: true });
    const again = await emit(socket, "order:serve", { orderId: sale.orderId });
    expect(again.ok).toBe(false);
    const sold = await new Promise<MeView>((resolve) => {
      socket.on("me", (me) => {
        if (me.today.sold > 0) resolve(me);
      });
    });
    expect(sold.today.revenue).toBe(sold.today.sold * 14_000);
    expect(sold.inventory[0]?.qty ?? 0).toBe(10 - sold.today.sold);

    // Hết ngày: báo cáo + bánh mì còn lại bị hỏng, quầy đóng.
    const report = await new Promise<DayReportView>((resolve) => socket.once("dayEnd", resolve));
    expect(report.day).toBe(1);
    expect(report.rent).toBe(80_000);
    expect(report.tips).toBeGreaterThanOrEqual(1_000);
    expect(report.served + report.spoiledQty).toBe(10);
    const next = await new Promise<Snapshot>((resolve) => socket.once("snapshot", resolve));
    expect(next.clock.day).toBe(2);
    expect(next.me.business?.open).toBe(false);
    expect(next.me.inventory).toEqual([]);
    expect(next.me.money).toBe(report.moneyEnd);
    socket.disconnect();
  });

  it("đi làm thuê được trả lương theo giờ, không mở quầy được khi đang làm", async () => {
    const { body } = await register(url);
    const { socket } = await connect(url, body.accessToken);
    await emit(socket, "equipment:buy", { equipmentId: "sap_phu_kien" });
    await emit(socket, "market:buy", { productId: "phu_kien", qty: 2 });
    await emit(socket, "biz:update", { lotId: "dau_hem" });
    const started = await emit(socket, "job:start", { jobId: "phu_quan_com" });
    expect(started.ok && started.data.jobId).toBe("phu_quan_com");
    // Việc vặt: làm kịp được thưởng.
    const task = await new Promise<JobTaskEvent>((resolve) => socket.once("jobTask", resolve));
    const done = await emit(socket, "job:task", { taskId: task.id });
    expect(done.ok && done.data.today.wages).toBeGreaterThanOrEqual(3_000);
    const blocked = await emit(socket, "biz:open", {});
    expect(blocked).toMatchObject({ ok: false, error: "invalid_state" });
    const paid = await new Promise<MeView>((resolve) => {
      socket.on("me", (me) => {
        if (me.today.wages > 0) resolve(me);
      });
    });
    expect(paid.today.wages).toBeGreaterThan(3_000);
    socket.disconnect();
  });

  it("vắng chủ thì quầy không bán; tiến độ kịch bản được lưu", async () => {
    const { body } = await register(url);
    const { socket, snapshot } = await connect(url, body.accessToken);
    expect(snapshot.me.tutorial).toBe("gap_chu_bay");
    const bad = await emit(socket, "tutorial:set", { step: "khong_co" });
    expect(bad.ok).toBe(false);
    const set = await emit(socket, "tutorial:set", { step: "den_vua_xe" });
    expect(set.ok && set.data.tutorial).toBe("den_vua_xe");

    await emit(socket, "equipment:buy", { equipmentId: "xe_banh_mi" });
    await emit(socket, "market:buy", { productId: "banh_mi", qty: 20 });
    await emit(socket, "biz:update", { lotId: "dau_hem" });
    await emit(socket, "biz:attend", { on: true });
    await emit(socket, "biz:open", {});
    await emit(socket, "biz:attend", { on: false });
    let sales = 0;
    socket.on("sale", () => sales++);
    await new Promise((r) => setTimeout(r, 1500));
    expect(sales).toBe(0);
    socket.disconnect();
  });
});
