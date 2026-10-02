import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type { MeView } from "@xom/shared";
import { changeFor, emit, join, next, openBanhMiStall } from "./client.js";
import { startApp } from "./helpers.js";

// Kỹ năng + mở khoá theo cấp (docs/USECASES.md UC-P1, DESIGN §4, Luật 4.2).

describe("Kỹ năng & mở khoá (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  it("nhà mặt tiền không khoá theo cấp nữa mà cần hợp đồng thuê (UC-F12)", async () => {
    const { socket } = await join(url);
    await emit(socket, "equipment:buy", { equipmentId: "xe_banh_mi" });
    expect(await emit(socket, "biz:update", { lotId: "nha_so_10" })).toMatchObject({
      ok: false,
      message: expect.stringMatching(/hợp đồng thuê/),
    });
    socket.disconnect();
  });

  it("làm thật mới lên kỹ năng: chào hỏi → ăn nói; bán kịp → tay nhanh", async () => {
    const { socket } = await openBanhMiStall(url);
    const cho = content.place("cho_dau_moi").position;
    socket.emit("move", { x: cho.x, z: cho.z - 1.4, yaw: 0, moving: false, inside: null });
    await new Promise((r) => setTimeout(r, 80));
    const greet = await emit(socket, "npc:talk", { npcId: "cho_dau_moi", topic: "greet" });
    expect(greet.ok).toBe(true);
    const me1 = await emit<MeView>(socket, "biz:attend", { on: true });
    expect(me1.ok && me1.data.progress.skills.an_noi).toBe(1);

    const o = await next(socket, "order");
    await emit(socket, "order:make", { orderId: o.orderId, build: o.spec });
    const paid = await emit<MeView>(socket, "order:pay", {
      orderId: o.orderId,
      change: changeFor(o),
    });
    expect(paid.ok && paid.data.progress.skills.tay_nhanh).toBe(1);
    socket.disconnect();
  });
});
