import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type { MeView } from "@xom/shared";
import { resaleValue } from "@xom/sim";
import { emit, join } from "./client.js";
import { startApp } from "./helpers.js";

// Thanh lý hàng tồn cho chợ Bà Năm (góp ý chơi thử: đổi nghề thì kẹt hàng cũ).

describe("Thanh lý hàng tồn (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  it("phải đứng ở chợ; bán hết một loại với giá thấp hơn giá gốc; hết hàng thì báo", async () => {
    const { socket } = await join(url);
    await emit(socket, "equipment:buy", { equipmentId: "xe_banh_mi" });
    const bought = await emit<MeView>(socket, "market:buy", { itemId: "pate", packs: 1 });
    if (!bought.ok) throw new Error("không mua được");
    const ing = content.ingredient("pate");

    socket.emit("move", { x: 40, z: -20, yaw: 0, moving: false, inside: null });
    await new Promise((r) => setTimeout(r, 80));
    expect(await emit(socket, "market:sell", { itemId: "pate" })).toMatchObject({
      ok: false,
      message: expect.stringMatching(/Ra chợ/),
    });

    const cho = content.place("cho_dau_moi").position;
    socket.emit("move", { x: cho.x, z: cho.z - 1.4, yaw: 0, moving: false, inside: null });
    await new Promise((r) => setTimeout(r, 80));
    const sold = await emit<MeView>(socket, "market:sell", { itemId: "pate" });
    const value = resaleValue(ing.costPerUnit, ing.packSize, content.economy.resaleRate);
    expect(sold.ok && sold.data.money - bought.data.money).toBe(value);
    expect(value).toBeLessThan(ing.costPerUnit * ing.packSize);
    expect(sold.ok && sold.data.inventory.find((i) => i.itemId === "pate")).toBeUndefined();
    expect(await emit(socket, "market:sell", { itemId: "pate" })).toMatchObject({
      ok: false,
      message: expect.stringMatching(/Không còn/),
    });
    socket.disconnect();
  });
});
