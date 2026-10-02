import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type { MeView, NotifyEvent, ShopSetupView, StoryEntryView, WorldView } from "@xom/shared";
import { emit, join, next } from "./client.js";
import { startApp } from "./helpers.js";

// Mở tiệm theo quy trình đời thật (docs/USECASES.md UC-F12): thuê nhà (cọc + vốn dự phòng) → đăng ký hộ kinh doanh, đặt tên
// quán → ATTP (tập huấn, đoàn kiểm tra tới tận tiệm) → biển hiệu → mở tiệm.

describe("Mở tiệm (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  type Sock = Parameters<typeof emit>[0];
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const shop = async (socket: Sock, event: Parameters<typeof emit>[1], body: unknown = {}) => {
    const r = await emit<ShopSetupView>(socket, event, body);
    if (!r.ok) throw new Error(`${event}: ${r.message}`);
    return r.data;
  };
  const me = async (socket: Sock) => {
    const r = await emit<MeView>(socket, "biz:attend", { on: true });
    if (!r.ok) throw new Error(r.message);
    return r.data;
  };
  const house = content.lot("nha_so_10");

  it("đi hết quy trình: thuê nhà → hộ kinh doanh → ATTP → biển hiệu → mở tiệm; trả nhà thì hoàn cọc", async () => {
    const { socket, snap } = await join(url);
    await emit(socket, "equipment:buy", { equipmentId: "xe_banh_mi" });
    await emit(socket, "debug:clock", { minute: 7 * 60 });
    const v0 = await shop(socket, "shop:view");
    expect(v0.step).toBe("lease");
    const est = v0.houses.find((h) => h.lotId === "nha_so_10")?.estimate;
    expect(est?.deposit).toBe(house.rentPerDay * content.data.shopSetup.depositDays);

    const before = await me(socket);
    const leased = await shop(socket, "shop:lease", { lotId: "nha_so_10" });
    expect(leased.step).toBe("license");
    const afterLease = await me(socket);
    expect(afterLease.money + afterLease.bank).toBe(
      before.money + before.bank - (est?.deposit ?? 0),
    );
    expect(afterLease.business?.lotId).toBe("nha_so_10");
    // Chưa có giấy tờ thì chưa mở được.
    const early = await emit(socket, "biz:open", {});
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.message).toContain("hộ kinh doanh");

    // Đặt tên quán: tên bậy bị từ chối; tên đẹp thì nộp hồ sơ, chờ xét.
    const bad = await emit(socket, "shop:register", { name: "<>" });
    expect(bad.ok).toBe(false);
    const filed = await shop(socket, "shop:register", { name: "  Bánh Mì   Cô Tấm " });
    expect(filed).toMatchObject({ shopName: "Bánh Mì Cô Tấm", license: "pending" });
    const notYet = await emit(socket, "shop:train", {});
    expect(notYet.ok).toBe(false);
    const approved = next(socket, "notify", (n: NotifyEvent) => n.text.startsWith("🏛️"));
    await emit(socket, "debug:clock", {
      minute: 7 * 60 + content.data.shopSetup.license.minutes + 1,
    });
    await approved;

    // ATTP: tập huấn → hẹn đoàn → đoàn tới, chủ phải có mặt ở tiệm.
    const trained = await shop(socket, "shop:train");
    expect(trained).toMatchObject({ license: "done", trained: true, step: "cert" });
    await wait(1_100);
    const booked = await shop(socket, "shop:book");
    expect(booked.inspect?.arrived).toBe(false);
    const tooSoon = await emit(socket, "shop:meet", {});
    expect(tooSoon.ok).toBe(false);
    const arrived = next(socket, "notify", (n: NotifyEvent) =>
      n.text.startsWith("👮 Đoàn kiểm tra ATTP tới"),
    );
    const t = booked.inspect;
    await emit(socket, "debug:clock", { minute: (t?.minute ?? 0) + 1 });
    await arrived;
    socket.emit("move", { x: 0, z: 0, yaw: 0, moving: false, inside: null });
    await wait(120);
    const away = await emit(socket, "shop:meet", {});
    expect(away.ok).toBe(false);
    socket.emit("move", {
      x: house.position.x,
      z: house.position.z + 1.3,
      yaw: 0,
      moving: false,
      inside: null,
    });
    await wait(120);
    const cert = await shop(socket, "shop:meet");
    expect(cert).toMatchObject({ certified: true, step: "sign" });

    // Biển hiệu tên quán hiện ngoài phố, rồi mở tiệm được.
    const world = next(socket, "world", (w: WorldView) =>
      w.lots.some((l) => l.shopName === "Bánh Mì Cô Tấm"),
    );
    await wait(1_100);
    const signed = await shop(socket, "shop:sign");
    expect(signed.step).toBe("ready");
    await world;
    await me(socket);
    const opened = await emit(socket, "biz:open", {});
    expect(opened.ok).toBe(true);
    const story = await emit<StoryEntryView[]>(socket, "story:list", {});
    expect(story.ok && story.data.some((s) => s.text.includes('"Bánh Mì Cô Tấm"'))).toBe(true);

    // Trả nhà: đang mở thì không được; đóng rồi trả → hoàn cọc, dọn đồ nghề ra.
    const busy = await emit(socket, "shop:unlease", {});
    expect(busy.ok).toBe(false);
    await emit(socket, "biz:close", {});
    const pre = await me(socket);
    const ended = await shop(socket, "shop:unlease");
    expect(ended.lease).toBeNull();
    const post = await me(socket);
    expect(post.money - pre.money).toBe(est?.deposit);
    expect(post.business?.lotId).toBeNull();
    expect(snap.me.playerId).toBeTruthy();
    socket.disconnect();
  });
  // Tiền nhà, hẹn ngày, trễ, dẹp tiệm: rent.e2e-spec.ts (UC-F13).
});
