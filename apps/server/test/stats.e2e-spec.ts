import type { INestApplication } from "@nestjs/common";
import type { MyStatsView, NotifyEvent, Snapshot, XomBoardView } from "@xom/shared";
import { changeFor, emit, join, next, openBanhMiStall } from "./client.js";
import { startApp } from "./helpers.js";

// Bảng giải của xóm + số liệu 7 ngày + thành tựu (docs/USECASES.md UC-P2).

describe("Thống kê & bảng giải (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  it("bán món đầu tiên → thành tựu Mở hàng, số liệu hôm nay; hàng xóm thấy bảng giải + thị phần", async () => {
    const a = await openBanhMiStall(url);
    const o = await next(a.socket, "order");
    await emit(a.socket, "order:make", { orderId: o.orderId, build: o.spec });
    const paid = await emit(a.socket, "order:pay", { orderId: o.orderId, change: changeFor(o) });
    if (!paid.ok) throw new Error(`tính tiền: ${paid.message}`);

    const badge = next(a.socket, "notify", (n: NotifyEvent) => n.text.startsWith("🏅"));
    const mine = await emit<MyStatsView>(a.socket, "stats:me", {});
    if (!mine.ok) throw new Error(`stats:me: ${mine.message}`);
    expect(mine.data.days.at(-1)).toMatchObject({ served: 1, revenue: o.price });
    expect(mine.data.achievements.find((x) => x.id === "mo_hang")).toMatchObject({ done: true });
    expect((await badge).text).toBe("🏅 Thành tựu mới: 🥖 Mở hàng");
    expect(mine.data.avg).toMatchObject({ stalls: 1, served: 1 });
    // Mở rồi thì không báo lại.
    const again = await emit<MyStatsView>(a.socket, "stats:me", {});
    expect(again.ok && again.data.achievements.filter((x) => x.done).length).toBeGreaterThan(0);

    const b = await join(url);
    const moved = next(b.socket, "snapshot", (s: Snapshot) => s.roster.code === a.snap.roster.code);
    await emit(b.socket, "xom:join", { code: a.snap.roster.code });
    await moved;
    const board = await emit<XomBoardView>(b.socket, "stats:xom", {});
    if (!board.ok) throw new Error(`stats:xom: ${board.message}`);
    expect(board.data.players).toBe(2);
    expect(board.data.awards.find((x) => x.id === "doanh_nhan")?.entries).toEqual([
      { playerId: a.snap.me.playerId, name: a.snap.me.displayName, value: o.price },
    ]);
    expect(board.data.shares[0]).toMatchObject({
      productId: "banh_mi",
      entries: [{ playerId: a.snap.me.playerId, share: 1 }],
    });
    expect(board.data.trends.length).toBeGreaterThan(0);
    a.socket.disconnect();
    b.socket.disconnect();
  });
});
