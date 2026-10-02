import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type {
  Ack,
  LandlordEvent,
  MeView,
  NotifyEvent,
  RentView,
  ShopSetupView,
  StoryEntryView,
} from "@xom/shared";
import { LedgerService, SYSTEM } from "../src/economy/ledger.service.js";
import { depositWallet } from "../src/game/shop.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { emit, join, next } from "./client.js";
import { startApp } from "./helpers.js";

// Đòi tiền nhà (docs/USECASES.md UC-F13): 17h chủ nhà tới nhắc (modal chân dung) → trả ngay / hẹn ngày (phí trễ) / để sau;
// chưa hẹn thì quá 20h trừ cọc + tính lần trễ + trừ tin cậy; hẹn theo ngày, qua ngày hẹn là thất hẹn; trễ lần 3 → dẹp tiệm.

describe("Đòi tiền nhà (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  type Sock = Awaited<ReturnType<typeof join>>["socket"];
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const r = content.data.shopSetup.rent;
  const house = content.lot("nha_so_10");
  const rent = house.rentPerDay;
  const ok = async <T>(p: Promise<Ack<T>>) => {
    const res = await p;
    if (!res.ok) throw new Error(res.message ?? res.error);
    return res.data;
  };
  const landlord = (socket: Sock, mood: LandlordEvent["mood"]) =>
    next(socket, "landlord", (e) => e.mood === mood);

  /** Người chơi có tiệm ở nhà số 10, ký hợp đồng hôm nay (ngày ký không tính tiền nhà). */
  async function tenant() {
    const { socket, snap } = await join(url);
    await emit(socket, "debug:grant", { money: 1_000_000 });
    await emit(socket, "equipment:buy", { equipmentId: "xe_banh_mi" });
    await wait(1_100);
    await ok(emit(socket, "debug:shop", { lotId: house.id }));
    const prisma = app.get(PrismaService);
    const lease = await prisma.lease.findFirstOrThrow({
      where: { ownerId: snap.me.playerId, status: "ACTIVE" },
    });
    return { socket, id: snap.me.playerId, lease, day: lease.signedDay, prisma };
  }

  it("17h chủ nhà tới nhắc → trả ngay; trả nhà khi còn nợ thì trừ vào cọc", async () => {
    const { socket, day } = await tenant();
    const v0 = await ok(emit<ShopSetupView>(socket, "shop:view", {}));
    expect(v0.rent).toMatchObject({ owed: 0, paidDay: day, strikes: 0, depositLeft: rent * 3 });
    expect(v0.rent?.landlord.name).toBe("Cô Tư Hường");

    const visit = landlord(socket, "remind");
    await emit(socket, "debug:clock", { day: day + 1, minute: r.remindMinute - 2 });
    const e = await visit;
    await emit(socket, "debug:clock", { minute: r.remindMinute });
    expect(e.rent).toMatchObject({ owed: rent, owedDays: 1, promiseDay: null });
    expect(e.line).toContain(rent.toLocaleString("vi-VN"));
    expect(e.rent.promiseOptions.map((o) => o.day)).toEqual([day + 2, day + 3]);

    const before = await ok(emit<MeView>(socket, "biz:attend", { on: false }));
    const thanks = landlord(socket, "paid");
    const paid = await ok(emit<RentView>(socket, "rent:pay", {}));
    await thanks;
    expect(paid).toMatchObject({ owed: 0, paidDay: day + 1 });
    const after = await ok(emit<MeView>(socket, "biz:attend", { on: false }));
    expect(before.money + before.bank - (after.money + after.bank)).toBe(rent);
    const again = await emit(socket, "rent:pay", {});
    expect(again.ok).toBe(false);

    // Hôm sau trả nhà: nợ 1 ngày trừ vào cọc, hoàn phần còn lại.
    await emit(socket, "debug:clock", { day: day + 2, minute: 7 * 60 });
    const pre = await ok(emit<MeView>(socket, "biz:attend", { on: false }));
    const ended = await ok(emit<ShopSetupView>(socket, "shop:unlease", {}));
    expect(ended.lease).toBeNull();
    const post = await ok(emit<MeView>(socket, "biz:attend", { on: false }));
    expect(post.money - pre.money).toBe(rent * 3 - rent);
    socket.disconnect();
  });

  it("hẹn theo ngày: phí trễ theo số ngày; cả ngày hẹn không bị đòi; qua ngày hẹn thì trừ cọc + tính trễ", async () => {
    const { socket, id, lease, day, prisma } = await tenant();
    await emit(socket, "debug:clock", { day: day + 1, minute: 7 * 60 });
    const far = await emit(socket, "rent:promise", { day: day + 1 + r.maxPromiseDays + 1 });
    expect(far.ok).toBe(false);
    const agreed = landlord(socket, "promise");
    const p = await ok(emit<RentView>(socket, "rent:promise", { day: day + 3 }));
    expect(p).toMatchObject({ promiseDay: day + 3, lateFee: 11_000 * 2, promiseOptions: [] });
    expect((await agreed).line).toContain(String(day + 3));
    const twice = await emit(socket, "rent:promise", { day: day + 2 });
    expect(twice.ok).toBe(false);

    // Cọc dày thêm để thất hẹn chỉ bị trừ cọc (không bị dẹp tiệm).
    await prisma.$transaction((tx) =>
      app.get(LedgerService).transfer(tx, SYSTEM.bank, depositWallet(lease.id), 500_000, "test"),
    );
    // Ngày hẹn, quá 20h vẫn chưa bị đòi (hẹn ngày chứ không hẹn giờ); chủ nhà tới nhắc "hôm nay tới hẹn".
    const reminder = landlord(socket, "promised");
    await emit(socket, "debug:clock", { day: day + 3, minute: r.dueMinute + 30 });
    await reminder;
    await emit(socket, "debug:clock", { minute: r.dueMinute + 30 });
    expect((await prisma.lease.findUniqueOrThrow({ where: { id: lease.id } })).strikes).toBe(0);

    // Qua ngày hẹn chưa trả: thất hẹn → trừ cọc 4 ngày tiền nhà + phí trễ, trễ 1 lần, trừ tin cậy.
    const trustBefore = (await prisma.player.findUniqueOrThrow({ where: { id } })).trust;
    const late = landlord(socket, "late");
    await emit(socket, "debug:clock", { day: day + 4, minute: 6 * 60 });
    const e = await late;
    expect(e.rent).toMatchObject({ owed: 0, strikes: 1, paidDay: day + 4, promiseDay: null });
    expect(e.rent.depositLeft).toBe(rent * 3 + 500_000 - rent * 4 - 42_000);
    const trustAfter = (await prisma.player.findUniqueOrThrow({ where: { id } })).trust;
    expect(trustBefore - trustAfter).toBe(r.trustLate);
    socket.disconnect();
  });

  it("để sau mãi: mỗi lần quá 20h trừ cọc; trễ lần thứ 3 thì chủ nhà dẹp tiệm, cả xóm biết", async () => {
    const { socket, id, lease, day, prisma } = await tenant();
    await prisma.$transaction((tx) =>
      app.get(LedgerService).transfer(tx, SYSTEM.bank, depositWallet(lease.id), 500_000, "test"),
    );
    for (let k = 1; k < r.evictAfterStrikes; k++) {
      const late = landlord(socket, "late");
      await emit(socket, "debug:clock", { day: day + k, minute: r.dueMinute - 2 });
      expect((await late).rent.strikes).toBe(k);
      await emit(socket, "debug:clock", { minute: 7 * 60 });
    }
    const evicted = landlord(socket, "evict");
    const news = next(socket, "notify", (n: NotifyEvent) => n.text.includes("vì nợ tiền nhà"));
    await emit(socket, "debug:clock", { day: day + r.evictAfterStrikes, minute: r.dueMinute - 2 });
    await evicted;
    expect((await news).text).toContain("Cô Tư Hường");
    await emit(socket, "debug:clock", { minute: 7 * 60 });
    const row = await prisma.lease.findUniqueOrThrow({ where: { id: lease.id } });
    expect(row.status).toBe("EVICTED");
    expect(await app.get(LedgerService).balance(prisma, depositWallet(lease.id))).toBe(0);
    const biz = await prisma.business.findFirstOrThrow({ where: { ownerId: id } });
    expect(biz).toMatchObject({ lotId: null, status: "CLOSED" });
    const story = await ok(emit<StoryEntryView[]>(socket, "story:list", {}));
    expect(story.some((s) => s.text.includes("dẹp tiệm"))).toBe(true);
    socket.disconnect();
  });
});
