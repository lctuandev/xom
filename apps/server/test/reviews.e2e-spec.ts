import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type { MeView, NotifyEvent, OrderEvent, ReviewsView, Snapshot } from "@xom/shared";
import { ReviewService } from "../src/game/reviews.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { changeFor, emit, join, next, openBanhMiStall } from "./client.js";
import { startApp } from "./helpers.js";

// Sổ đánh giá quầy (docs/USECASES.md UC-F11).

describe("Sổ đánh giá (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("khách NPC chấm sao xấu thì chủ quầy được báo; sổ có điểm trung bình; mỗi cửa hàng một sổ", async () => {
    const a = await openBanhMiStall(url);
    const att = await emit<MeView>(a.socket, "biz:attend", { on: false });
    const businessId = (att.ok && att.data.business?.id) || "";
    const warned = next(a.socket, "notify", (n: NotifyEvent) => n.text.startsWith("📒"));
    const fake = {
      orderId: "npc-review-1",
      ownerId: a.snap.me.playerId,
      businessId,
      productId: "banh_mi",
      archetype: "hoc_sinh",
    } as OrderEvent;
    await app.get(ReviewService).npc(fake, 1, 2, "slow", { force: true });
    expect((await warned).text).toMatch(/· học sinh chấm ★★☆☆☆/);
    const list = await emit<ReviewsView>(a.socket, "review:list", { businessId });
    expect(list.ok && list.data).toMatchObject({ avg: 2, count: 1, dist: [0, 1, 0, 0, 0] });
    expect(list.ok && content.data.reviews.lines.slow).toContain(
      list.ok && list.data.items[0]?.text,
    );
    // Mở thêm cửa hàng thứ hai: sổ riêng, chưa có đánh giá nào.
    await emit(a.socket, "debug:grant", { money: 2_000_000 });
    const second = await emit<MeView>(a.socket, "equipment:buy", { equipmentId: "xe_tra_sua" });
    const otherId = (second.ok && second.data.business?.id) || "";
    expect(otherId).not.toBe(businessId);
    const other = await emit<ReviewsView>(a.socket, "review:list", { businessId: otherId });
    expect(other.ok && other.data).toMatchObject({ businessId: otherId, count: 0 });
    a.socket.disconnect();
  });

  it("hàng xóm mua rồi mới đánh giá (che từ tục, mỗi ngày một lần); chủ quầy trả lời một lần, gỡ chút uy tín", async () => {
    const a = await openBanhMiStall(url);
    const npcOrders: string[] = [];
    a.socket.on("order", (o: OrderEvent) => {
      if (!o.buyerId) npcOrders.push(o.orderId);
    });
    const b = await join(url);
    const moved = next(b.socket, "snapshot", (s: Snapshot) => s.roster.code === a.snap.roster.code);
    await emit(b.socket, "xom:join", { code: a.snap.roster.code });
    const stall = (await moved).world.lots.find((l) => l.ownerId === a.snap.me.playerId);
    if (!stall) throw new Error("không thấy quầy");
    const businessId = stall.businessId;

    expect(
      await emit(b.socket, "review:write", { businessId, stars: 5, text: "ngon" }),
    ).toMatchObject({ ok: false, message: "Mua ở quầy này rồi mới đánh giá được" });

    const lot = content.lot("dau_hem").position;
    b.socket.emit("move", { x: lot.x + 1, z: lot.z + 1.2, yaw: 0, moving: false, inside: null });
    await wait(120);
    for (const id of npcOrders.splice(0)) await emit(a.socket, "order:decline", { orderId: id });
    const got = next(a.socket, "order", (o: OrderEvent) => o.buyerId === b.snap.me.playerId);
    const placed = await emit(b.socket, "shop:order", {
      businessId: stall.businessId,
      variantId: "banh_mi_thit",
    });
    if (!placed.ok) throw new Error(`gọi món: ${placed.message}`);
    const o = await got;
    await wait(1100);
    await emit(a.socket, "order:make", { orderId: o.orderId, build: o.spec });
    const paid = await emit(a.socket, "order:pay", { orderId: o.orderId, change: changeFor(o) });
    if (!paid.ok) throw new Error(`tính tiền: ${paid.error} ${paid.message}`);

    const before = await emit<ReviewsView>(b.socket, "review:list", { businessId });
    expect(before.ok && before.data.canWrite).toBe(true);
    const wrote = await emit<ReviewsView>(b.socket, "review:write", {
      businessId,
      stars: 2,
      text: "Chờ lâu vl, bánh nguội",
    });
    if (!wrote.ok) throw new Error(`viết: ${wrote.message}`);
    expect(wrote.data.canWrite).toBe(false);
    const mine = wrote.data.items.find((r) => r.fromPlayer);
    expect(mine).toMatchObject({ stars: 2, text: "Chờ lâu ***, bánh nguội", reply: null });
    expect(
      await emit(b.socket, "review:write", { businessId, stars: 5, text: "đổi ý" }),
    ).toMatchObject({ ok: false, message: "Hôm nay bạn đánh giá quầy này rồi" });

    if (!mine) throw new Error("không thấy đánh giá");
    expect(await emit(b.socket, "review:reply", { reviewId: mine.id, text: "hihi" })).toMatchObject(
      { ok: false, message: "Không phải đánh giá quầy mình" },
    );
    const prisma = app.get(PrismaService);
    const repBefore = (await prisma.business.findUniqueOrThrow({ where: { id: businessId } }))
      .reputation;
    const replied = await emit<ReviewsView>(a.socket, "review:reply", {
      reviewId: mine.id,
      text: content.data.reviews.quickReplies.bad[0] ?? "Xin lỗi bạn",
    });
    if (!replied.ok) throw new Error(`trả lời: ${replied.message}`);
    expect(replied.data.items.find((r) => r.id === mine.id)?.reply).toBeTruthy();
    const repAfter = (await prisma.business.findUniqueOrThrow({ where: { id: businessId } }))
      .reputation;
    expect(repAfter).toBeGreaterThan(repBefore);
    expect(
      await emit(a.socket, "review:reply", { reviewId: mine.id, text: "lần nữa" }),
    ).toMatchObject({ ok: false, message: "Đã trả lời rồi" });
    a.socket.disconnect();
    b.socket.disconnect();
  });
});
