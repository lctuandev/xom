import type { INestApplication } from "@nestjs/common";
import type { NotifyEvent, OrderEvent, RegularView, StoryEntryView } from "@xom/shared";
import { changeFor, emit, next, openBanhMiStall } from "./client.js";
import { startApp } from "./helpers.js";

// Khách quen (docs/KIENTRUC.md §1, docs/USECASES.md UC-M5): khách là cư dân có tên; quầy nhớ họ ghé mấy lần — đủ 5 lần
// thì ❤️ khách quen (ghi vào Chuyện của tôi), có sổ khách quen.

describe("Khách quen (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("cư dân đã ghé 4 lần, bán đúng lần thứ 5 → thành khách quen ❤️, có trong sổ + Chuyện của tôi", async () => {
    const { socket } = await openBanhMiStall(url);
    // Gom mọi khách từ lúc mở quầy (hàng chờ có thể đã đầy trước khi test kịp nghe).
    const queue: OrderEvent[] = [];
    socket.on("order", (o: OrderEvent) => queue.push(o));
    await emit(socket, "debug:regulars", { visits: 4 });
    await wait(1_100);
    // Khách có tên mới tính lần ghé; khách đã xếp hàng trước khi đặt số lần thì mời đi cho khách mới tới.
    let order: OrderEvent | null = null;
    for (let i = 0; i < 400 && !order; i++) {
      const o = queue.shift();
      if (!o) {
        await wait(50);
        continue;
      }
      if (o.residentId && o.visits === 4) order = o;
      else {
        await wait(120);
        await emit(socket, "order:decline", { orderId: o.orderId });
      }
    }
    if (!order) throw new Error("không có khách có tên");
    expect(order.residentName).toBeTruthy();
    expect(order).toMatchObject({ visits: 4, regular: false });
    // Đã ghé ≥ 3 lần: khách mở lời kiểu người quen.
    expect(order.ask).toMatch(/Bữa nay ghé nữa nè|Lại là tui nè|Ghé quầy quen nè/);
    await wait(1_100);
    const heart = next(socket, "notify", (n: NotifyEvent) => n.text.startsWith("❤️"));
    await emit(socket, "order:make", { orderId: order.orderId, build: order.spec });
    const paid = await emit(socket, "order:pay", {
      orderId: order.orderId,
      change: changeFor(order),
    });
    if (!paid.ok) throw new Error(`tính tiền: ${paid.message}`);
    expect((await heart).text).toBe(`❤️ ${order.residentName} thành khách quen của quầy bạn!`);

    const book = await emit<RegularView[]>(socket, "regulars:list", {});
    if (!book.ok) throw new Error(book.message);
    expect(book.data.find((r) => r.residentId === order?.residentId)).toMatchObject({
      visits: 5,
      regular: true,
    });
    const story = await emit<StoryEntryView[]>(socket, "story:list", {});
    expect(
      story.ok &&
        story.data.some((s) => s.text.startsWith(`Có khách quen đầu tiên: ${order?.residentName}`)),
    ).toBe(true);
    socket.disconnect();
  });
});
