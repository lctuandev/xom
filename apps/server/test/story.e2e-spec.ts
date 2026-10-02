import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type { NotifyEvent, OrderEvent, StoryEntryView } from "@xom/shared";
import { changeFor, emit, join, next, openBanhMiStall } from "./client.js";
import { startApp } from "./helpers.js";

// Chuyện của tôi (docs/THEGIOI.md §1): server ghi mốc đời người chơi — dọn về xóm, mua xe, mở quầy, bán món đầu
// tiên (thành tựu có câu kể), đi làm thuê lần đầu. Mỗi mốc ghi một lần; câu viết sẵn lúc xảy ra.

describe("Chuyện của tôi (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  const story = async (socket: Parameters<typeof emit>[0]) => {
    const r = await emit<StoryEntryView[]>(socket, "story:list", {});
    if (!r.ok) throw new Error(`story:list: ${r.message}`);
    return r.data;
  };

  it("dọn về xóm → mua xe → mở quầy → bán món đầu tiên: mỗi mốc một dòng, đúng thứ tự", async () => {
    const { socket } = await openBanhMiStall(url);
    const texts = (await story(socket)).map((s) => s.text);
    const money = `${content.economy.startingMoney.toLocaleString("vi-VN")}đ`;
    expect(texts[0]).toBe(`Dọn về xóm với ${money} trong túi`);
    expect(texts).toContain("Mua Xe bánh mì kính — bắt đầu đi buôn");
    expect(texts).toContain("Mở quầy bánh mì đầu tiên ở Đầu hẻm 12");

    // Bán món đầu tiên → thành tựu "Mở hàng" kèm câu kể.
    const order: OrderEvent = await next(socket, "order");
    await new Promise((r) => setTimeout(r, 1_100));
    await emit(socket, "order:make", { orderId: order.orderId, build: order.spec });
    const paid = await emit(socket, "order:pay", {
      orderId: order.orderId,
      change: changeFor(order),
    });
    if (!paid.ok) throw new Error(`tính tiền: ${paid.message}`);
    const mo = content.data.achievements.find((a) => a.id === "mo_hang");
    await expect
      .poll(async () => (await story(socket)).map((s) => s.text), { timeout: 5_000 })
      .toContain(mo?.story);

    // Đóng rồi mở lại: không ghi "mở quầy đầu tiên" lần nữa.
    await emit(socket, "biz:close", {});
    await emit(socket, "biz:open", {});
    const again = (await story(socket)).filter((s) => s.text.startsWith("Mở quầy"));
    expect(again).toHaveLength(1);
    socket.disconnect();
  });

  it("đi làm thuê lần đầu: ghi mốc + báo 📖", async () => {
    const { socket } = await join(url);
    const place = content.placeForJob("phu_quan_com");
    if (!place) throw new Error("không có quán cơm");
    socket.emit("move", { ...place.position, yaw: 0, moving: false, inside: place.id });
    await new Promise((r) => setTimeout(r, 150));
    const told = next(socket, "notify", (n: NotifyEvent) => n.text.startsWith("📖"));
    const started = await emit(socket, "work:start", { jobId: "phu_quan_com", role: "dung_quay" });
    if (!started.ok) throw new Error(`vào ca: ${started.message}`);
    expect((await told).text).toBe(
      "📖 💼 Đi làm thuê lần đầu: đứng quầy múc cơm · Phụ quán cơm Cô Tư",
    );
    const last = (await story(socket)).at(-1);
    expect(last).toMatchObject({ emoji: "💼", day: expect.any(Number) });
    socket.disconnect();
  });
});
