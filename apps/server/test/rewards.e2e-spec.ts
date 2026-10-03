import type { INestApplication } from "@nestjs/common";
import { content } from "@xom/content";
import type { MeView, QuestView } from "@xom/shared";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { connect, emit } from "./client.js";
import { register, startApp, uniqueName } from "./helpers.js";

// Thưởng thành tựu + nhiệm vụ hằng ngày (góp ý đợt 2, docs/USECASES.md UC-P4): đạt thật mới nhận, nhận một lần,
// tiền qua sổ cái + kinh nghiệm.

describe("Thưởng thành tựu / nhiệm vụ (e2e)", () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    ({ app, url } = await startApp());
  });
  afterAll(() => app.close());

  const enter = async (opts: { solo?: boolean; xom?: string }) => {
    const { body } = await register(url, uniqueName(), opts);
    return connect(url, body.accessToken);
  };

  it("thành tựu đã mở nhận thưởng một lần; nhiệm vụ đạt thật mới nhận, mỗi ngày một lần", async () => {
    const a = await enter({ solo: true });
    const me0 = a.snap.me;
    const ach = content.data.achievements.find((x) => x.id === "mo_hang");
    if (!ach) throw new Error("thiếu thành tựu mo_hang");

    // Chưa đạt thì không nhận được.
    expect(await emit(a.socket, "reward:claim", { kind: "ach", id: "mo_hang" })).toMatchObject({
      ok: false,
      message: "Chưa đạt thành tựu này",
    });
    // Đạt (ghi như server ghi khi bán món đầu tiên) → nhận: +tiền mặt, +kinh nghiệm.
    const prisma = app.get(PrismaService);
    await prisma.player.update({
      where: { id: me0.playerId },
      data: { achievements: { mo_hang: 1, khoi_nghiep: 1 } },
    });
    const got = await emit<MeView>(a.socket, "reward:claim", { kind: "ach", id: "mo_hang" });
    if (!got.ok) throw new Error(got.message);
    expect(got.data.money).toBe(me0.money + ach.reward.money);
    // Chấm đỏ 🏅: còn "Khởi nghiệp" đạt mà chưa nhận.
    expect(got.data.rewards).toMatchObject({ badges: 1 });
    const row = await prisma.player.findUniqueOrThrow({ where: { id: me0.playerId } });
    expect(row.xp).toBeGreaterThanOrEqual(ach.reward.xp);
    expect(await emit(a.socket, "reward:claim", { kind: "ach", id: "mo_hang" })).toMatchObject({
      ok: false,
      message: "Nhận thưởng này rồi",
    });

    // Nhiệm vụ "có hàng xóm cùng chơi": một mình thì chưa xong; bạn vào xóm thì xong, nhận một lần.
    const list = async () => {
      const r = await emit<QuestView[]>(a.socket, "quest:list", {});
      if (!r.ok) throw new Error("quest:list lỗi");
      return r.data;
    };
    expect((await list()).find((q) => q.id === "co_ban_choi")).toMatchObject({ done: false });
    expect(
      await emit(a.socket, "reward:claim", { kind: "quest", id: "co_ban_choi" }),
    ).toMatchObject({
      ok: false,
      message: "Chưa xong nhiệm vụ này",
    });
    const b = await enter({ xom: a.snap.roster.code });
    expect((await list()).find((q) => q.id === "co_ban_choi")).toMatchObject({
      done: true,
      claimed: false,
    });
    const q = await emit<MeView>(a.socket, "reward:claim", { kind: "quest", id: "co_ban_choi" });
    expect(q.ok).toBe(true);
    if (q.ok) expect(q.data.rewards?.quests).toBe(0);
    expect((await list()).find((q) => q.id === "co_ban_choi")?.claimed).toBe(true);
    expect((await emit(a.socket, "reward:claim", { kind: "quest", id: "co_ban_choi" })).ok).toBe(
      false,
    );

    // Nhiệm vụ bán món: chưa bán thì chưa xong.
    expect((await list()).find((q) => q.id === "ban_5")).toMatchObject({ value: 0, done: false });
    a.socket.disconnect();
    b.socket.disconnect();
  });
});
