import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type { MeView, NotifyEvent, SayEvent } from "@xom/shared";
import { absMinute } from "@xom/sim";
import { GameService } from "../src/game/game.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { emit, join, next, openBanhMiStall } from "./client.js";
import { startApp } from "./helpers.js";

// Đói / khát + khách réo khi chủ vắng (docs/USECASES.md UC-B11).

describe("Đói / khát (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  it("đói thì được nhắc (không khoá gì); ăn phở thì no lại", async () => {
    const { socket, snap } = await join(url);
    const game = app.get(GameService);
    const room = game.roomFor(snap.me.playerId);
    if (!room) throw new Error("không có xóm");
    await emit(socket, "debug:clock", { minute: 420 });
    await app.get(PrismaService).player.update({
      where: { id: snap.me.playerId },
      data: { needs: { food: 20, drink: 90, at: absMinute(room.day, room.minute) } },
    });
    const warned = next(socket, "notify", (n: NotifyEvent) => n.text.startsWith("🍚"));
    await game.needs.needsTick(room);
    expect((await warned).text).toMatch(/Bụng réo/);

    const pho = content.data.vendors.find((v) => v.items.some((i) => i.id === "pho_tai"));
    if (!pho) throw new Error("không có sạp phở");
    socket.emit("move", { ...pho.position, yaw: 0, moving: false, inside: null });
    await new Promise((r) => setTimeout(r, 120));
    const ate = await emit<MeView>(socket, "vendor:buy", { vendorId: pho.id, itemId: "pho_tai" });
    if (!ate.ok) throw new Error(`mua phở: ${ate.message}`);
    // 20 + 70 (phở), trừ chút thời gian trôi trong lúc đi tới sạp.
    expect(ate.data.needs.food).toBeGreaterThanOrEqual(85);
    expect(ate.data.needs.drink).toBeGreaterThanOrEqual(95);
    socket.disconnect();
  });

  it("quầy mở mà chủ đi vắng: khách réo ở quầy, chủ được báo", async () => {
    const a = await openBanhMiStall(url);
    const game = app.get(GameService);
    const room = game.roomFor(a.snap.me.playerId);
    if (!room) throw new Error("không có xóm");
    await emit(a.socket, "biz:attend", { on: false });
    const said = next(a.socket, "say", (e: SayEvent) => e.who === "lot:dau_hem");
    const told = next(a.socket, "notify", (n: NotifyEvent) => n.text.startsWith("🔔"));
    for (let i = 0; i < 20 && !room.calloutAt.size; i++) {
      room.minute += 5;
      await game.needs.calloutTick(room);
    }
    expect(content.data.needs.callouts).toContain((await said).text);
    expect((await told).text).toMatch(/Khách đang réo ở quầy Đầu hẻm 12/);
    a.socket.disconnect();
  });
});
