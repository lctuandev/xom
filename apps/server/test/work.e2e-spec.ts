import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type {
  Ack,
  ClientToServerEvents,
  PayslipView,
  ServerToClientEvents,
  ShiftView,
  WorkResult,
} from "@xom/shared";
import { linesOf } from "@xom/sim";
import { io, type Socket } from "socket.io-client";
import { register, startApp } from "./helpers.js";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

async function join(url: string): Promise<Client> {
  const { body } = await register(url);
  return new Promise((resolve, reject) => {
    const socket: Client = io(url, {
      path: "/socket.io",
      addTrailingSlash: false,
      transports: ["websocket"],
      auth: { token: body.accessToken },
    });
    socket.once("snapshot", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

function emit(
  socket: Client,
  event: keyof ClientToServerEvents,
  payload: unknown,
): Promise<Ack<WorkResult>> {
  return new Promise((resolve) => {
    // biome-ignore lint/suspicious/noExplicitAny: emit generic qua union event
    (socket.emit as any)(event, payload, resolve);
  });
}
const act = (s: Client, payload: unknown) => emit(s, "work:act", payload);

/** Chờ tới khi trạng thái ca thỏa điều kiện. */
function waitShift(socket: Client, pred: (s: ShiftView) => boolean): Promise<ShiftView> {
  return new Promise((resolve) => {
    const on = (v: ShiftView | null) => {
      if (v && pred(v)) {
        socket.off("shift", on);
        resolve(v);
      }
    };
    socket.on("shift", on);
  });
}

const R = content.data.restaurant;
const D = content.data.delivery;

describe("Vào làm (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  it("đứng quầy: múc đúng thì có tiền việc; múc sai bị trả lại; khay hết phải báo bếp", async () => {
    const s = await join(url);
    const started = await emit(s, "work:start", { jobId: "phu_quan_com", role: "dung_quay" });
    expect(started.ok && started.data.shift?.role).toBe("dung_quay");
    // Không vào hai ca một lúc.
    expect((await emit(s, "work:start", { jobId: "giao_hang", role: "giao_hang" })).ok).toBe(false);

    const v = await waitShift(s, (x) => x.plates.length > 0);
    const plate = v.plates[0];
    if (!plate) throw new Error("không có khách");
    const wrong = await act(s, { kind: "plate", taskId: plate.id, items: [...plate.items, "com"] });
    expect(wrong.ok && wrong.data).toMatchObject({ ok: false });
    expect(wrong.ok && wrong.data.shift?.stats.mistakes).toBe(1);
    const right = await act(s, { kind: "plate", taskId: plate.id, items: plate.items });
    expect(right.ok && right.data).toMatchObject({ ok: true, pay: 3_000 });
    expect(right.ok && right.data.me.today.wages).toBe(3_000);
    // Múc sai cũng tốn món: khay cơm đã giảm 3 phần (2 lần múc cơm cho dĩa sai + 1 dĩa đúng) trở lên.
    expect((right.ok && right.data.shift?.trays.com) ?? 99).toBeLessThanOrEqual(R.trayPortions - 2);

    const refill = await act(s, { kind: "refill", foodId: "suon" });
    expect(refill.ok && refill.data.shift?.refilling.suon).toBeGreaterThan(Date.now());

    const stop = await emit(s, "work:stop", {});
    expect(stop.ok && stop.data.payslip).toMatchObject({
      reason: "stop",
      piece: 3_000,
      mistakes: 1,
    });
    expect(stop.ok && stop.data.shift).toBeNull();
    s.disconnect();
  });

  it("thu ngân: tính dư bị khách bắt; tính thiếu lộ ra khi kiểm két, trừ lương", async () => {
    const s = await join(url);
    await emit(s, "work:start", { jobId: "phu_quan_com", role: "thu_ngan" });
    const v = await waitShift(s, (x) => x.cashier.length > 0);
    const t = v.cashier[0];
    if (!t) throw new Error("không có khách");
    // Tìm lại món trên phiếu để bấm máy.
    const dish = R.dishes.find(
      (d) =>
        t.ticket[0]?.startsWith(d.name) &&
        !R.dishes.some((o) => o.name.length > d.name.length && t.ticket[0]?.startsWith(o.name)),
    );
    if (!dish) throw new Error("không nhận ra món");
    const mods = R.mods.filter((m) => t.ticket[0]?.includes(m.say)).map((m) => m.id);
    const drinks = R.drinks.filter((d) => t.ticket.includes(d.name)).map((d) => d.id);
    const lines = linesOf({ dishId: dish.id, modIds: mods, drinkIds: drinks });

    const over = await act(s, {
      kind: "ring",
      taskId: t.id,
      lines: { ...lines, nuoc_ngot: (lines.nuoc_ngot ?? 0) + 1 },
      change: null,
    });
    expect(over.ok && over.data).toMatchObject({
      ok: false,
      line: expect.stringMatching(/Tính dư/),
    });

    // Bỏ món cuối cùng (trà đá / yêu cầu / hoặc dĩa) → tính thiếu, khách lặng lẽ trả.
    const underLines = { [dish.id]: 1 };
    const underTotal = dish.price;
    const change = t.pay.kind === "cash" ? Math.max(0, t.pay.bill - underTotal) : null;
    const under = await act(s, { kind: "ring", taskId: t.id, lines: underLines, change });
    expect(under.ok && under.data.ok).toBe(true);
    const stop = await emit(s, "work:stop", {});
    const fullTotal =
      dish.price +
      mods.reduce((a, id) => a + (R.mods.find((m) => m.id === id)?.price ?? 0), 0) +
      drinks.reduce((a, id) => a + (R.drinks.find((d) => d.id === id)?.price ?? 0), 0);
    expect(stop.ok && stop.data.payslip?.deductions).toBe(
      Math.min(fullTotal - underTotal, 500_000 + 2_500),
    );
    s.disconnect();
  });

  it("bưng bê: đặt nhầm bàn bị nhắc; đúng bàn có tiền; bàn ăn xong phải dọn", async () => {
    const s = await join(url);
    await emit(s, "work:start", { jobId: "phu_quan_com", role: "bung_be" });
    const v = await waitShift(s, (x) => x.serve.length > 0);
    const t = v.serve[0];
    if (!t) throw new Error("không có dĩa");
    const wrongTable = (t.table % R.tables) + 1;
    expect((await act(s, { kind: "serve", taskId: t.id, table: wrongTable })).ok).toBe(true);
    const right = await act(s, { kind: "serve", taskId: t.id, table: t.table });
    expect(right.ok && right.data).toMatchObject({ ok: true, pay: 2_000 });
    expect(right.ok && right.data.shift?.tables[t.table - 1]).toBe("eating");
    await waitShift(s, (x) => x.tables[t.table - 1] === "dirty");
    const clean = await act(s, { kind: "clean", table: t.table });
    expect(clean.ok && clean.data).toMatchObject({ ok: true, pay: 1_000 });
    await emit(s, "work:stop", {});
    s.disconnect();
  });

  it("giao hàng: nhận đơn → lấy đúng gói → giao đúng nhà, xử lý người mở cửa → nộp tiền", async () => {
    const s = await join(url);
    await emit(s, "work:start", { jobId: "giao_hang", role: "giao_hang" });
    const taken = await act(s, { kind: "take" });
    const orders = (taken.ok && taken.data.shift?.deliveries) || [];
    expect(orders).toHaveLength(D.maxPerTrip);

    const o = orders[0];
    if (!o) throw new Error("không có đơn");
    expect(o.shelf).toContain(o.code);
    const wrongCode = o.shelf.find((c) => c !== o.code);
    const wrong = await act(s, { kind: "pick", taskId: o.id, code: wrongCode });
    expect(wrong.ok && wrong.data).toMatchObject({
      ok: false,
      line: expect.stringMatching(/đọc kỹ mã/),
    });
    for (const d of orders)
      expect((await act(s, { kind: "pick", taskId: d.id, code: d.code })).ok).toBe(true);
    await act(s, { kind: "ride", fast: false });

    let delivered = 0;
    for (const d of orders) {
      const other = D.addresses.find((a) => a.id !== d.addressId)?.id;
      const wrongHouse = await act(s, { kind: "call", taskId: d.id, addressId: other });
      expect(wrongHouse.ok && wrongHouse.data.line).toMatch(/Không phải nhà tôi/);
      const call = await act(s, { kind: "call", taskId: d.id, addressId: d.addressId });
      const cur = call.ok ? call.data.shift?.deliveries.find((x) => x.id === d.id) : undefined;
      if (cur?.stage === "absent") {
        const choice = d.cod > 0 ? "return" : "neighbor";
        expect((await act(s, { kind: "absent", taskId: d.id, choice })).ok).toBe(true);
        if (choice === "neighbor") delivered++;
        continue;
      }
      expect(cur?.stage).toBe("at_door");
      const door = cur?.door;
      if (door?.relation === "stranger") {
        const refuse = await act(s, {
          kind: "handover",
          taskId: d.id,
          accept: false,
          change: null,
        });
        expect(refuse.ok && refuse.data.shift?.deliveries.find((x) => x.id === d.id)?.stage).toBe(
          "later",
        );
        continue;
      }
      const change = door?.pay?.kind === "cash" ? door.pay.bill - d.cod : null;
      const done = await act(s, { kind: "handover", taskId: d.id, accept: true, change });
      expect(done.ok && done.data.shift?.deliveries.find((x) => x.id === d.id)?.stage).toBe(
        "delivered",
      );
      delivered++;
    }
    const settle = await act(s, { kind: "settle" });
    if (delivered > 0) {
      expect(settle.ok && settle.data.pay).toBeGreaterThanOrEqual(12_000 * delivered);
      expect(settle.ok && settle.data.shift?.cashHeld).toBe(0);
    }
    const slip = await new Promise<PayslipView>((resolve) => {
      s.once("payslip", resolve);
      void emit(s, "work:stop", {});
    });
    expect(slip.mistakes).toBe(1); // lấy nhầm gói
    s.disconnect();
  });

  it("phạm lỗi quá nhiều thì bị cho nghỉ; đang trong ca không mở quầy được", async () => {
    const s = await join(url);
    await emit(s, "work:start", { jobId: "giao_hang", role: "giao_hang" });
    const taken = await act(s, { kind: "take" });
    const d = taken.ok ? taken.data.shift?.deliveries[0] : undefined;
    if (!d) throw new Error("không có đơn");
    const fired = new Promise<PayslipView>((resolve) => s.once("payslip", resolve));
    const bad = d.shelf.filter((c) => c !== d.code);
    for (let i = 0; i < content.job("giao_hang").maxStrikes; i++) {
      await act(s, { kind: "pick", taskId: d.id, code: bad[i % bad.length] });
    }
    expect(await fired).toMatchObject({ reason: "fired" });
    s.disconnect();
  });
});
