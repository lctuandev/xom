import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type {
  GigBoardView,
  MeView,
  NotifyEvent,
  PhotoSessionView,
  PhotoShotView,
  Snapshot,
} from "@xom/shared";
import { fundWallet, LedgerService } from "../src/economy/ledger.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { type Client, emit, join, next, openBanhMiStall } from "./client.js";
import { startApp } from "./helpers.js";

// Việc người chơi đăng cho nhau + 📸 thợ ảnh (docs/KIENTRUC.md §3 — 1.20b, docs/USECASES.md UC-M8): chủ quầy trả trước tiền
// công vào ví giữ hộ (+ phí ghi sổ vào quỹ xóm) → hàng xóm nhận (cọc) → thuê máy ảnh, chụp tại quầy đang mở → nộp → chủ
// nghiệm thu + chấm sao (quầy đông khách hơn) / quá hạn tự trả / khiếu nại thì Chú Hai phân xử theo điểm ảnh.

describe("Việc người chơi đăng — thợ ảnh (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  const p = content.data.gigs.photo;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const lot = content.lot("dau_hem").position;
  const ok = async <T>(socket: Client, event: Parameters<typeof emit>[1], body: unknown = {}) => {
    const r = await emit<T>(socket, event, body);
    if (!r.ok) throw new Error(`${event}: ${r.message}`);
    return r.data;
  };
  const money = async (socket: Client) => {
    const me = await ok<MeView>(socket, "biz:attend", { on: false });
    return me.money + me.bank;
  };

  /** Chủ quầy bánh mì mở hàng ở Đầu hẻm 12; hàng xóm vào cùng xóm, đứng trước quầy. */
  const pair = async () => {
    const a = await openBanhMiStall(url);
    const b = await join(url);
    const moved = next(b.socket, "snapshot", (s: Snapshot) => s.roster.code === a.snap.roster.code);
    await emit(b.socket, "xom:join", { code: a.snap.roster.code });
    await moved;
    b.socket.emit("move", { x: lot.x + 1, z: lot.z + 1.5, yaw: 0, moving: false, inside: null });
    await wait(150);
    return { a, b };
  };

  /**
   * Chụp theo khoảnh khắc server đưa: `good` thì bấm đúng lúc, không thì bấm ngay đầu buổi (0 điểm). Đồng hồ e2e chạy
   * 100 phút game/giây nên mỗi tấm đẹp là một buổi chụp ngắn (bấm ở khoảnh khắc đầu), kéo giờ lùi về sáng trước mỗi buổi.
   */
  const shootSession = async (socket: Client, id: string, good: boolean) => {
    const scores: number[] = [];
    if (good) {
      for (let i = 0; i < p.keep; i++) {
        await emit(socket, "debug:clock", { minute: 7 * 60 });
        const s = await ok<PhotoSessionView>(socket, "gig:shoot", { id });
        const start = Date.now();
        const m = s.moments[0];
        if (!m) throw new Error("không có khoảnh khắc");
        await wait(Math.max(0, m.at - (Date.now() - start)));
        scores.push((await ok<PhotoShotView>(socket, "gig:shot", { id })).score);
      }
    } else {
      await ok<PhotoSessionView>(socket, "gig:shoot", { id });
      for (let i = 0; i < p.keep; i++)
        scores.push((await ok<PhotoShotView>(socket, "gig:shot", { id })).score);
    }
    return scores;
  };

  it("đăng việc → nhận → chụp đẹp → nộp → nghiệm thu 5⭐: trả tiền + cọc, quỹ xóm có phí, quầy được quảng cáo", async () => {
    const { a, b } = await pair();
    const prisma = app.get(PrismaService);
    const ledger = app.get(LedgerService);
    const reward = p.rewards[1] ?? 100_000;
    const fee = Math.max(
      content.data.gigs.feeMin,
      Math.round((reward * content.data.gigs.feeRate) / 1000) * 1000,
    );
    const room =
      (await prisma.player.findUniqueOrThrow({ where: { id: a.snap.me.playerId } })).roomId ?? "";
    const fundBefore = await ledger.balance(prisma, fundWallet(room));
    const aBefore = await money(a.socket);
    await emit(a.socket, "debug:clock", { minute: 7 * 60 });
    await wait(1100);
    const posted = await ok<GigBoardView>(a.socket, "gig:post", {
      kind: "photo",
      reward,
      hours: 4,
    });
    const gig = posted.gigs.find((g) => g.posted && g.status === "OPEN");
    if (!gig) throw new Error("không thấy việc vừa đăng");
    expect(gig.fee).toBe(fee);
    expect(await money(a.socket)).toBe(aBefore - reward - fee);
    expect((await ledger.balance(prisma, fundWallet(room))) - fundBefore).toBe(fee);

    // Không tự nhận việc mình; đăng chồng việc thứ hai không được.
    expect(await emit(a.socket, "gig:take", { id: gig.id })).toMatchObject({ ok: false });
    expect(await emit(a.socket, "gig:post", { kind: "photo", reward, hours: 4 })).toMatchObject({
      ok: false,
    });

    const taken = next(
      a.socket,
      "notify",
      (n: NotifyEvent) => n.text.startsWith("📸") && n.open === "jobs:gigs",
    );
    const bBefore = await money(b.socket);
    await ok(b.socket, "gig:take", { id: gig.id });
    await taken;
    expect(await money(b.socket)).toBe(bBefore - gig.deposit);

    // Đứng xa quầy thì không chụp được.
    b.socket.emit("move", { x: lot.x + 30, z: lot.z, yaw: 0, moving: false, inside: null });
    await wait(150);
    expect(await emit(b.socket, "gig:shoot", { id: gig.id })).toMatchObject({ ok: false });
    b.socket.emit("move", { x: lot.x + 1, z: lot.z + 1.5, yaw: 0, moving: false, inside: null });
    await wait(150);

    const scores = await shootSession(b.socket, gig.id, true);
    expect(Math.min(...scores)).toBeGreaterThanOrEqual(60);
    // Nộp rồi nghiệm thu liền (đồng hồ e2e nhanh: 2 giờ game chỉ ~1 giây là tự trả). Máy ảnh thuê một lần.
    await emit(a.socket, "debug:clock", { minute: 7 * 60 });
    const submitted = next(a.socket, "notify", (n: NotifyEvent) => n.text.includes("nộp ảnh"));
    const sent = await ok<GigBoardView>(b.socket, "gig:submit", { id: gig.id });
    expect(sent.gigs.find((g) => g.id === gig.id)?.status).toBe("SUBMITTED");
    const review = await ok<GigBoardView>(a.socket, "gig:review", { id: gig.id, stars: 5 });
    await submitted;
    const done = review.gigs.find((g) => g.id === gig.id);
    expect(done).toMatchObject({ status: "DONE", stars: 5, verdict: "accepted" });
    expect(done?.quality).toBeGreaterThanOrEqual(60);
    expect(await money(b.socket)).toBe(bBefore - p.cameraRent + reward);
    const taker = await prisma.player.findUniqueOrThrow({ where: { id: b.snap.me.playerId } });
    expect(taker).toMatchObject({
      gigs: 1,
      gigStars: 5,
      trust: content.data.contracts.trust.start + content.data.contracts.trust.done,
    });
    const biz = await prisma.business.findFirstOrThrow({ where: { ownerId: a.snap.me.playerId } });
    expect(biz.adMul).toBeGreaterThan(1);
    expect(biz.adUntil).toBeGreaterThan(0);
    a.socket.disconnect();
    b.socket.disconnect();
  });

  it("ảnh xấu → chủ khiếu nại → Chú Hai xử hoàn tiền công, thợ lấy lại cọc nhưng mất tin cậy", async () => {
    const { a, b } = await pair();
    const prisma = app.get(PrismaService);
    const reward = p.rewards[0] ?? 60_000;
    await emit(a.socket, "debug:clock", { minute: 7 * 60 });
    await wait(1100);
    const posted = await ok<GigBoardView>(a.socket, "gig:post", {
      kind: "photo",
      reward,
      hours: 2,
    });
    const gig = posted.gigs.find((g) => g.posted && g.status === "OPEN");
    if (!gig) throw new Error("không thấy việc");
    await ok(b.socket, "gig:take", { id: gig.id });
    expect(await emit(b.socket, "gig:submit", { id: gig.id })).toMatchObject({ ok: false });
    await shootSession(b.socket, gig.id, false);
    await ok(b.socket, "gig:submit", { id: gig.id });
    const aMid = await money(a.socket);
    const r = await ok<GigBoardView>(a.socket, "gig:dispute", { id: gig.id });
    expect(r.gigs.find((g) => g.id === gig.id)).toMatchObject({
      status: "REFUNDED",
      verdict: "dispute_poster",
    });
    expect(await money(a.socket)).toBe(aMid + reward);
    const taker = await prisma.player.findUniqueOrThrow({ where: { id: b.snap.me.playerId } });
    expect(taker.trust).toBe(
      content.data.contracts.trust.start - content.data.gigs.disputeLostTrust,
    );
    a.socket.disconnect();
    b.socket.disconnect();
  });

  it("chủ quên nghiệm thu: quá hạn tự trả cho thợ; chưa ai nhận thì gỡ được, hoàn tiền công", async () => {
    const { a, b } = await pair();
    const reward = p.rewards[0] ?? 60_000;
    await wait(1100);
    // Gỡ việc chưa ai nhận: hoàn tiền công, phí ghi sổ không hoàn.
    const first = await ok<GigBoardView>(a.socket, "gig:post", { kind: "photo", reward, hours: 8 });
    const g1 = first.gigs.find((g) => g.posted && g.status === "OPEN");
    if (!g1) throw new Error("không thấy việc");
    const before = await money(a.socket);
    await ok(a.socket, "gig:cancel", { id: g1.id });
    expect(await money(a.socket)).toBe(before + reward);

    await emit(a.socket, "debug:clock", { minute: 9 * 60 });
    const posted = await ok<GigBoardView>(a.socket, "gig:post", {
      kind: "photo",
      reward,
      hours: 8,
    });
    const gig = posted.gigs.find((g) => g.posted && g.status === "OPEN");
    if (!gig) throw new Error("không thấy việc");
    await ok(b.socket, "gig:take", { id: gig.id });
    await shootSession(b.socket, gig.id, true);
    const bBefore = await money(b.socket);
    const paid = next(b.socket, "notify", (n: NotifyEvent) => n.text.includes("tự trả"));
    // Chủ quầy không bấm gì: quá hạn nghiệm thu thì tự trả.
    await ok(b.socket, "gig:submit", { id: gig.id });
    await paid;
    expect(await money(b.socket)).toBe(bBefore + reward + gig.deposit);
    a.socket.disconnect();
    b.socket.disconnect();
  });
});
