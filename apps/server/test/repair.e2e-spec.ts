import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type { InspectResult, MakeResult, OrderEvent, OrderUpdateEvent } from "@xom/shared";
import { changeFor, emit, join, next } from "./client.js";
import { startApp } from "./helpers.js";

// Tiệm sửa xe (docs/NGHE.md §3.1, docs/USECASES.md UC-G1…G4): khách kể triệu chứng, chủ tiệm kiểm tra
// bộ phận (server trả kết quả), chọn cách sửa, lấy phụ tùng trong kho; sửa sai bệnh thì chạy thử vẫn hư.

const PARTS = ["mieng_va", "ruot_xe", "bugi", "ma_phanh", "bong_den"];

describe("Tiệm sửa xe (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("khách kể triệu chứng → kiểm tra bộ phận → sửa sai thì vẫn hư → sửa đúng, tính tiền", async () => {
    const { socket } = await join(url);
    await emit(socket, "debug:weather", { kind: "sunny", minutes: 960 });
    expect((await emit(socket, "equipment:buy", { equipmentId: "xe_do_nghe" })).ok).toBe(true);
    for (const itemId of PARTS) {
      const r = await emit(socket, "market:buy", { itemId, packs: 1 });
      if (!r.ok) throw new Error(`mua ${itemId}: ${r.message}`);
    }
    await wait(1_100);
    await emit(socket, "biz:update", { lotId: "nga_tu" });
    await emit(socket, "biz:attend", { on: true });
    const opened = await emit(socket, "biz:open", {});
    if (!opened.ok) throw new Error(`không mở được tiệm: ${opened.message}`);

    const repair = content.product("sua_xe");
    const order: OrderEvent = await next(socket, "order");
    const variant = repair.recipe.variants.find((v) => v.id === order.variantId);
    // Khách chỉ nói triệu chứng, không nói bệnh.
    expect(variant?.symptoms).toContain(order.ask);
    expect(order.ask).not.toContain(variant?.name ?? "???");

    // Kiểm tra từng bộ phận: đúng chỗ thì thấy bệnh, chỗ khác bình thường.
    const parts = repair.diagnosis?.parts.map((p) => p.id) ?? [];
    const findings: Record<string, string> = {};
    let last: InspectResult | null = null;
    for (const part of parts) {
      const r = await emit<InspectResult>(socket, "order:inspect", {
        orderId: order.orderId,
        part,
      });
      if (!r.ok) throw new Error(`kiểm tra ${part}: ${r.message}`);
      findings[part] = r.data.finding;
      last = r.data;
    }
    for (const part of parts) {
      expect(findings[part]).toBe(variant?.findings[part] ?? repair.diagnosis?.ok);
    }
    // Kiểm tra lung tung quá 3 lần: khách sốt ruột (hạn chờ rút lại nhưng còn ít nhất vài giây).
    expect(last?.expiresAt).toBeGreaterThan(Date.now());
    expect(
      await emit(socket, "order:inspect", { orderId: order.orderId, part: "banh_lai" }),
    ).toMatchObject({ ok: false, error: "invalid_payload" });

    // Sửa sai bệnh (bơm hơi cho xe hư bugi…): chạy thử vẫn hư.
    const wrongFix = order.spec.sua === "bom_hoi" ? "tang_xich" : "bom_hoi";
    const complaint = next(socket, "orderUpdate", (u: OrderUpdateEvent) => u.stage === "wrong");
    const wrong = await emit<MakeResult>(socket, "order:make", {
      orderId: order.orderId,
      build: { ...order.spec, sua: wrongFix },
    });
    expect(wrong.ok && wrong.data.correct).toBe(false);
    expect((await complaint).line).toBe(repair.diagnosis?.stillBroken);

    // Sửa đúng: máy nổ, tính tiền (thối đúng).
    await wait(150);
    const made = await emit<MakeResult>(socket, "order:make", {
      orderId: order.orderId,
      build: order.spec,
    });
    expect(made.ok && made.data.correct).toBe(true);
    const paid = await emit(socket, "order:pay", {
      orderId: order.orderId,
      change: changeFor(order),
    });
    expect(paid.ok).toBe(true);
    socket.disconnect();
  });
});
