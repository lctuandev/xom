import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type { MeView } from "@xom/shared";
import { shopEstimate } from "@xom/sim";
import { connect, emit } from "./client.js";
import { register, startApp, uniqueName } from "./helpers.js";

// ＋ Mở cửa hàng mới (docs/CUAHANG.md — góp ý đợt 5): chọn đồ nghề + chỗ, làm ngay trong sheet (không phải đứng ở vựa xe);
// xe đẩy vỉa hè / sạp ô đất (phí dựng) / tiệm nhà mặt tiền (ký thuê, cọc). Thiếu tiền hoặc chỗ có người thì từ chối, không trừ.

describe("Mở cửa hàng mới (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  const enter = async (opts: { solo?: boolean; xom?: string } = { solo: true }) => {
    const { body } = await register(url, uniqueName(), opts);
    return connect(url, body.accessToken);
  };
  const ok = async (p: Promise<unknown>) => {
    const r = (await p) as { ok: boolean; data?: MeView; message?: string };
    if (!r.ok || !r.data) throw new Error(r.message ?? "lỗi");
    return r.data;
  };

  it("xe đẩy vỉa hè: mua đồ nghề + chọn chỗ một bước, không cần đứng ở vựa xe", async () => {
    const a = await enter();
    const eq = content.equipment("xe_banh_mi");
    const me0 = a.snap.me;
    const me = await ok(emit(a.socket, "shop:new", { equipmentId: eq.id, lotId: "dau_hem" }));
    expect(me.shops).toHaveLength(1);
    expect(me.business?.lotId).toBe("dau_hem");
    expect(me.money + me.bank).toBe(me0.money + me0.bank - eq.price);
    a.socket.disconnect();
  });

  it("tiệm nhà mặt tiền: ký thuê luôn (cọc); thiếu tiền thì từ chối mà không mất tiền đồ nghề", async () => {
    const a = await enter();
    // Mở xe đẩy trước cho vơi tiền (còn ~1,3tr) — tiệm số 24 + trà sữa cần 2,35tr.
    const first = await ok(
      emit(a.socket, "shop:new", { equipmentId: "xe_banh_mi", lotId: "dau_hem" }),
    );
    const eq = content.equipment("xe_tra_sua");
    const est = shopEstimate(content, "nha_so_24", eq.products[0] ?? "");
    expect(first.money + first.bank).toBeLessThan(eq.price + est.deposit + est.reserve);
    const poor = await emit<MeView>(a.socket, "shop:new", {
      equipmentId: eq.id,
      lotId: "nha_so_24",
    });
    expect(poor).toMatchObject({ ok: false, error: "insufficient_funds" });
    const same = await ok(emit(a.socket, "debug:grant", { money: 1_000 }));
    expect(same.shops).toHaveLength(1);
    expect(same.money + same.bank).toBe(first.money + first.bank + 1_000);

    await ok(emit(a.socket, "debug:grant", { money: 5_000_000 }));
    const me = await ok(emit(a.socket, "shop:new", { equipmentId: eq.id, lotId: "nha_so_24" }));
    expect(me.shops).toHaveLength(2);
    expect(me.business?.lotId).toBe("nha_so_24");
    expect(me.business?.leaseLotId).toBe("nha_so_24");
    a.socket.disconnect();
  });

  it("chỗ đã có người dùng thì từ chối, không tạo cửa hàng", async () => {
    const a = await enter();
    await ok(emit(a.socket, "shop:new", { equipmentId: "xe_banh_mi", lotId: "dau_hem" }));
    const b = await enter({ xom: a.snap.roster.code });
    const r = await emit(b.socket, "shop:new", { equipmentId: "xe_tra_sua", lotId: "dau_hem" });
    expect(r).toMatchObject({ ok: false });
    const view = await emit<MeView>(b.socket, "debug:grant", { money: 1_000 });
    if (view.ok) expect(view.data.shops).toHaveLength(0);
    a.socket.disconnect();
    b.socket.disconnect();
  });
});
