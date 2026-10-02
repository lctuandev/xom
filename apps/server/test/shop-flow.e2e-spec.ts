import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type { MeView, NotifyEvent, OrderEvent } from "@xom/shared";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { BANH_MI_THIT, type Client, emit, next, openBanhMiStall } from "./client.js";
import { startApp } from "./helpers.js";

// Rà luồng thuê nhà → mở tiệm → bán (góp ý chơi thử): không trả tiền trùng (tiền nhà theo hợp đồng, mở tiệm chỉ trả thuế
// khoán), đang thuê nhà thì không dọn ra vỉa hè, nhân viên tới ca tự mở cửa, có nhân viên thì chủ đứng xem hoặc giành bán.

describe("Luồng tiệm + nhân viên (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const me = async (socket: Client, on = true) => {
    const r = await emit<MeView>(socket, "biz:attend", { on });
    if (!r.ok) throw new Error(r.message);
    return r.data;
  };

  it("tiệm trong nhà: mở cửa chỉ trả thuế khoán (tiền nhà theo hợp đồng); đang thuê nhà thì không dọn ra vỉa hè", async () => {
    const { socket } = await openBanhMiStall(url);
    await emit(socket, "debug:clock", { minute: 7 * 60 });
    await emit(socket, "biz:close", {});
    await wait(1_100);
    expect((await emit(socket, "debug:shop", { lotId: "nha_so_10" })).ok).toBe(true);
    const before = await me(socket);
    expect(before.business?.leaseLotId).toBe("nha_so_10");
    const opened = await emit<MeView>(socket, "biz:open", {});
    if (!opened.ok) throw new Error(opened.message);
    const after = await me(socket);
    expect(before.money + before.bank - (after.money + after.bank)).toBe(
      content.economy.fees.daily.house,
    );

    await emit(socket, "biz:close", {});
    const out = await emit(socket, "biz:update", { lotId: "dau_hem" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.message).toContain("Trả nhà");
    socket.disconnect();
  });

  it("nhân viên tới ca thì tự mở cửa giúp chủ (còn hàng); chủ ở quầy thì nhân viên bán, chủ giành bán thì khách vào bếp chủ", async () => {
    const { socket, snap } = await openBanhMiStall(url);
    const ownerId = snap.me.playerId;
    const prisma = app.get(PrismaService);
    await wait(1_100);
    // Nhập dư hàng cho cả ngày (nhân viên bán + chủ giành bán).
    await emit(socket, "debug:grant", { money: 2_000_000 });
    for (const itemId of BANH_MI_THIT) await emit(socket, "market:buy", { itemId, packs: 3 });
    await wait(1_100);
    await emit(socket, "debug:clock", { minute: 7 * 60 });
    await emit(socket, "staff:hire", { staffId: "khoa_phu", shiftId: "ca_ngay" });
    await emit(socket, "biz:close", {});
    await emit(socket, "biz:attend", { on: false });
    // Chủ tự đóng thì hôm nay nhân viên không mở lại; sáng hôm sau tới ca mới mở.
    await wait(300);
    expect((await prisma.business.findFirstOrThrow({ where: { ownerId } })).status).toBe("CLOSED");
    const opened = next(socket, "notify", (n: NotifyEvent) => n.text.includes("mở cửa quầy giúp"));
    const room = await prisma.room.findFirstOrThrow({
      where: { players: { some: { id: ownerId } } },
    });
    await emit(socket, "debug:clock", { minute: 7 * 60, day: room.day + 1 });
    await opened;
    expect((await prisma.business.findFirstOrThrow({ where: { ownerId } })).status).toBe("OPEN");

    // Chủ quay lại quầy: nhân viên vẫn bán, khách không vào bếp chủ.
    await wait(1_100);
    const view = await me(socket, true);
    expect(view.business?.staff?.selling).toBe(true);
    let mine = 0;
    const count = (o: OrderEvent) => {
      if (o.ownerId === ownerId && !o.buyerId) mine += 1;
    };
    socket.on("order", count);
    const sold = next(socket, "notify", (n: NotifyEvent) => n.text.startsWith("👩‍🍳 Khoa vừa bán"));
    await sold;
    expect(mine).toBe(0);

    // Giành tự bán: khách lại vào bếp của chủ, nhân viên thôi bán.
    await wait(1_100);
    const self = await emit<MeView>(socket, "biz:selfSell", { on: true });
    if (!self.ok) throw new Error(self.message);
    expect(self.data.business?.staff?.selling).toBe(false);
    const got = next(socket, "order", (o: OrderEvent) => o.ownerId === ownerId && !o.buyerId);
    await got;
    socket.off("order", count);
    socket.disconnect();
  });
});
