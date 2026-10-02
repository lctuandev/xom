import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type { MeView, MyStatsView, NotifyEvent, StaffView, StoryEntryView } from "@xom/shared";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { connect, emit, next, openBanhMiStall } from "./client.js";
import { startApp } from "./helpers.js";

// Thuê nhân viên (docs/KIENTRUC.md §2, docs/USECASES.md UC-M6): nhân viên đứng quầy thay khi chủ rời quầy hoặc thoát game —
// bán theo lưu lượng + tay nghề + kho hàng, tiền bán vào ví chủ, lương trả theo giờ. Vào lại thấy "Trong lúc bạn vắng".

describe("Thuê nhân viên (e2e)", () => {
  let app: INestApplication;
  let url: string;
  const grace = process.env.LEAVE_GRACE_MS;
  beforeAll(async () => {
    process.env.LEAVE_GRACE_MS = "300";
    ({ app, url } = await startApp());
  });
  afterAll(async () => {
    if (grace === undefined) delete process.env.LEAVE_GRACE_MS;
    else process.env.LEAVE_GRACE_MS = grace;
    await app.close();
  });

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const view = async (socket: Parameters<typeof emit>[0]) => {
    const r = await emit<StaffView>(socket, "staff:view", {});
    if (!r.ok) throw new Error(r.message);
    return r.data;
  };

  it("thuê người không có thật / ca không có → bị từ chối; thuê Thu → ghi Chuyện của tôi; cho nghỉ", async () => {
    const { socket } = await openBanhMiStall(url);
    const bad = await emit(socket, "staff:hire", { staffId: "ai_do", shiftId: "sang" });
    expect(bad.ok).toBe(false);
    const hired = await emit<StaffView>(socket, "staff:hire", { staffId: "thu", shiftId: "toi" });
    if (!hired.ok) throw new Error(hired.message);
    expect(hired.data.employees).toMatchObject([{ staffId: "thu", shiftId: "toi" }]);
    const story = await emit<StoryEntryView[]>(socket, "story:list", {});
    expect(
      story.ok && story.data.some((s) => s.text === "Thuê người đầu tiên: Thu đứng quầy phụ"),
    ).toBe(true);
    const fired = await emit<StaffView>(socket, "staff:fire", {});
    expect(fired.ok && fired.data.employees).toEqual([]);
    socket.disconnect();
  });

  it("chủ rời quầy (vẫn trong xóm) mà nhân viên trong ca → nhân viên bán thay, tiền vào ví chủ", async () => {
    const { socket, me } = await openBanhMiStall(url);
    await emit(socket, "debug:clock", { minute: 18 * 60 });
    await emit(socket, "staff:hire", { staffId: "khoa_phu", shiftId: "toi" });
    const sold = next(socket, "notify", (n: NotifyEvent) => n.text.startsWith("👩‍🍳 Khoa vừa bán"));
    await emit(socket, "biz:attend", { on: false });
    await sold;
    const v = await view(socket);
    expect(v.recent[0]).toMatchObject({ staffId: "khoa_phu" });
    expect(v.recent[0]?.revenue).toBeGreaterThan(0);
    expect(v.recent[0]?.wages).toBeGreaterThan(0);
    // Sổ sách (docs/IA.md bước C): lương nhân viên là khoản chi riêng, không lẫn vào phí.
    const stats = await emit<MyStatsView>(socket, "stats:me", {});
    const today = stats.ok ? stats.data.days.at(-1) : undefined;
    expect(today?.costs.staff).toBe(v.recent[0]?.wages);
    const now = await emit<MeView>(socket, "biz:attend", { on: true });
    expect(now.ok && now.data.money + now.data.bank).not.toBe(me.money + me.bank);
    socket.disconnect();
  });

  it("thoát game giữa ca → nhân viên bán nốt tới hết ca; vào lại thấy doanh thu + lương trong 'Trong lúc bạn vắng'", async () => {
    const { socket, token, me } = await openBanhMiStall(url);
    await emit(socket, "debug:clock", { minute: 18 * 60 });
    await emit(socket, "staff:hire", { staffId: "thu", shiftId: "toi" });
    await emit(socket, "debug:away", { minutes: 60, days: 0 });
    socket.disconnect();
    // Hết ân hạn: nhân viên bán nốt ca rồi dọn quầy — chờ tới khi phiếu ca ghi xong (không chờ cứng: máy chậm thì lâu hơn).
    const prisma = app.get(PrismaService);
    for (let i = 0; i < 100; i++) {
      if (await prisma.staffShift.count({ where: { ownerId: me.playerId } })) break;
      await wait(100);
    }
    const back = await connect(url, token);
    const staff = back.snap.away?.staff;
    expect(staff).toMatchObject({ name: "Thu" });
    expect(staff?.served).toBeGreaterThan(0);
    expect(staff?.revenue).toBeGreaterThan(0);
    // Lương theo giờ, làm tròn 500đ; quầy đã đóng sau ca.
    expect(staff?.wages).toBeGreaterThan(0);
    expect((staff?.wages ?? 0) % 500).toBe(0);
    const v = await view(back.socket);
    expect(v.recent[0]).toMatchObject({
      staffId: "thu",
      revenue: staff?.revenue,
      wages: staff?.wages,
    });
    expect(back.snap.me.business?.open).toBe(false);
    back.socket.disconnect();
  });
  it("có nhân viên trong ca thì chủ đi làm thuê được, quầy vẫn bán; không có nhân viên thì bị chặn", async () => {
    const { socket } = await openBanhMiStall(url);
    await emit(socket, "debug:clock", { minute: 18 * 60 });
    const tied = await emit(socket, "work:start", { jobId: "phu_quan_com", role: "dung_quay" });
    expect(tied.ok).toBe(false);
    if (!tied.ok) expect(tied.message).toContain("không có nhân viên trong ca");
    await emit(socket, "staff:hire", { staffId: "khoa_phu", shiftId: "toi" });
    const sold = next(socket, "notify", (n: NotifyEvent) => n.text.startsWith("👩‍🍳 Khoa vừa bán"));
    const free = await emit<MeView>(socket, "work:start", {
      jobId: "phu_quan_com",
      role: "dung_quay",
    });
    expect(free.ok).toBe(true);
    // Chủ vào ca làm thuê (rời quầy) — Khoa đứng bán thay.
    await emit(socket, "biz:attend", { on: false });
    await sold;
    socket.disconnect();
  });

  it("cấp tiệm: xe đẩy chỉ 1 người, không nâng cấp; tiệm cấp 2 thuê 2 người cùng ca, cả nhóm bán, phiếu theo người", async () => {
    const { socket, me } = await openBanhMiStall(url);
    await emit(socket, "debug:clock", { minute: 18 * 60 });
    await emit(socket, "debug:grant", { money: 3_000_000 });
    // Xe đẩy: thuê người thứ 2 bị từ chối; không nâng cấp được.
    await emit(socket, "staff:hire", { staffId: "thu", shiftId: "toi" });
    const second = await emit(socket, "staff:hire", { staffId: "khoa_phu", shiftId: "toi" });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.message).toContain("nâng cấp tiệm");
    await emit(socket, "biz:close", {});
    expect((await emit(socket, "biz:upgrade", {})).ok).toBe(false);

    // Sang nhà mặt tiền (đủ giấy tờ bằng lệnh dev) rồi nâng lên cấp 2: trả đúng tiền nâng cấp.
    await new Promise((r) => setTimeout(r, 1_100));
    expect((await emit(socket, "debug:shop", { lotId: "nha_so_10" })).ok).toBe(true);
    const lv2 = content.data.shopLevels.find((l) => l.level === 2);
    const before = await emit<MeView>(socket, "biz:attend", { on: false });
    const up = await emit<MeView>(socket, "biz:upgrade", {});
    if (!up.ok || !before.ok) throw new Error("không nâng cấp được");
    expect(before.data.money + before.data.bank - (up.data.money + up.data.bank)).toBe(
      lv2?.upgradeCost,
    );
    expect(up.data.business?.level).toBe(2);
    const two = await emit<StaffView>(socket, "staff:hire", {
      staffId: "khoa_phu",
      shiftId: "toi",
    });
    if (!two.ok) throw new Error(two.message);
    expect(two.data.employees.map((e) => e.staffId).sort()).toEqual(["khoa_phu", "thu"]);
    expect(two.data.maxStaff).toBe(2);

    // Một người không làm hai cửa hàng: mở thêm cửa hàng rồi thuê Thu bên đó → từ chối.
    // (Cả nhóm bán thay khi chủ rời quầy.)
    const sold = next(
      socket,
      "notify",
      (n: NotifyEvent) =>
        n.text.includes("Thu") && n.text.includes("Khoa") && n.text.includes("vừa bán"),
    );
    await emit(socket, "biz:attend", { on: true });
    const opened = await emit(socket, "biz:open", {});
    if (!opened.ok) throw new Error(opened.message);
    await emit(socket, "biz:attend", { on: false });
    await sold;
    const v = await emit<StaffView>(socket, "staff:view", {});
    const people = v.ok ? new Set(v.data.recent.map((r) => r.staffId)) : new Set();
    expect(people.has("thu") && people.has("khoa_phu")).toBe(true);
    expect(me.playerId).toBeTruthy();
    socket.disconnect();
  });

  it("một người chỉ làm cho một cửa hàng của mình", async () => {
    const { socket } = await openBanhMiStall(url);
    await emit(socket, "debug:grant", { money: 3_000_000 });
    await emit(socket, "staff:hire", { staffId: "thu", shiftId: "sang" });
    await emit(socket, "equipment:buy", { equipmentId: "xe_tra_sua" });
    const again = await emit(socket, "staff:hire", { staffId: "thu", shiftId: "toi" });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.message).toContain("cửa hàng khác");
    socket.disconnect();
  });
});
