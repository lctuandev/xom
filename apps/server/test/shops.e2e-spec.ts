import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type { MeView, MyStatsView, NotifyEvent } from "@xom/shared";
import { emit, join, next } from "./client.js";
import { startApp } from "./helpers.js";

// Nhiều cửa hàng + kho riêng từng tiệm (docs/IA.md bước D, UC-F14): mua thêm đồ nghề = mở thêm cửa hàng (không giới hạn);
// mỗi cửa hàng một kho; chọn cửa hàng đang quản lý; chuyển kho tới sau vài phút game; đổi nghề giữ cửa hàng + kho cũ.

describe("Nhiều cửa hàng (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  const ok = async (p: Promise<unknown>) => {
    const r = (await p) as { ok: boolean; data?: MeView; message?: string };
    if (!r.ok || !r.data) throw new Error(r.message ?? "lỗi");
    return r.data;
  };

  it("mở thêm cửa hàng, kho riêng, chọn cửa hàng, chuyển kho có thời gian, đổi nghề giữ kho", async () => {
    const { socket } = await join(url);
    await emit(socket, "debug:clock", { minute: 8 * 60 });
    await emit(socket, "debug:grant", { money: 3_000_000 });

    // Cửa hàng A: xe bánh mì, nhập pate vào kho A.
    const a = await ok(emit(socket, "equipment:buy", { equipmentId: "xe_banh_mi" }));
    expect(a.shops).toHaveLength(1);
    const aId = a.shops[0]?.id ?? "";
    const pack = content.ingredient("pate").packSize;
    const stocked = await ok(emit(socket, "market:buy", { itemId: "pate", packs: 1 }));
    expect(stocked.inventory.find((i) => i.itemId === "pate")?.qty).toBe(pack);

    // Mua thêm đồ nghề = MỞ THÊM cửa hàng B (không thay A), B thành cửa hàng đang quản lý, kho B trống.
    const b = await ok(emit(socket, "equipment:buy", { equipmentId: "xe_tra_sua" }));
    expect(b.shops).toHaveLength(2);
    const bId = b.shops.find((s) => s.id !== aId)?.id ?? "";
    expect(b.business?.id).toBe(bId);
    expect(b.shops.find((s) => s.id === bId)?.active).toBe(true);
    expect(b.inventory).toEqual([]);

    // Chọn lại A: kho A còn nguyên pate.
    const backA = await ok(emit(socket, "biz:select", { businessId: aId }));
    expect(backA.business?.id).toBe(aId);
    expect(backA.inventory.find((i) => i.itemId === "pate")?.qty).toBe(pack);

    // Chuyển 3 pate từ A sang B: A trừ ngay; B chưa có (đang chở).
    const moved = await ok(emit(socket, "stock:transfer", { toId: bId, itemId: "pate", qty: 3 }));
    expect(moved.inventory.find((i) => i.itemId === "pate")?.qty).toBe(pack - 3);
    const tooMany = await emit(socket, "stock:transfer", { toId: bId, itemId: "pate", qty: 999 });
    expect(tooMany.ok).toBe(false);
    const inB = await ok(emit(socket, "biz:select", { businessId: bId }));
    expect(inB.inventory).toEqual([]);

    // Sau `transferMinutes` phút game: hàng tới B.
    const arrived = next(socket, "notify", (n: NotifyEvent) => n.text.startsWith("📦 Hàng chuyển"));
    await emit(socket, "debug:clock", { minute: 8 * 60 + content.economy.transferMinutes + 5 });
    await arrived;
    const later = await ok(emit(socket, "biz:attend", { on: false }));
    expect(later.inventory.find((i) => i.itemId === "pate")?.qty).toBe(3);

    // Không chuyển sang cửa hàng không phải của mình.
    const other = await join(url);
    await emit(other.socket, "equipment:buy", { equipmentId: "xe_banh_mi" });
    const theirs = (await ok(emit(other.socket, "biz:attend", { on: false }))).shops[0]?.id ?? "";
    const steal = await emit(socket, "stock:transfer", { toId: theirs, itemId: "pate", qty: 1 });
    expect(steal.ok).toBe(false);
    expect((await emit(socket, "biz:select", { businessId: theirs })).ok).toBe(false);

    // Đổi nghề cửa hàng B (replace): vẫn 2 cửa hàng, B giữ id + kho, đổi món; được bán lại nửa giá xe cũ.
    const before = later.money + later.bank;
    const price = content.equipment("sap_phu_kien").price;
    const resale = Math.round((content.equipment("xe_tra_sua").price * 0.5) / 1000) * 1000;
    const swapped = await ok(
      emit(socket, "equipment:buy", { equipmentId: "sap_phu_kien", mode: "replace" }),
    );
    expect(swapped.shops).toHaveLength(2);
    expect(swapped.business?.id).toBe(bId);
    expect(swapped.business?.equipmentId).toBe("sap_phu_kien");
    expect(swapped.inventory.find((i) => i.itemId === "pate")?.qty).toBe(3);
    expect(swapped.money + swapped.bank).toBe(before - price + resale);
    socket.disconnect();
    other.socket.disconnect();
  });

  it("chủ tự đứng bán một cửa hàng một lúc: đứng quầy theo cửa hàng đang quản lý", async () => {
    const { socket } = await join(url);
    await emit(socket, "debug:grant", { money: 3_000_000 });
    const a = await ok(emit(socket, "equipment:buy", { equipmentId: "xe_banh_mi" }));
    const aId = a.shops[0]?.id ?? "";
    await ok(emit(socket, "equipment:buy", { equipmentId: "xe_tra_sua" }));
    // Đang quản lý B mà báo đứng quầy → đứng ở B; chọn A thì thôi đứng ở B.
    const atB = await ok(emit(socket, "biz:attend", { on: true }));
    expect(atB.attending).toBe(true);
    const selA = await ok(emit(socket, "biz:select", { businessId: aId }));
    expect(selA.attending).toBe(false);
    socket.disconnect();
  });

  it("sổ theo cửa hàng (góp ý đợt 4): nhập hàng cho cửa hàng nào thì ghi vào sổ cửa hàng đó", async () => {
    const { socket } = await join(url);
    await emit(socket, "debug:clock", { minute: 8 * 60 });
    await emit(socket, "debug:grant", { money: 3_000_000 });
    const a = await ok(emit(socket, "equipment:buy", { equipmentId: "xe_banh_mi" }));
    const aId = a.shops[0]?.id ?? "";
    await ok(emit(socket, "market:buy", { itemId: "pate", packs: 1 }));
    const b = await ok(emit(socket, "equipment:buy", { equipmentId: "xe_tra_sua" }));
    const bId = b.shops.find((s) => s.id !== aId)?.id ?? "";
    await ok(emit(socket, "market:buy", { itemId: "da", packs: 2 }));
    const r = await emit<MyStatsView>(socket, "stats:me", {});
    if (!r.ok) throw new Error(r.message);
    const today = (id: string) => r.data.shops?.find((s) => s.businessId === id)?.days.at(-1);
    const pate = content.ingredient("pate");
    expect(today(aId)?.costs.stock).toBeGreaterThan(0);
    expect(today(bId)?.costs.stock).toBeGreaterThan(0);
    expect(today(aId)?.costs.stock).not.toBe(today(bId)?.costs.stock);
    // Tổng của người chơi = cộng các cửa hàng.
    expect(r.data.days.at(-1)?.costs.stock).toBe(
      (today(aId)?.costs.stock ?? 0) + (today(bId)?.costs.stock ?? 0),
    );
    expect(pate.packSize).toBeGreaterThan(0);
    socket.disconnect();
  });
});
