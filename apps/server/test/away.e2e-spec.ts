import type { INestApplication } from "@nestjs/common";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { connect, emit, join } from "./client.js";
import { startApp } from "./helpers.js";

// "Trong lúc bạn vắng…" (docs/THEGIOI.md §4, docs/USECASES.md UC-M4): vào lại sau một lúc vắng thì snapshot kèm tóm tắt
// chuyện thật đã xảy ra — đánh giá mới, ngày đã qua, giá chợ đổi. Không có tiền tự sinh; vắng chưa đủ lâu thì không báo.

describe("Trong lúc bạn vắng (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("vào lại sau 30 phút: thấy đánh giá mới + số ngày xóm đã qua; vừa rời thì không báo", async () => {
    const { socket, snap, token } = await join(url);
    const id = snap.me.playerId;
    await emit(socket, "equipment:buy", { equipmentId: "xe_banh_mi" });
    await emit(socket, "debug:clock", { minute: 9 * 60, day: 5 });
    socket.disconnect();
    await wait(300);

    // Vừa rời rồi vào lại ngay: không có gì để kể.
    const quick = await connect(url, token);
    expect(quick.snap.away).toBeUndefined();
    quick.socket.disconnect();
    await wait(300);

    // Giả như đã vắng 30 phút, xóm qua 3 ngày, có khách viết đánh giá.
    const prisma = app.get(PrismaService);
    const before = new Date(Date.now() - 30 * 60_000);
    await prisma.player.update({ where: { id }, data: { lastSeenAt: before, lastSeenDay: 2 } });
    await prisma.review.create({
      data: {
        ownerId: id,
        productId: "banh_mi",
        authorName: "Cô Ba",
        stars: 5,
        text: "Ngon!",
        day: 4,
      },
    });
    const back = await connect(url, token);
    const away = back.snap.away;
    expect(away).toBeDefined();
    expect(away?.minutes).toBeGreaterThanOrEqual(30);
    expect(away?.days).toBe(back.snap.clock.day - 2);
    expect(away?.reviews).toMatchObject({
      count: 1,
      avg: 5,
      latest: { name: "Cô Ba", text: "Ngon!" },
    });
    // Giá chợ nguyên liệu bánh mì: đổi giữa ngày 2 và hôm nay (nếu đổi đáng kể).
    expect(Array.isArray(away?.prices)).toBe(true);
    // Tiền không tự tăng khi vắng.
    expect(back.snap.me.money).toBe(snap.me.money - 1_200_000);
    back.socket.disconnect();
  });
});
